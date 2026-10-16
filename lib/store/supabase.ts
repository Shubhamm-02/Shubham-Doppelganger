import type { SupabaseClient } from "@supabase/supabase-js";
import type { TurnMetadata } from "@/lib/chat/types";
import { parseSchedulingState } from "@/lib/scheduling/state";
import { pageSize, turnPage } from "@/lib/store/paging";
import type {
  ChatStore,
  NewTurn,
  SessionRecord,
  SessionSummary,
  TurnRecord
} from "@/lib/store/types";

type SessionRow = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
};

type SessionRecordRow = SessionRow & { scheduling: unknown; scheduling_version: number };

type TurnRow = {
  id: number;
  session_id: number;
  user_message: string;
  assistant_message: string | null;
  grounded: boolean | null;
  metadata: TurnMetadata;
  created_at: string;
};

const SESSION_COLUMNS = "id,title,created_at,updated_at";
const SESSION_RECORD_COLUMNS = `${SESSION_COLUMNS},scheduling,scheduling_version`;
const TURN_COLUMNS =
  "id,session_id,user_message,assistant_message,grounded,metadata,created_at";

function toSessionSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toSessionRecord(row: SessionRecordRow): SessionRecord {
  return {
    ...toSessionSummary(row),
    scheduling: row.scheduling === null ? null : parseSchedulingState(row.scheduling),
    schedulingVersion: row.scheduling_version
  };
}

function toTurnRecord(row: TurnRow): TurnRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    grounded: row.grounded,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function turnColumns(turn: NewTurn) {
  return {
    user_message: turn.userMessage,
    assistant_message: turn.assistantMessage,
    retrieved_document_ids: turn.retrievedDocumentIds,
    grounded: turn.grounded,
    latency_ms: turn.latencyMs,
    metadata: turn.metadata ?? {}
  };
}

export function createSupabaseStore(supabase: SupabaseClient): ChatStore {
  async function getSession(visitorId: string, sessionId: number) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select(SESSION_RECORD_COLUMNS)
      .eq("id", sessionId)
      .eq("visitor_id", visitorId)
      .maybeSingle<SessionRecordRow>();

    if (error) throw error;
    return data ? toSessionRecord(data) : null;
  }

  async function turnsNewestFirst(sessionId: number, limit: number, before?: number) {
    let query = supabase
      .from("conversations")
      .select(TURN_COLUMNS)
      .eq("session_id", sessionId)
      .eq("channel", "chat");

    if (before !== undefined) query = query.lt("id", before);

    const { data, error } = await query
      .order("id", { ascending: false })
      .limit(limit)
      .overrideTypes<TurnRow[], { merge: false }>();

    if (error) throw error;
    return data.map(toTurnRecord);
  }

  async function touchSession(sessionId: number, updatedAt: string) {
    const { error } = await supabase
      .from("chat_sessions")
      .update({ updated_at: updatedAt })
      .eq("id", sessionId);

    // The turn is already saved; a stale updated_at only affects the session list order.
    if (error) console.warn("Chat session activity time was not updated.", error);
  }

  return {
    async listSessions(visitorId, limit) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select(SESSION_COLUMNS)
        .eq("visitor_id", visitorId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize(limit))
        .overrideTypes<SessionRow[], { merge: false }>();

      if (error) throw error;
      return data.map(toSessionSummary);
    },

    getSession,

    async createSession(visitorId, title) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ visitor_id: visitorId, title })
        .select(SESSION_COLUMNS)
        .single<SessionRow>();

      if (error) throw error;
      return toSessionSummary(data);
    },

    async renameSession(visitorId, sessionId, title) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .update({ title })
        .eq("id", sessionId)
        .eq("visitor_id", visitorId)
        .select(SESSION_COLUMNS)
        .maybeSingle<SessionRow>();

      if (error) throw error;
      return data ? toSessionSummary(data) : null;
    },

    async deleteSession(visitorId, sessionId) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("visitor_id", visitorId)
        .select("id");

      if (error) throw error;
      return data.length > 0;
    },

    async saveScheduling(sessionId, state, version) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .update({ scheduling: state, scheduling_version: version + 1 })
        .eq("id", sessionId)
        .eq("scheduling_version", version)
        .select("id");

      if (error) throw error;
      return data.length > 0;
    },

    async listTurns(visitorId, sessionId, { before, limit }) {
      if (!(await getSession(visitorId, sessionId))) return null;
      const size = pageSize(limit);
      return turnPage(await turnsNewestFirst(sessionId, size + 1, before), size);
    },

    async recentTurns(sessionId, limit) {
      return (await turnsNewestFirst(sessionId, limit)).reverse();
    },

    async appendTurn(sessionId, turn) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ session_id: sessionId, channel: "chat", ...turnColumns(turn) })
        .select(TURN_COLUMNS)
        .single<TurnRow>();

      if (error) throw error;
      await touchSession(sessionId, data.created_at);
      return toTurnRecord(data);
    },

    async replaceTurn(sessionId, turnId, turn) {
      const { data, error } = await supabase
        .rpc("replace_latest_chat_turn", {
          target_session_id: sessionId,
          target_turn_id: turnId,
          ...turnColumns(turn)
        })
        .maybeSingle<TurnRow>();

      if (error) throw error;
      if (!data) return null;
      await touchSession(sessionId, new Date().toISOString());
      return toTurnRecord(data);
    }
  };
}
