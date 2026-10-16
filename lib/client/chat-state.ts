import type { ChatDone, ChatStage } from "@/lib/chat/types";
import type { AssistantMessage, ClientError, ThreadMessage, TurnPage, TurnRecord, UserMessage } from "@/lib/client/types";

export type HistoryStatus = "idle" | "loading" | "ready" | "error";
export type EarlierStatus = "idle" | "loading" | "error";
export type VoiceTranscriptEntry = { role: "user" | "assistant"; text: string; final: boolean };

export type ChatState = {
  sessionId: number | null;
  messages: ThreadMessage[];
  historyStatus: HistoryStatus;
  cursor: number | null;
  earlierStatus: EarlierStatus;
  streamingId: string | null;
  lastCompletedAnswer: { id: string; text: string } | null;
  rateLimitedUntil: number | null;
  voiceDraft: { id: string; committed: string } | null;
};

export type ChatEvent =
  | { type: "reset" }
  | { type: "history_requested"; sessionId: number }
  | { type: "history_loaded"; sessionId: number; page: TurnPage }
  | { type: "history_failed"; sessionId: number }
  | { type: "earlier_requested" }
  | { type: "earlier_loaded"; sessionId: number; page: TurnPage }
  | { type: "earlier_failed"; sessionId: number }
  | { type: "sent"; userId: string; assistantId: string; text: string }
  | { type: "resent"; assistantId: string }
  | { type: "session_assigned"; sessionId: number }
  | { type: "stage"; assistantId: string; stage: ChatStage }
  | { type: "tokens"; assistantId: string; text: string }
  | { type: "done"; assistantId: string; done: ChatDone }
  | { type: "failed"; assistantId: string; error: ClientError; at: number }
  | { type: "stopped"; assistantId: string }
  | { type: "voice_transcript"; id: string; entry: VoiceTranscriptEntry };

export const initialChatState: ChatState = {
  sessionId: null,
  messages: [],
  historyStatus: "idle",
  cursor: null,
  earlierStatus: "idle",
  streamingId: null,
  lastCompletedAnswer: null,
  rateLimitedUntil: null,
  voiceDraft: null
};

function pendingAssistant(id: string): AssistantMessage {
  return {
    id,
    role: "assistant",
    text: "",
    turnId: null,
    channel: "chat",
    status: "pending",
    intent: null,
    stage: null,
    sources: [],
    scheduling: null,
    grounded: null,
    error: null
  };
}

function turnToMessages(turn: TurnRecord): [UserMessage, AssistantMessage] {
  const stopped = turn.metadata.stopped === true || turn.assistantMessage === null;
  return [
    { id: `turn-${turn.id}-user`, role: "user", text: turn.userMessage, turnId: turn.id, channel: "chat" },
    {
      id: `turn-${turn.id}`,
      role: "assistant",
      text: turn.assistantMessage ?? "",
      turnId: turn.id,
      channel: "chat",
      status: stopped ? "stopped" : "complete",
      intent: turn.metadata.intent ?? null,
      stage: null,
      sources: turn.metadata.sources ?? [],
      scheduling: turn.metadata.scheduling ?? null,
      grounded: turn.grounded,
      error: null
    }
  ];
}

function pageToMessages(page: TurnPage) {
  return page.turns.flatMap(turnToMessages);
}

function updateAssistant(state: ChatState, id: string, update: (message: AssistantMessage) => AssistantMessage) {
  let changed = false;
  const messages = state.messages.map((message) => {
    if (message.id !== id || message.role !== "assistant") return message;
    changed = true;
    return update(message);
  });
  return changed ? messages : state.messages;
}

function settle(state: ChatState, assistantId: string, messages: ThreadMessage[]): ChatState {
  return {
    ...state,
    messages,
    streamingId: state.streamingId === assistantId ? null : state.streamingId
  };
}

function withUserTurnId(messages: ThreadMessage[], assistantId: string, turnId: number | null) {
  const index = messages.findIndex((message) => message.id === assistantId);
  const previous = messages[index - 1];
  if (index < 1 || previous.role !== "user" || turnId === null) return messages;
  return messages.map((message, position) => (position === index - 1 ? { ...message, turnId } : message));
}

function applyVoiceTranscript(state: ChatState, id: string, entry: VoiceTranscriptEntry): ChatState {
  const text = entry.text.trim();
  if (!text) return state;
  const last = state.messages[state.messages.length - 1];
  const draft = state.voiceDraft;
  const continuing = draft !== null && last?.id === draft.id && last.role === entry.role;

  if (continuing) {
    const combined = draft.committed ? `${draft.committed} ${text}` : text;
    const messages = state.messages.map((message) => {
      if (message.id !== draft.id) return message;
      if (message.role === "user") return { ...message, text: combined };
      return { ...message, text: combined, status: entry.final ? ("complete" as const) : ("streaming" as const) };
    });
    return { ...state, messages, voiceDraft: { id: draft.id, committed: entry.final ? combined : draft.committed } };
  }

  const message: ThreadMessage =
    entry.role === "user"
      ? { id, role: "user", text, turnId: null, channel: "voice" }
      : { ...pendingAssistant(id), text, channel: "voice", status: entry.final ? "complete" : "streaming" };
  return {
    ...state,
    messages: [...state.messages, message],
    voiceDraft: { id, committed: entry.final ? text : "" }
  };
}

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "reset":
      return { ...initialChatState, rateLimitedUntil: state.rateLimitedUntil };

    case "history_requested":
      return {
        ...initialChatState,
        sessionId: event.sessionId,
        historyStatus: "loading",
        rateLimitedUntil: state.rateLimitedUntil
      };

    case "history_loaded":
      if (event.sessionId !== state.sessionId) return state;
      return {
        ...state,
        messages: [...pageToMessages(event.page), ...state.messages],
        historyStatus: "ready",
        cursor: event.page.nextCursor,
        earlierStatus: "idle"
      };

    case "history_failed":
      if (event.sessionId !== state.sessionId) return state;
      return { ...state, historyStatus: "error" };

    case "earlier_requested":
      if (state.cursor === null || state.historyStatus !== "ready") return state;
      return { ...state, earlierStatus: "loading" };

    case "earlier_loaded":
      if (event.sessionId !== state.sessionId) return state;
      return {
        ...state,
        messages: [...pageToMessages(event.page), ...state.messages],
        cursor: event.page.nextCursor,
        earlierStatus: "idle"
      };

    case "earlier_failed":
      if (event.sessionId !== state.sessionId) return state;
      return { ...state, earlierStatus: "error" };

    case "sent":
      return {
        ...state,
        historyStatus: state.historyStatus === "idle" ? "ready" : state.historyStatus,
        messages: [
          ...state.messages,
          { id: event.userId, role: "user", text: event.text, turnId: null, channel: "chat" },
          pendingAssistant(event.assistantId)
        ],
        streamingId: event.assistantId,
        voiceDraft: null
      };

    case "resent": {
      const messages = updateAssistant(state, event.assistantId, (message) => ({
        ...pendingAssistant(message.id),
        turnId: message.turnId,
        intent: message.intent
      }));
      if (messages === state.messages) return state;
      return { ...state, messages, streamingId: event.assistantId };
    }

    case "session_assigned":
      return state.sessionId === null ? { ...state, sessionId: event.sessionId } : state;

    case "stage":
      return {
        ...state,
        messages: updateAssistant(state, event.assistantId, (message) => ({ ...message, stage: event.stage }))
      };

    case "tokens":
      if (!event.text) return state;
      return {
        ...state,
        messages: updateAssistant(state, event.assistantId, (message) => ({
          ...message,
          text: message.text + event.text,
          status: "streaming"
        }))
      };

    case "done": {
      const { done } = event;
      const text = done.answer || state.messages.find((message) => message.id === event.assistantId)?.text || "";
      const messages = updateAssistant(state, event.assistantId, (message) => ({
        ...message,
        text,
        turnId: done.turnId ?? message.turnId,
        status: "complete",
        intent: done.intent,
        stage: null,
        sources: done.sources,
        scheduling: done.scheduling,
        grounded: done.grounded,
        error: null
      }));
      if (messages === state.messages) return state;
      return {
        ...settle(state, event.assistantId, withUserTurnId(messages, event.assistantId, done.turnId)),
        sessionId: state.sessionId ?? done.sessionId,
        lastCompletedAnswer: { id: event.assistantId, text }
      };
    }

    case "failed": {
      const { error } = event;
      const settled = settle(
        state,
        event.assistantId,
        updateAssistant(state, event.assistantId, (message) => ({ ...message, status: "error", stage: null, error }))
      );
      return error.kind === "rate_limited" && error.retryAfter
        ? { ...settled, rateLimitedUntil: event.at + error.retryAfter * 1000 }
        : settled;
    }

    case "stopped":
      return settle(
        state,
        event.assistantId,
        updateAssistant(state, event.assistantId, (message) => ({ ...message, status: "stopped", stage: null }))
      );

    case "voice_transcript":
      return applyVoiceTranscript(state, event.id, event.entry);
  }
}

export function lastAssistant(messages: ThreadMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") return message;
  }
  return null;
}

export function promptFor(messages: ThreadMessage[], assistantId: string) {
  const index = messages.findIndex((message) => message.id === assistantId);
  const previous = index > 0 ? messages[index - 1] : null;
  return previous?.role === "user" ? previous.text : null;
}
