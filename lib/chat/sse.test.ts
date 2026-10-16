import { describe, expect, it } from "vitest";
import { createSseParser, encodeSseEvent } from "@/lib/chat/sse";
import type { ChatDone, ChatStreamEvent } from "@/lib/chat/types";

const DONE: ChatDone = {
  turnId: 7,
  sessionId: 3,
  answer: "Line one\nLine two",
  intent: "profile",
  grounded: true,
  sources: [],
  scheduling: null
};

function parseAll(chunks: string[]) {
  const events: ChatStreamEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  chunks.forEach(parser.push);
  return events;
}

describe("encodeSseEvent", () => {
  it("writes one event line and one data line ending in a blank line", () => {
    expect(encodeSseEvent({ event: "status", data: { stage: "searching" } })).toBe(
      'event: status\ndata: {"stage":"searching"}\n\n'
    );
  });

  it("keeps newlines in the payload escaped inside a single data line", () => {
    const encoded = encodeSseEvent({ event: "done", data: DONE });

    expect(encoded.split("\n").filter(Boolean)).toHaveLength(2);
    expect(parseAll([encoded])).toEqual([{ event: "done", data: DONE }]);
  });
});

describe("createSseParser", () => {
  const stream = [
    encodeSseEvent({ event: "meta", data: { sessionId: 3 } }),
    encodeSseEvent({ event: "status", data: { stage: "searching" } }),
    encodeSseEvent({ event: "token", data: { token: "Hi " } }),
    encodeSseEvent({ event: "done", data: DONE })
  ].join("");

  it("parses events in order", () => {
    expect(parseAll([stream]).map((event) => event.event)).toEqual([
      "meta",
      "status",
      "token",
      "done"
    ]);
  });

  it("round-trips an error event", () => {
    const error: ChatStreamEvent = {
      event: "error",
      data: { code: "internal", message: "Something broke" }
    };

    expect(parseAll([encodeSseEvent(error)])).toEqual([error]);
  });

  it("gives the same events however the stream is split into chunks", () => {
    const expected = parseAll([stream]);

    for (let size = 1; size <= 7; size += 1) {
      const chunks = stream.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? [];
      expect(parseAll(chunks)).toEqual(expected);
    }
  });

  it("accepts CRLF and CR line endings, including a CRLF split across chunks", () => {
    const crlf = 'event: token\r\ndata: {"token":"a"}\r\n\r\n';
    const cr = 'event: token\rdata: {"token":"b"}\r\r';

    expect(parseAll([crlf, cr])).toEqual([
      { event: "token", data: { token: "a" } },
      { event: "token", data: { token: "b" } }
    ]);
    expect(parseAll(['event: token\r', '\ndata: {"token":"c"}\r', "\n\r", "\n"])).toEqual([
      { event: "token", data: { token: "c" } }
    ]);
  });

  it("joins multi-line data with newlines", () => {
    expect(parseAll(['event: token\ndata: {"token":\ndata: "x"}\n\n'])).toEqual([
      { event: "token", data: { token: "x" } }
    ]);
  });

  it("ignores comments, unknown fields and events, events without data and invalid JSON", () => {
    const events = parseAll([
      ": stream-open\n\n",
      "id: 4\nretry: 1000\n\n",
      'event: ping\ndata: {}\n\n',
      "event: token\n\n",
      "event: token\ndata: {broken\n\n",
      'data: {"token":"unnamed"}\n\n',
      'event:token\ndata:{"token":"tight"}\n\n'
    ]);

    expect(events).toEqual([{ event: "token", data: { token: "tight" } }]);
  });

  it("does not dispatch an event until its blank line arrives", () => {
    expect(parseAll(['event: token\ndata: {"token":"late"}\n'])).toEqual([]);
  });

  it("dispatches a last event without its blank line on flush", () => {
    const events: ChatStreamEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push('event: token\ndata: {"token":"last"}');
    expect(events).toEqual([]);
    parser.flush();
    expect(events).toEqual([{ event: "token", data: { token: "last" } }]);
  });
});
