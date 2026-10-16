import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createRequestLogger } from "@/lib/logger";

let info: MockInstance<typeof console.info>;

function loggedLines() {
  return info.mock.calls.map((args) => JSON.parse(String(args[0])));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T06:30:00.000Z"));
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createRequestLogger", () => {
  it("uses the Vercel request id when present", () => {
    const request = new Request("http://localhost/api/chat", {
      headers: { "x-vercel-id": "bom1::iad1::abc123" }
    });

    expect(createRequestLogger("chat", request).requestId).toBe("bom1::iad1::abc123");
  });

  it("generates a request id otherwise", () => {
    const first = createRequestLogger("chat", new Request("http://localhost/api/chat"));
    const second = createRequestLogger("chat", new Request("http://localhost/api/chat"));

    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.requestId).not.toBe(second.requestId);
  });

  it("emits one JSON line with stage durations, time to first token and the outcome", () => {
    const logger = createRequestLogger("chat.stream", new Request("http://localhost/api/chat"));

    expect(logger.startedAt).toBe(Date.parse("2026-10-16T06:30:00.000Z"));
    vi.advanceTimersByTime(20);
    logger.mark("intake");
    vi.advanceTimersByTime(10);
    logger.mark("session");
    vi.advanceTimersByTime(5);
    logger.mark("routing");
    vi.advanceTimersByTime(200);
    logger.mark("retrieval");
    logger.mark("ttft");
    vi.advanceTimersByTime(800);
    logger.set({ intent: "profile", via: "fast-path" });
    logger.flush("ok");
    logger.flush("error");

    expect(loggedLines()).toEqual([
      {
        requestId: logger.requestId,
        route: "chat.stream",
        intent: "profile",
        via: "fast-path",
        timings: {
          intake_ms: 20,
          session_ms: 10,
          routing_ms: 5,
          retrieval_ms: 200,
          ttft_ms: 235,
          total_ms: 1035
        },
        outcome: "ok"
      }
    ]);
  });
});
