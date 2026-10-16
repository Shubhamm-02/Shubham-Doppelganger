type TimingStage = "intake" | "session" | "routing" | "retrieval" | "calendar" | "ttft";

type RequestOutcome = "ok" | "stopped" | "rejected" | "error";

export type RequestLogger = {
  requestId: string;
  startedAt: number;
  mark(stage: TimingStage): void;
  set(fields: Record<string, string | number | boolean | null>): void;
  flush(outcome: RequestOutcome): void;
};

export function createRequestLogger(route: string, request: Request): RequestLogger {
  const requestId = request.headers.get("x-vercel-id")?.trim() || crypto.randomUUID();
  const startedAt = Date.now();
  const fields: Record<string, string | number | boolean | null> = {};
  const timings: Record<string, number> = {};
  let lastMarkAt = startedAt;
  let flushed = false;

  return {
    requestId,
    startedAt,
    // Each stage records the time since the previous mark; ttft is measured from the request start.
    mark(stage) {
      const now = Date.now();
      timings[`${stage}_ms`] = now - (stage === "ttft" ? startedAt : lastMarkAt);
      if (stage !== "ttft") lastMarkAt = now;
    },
    set(values) {
      Object.assign(fields, values);
    },
    flush(outcome) {
      if (flushed) return;
      flushed = true;
      timings.total_ms = Date.now() - startedAt;
      console.info(JSON.stringify({ requestId, route, ...fields, timings, outcome }));
    }
  };
}
