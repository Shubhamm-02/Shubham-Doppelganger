import type { ChatAction, ChatIntent, ChatStage, SchedulingSnapshot, Source, TurnMetadata } from "@/lib/chat/types";

export type SessionSummary = { id: number; title: string; createdAt: string; updatedAt: string };

export type TurnRecord = {
  id: number;
  sessionId: number;
  userMessage: string;
  assistantMessage: string | null;
  grounded: boolean | null;
  createdAt: string;
  metadata: TurnMetadata;
};

export type TurnPage = { turns: TurnRecord[]; nextCursor: number | null };

export type ChatRequest = {
  message: string;
  sessionId?: number;
  action?: ChatAction;
  replaceTurnId?: number;
};

export type ClientErrorKind = "rate_limited" | "offline" | "not_found" | "invalid" | "server" | "network";

export type ClientError = { kind: ClientErrorKind; message: string; retryAfter?: number };

export type UserMessage = {
  id: string;
  role: "user";
  text: string;
  turnId: number | null;
  channel: "chat" | "voice";
};

export type AssistantMessage = {
  id: string;
  role: "assistant";
  text: string;
  turnId: number | null;
  channel: "chat" | "voice";
  status: "pending" | "streaming" | "complete" | "stopped" | "error";
  intent: ChatIntent | null;
  stage: ChatStage | null;
  sources: Source[];
  scheduling: SchedulingSnapshot | null;
  grounded: boolean | null;
  error: ClientError | null;
};

export type ThreadMessage = UserMessage | AssistantMessage;
