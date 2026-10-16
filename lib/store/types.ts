import type { TurnMetadata } from "@/lib/chat/types";
import type { SchedulingState } from "@/lib/scheduling/state";

export type SessionSummary = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = SessionSummary & {
  scheduling: SchedulingState | null;
  schedulingVersion: number;
};

export type TurnRecord = {
  id: number;
  sessionId: number;
  userMessage: string;
  assistantMessage: string | null;
  grounded: boolean | null;
  metadata: TurnMetadata;
  createdAt: string;
};

export type NewTurn = {
  userMessage: string;
  assistantMessage: string;
  grounded: boolean;
  retrievedDocumentIds: number[];
  latencyMs: number;
  metadata?: TurnMetadata;
};

export type TurnPage = { turns: TurnRecord[]; nextCursor: number | null };

export interface ChatStore {
  listSessions(visitorId: string, limit: number): Promise<SessionSummary[]>;
  getSession(visitorId: string, sessionId: number): Promise<SessionRecord | null>;
  createSession(visitorId: string, title: string): Promise<SessionSummary>;
  renameSession(
    visitorId: string,
    sessionId: number,
    title: string
  ): Promise<SessionSummary | null>;
  deleteSession(visitorId: string, sessionId: number): Promise<boolean>;
  // Writes only while the stored version still equals `version`, and bumps it; resolves to
  // false, writing nothing, when another request saved first.
  saveScheduling(sessionId: number, state: SchedulingState, version: number): Promise<boolean>;
  listTurns(
    visitorId: string,
    sessionId: number,
    options: { before?: number; limit: number }
  ): Promise<TurnPage | null>;
  recentTurns(sessionId: number, limit: number): Promise<TurnRecord[]>;
  appendTurn(sessionId: number, turn: NewTurn): Promise<TurnRecord>;
  // Resolves to null unless turnId is the newest turn of the session.
  replaceTurn(sessionId: number, turnId: number, turn: NewTurn): Promise<TurnRecord | null>;
}
