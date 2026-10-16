import { isIPv6 } from "node:net";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitPolicy = {
  name: "chat" | "booking";
  windowSeconds: number;
  visitorLimit: number;
  ipLimit: number;
};

const CHAT_POLICY: LimitPolicy = {
  name: "chat",
  windowSeconds: 300,
  visitorLimit: 20,
  ipLimit: 60
};
// Each attempt reaches Cal.com and can put a real call on Shubham's calendar.
const BOOKING_POLICY: LimitPolicy = {
  name: "booking",
  windowSeconds: 24 * 60 * 60,
  visitorLimit: 3,
  ipLimit: 5
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

type WindowCheck = { success: boolean; reset: number };
type Limiter = (identifier: string) => Promise<WindowCheck>;
type WindowLimiters = { visitor: Limiter; ip: Limiter };
type PolicyLimiters = { primary: WindowLimiters; local: WindowLimiters };

const limitersByPolicy = new Map<LimitPolicy["name"], PolicyLimiters>();

function hasRedisConfig() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

// An IPv6 client usually controls a whole /64, so the IP window counts the prefix.
function ipWindowKey(ip: string) {
  if (!isIPv6(ip)) return ip;
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mappedIpv4) return mappedIpv4;

  const [head, tail] = ip.split("::");
  const headHextets = head ? head.split(":") : [];
  const tailHextets = tail ? tail.split(":") : [];
  const hextets =
    tail === undefined
      ? headHextets
      : [
          ...headHextets,
          ...Array(8 - headHextets.length - tailHextets.length).fill("0"),
          ...tailHextets
        ];

  const prefix = hextets
    .slice(0, 4)
    .map((hextet) => parseInt(hextet, 16).toString(16))
    .join(":");
  return `${prefix}::/64`;
}

function redisLimiter(redis: Redis, prefix: string, limit: number, windowSeconds: number): Limiter {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix
  });

  return async (identifier) => {
    const result = await ratelimit.limit(identifier);
    if (result.reason === "timeout") {
      throw new Error(`Rate limit check for ${prefix} timed out.`);
    }
    return result;
  };
}

function memoryLimiter(limit: number, windowSeconds: number): Limiter {
  const windowMs = windowSeconds * 1000;
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  return async (identifier) => {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (now - lastSweep >= windowMs) {
      for (const [key, times] of hits) {
        if (times[times.length - 1] <= windowStart) hits.delete(key);
      }
      lastSweep = now;
    }

    const recent = (hits.get(identifier) ?? []).filter(
      (time) => time > windowStart
    );
    const success = recent.length < limit;
    if (success) recent.push(now);
    hits.set(identifier, recent);

    return { success, reset: recent[0] + windowMs };
  };
}

function createLimiters(policy: LimitPolicy): PolicyLimiters {
  const local = {
    visitor: memoryLimiter(policy.visitorLimit, policy.windowSeconds),
    ip: memoryLimiter(policy.ipLimit, policy.windowSeconds)
  };

  if (hasRedisConfig()) {
    const redis = Redis.fromEnv();
    const prefix = `wizard:${policy.name}`;
    const { visitorLimit, ipLimit, windowSeconds } = policy;
    return {
      primary: {
        visitor: redisLimiter(redis, `${prefix}:visitor`, visitorLimit, windowSeconds),
        ip: redisLimiter(redis, `${prefix}:ip`, ipLimit, windowSeconds)
      },
      local
    };
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      `Upstash Redis is not configured; ${policy.name} rate limits only apply per server instance.`
    );
  }

  return { primary: local, local };
}

function getLimiters(policy: LimitPolicy) {
  let limiters = limitersByPolicy.get(policy.name);
  if (!limiters) {
    limiters = createLimiters(policy);
    limitersByPolicy.set(policy.name, limiters);
  }
  return limiters;
}

function checkWindows(
  limiters: WindowLimiters,
  identity: { ip: string; visitorId: string }
) {
  return Promise.all([
    limiters.visitor(identity.visitorId),
    limiters.ip(ipWindowKey(identity.ip))
  ]);
}

async function limitRequest(
  policy: LimitPolicy,
  identity: { ip: string; visitorId: string }
): Promise<RateLimitResult> {
  const { primary, local } = getLimiters(policy);

  let checks: WindowCheck[];
  try {
    checks = await checkWindows(primary, identity);
  } catch (error) {
    // A Redis outage drops to per-instance limits rather than taking chat down or lifting the cap.
    console.error(`The ${policy.name} rate limit check failed; using per-instance limits.`, error);
    checks = await checkWindows(local, identity);
  }

  const blocked = checks.filter((check) => !check.success);
  if (!blocked.length) return { ok: true };

  const reset = Math.max(...blocked.map((check) => check.reset));
  return {
    ok: false,
    retryAfter: Math.max(1, Math.ceil((reset - Date.now()) / 1000))
  };
}

export function limitChatRequest(identity: { ip: string; visitorId: string }) {
  return limitRequest(CHAT_POLICY, identity);
}

export function limitBookingAttempt(identity: { ip: string; visitorId: string }) {
  return limitRequest(BOOKING_POLICY, identity);
}
