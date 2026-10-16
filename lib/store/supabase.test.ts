import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { initialSchedulingState } from "@/lib/scheduling/state";
import { createSupabaseStore } from "@/lib/store/supabase";

type QueryResult = { data: unknown; error: unknown };
type RecordedQuery = { table: string; steps: Array<[string, ...unknown[]]> };

// Records each chained query-builder call (an rpc call as a query on the function's name) and
// resolves awaited queries with queued results in order.
function fakeSupabase(results: QueryResult[]) {
  const queries: RecordedQuery[] = [];

  function record(table: string, steps: RecordedQuery["steps"]) {
    const query: RecordedQuery = { table, steps };
    queries.push(query);

    const builder: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") {
            const result = results.shift() ?? { data: null, error: null };
            return (resolve: (value: QueryResult) => void) => resolve(result);
          }
          return (...args: unknown[]) => {
            query.steps.push([String(property), ...args]);
            return builder;
          };
        }
      }
    );

    return builder;
  }

  const client = {
    from: (table: string) => record(table, []),
    rpc: (fn: string, args: unknown) => record(fn, [["rpc", args]])
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const sessionRow = {
  id: 7,
  title: "Projects overview",
  created_at: "2026-10-16T10:00:00+00:00",
  updated_at: "2026-10-16T11:00:00+00:00"
};

const sessionSummary = {
  id: 7,
  title: "Projects overview",
  createdAt: "2026-10-16T10:00:00+00:00",
  updatedAt: "2026-10-16T11:00:00+00:00"
};

function turnRow(id: number) {
  return {
    id,
    session_id: 7,
    user_message: `q${id}`,
    assistant_message: `a${id}`,
    grounded: true,
    metadata: { intent: "profile" },
    created_at: "2026-10-16T11:00:00+00:00"
  };
}

describe("supabase chat store", () => {
  it("lists only the visitor's sessions by recent activity, capped at 50", async () => {
    const { client, queries } = fakeSupabase([{ data: [sessionRow], error: null }]);

    const sessions = await createSupabaseStore(client).listSessions("visitor-a", 500);

    expect(sessions).toEqual([sessionSummary]);
    expect(queries).toEqual([
      {
        table: "chat_sessions",
        steps: [
          ["select", "id,title,created_at,updated_at"],
          ["eq", "visitor_id", "visitor-a"],
          ["order", "updated_at", { ascending: false }],
          ["order", "id", { ascending: false }],
          ["limit", 50],
          ["overrideTypes"]
        ]
      }
    ]);
  });

  it("creates sessions owned by the visitor", async () => {
    const { client, queries } = fakeSupabase([{ data: sessionRow, error: null }]);

    const session = await createSupabaseStore(client).createSession("visitor-a", "Projects overview");

    expect(session).toEqual(sessionSummary);
    expect(queries[0].steps[0]).toEqual([
      "insert",
      { visitor_id: "visitor-a", title: "Projects overview" }
    ]);
  });

  it("scopes getSession, renameSession and deleteSession by visitor", async () => {
    const { client, queries } = fakeSupabase([
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null }
    ]);
    const store = createSupabaseStore(client);

    expect(await store.getSession("visitor-b", 7)).toBeNull();
    expect(await store.renameSession("visitor-b", 7, "Hijacked")).toBeNull();
    expect(await store.deleteSession("visitor-b", 7)).toBe(false);

    for (const query of queries) {
      expect(query.table).toBe("chat_sessions");
      expect(query.steps).toContainEqual(["eq", "id", 7]);
      expect(query.steps).toContainEqual(["eq", "visitor_id", "visitor-b"]);
    }
    expect(queries[1].steps[0]).toEqual(["update", { title: "Hijacked" }]);
    expect(queries[2].steps[0]).toEqual(["delete"]);
  });

  it("reports a successful owned delete", async () => {
    const { client } = fakeSupabase([{ data: [{ id: 7 }], error: null }]);

    expect(await createSupabaseStore(client).deleteSession("visitor-a", 7)).toBe(true);
  });

  it("does not read turns of a session the visitor does not own", async () => {
    const { client, queries } = fakeSupabase([{ data: null, error: null }]);

    const page = await createSupabaseStore(client).listTurns("visitor-b", 7, { limit: 10 });

    expect(page).toBeNull();
    expect(queries.map((query) => query.table)).toEqual(["chat_sessions"]);
  });

  it("pages chat turns newest first with an id cursor", async () => {
    const { client, queries } = fakeSupabase([
      { data: sessionRow, error: null },
      { data: [turnRow(9), turnRow(8), turnRow(6)], error: null }
    ]);

    const page = await createSupabaseStore(client).listTurns("visitor-a", 7, {
      before: 10,
      limit: 2
    });

    expect(page?.turns.map((turn) => turn.id)).toEqual([8, 9]);
    expect(page?.nextCursor).toBe(8);
    expect(page?.turns[0]).toEqual({
      id: 8,
      sessionId: 7,
      userMessage: "q8",
      assistantMessage: "a8",
      grounded: true,
      metadata: { intent: "profile" },
      createdAt: "2026-10-16T11:00:00+00:00"
    });
    expect(queries[1]).toEqual({
      table: "conversations",
      steps: [
        ["select", "id,session_id,user_message,assistant_message,grounded,metadata,created_at"],
        ["eq", "session_id", 7],
        ["eq", "channel", "chat"],
        ["lt", "id", 10],
        ["order", "id", { ascending: false }],
        ["limit", 3],
        ["overrideTypes"]
      ]
    });
  });

  it("returns recent turns oldest first", async () => {
    const { client } = fakeSupabase([{ data: [turnRow(3), turnRow(2)], error: null }]);

    const turns = await createSupabaseStore(client).recentTurns(7, 2);

    expect(turns.map((turn) => turn.id)).toEqual([2, 3]);
  });

  it("logs a chat turn and bumps the session's activity time", async () => {
    const { client, queries } = fakeSupabase([
      { data: turnRow(11), error: null },
      { data: null, error: null }
    ]);

    const turn = await createSupabaseStore(client).appendTurn(7, {
      userMessage: "q11",
      assistantMessage: "a11",
      grounded: true,
      retrievedDocumentIds: [4, 5],
      latencyMs: 812
    });

    expect(turn.id).toBe(11);
    expect(queries[0].steps[0]).toEqual([
      "insert",
      {
        session_id: 7,
        channel: "chat",
        user_message: "q11",
        assistant_message: "a11",
        retrieved_document_ids: [4, 5],
        grounded: true,
        latency_ms: 812,
        metadata: {}
      }
    ]);
    expect(queries[1]).toEqual({
      table: "chat_sessions",
      steps: [
        ["update", { updated_at: "2026-10-16T11:00:00+00:00" }],
        ["eq", "id", 7]
      ]
    });
  });

  it("returns the saved turn when only the activity time update fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeSupabase([
      { data: turnRow(12), error: null },
      { data: null, error: { message: "timeout" } }
    ]);

    const turn = await createSupabaseStore(client).appendTurn(7, {
      userMessage: "q12",
      assistantMessage: "a12",
      grounded: true,
      retrievedDocumentIds: [],
      latencyMs: 90
    });

    expect(turn.id).toBe(12);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("surfaces Supabase errors", async () => {
    const failure = { message: "relation does not exist" };
    const { client } = fakeSupabase([{ data: null, error: failure }]);

    await expect(createSupabaseStore(client).listSessions("visitor-a", 10)).rejects.toBe(
      failure
    );
  });

  it("returns the session's scheduling state and its version with getSession", async () => {
    const state = { ...initialSchedulingState(), step: "awaiting_day", name: "Jane Doe" };
    const { client, queries } = fakeSupabase([
      { data: { ...sessionRow, scheduling: state, scheduling_version: 3 }, error: null },
      { data: { ...sessionRow, scheduling: null, scheduling_version: 0 }, error: null }
    ]);
    const store = createSupabaseStore(client);

    expect(await store.getSession("visitor-a", 7)).toEqual({
      ...sessionSummary,
      scheduling: state,
      schedulingVersion: 3
    });
    expect(await store.getSession("visitor-a", 7)).toEqual({
      ...sessionSummary,
      scheduling: null,
      schedulingVersion: 0
    });
    expect(queries[0].steps[0]).toEqual([
      "select",
      "id,title,created_at,updated_at,scheduling,scheduling_version"
    ]);
  });

  it("falls back to idle when stored scheduling state is malformed", async () => {
    const { client } = fakeSupabase([
      {
        data: { ...sessionRow, scheduling: { step: "teleporting" }, scheduling_version: 2 },
        error: null
      }
    ]);

    const session = await createSupabaseStore(client).getSession("visitor-a", 7);

    expect(session?.scheduling).toMatchObject({ step: "idle", offeredSlots: [], booking: null });
    expect(session?.schedulingVersion).toBe(2);
  });

  it("saves scheduling state only over the version it read, and bumps the version", async () => {
    const state = initialSchedulingState();
    const { client, queries } = fakeSupabase([
      { data: [{ id: 7 }], error: null },
      { data: [], error: null }
    ]);
    const store = createSupabaseStore(client);

    expect(await store.saveScheduling(7, state, 4)).toBe(true);
    expect(await store.saveScheduling(7, state, 4)).toBe(false);
    expect(queries[0]).toEqual({
      table: "chat_sessions",
      steps: [
        ["update", { scheduling: state, scheduling_version: 5 }],
        ["eq", "id", 7],
        ["eq", "scheduling_version", 4],
        ["select", "id"]
      ]
    });
  });

  it("surfaces scheduling save errors", async () => {
    const failure = { message: "column scheduling does not exist" };
    const { client } = fakeSupabase([{ data: null, error: failure }]);

    await expect(
      createSupabaseStore(client).saveScheduling(7, initialSchedulingState(), 0)
    ).rejects.toBe(failure);
  });

  it("replaces the newest turn in place in one statement and bumps the session's activity time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:30:00.000Z"));
    const { client, queries } = fakeSupabase([
      { data: { ...turnRow(11), assistant_message: "again" }, error: null },
      { data: null, error: null }
    ]);

    const turn = await createSupabaseStore(client).replaceTurn(7, 11, {
      userMessage: "q11",
      assistantMessage: "again",
      grounded: false,
      retrievedDocumentIds: [],
      latencyMs: 300,
      metadata: { intent: "profile", stopped: true }
    });
    vi.useRealTimers();

    expect(turn).toMatchObject({ id: 11, assistantMessage: "again" });
    expect(queries[0]).toEqual({
      table: "replace_latest_chat_turn",
      steps: [
        [
          "rpc",
          {
            target_session_id: 7,
            target_turn_id: 11,
            user_message: "q11",
            assistant_message: "again",
            retrieved_document_ids: [],
            grounded: false,
            latency_ms: 300,
            metadata: { intent: "profile", stopped: true }
          }
        ],
        ["maybeSingle"]
      ]
    });
    expect(queries[1]).toEqual({
      table: "chat_sessions",
      steps: [
        ["update", { updated_at: "2026-10-16T12:30:00.000Z" }],
        ["eq", "id", 7]
      ]
    });
  });

  it("returns null when the turn is no longer the newest", async () => {
    const { client, queries } = fakeSupabase([{ data: null, error: null }]);

    const turn = await createSupabaseStore(client).replaceTurn(7, 11, {
      userMessage: "q11",
      assistantMessage: "again",
      grounded: true,
      retrievedDocumentIds: [],
      latencyMs: 300
    });

    expect(turn).toBeNull();
    expect(queries.map((query) => query.table)).toEqual(["replace_latest_chat_turn"]);
  });

  it("surfaces replace errors", async () => {
    const failure = { message: "function replace_latest_chat_turn does not exist" };
    const { client } = fakeSupabase([{ data: null, error: failure }]);

    await expect(
      createSupabaseStore(client).replaceTurn(7, 11, {
        userMessage: "q11",
        assistantMessage: "again",
        grounded: true,
        retrievedDocumentIds: [],
        latencyMs: 300
      })
    ).rejects.toBe(failure);
  });
});
