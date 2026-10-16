"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ChatAction, ChatStreamEvent } from "@/lib/chat/types";
import { fetchTurns, streamChat } from "@/lib/client/api";
import {
  chatReducer,
  initialChatState,
  lastAssistant,
  promptFor,
  type ChatEvent,
  type ChatState,
  type VoiceTranscriptEntry
} from "@/lib/client/chat-state";
import { clientError, fromApiErrorCode, isAbortError, toClientError } from "@/lib/client/errors";
import type { ChatRequest, SessionSummary } from "@/lib/client/types";

export type UseChatStreamOptions = {
  onSessionCreated(session: SessionSummary): void;
  onTurnSettled(sessionId: number): void;
};

type Prompt = { message: string; action?: ChatAction };

type StreamRun = {
  assistantId: string;
  controller: AbortController;
  pending: string;
  frame: number;
};

const TITLE_LENGTH = 60;

let nextLocalId = 0;

function localId(prefix: string) {
  nextLocalId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextLocalId}`;
}

function provisionalTitle(message: string) {
  const line = message.split("\n")[0].trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
}

function createChatController() {
  let state: ChatState = initialChatState;
  const listeners = new Set<() => void>();
  let callbacks: UseChatStreamOptions = { onSessionCreated() {}, onTurnSettled() {} };
  let active: StreamRun | null = null;
  let history: AbortController | null = null;
  let earlier: AbortController | null = null;
  const prompts = new Map<string, Prompt>();

  function dispatch(event: ChatEvent) {
    const next = chatReducer(state, event);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener());
  }

  function flush(run: StreamRun) {
    if (run.frame) cancelAnimationFrame(run.frame);
    run.frame = 0;
    if (!run.pending) return;
    const text = run.pending;
    run.pending = "";
    dispatch({ type: "tokens", assistantId: run.assistantId, text });
  }

  function queueToken(run: StreamRun, token: string) {
    run.pending += token;
    if (run.frame) return;
    run.frame = requestAnimationFrame(() => {
      run.frame = 0;
      if (active === run) flush(run);
    });
  }

  function discardStream() {
    const run = active;
    if (!run) return;
    active = null;
    if (run.frame) cancelAnimationFrame(run.frame);
    run.controller.abort();
  }

  function abortFetches() {
    history?.abort();
    earlier?.abort();
    history = null;
    earlier = null;
  }

  function finish(run: StreamRun) {
    flush(run);
    active = null;
  }

  function handleEvent(run: StreamRun, request: ChatRequest, event: ChatStreamEvent) {
    if (active !== run) return;
    switch (event.event) {
      case "token":
        queueToken(run, event.data.token);
        return;
      case "meta": {
        const sessionId = event.data.sessionId;
        if (sessionId === null || state.sessionId !== null) return;
        dispatch({ type: "session_assigned", sessionId });
        const now = new Date().toISOString();
        callbacks.onSessionCreated({ id: sessionId, title: provisionalTitle(request.message), createdAt: now, updatedAt: now });
        return;
      }
      case "status":
        flush(run);
        dispatch({ type: "stage", assistantId: run.assistantId, stage: event.data.stage });
        return;
      case "done": {
        finish(run);
        dispatch({ type: "done", assistantId: run.assistantId, done: event.data });
        const sessionId = event.data.sessionId ?? state.sessionId;
        if (sessionId !== null) callbacks.onTurnSettled(sessionId);
        return;
      }
      case "error":
        finish(run);
        dispatch({ type: "failed", assistantId: run.assistantId, error: fromApiErrorCode(event.data.code), at: Date.now() });
    }
  }

  // The server saves a stopped answer only after it notices the cut stream, so that turn's id never
  // reaches this client. Retrying should replace the saved turn rather than add a second one.
  function stoppedTurnId(sessionId: number, message: string, signal: AbortSignal) {
    return fetchTurns(sessionId, { limit: 1, signal })
      .then(({ turns }) => {
        const latest = turns.at(-1);
        if (!latest?.metadata.stopped || latest.metadata.intent === "scheduling") return null;
        if (latest.userMessage !== message) return null;
        return state.messages.some((entry) => entry.turnId === latest.id) ? null : latest.id;
      })
      .catch(() => null);
  }

  function run(assistantId: string, prompt: Prompt, replaceTurnId: number | null, findStoppedTurn = false) {
    discardStream();
    const current: StreamRun = { assistantId, controller: new AbortController(), pending: "", frame: 0 };
    active = current;
    prompts.set(assistantId, prompt);
    const { signal } = current.controller;
    const sessionId = state.sessionId;
    const turnId =
      findStoppedTurn && sessionId !== null
        ? stoppedTurnId(sessionId, prompt.message, signal)
        : Promise.resolve(replaceTurnId);

    turnId
      .then((resolvedTurnId) => {
        const request: ChatRequest = { message: prompt.message };
        if (prompt.action) request.action = prompt.action;
        if (sessionId !== null) request.sessionId = sessionId;
        if (resolvedTurnId !== null) request.replaceTurnId = resolvedTurnId;
        return streamChat(request, { signal, onEvent: (event) => handleEvent(current, request, event) });
      })
      .then(() => {
        if (active !== current) return;
        finish(current);
        dispatch({ type: "failed", assistantId, error: clientError("server"), at: Date.now() });
      })
      .catch((error: unknown) => {
        if (active !== current) return;
        finish(current);
        if (isAbortError(error)) return;
        dispatch({ type: "failed", assistantId, error: toClientError(error), at: Date.now() });
      });
  }

  function send(text: string, options: { action?: ChatAction } = {}) {
    const message = text.trim();
    if (!message || active) return;
    const assistantId = localId("assistant");
    dispatch({ type: "sent", userId: localId("user"), assistantId, text: message });
    run(assistantId, { message, action: options.action }, null);
  }

  function stop() {
    const current = active;
    if (!current) return;
    flush(current);
    active = null;
    current.controller.abort();
    dispatch({ type: "stopped", assistantId: current.assistantId });
    if (state.sessionId !== null) callbacks.onTurnSettled(state.sessionId);
  }

  function retry(assistantId: string) {
    if (active) return;
    const message = state.messages.find((entry) => entry.id === assistantId);
    if (!message || message.role !== "assistant" || message.channel !== "chat") return;
    const text = promptFor(state.messages, assistantId);
    const prompt = prompts.get(assistantId) ?? (text ? { message: text } : null);
    if (!prompt) return;
    // Only profile answers are replaced in place; the server refuses to rerun a booking reply.
    const replaceable = !prompt.action && message.intent !== "scheduling";
    dispatch({ type: "resent", assistantId });
    run(assistantId, prompt, replaceable ? message.turnId : null, replaceable && message.turnId === null);
  }

  function regenerate() {
    const last = lastAssistant(state.messages);
    if (last && last.status !== "pending" && last.status !== "streaming") retry(last.id);
  }

  function loadHistory(sessionId: number) {
    discardStream();
    abortFetches();
    const controller = new AbortController();
    history = controller;
    dispatch({ type: "history_requested", sessionId });
    fetchTurns(sessionId, { signal: controller.signal })
      .then((page) => {
        if (history !== controller) return;
        history = null;
        dispatch({ type: "history_loaded", sessionId, page });
      })
      .catch((error: unknown) => {
        if (history !== controller || isAbortError(error)) return;
        history = null;
        dispatch({ type: "history_failed", sessionId });
      });
  }

  function openSession(sessionId: number) {
    if (state.sessionId === sessionId && state.historyStatus !== "error") return;
    loadHistory(sessionId);
  }

  function reloadHistory() {
    if (state.sessionId !== null) loadHistory(state.sessionId);
  }

  function loadEarlier() {
    const { sessionId, cursor } = state;
    if (sessionId === null || cursor === null || state.earlierStatus === "loading") return;
    const controller = new AbortController();
    earlier = controller;
    dispatch({ type: "earlier_requested" });
    fetchTurns(sessionId, { before: cursor, signal: controller.signal })
      .then((page) => {
        if (earlier !== controller) return;
        earlier = null;
        dispatch({ type: "earlier_loaded", sessionId, page });
      })
      .catch((error: unknown) => {
        if (earlier !== controller || isAbortError(error)) return;
        earlier = null;
        dispatch({ type: "earlier_failed", sessionId });
      });
  }

  function newChat() {
    discardStream();
    abortFetches();
    prompts.clear();
    dispatch({ type: "reset" });
  }

  function appendVoiceTranscript(entry: VoiceTranscriptEntry) {
    dispatch({ type: "voice_transcript", id: localId("voice"), entry });
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setCallbacks(next: UseChatStreamOptions) {
      callbacks = next;
    },
    dispose() {
      discardStream();
      abortFetches();
    },
    actions: { send, stop, retry, regenerate, openSession, newChat, loadEarlier, reloadHistory, appendVoiceTranscript }
  };
}

export function useChatStream({ onSessionCreated, onTurnSettled }: UseChatStreamOptions) {
  const [controller] = useState(createChatController);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    controller.setCallbacks({ onSessionCreated, onTurnSettled });
  }, [controller, onSessionCreated, onTurnSettled]);

  useEffect(() => () => controller.dispose(), [controller]);

  return {
    sessionId: state.sessionId,
    messages: state.messages,
    historyStatus: state.historyStatus,
    hasEarlier: state.cursor !== null,
    earlierStatus: state.earlierStatus,
    isStreaming: state.streamingId !== null,
    lastCompletedAnswer: state.lastCompletedAnswer,
    rateLimitedUntil: state.rateLimitedUntil,
    ...controller.actions
  };
}

export type ChatStream = ReturnType<typeof useChatStream>;
