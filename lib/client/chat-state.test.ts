import { describe, expect, it } from "vitest";
import type { ChatDone } from "@/lib/chat/types";
import {
  chatReducer,
  initialChatState,
  lastAssistant,
  promptFor,
  type ChatEvent,
  type ChatState
} from "@/lib/client/chat-state";
import { clientError } from "@/lib/client/errors";
import type { AssistantMessage, TurnRecord } from "@/lib/client/types";

function reduce(events: ChatEvent[], state: ChatState = initialChatState) {
  return events.reduce(chatReducer, state);
}

function assistant(state: ChatState, id = "a1") {
  const message = state.messages.find((entry) => entry.id === id);
  if (!message || message.role !== "assistant") throw new Error(`no assistant message ${id}`);
  return message as AssistantMessage;
}

function turn(id: number, overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    id,
    sessionId: 7,
    userMessage: `question ${id}`,
    assistantMessage: `answer ${id}`,
    grounded: true,
    createdAt: "2026-10-16T10:00:00.000Z",
    metadata: {},
    ...overrides
  };
}

const done: ChatDone = {
  turnId: 41,
  sessionId: 7,
  answer: "Shubham built CommentAI.",
  intent: "profile",
  grounded: true,
  sources: [{ id: "s1", path: "data/resume.md", title: "Resume", section: "Projects", snippet: "CommentAI", url: null }],
  scheduling: null
};

const sent: ChatEvent = { type: "sent", userId: "u1", assistantId: "a1", text: "What did he build?" };

describe("chatReducer", () => {
  it("adds the user message and a pending answer optimistically", () => {
    const state = reduce([sent]);
    expect(state.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(state.messages[0]).toMatchObject({ text: "What did he build?", turnId: null, channel: "chat" });
    expect(assistant(state)).toMatchObject({ status: "pending", stage: null, text: "" });
    expect(state.streamingId).toBe("a1");
    expect(state.historyStatus).toBe("ready");
  });

  it("tracks the server stage until the first token, then streams", () => {
    let state = reduce([sent, { type: "stage", assistantId: "a1", stage: "searching" }]);
    expect(assistant(state)).toMatchObject({ status: "pending", stage: "searching" });

    state = reduce(
      [
        { type: "tokens", assistantId: "a1", text: "Shubham " },
        { type: "tokens", assistantId: "a1", text: "built" }
      ],
      state
    );
    expect(assistant(state)).toMatchObject({ status: "streaming", text: "Shubham built" });
  });

  it("ignores empty token batches without creating a new state", () => {
    const state = reduce([sent]);
    expect(chatReducer(state, { type: "tokens", assistantId: "a1", text: "" })).toBe(state);
  });

  it("completes with the authoritative answer, sources and turn ids", () => {
    const state = reduce([
      sent,
      { type: "tokens", assistantId: "a1", text: "Shubham built Comm" },
      { type: "done", assistantId: "a1", done }
    ]);
    expect(assistant(state)).toMatchObject({
      status: "complete",
      text: "Shubham built CommentAI.",
      turnId: 41,
      intent: "profile",
      grounded: true,
      sources: done.sources,
      stage: null
    });
    expect(state.messages[0].turnId).toBe(41);
    expect(state.sessionId).toBe(7);
    expect(state.streamingId).toBeNull();
    expect(state.lastCompletedAnswer).toEqual({ id: "a1", text: "Shubham built CommentAI." });
  });

  it("keeps the streamed text when done carries an empty answer", () => {
    const state = reduce([
      sent,
      { type: "tokens", assistantId: "a1", text: "Partial" },
      { type: "done", assistantId: "a1", done: { ...done, answer: "" } }
    ]);
    expect(assistant(state).text).toBe("Partial");
  });

  it("assigns the session from meta only when the chat has none", () => {
    let state = reduce([sent, { type: "session_assigned", sessionId: 7 }]);
    expect(state.sessionId).toBe(7);
    state = chatReducer(state, { type: "session_assigned", sessionId: 9 });
    expect(state.sessionId).toBe(7);
  });

  it("keeps partial text and marks the answer stopped", () => {
    const state = reduce([
      sent,
      { type: "stage", assistantId: "a1", stage: "searching" },
      { type: "tokens", assistantId: "a1", text: "Half an ans" },
      { type: "stopped", assistantId: "a1" }
    ]);
    expect(assistant(state)).toMatchObject({ status: "stopped", text: "Half an ans", stage: null });
    expect(state.streamingId).toBeNull();
  });

  it("records errors inline and starts the rate-limit window", () => {
    const state = reduce([
      sent,
      { type: "failed", assistantId: "a1", error: clientError("rate_limited", 12), at: 1_000 }
    ]);
    expect(assistant(state)).toMatchObject({ status: "error", error: { kind: "rate_limited", retryAfter: 12 } });
    expect(assistant(state).error?.message).toBe("You're sending messages quickly. Try again in 12s.");
    expect(state.rateLimitedUntil).toBe(13_000);
    expect(state.streamingId).toBeNull();
  });

  it("does not start a rate-limit window for other errors", () => {
    const state = reduce([sent, { type: "failed", assistantId: "a1", error: clientError("offline"), at: 1_000 }]);
    expect(state.rateLimitedUntil).toBeNull();
    expect(assistant(state).error?.kind).toBe("offline");
  });

  it("resets a failed answer to pending on retry and keeps its turn id and intent", () => {
    const failed = reduce([
      { type: "history_requested", sessionId: 7 },
      {
        type: "history_loaded",
        sessionId: 7,
        page: { turns: [turn(5, { metadata: { intent: "profile" } })], nextCursor: null }
      }
    ]);
    const state = chatReducer(failed, { type: "resent", assistantId: "turn-5" });
    expect(assistant(state, "turn-5")).toMatchObject({
      status: "pending",
      text: "",
      turnId: 5,
      intent: "profile",
      sources: []
    });
    expect(state.streamingId).toBe("turn-5");
  });

  it("ignores retry for an unknown message", () => {
    const state = reduce([sent]);
    expect(chatReducer(state, { type: "resent", assistantId: "missing" })).toBe(state);
  });

  it("maps history turns to message pairs, including stopped answers and metadata", () => {
    const state = reduce([
      { type: "history_requested", sessionId: 7 },
      {
        type: "history_loaded",
        sessionId: 7,
        page: {
          turns: [
            turn(3, { metadata: { intent: "profile", sources: done.sources } }),
            turn(4, { assistantMessage: "Partial", metadata: { intent: "scheduling", stopped: true } })
          ],
          nextCursor: 3
        }
      }
    ]);
    expect(state.historyStatus).toBe("ready");
    expect(state.messages.map((message) => message.id)).toEqual(["turn-3-user", "turn-3", "turn-4-user", "turn-4"]);
    expect(assistant(state, "turn-3")).toMatchObject({ intent: "profile", sources: done.sources });
    expect(assistant(state, "turn-4")).toMatchObject({ intent: "scheduling", status: "stopped" });
    expect(state.cursor).toBe(3);
  });

  it("drops a history response for a session the visitor already left", () => {
    const state = reduce([
      { type: "history_requested", sessionId: 7 },
      { type: "history_requested", sessionId: 8 },
      { type: "history_loaded", sessionId: 7, page: { turns: [turn(1)], nextCursor: null } }
    ]);
    expect(state.sessionId).toBe(8);
    expect(state.historyStatus).toBe("loading");
    expect(state.messages).toEqual([]);
  });

  it("keeps messages sent while history was still loading", () => {
    const state = reduce([
      { type: "history_requested", sessionId: 7 },
      sent,
      { type: "history_loaded", sessionId: 7, page: { turns: [turn(1)], nextCursor: null } }
    ]);
    expect(state.messages.map((message) => message.id)).toEqual(["turn-1-user", "turn-1", "u1", "a1"]);
  });

  it("prepends earlier pages and advances the cursor", () => {
    let state = reduce([
      { type: "history_requested", sessionId: 7 },
      { type: "history_loaded", sessionId: 7, page: { turns: [turn(5)], nextCursor: 5 } },
      { type: "earlier_requested" }
    ]);
    expect(state.earlierStatus).toBe("loading");
    state = chatReducer(state, { type: "earlier_loaded", sessionId: 7, page: { turns: [turn(4)], nextCursor: null } });
    expect(state.messages.map((message) => message.id)).toEqual(["turn-4-user", "turn-4", "turn-5-user", "turn-5"]);
    expect(state.cursor).toBeNull();
    expect(state.earlierStatus).toBe("idle");
    expect(chatReducer(state, { type: "earlier_requested" })).toBe(state);
  });

  it("marks a failed earlier page without touching the thread", () => {
    const loaded = reduce([
      { type: "history_requested", sessionId: 7 },
      { type: "history_loaded", sessionId: 7, page: { turns: [turn(5)], nextCursor: 5 } },
      { type: "earlier_requested" }
    ]);
    const state = chatReducer(loaded, { type: "earlier_failed", sessionId: 7 });
    expect(state.earlierStatus).toBe("error");
    expect(state.messages).toBe(loaded.messages);
  });

  it("starts a new chat but remembers the rate-limit window", () => {
    const state = reduce([
      sent,
      { type: "failed", assistantId: "a1", error: clientError("rate_limited", 5), at: 0 },
      { type: "reset" }
    ]);
    expect(state).toEqual({ ...initialChatState, rateLimitedUntil: 5_000 });
  });

  it("updates voice partials in place and appends finals for the same speaker", () => {
    let state = reduce([
      { type: "voice_transcript", id: "v1", entry: { role: "user", text: "Can I book", final: false } },
      { type: "voice_transcript", id: "v2", entry: { role: "user", text: "Can I book a call?", final: true } }
    ]);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ id: "v1", text: "Can I book a call?", channel: "voice" });

    state = reduce(
      [
        { type: "voice_transcript", id: "v3", entry: { role: "assistant", text: "Sure.", final: true } },
        { type: "voice_transcript", id: "v4", entry: { role: "assistant", text: "Which", final: false } }
      ],
      state
    );
    expect(state.messages).toHaveLength(2);
    expect(assistant(state, "v3")).toMatchObject({ text: "Sure. Which", status: "streaming", channel: "voice" });

    state = chatReducer(state, {
      type: "voice_transcript",
      id: "v5",
      entry: { role: "assistant", text: "Which day works?", final: true }
    });
    expect(assistant(state, "v3")).toMatchObject({ text: "Sure. Which day works?", status: "complete" });

    state = chatReducer(state, { type: "voice_transcript", id: "v6", entry: { role: "user", text: "Friday", final: true } });
    expect(state.messages.map((message) => message.id)).toEqual(["v1", "v3", "v6"]);
  });

  it("ignores blank voice transcripts", () => {
    const state = reduce([sent]);
    expect(chatReducer(state, { type: "voice_transcript", id: "v1", entry: { role: "user", text: "  ", final: true } })).toBe(
      state
    );
  });
});

describe("thread helpers", () => {
  it("finds the last assistant message and the prompt behind it", () => {
    const state = reduce([sent]);
    expect(lastAssistant(state.messages)?.id).toBe("a1");
    expect(promptFor(state.messages, "a1")).toBe("What did he build?");
    expect(promptFor(state.messages, "u1")).toBeNull();
    expect(lastAssistant([])).toBeNull();
  });
});
