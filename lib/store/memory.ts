import { pageSize, turnPage } from "@/lib/store/paging";
import type { SchedulingState } from "@/lib/scheduling/state";
import type { ChatStore, NewTurn, SessionSummary, TurnRecord } from "@/lib/store/types";

type StoredSession = SessionSummary & {
  visitorId: string;
  scheduling: SchedulingState | null;
  schedulingVersion: number;
};

function toSummary({ id, title, createdAt, updatedAt }: StoredSession): SessionSummary {
  return { id, title, createdAt, updatedAt };
}

function turnFields(turn: NewTurn) {
  return {
    userMessage: turn.userMessage,
    assistantMessage: turn.assistantMessage,
    grounded: turn.grounded,
    metadata: structuredClone(turn.metadata ?? {})
  };
}

export function createMemoryStore(): ChatStore {
  const sessions = new Map<number, StoredSession>();
  const turnsBySession = new Map<number, TurnRecord[]>();
  let lastSessionId = 0;
  let lastTurnId = 0;

  function ownedSession(visitorId: string, sessionId: number) {
    const session = sessions.get(sessionId);
    return session?.visitorId === visitorId ? session : null;
  }

  function existingSession(sessionId: number) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Chat session ${sessionId} does not exist.`);
    return session;
  }

  function turnsNewestFirst(sessionId: number) {
    const turns = turnsBySession.get(sessionId) ?? [];
    return turns.map((turn) => structuredClone(turn)).reverse();
  }

  return {
    async listSessions(visitorId, limit) {
      return [...sessions.values()]
        .filter((session) => session.visitorId === visitorId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
        .slice(0, pageSize(limit))
        .map(toSummary);
    },

    async getSession(visitorId, sessionId) {
      const session = ownedSession(visitorId, sessionId);
      return session
        ? {
            ...toSummary(session),
            scheduling: structuredClone(session.scheduling),
            schedulingVersion: session.schedulingVersion
          }
        : null;
    },

    async createSession(visitorId, title) {
      const now = new Date().toISOString();
      const session: StoredSession = {
        id: ++lastSessionId,
        title,
        createdAt: now,
        updatedAt: now,
        visitorId,
        scheduling: null,
        schedulingVersion: 0
      };
      sessions.set(session.id, session);
      return toSummary(session);
    },

    async renameSession(visitorId, sessionId, title) {
      const session = ownedSession(visitorId, sessionId);
      if (!session) return null;
      session.title = title;
      return toSummary(session);
    },

    async deleteSession(visitorId, sessionId) {
      if (!ownedSession(visitorId, sessionId)) return false;
      sessions.delete(sessionId);
      turnsBySession.delete(sessionId);
      return true;
    },

    async saveScheduling(sessionId, state, version) {
      const session = existingSession(sessionId);
      if (session.schedulingVersion !== version) return false;
      session.scheduling = structuredClone(state);
      session.schedulingVersion += 1;
      return true;
    },

    async listTurns(visitorId, sessionId, { before, limit }) {
      if (!ownedSession(visitorId, sessionId)) return null;
      const size = pageSize(limit);
      const older = turnsNewestFirst(sessionId).filter(
        (turn) => before === undefined || turn.id < before
      );
      return turnPage(older.slice(0, size + 1), size);
    },

    async recentTurns(sessionId, limit) {
      return turnsNewestFirst(sessionId).slice(0, limit).reverse();
    },

    async appendTurn(sessionId, turn) {
      const session = existingSession(sessionId);
      const record: TurnRecord = {
        id: ++lastTurnId,
        sessionId,
        ...turnFields(turn),
        createdAt: new Date().toISOString()
      };
      const sessionTurns = turnsBySession.get(sessionId) ?? [];
      sessionTurns.push(record);
      turnsBySession.set(sessionId, sessionTurns);
      session.updatedAt = record.createdAt;
      return structuredClone(record);
    },

    async replaceTurn(sessionId, turnId, turn) {
      const session = sessions.get(sessionId);
      const sessionTurns = turnsBySession.get(sessionId) ?? [];
      const latest = sessionTurns.at(-1);
      if (!session || latest?.id !== turnId) return null;

      const record: TurnRecord = { ...latest, ...turnFields(turn) };
      sessionTurns[sessionTurns.length - 1] = record;
      session.updatedAt = new Date().toISOString();
      return structuredClone(record);
    }
  };
}
