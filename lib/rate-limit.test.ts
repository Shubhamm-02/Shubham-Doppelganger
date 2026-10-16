import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RateLimitModule = typeof import("@/lib/rate-limit");
type Identity = Parameters<RateLimitModule["limitChatRequest"]>[0];

const REDIS_ENV = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN"
];

let limitChatRequest: RateLimitModule["limitChatRequest"];
let limitBookingAttempt: RateLimitModule["limitBookingAttempt"];

async function loadRateLimit() {
  vi.resetModules();
  ({ limitChatRequest, limitBookingAttempt } = await import("@/lib/rate-limit"));
}

async function send(count: number, identity: Identity) {
  const results = [];
  for (let index = 0; index < count; index += 1) {
    results.push(await limitChatRequest(identity));
  }
  return results;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock("@upstash/redis");
  vi.doUnmock("@upstash/ratelimit");
});

describe("limitChatRequest without Redis", () => {
  beforeEach(async () => {
    for (const name of REDIS_ENV) vi.stubEnv(name, "");
    await loadRateLimit();
  });

  it("allows 20 requests per visitor per five minutes", async () => {
    const identity = { ip: "203.0.113.1", visitorId: "visitor-a" };

    const allowed = await send(20, identity);
    expect(allowed.every((result) => result.ok)).toBe(true);
    expect(await limitChatRequest(identity)).toEqual({
      ok: false,
      retryAfter: 300
    });

    vi.advanceTimersByTime(120_000);
    expect(await limitChatRequest(identity)).toEqual({
      ok: false,
      retryAfter: 180
    });

    vi.advanceTimersByTime(180_000);
    expect(await limitChatRequest(identity)).toEqual({ ok: true });
  });

  it("frees capacity as old requests slide out of the window", async () => {
    const identity = { ip: "203.0.113.2", visitorId: "visitor-b" };

    await send(10, identity);
    vi.advanceTimersByTime(150_000);
    await send(10, identity);
    expect(await limitChatRequest(identity)).toEqual({
      ok: false,
      retryAfter: 150
    });

    vi.advanceTimersByTime(150_000);
    const results = await send(11, identity);
    expect(results.slice(0, 10).every((result) => result.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, retryAfter: 150 });
  });

  it("does not count rejected requests and never asks for less than one second", async () => {
    const identity = { ip: "203.0.113.3", visitorId: "visitor-c" };

    await send(20, identity);
    vi.advanceTimersByTime(299_999);
    expect(await send(5, identity)).toEqual(
      Array(5).fill({ ok: false, retryAfter: 1 })
    );

    vi.advanceTimersByTime(1);
    expect(await limitChatRequest(identity)).toEqual({ ok: true });
  });

  it("caps an IP at 60 requests across visitors", async () => {
    for (let index = 0; index < 60; index += 1) {
      expect(
        await limitChatRequest({
          ip: "198.51.100.7",
          visitorId: `visitor-${index}`
        })
      ).toEqual({ ok: true });
    }

    expect(
      await limitChatRequest({ ip: "198.51.100.7", visitorId: "new-visitor" })
    ).toEqual({ ok: false, retryAfter: 300 });
    expect(
      await limitChatRequest({ ip: "198.51.100.8", visitorId: "other-visitor" })
    ).toEqual({ ok: true });
  });

  it("counts IPv6 clients by their /64 prefix", async () => {
    for (let index = 0; index < 60; index += 1) {
      await limitChatRequest({
        ip: `2001:db8:0:1::${index.toString(16)}`,
        visitorId: `visitor-v6-${index}`
      });
    }

    expect(
      await limitChatRequest({ ip: "2001:db8:0:1:ffff::1", visitorId: "v6-new" })
    ).toEqual({ ok: false, retryAfter: 300 });
    expect(
      await limitChatRequest({ ip: "2001:db8:0:2::1", visitorId: "v6-other" })
    ).toEqual({ ok: true });
  });

  it("follows a visitor across IP addresses", async () => {
    for (let index = 0; index < 20; index += 1) {
      await limitChatRequest({ ip: `192.0.2.${index}`, visitorId: "roaming" });
    }

    expect(
      await limitChatRequest({ ip: "192.0.2.200", visitorId: "roaming" })
    ).toEqual({ ok: false, retryAfter: 300 });
  });

  it("allows 3 booking attempts per visitor and 5 per IP a day, apart from chat limits", async () => {
    for (let index = 0; index < 3; index += 1) {
      expect(await limitBookingAttempt({ ip: "203.0.113.20", visitorId: "booker" })).toEqual({
        ok: true
      });
    }
    expect(await limitBookingAttempt({ ip: "203.0.113.21", visitorId: "booker" })).toEqual({
      ok: false,
      retryAfter: 86_400
    });
    expect(await limitChatRequest({ ip: "203.0.113.20", visitorId: "booker" })).toEqual({
      ok: true
    });

    await limitBookingAttempt({ ip: "203.0.113.20", visitorId: "fresh-cookie-1" });
    await limitBookingAttempt({ ip: "203.0.113.20", visitorId: "fresh-cookie-2" });
    expect(
      await limitBookingAttempt({ ip: "203.0.113.20", visitorId: "fresh-cookie-3" })
    ).toEqual({ ok: false, retryAfter: 86_400 });

    vi.advanceTimersByTime(86_400_000);
    expect(await limitBookingAttempt({ ip: "203.0.113.20", visitorId: "booker" })).toEqual({
      ok: true
    });
  });

  it("warns once in production that limits are per instance", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadRateLimit();

    await send(3, { ip: "203.0.113.4", visitorId: "visitor-d" });

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("limitChatRequest with Redis", () => {
  const limit = vi.fn();
  const configs: Array<{ prefix: string; limiter: unknown }> = [];

  beforeEach(async () => {
    limit.mockReset();
    configs.length = 0;
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.doMock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({}) } }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow(tokens: number, window: string) {
          return { tokens, window };
        }

        private readonly prefix: string;

        constructor(config: { prefix: string; limiter: unknown }) {
          configs.push(config);
          this.prefix = config.prefix;
        }

        limit(identifier: string) {
          return limit(this.prefix, identifier);
        }
      }
    }));
    await loadRateLimit();
  });

  it("checks both sliding windows and reports the later reset", async () => {
    limit.mockImplementation(async (prefix: string) =>
      prefix === "wizard:chat:ip"
        ? { success: false, reset: Date.now() + 42_100 }
        : { success: true, reset: Date.now() + 90_000 }
    );

    const result = await limitChatRequest({ ip: "203.0.113.9", visitorId: "v" });

    expect(result).toEqual({ ok: false, retryAfter: 43 });
    expect(limit).toHaveBeenCalledWith("wizard:chat:visitor", "v");
    expect(limit).toHaveBeenCalledWith("wizard:chat:ip", "203.0.113.9");
    expect(configs).toEqual([
      {
        redis: {},
        prefix: "wizard:chat:visitor",
        limiter: { tokens: 20, window: "300 s" }
      },
      {
        redis: {},
        prefix: "wizard:chat:ip",
        limiter: { tokens: 60, window: "300 s" }
      }
    ]);
  });

  it("keeps booking attempts in their own daily windows", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() });

    expect(await limitBookingAttempt({ ip: "203.0.113.9", visitorId: "v" })).toEqual({ ok: true });

    expect(limit).toHaveBeenCalledWith("wizard:booking:visitor", "v");
    expect(limit).toHaveBeenCalledWith("wizard:booking:ip", "203.0.113.9");
    expect(configs).toEqual([
      {
        redis: {},
        prefix: "wizard:booking:visitor",
        limiter: { tokens: 3, window: "86400 s" }
      },
      {
        redis: {},
        prefix: "wizard:booking:ip",
        limiter: { tokens: 5, window: "86400 s" }
      }
    ]);
  });

  it("keys IPv6 clients by /64 prefix and IPv4-mapped clients by IPv4", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() });

    await limitChatRequest({ ip: "2001:0DB8:0:1:abcd::7", visitorId: "v" });
    await limitChatRequest({ ip: "::ffff:203.0.113.9", visitorId: "v" });

    expect(limit).toHaveBeenCalledWith("wizard:chat:ip", "2001:db8:0:1::/64");
    expect(limit).toHaveBeenCalledWith("wizard:chat:ip", "203.0.113.9");
  });

  it("falls back to per-instance limits when Redis errors", async () => {
    limit.mockRejectedValue(new Error("connection reset"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const identity = { ip: "203.0.113.9", visitorId: "v" };

    const allowed = await send(20, identity);

    expect(allowed.every((result) => result.ok)).toBe(true);
    expect(await limitChatRequest(identity)).toEqual({ ok: false, retryAfter: 300 });
    expect(error).toHaveBeenCalledTimes(21);
  });

  it("treats a Redis timeout as an outage", async () => {
    limit.mockResolvedValue({ success: true, reset: 0, reason: "timeout" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const identity = { ip: "203.0.113.9", visitorId: "v" };

    await send(20, identity);

    expect(await limitChatRequest(identity)).toEqual({ ok: false, retryAfter: 300 });
  });
});
