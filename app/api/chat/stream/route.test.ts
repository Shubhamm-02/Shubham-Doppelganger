import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSink, PreparedChatTurn } from "@/lib/chat/handle-message";
import type { ChatDone, ChatStreamEvent } from "@/lib/chat/types";

const mocks = vi.hoisted(() => ({ startChatTurn: vi.fn(), runChatTurn: vi.fn() }));

vi.mock("@/lib/chat/handle-message", () => mocks);

import { POST } from "@/app/api/chat/stream/route";
import { createSseParser } from "@/lib/chat/sse";

const DONE: ChatDone = {
  turnId: 1,
  sessionId: 2,
  answer: "Hi there",
  intent: "profile",
  grounded: true,
  sources: [],
  scheduling: null
};

type RunOptions = { signal: AbortSignal };

function chatRequest() {
  return new Request("http://localhost/api/chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Hi" })
  });
}

async function readEvents(response: Response) {
  const events: ChatStreamEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  parser.push(await response.text());
  return events;
}

beforeEach(() => {
  mocks.startChatTurn.mockReset().mockResolvedValue({ message: "Hi" } as PreparedChatTurn);
  mocks.runChatTurn.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/chat/stream", () => {
  it("streams meta, status and tokens before done, with SSE headers", async () => {
    mocks.runChatTurn.mockImplementation(async (_turn: PreparedChatTurn, sink: ChatSink) => {
      sink.meta(2);
      sink.status("searching");
      sink.token("Hi ");
      sink.token("there");
      return DONE;
    });

    const response = await POST(chatRequest());

    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await readEvents(response)).toEqual([
      { event: "meta", data: { sessionId: 2 } },
      { event: "status", data: { stage: "searching" } },
      { event: "token", data: { token: "Hi " } },
      { event: "token", data: { token: "there" } },
      { event: "done", data: DONE }
    ]);
  });

  it("returns a rejection from startChatTurn as is", async () => {
    const rejection = Response.json({ error: { code: "not_found" } }, { status: 404 });
    mocks.startChatTurn.mockResolvedValue(rejection);

    expect(await POST(chatRequest())).toBe(rejection);
    expect(mocks.runChatTurn).not.toHaveBeenCalled();
  });

  it("ends with an error event when answering fails after the stream opened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runChatTurn.mockImplementation(async (_turn: PreparedChatTurn, sink: ChatSink) => {
      sink.meta(2);
      sink.token("Hi ");
      throw new Error("model went away");
    });

    const events = await readEvents(await POST(chatRequest()));

    expect(events.map((event) => event.event)).toEqual(["meta", "token", "error"]);
    expect(events.at(-1)).toEqual({
      event: "error",
      data: {
        code: "internal",
        message: "I hit an error while streaming the answer. Please try again in a moment."
      }
    });
  });

  it("aborts the turn and sends nothing more when the reader cancels", async () => {
    let signal: AbortSignal | undefined;
    let finish: () => void = () => {};
    mocks.runChatTurn.mockImplementation(
      async (_turn: PreparedChatTurn, sink: ChatSink, options: RunOptions) => {
        signal = options.signal;
        sink.token("Hi ");
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        sink.token("there");
        return null;
      }
    );

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const reader = (await POST(chatRequest())).body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(signal?.aborted).toBe(true);
    finish();

    await vi.waitFor(() => expect(info).toHaveBeenCalledOnce());
    expect(JSON.parse(String(info.mock.calls[0][0])).outcome).toBe("stopped");
  });
});
