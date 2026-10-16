import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnMetadata } from "@/lib/chat/types";
import { initialSchedulingState } from "@/lib/scheduling/state";
import { createMemoryStore } from "@/lib/store/memory";
import type { ChatStore, NewTurn } from "@/lib/store/types";

const ALICE = "visitor-alice";
const BOB = "visitor-bob";

function turn(userMessage: string): NewTurn {
  return {
    userMessage,
    assistantMessage: `Answer to ${userMessage}`,
    grounded: true,
    retrievedDocumentIds: [1, 2],
    latencyMs: 120
  };
}

async function appendTurns(store: ChatStore, sessionId: number, count: number) {
  const ids: number[] = [];
  for (let index = 1; index <= count; index += 1) {
    ids.push((await store.appendTurn(sessionId, turn(`question ${index}`))).id);
  }
  return ids;
}

describe("memory chat store", () => {
  let store: ChatStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
    store = createMemoryStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("session scoping", () => {
    it("lists only the calling visitor's sessions", async () => {
      const aliceSession = await store.createSession(ALICE, "Alice chat");
      await store.createSession(BOB, "Bob chat");

      expect(await store.listSessions(ALICE, 30)).toEqual([aliceSession]);
      expect((await store.listSessions(BOB, 30)).map((s) => s.title)).toEqual([
        "Bob chat"
      ]);
      expect(await store.listSessions("visitor-nobody", 30)).toEqual([]);
    });

    it("hides another visitor's session from getSession", async () => {
      const session = await store.createSession(ALICE, "Alice chat");

      expect(await store.getSession(ALICE, session.id)).toEqual({ ...session, scheduling: null, schedulingVersion: 0 });
      expect(await store.getSession(BOB, session.id)).toBeNull();
      expect(await store.getSession(ALICE, session.id + 100)).toBeNull();
    });

    it("orders sessions by most recent activity", async () => {
      const first = await store.createSession(ALICE, "First");
      vi.advanceTimersByTime(1000);
      const second = await store.createSession(ALICE, "Second");
      vi.advanceTimersByTime(1000);

      expect((await store.listSessions(ALICE, 30)).map((s) => s.id)).toEqual([
        second.id,
        first.id
      ]);

      const appended = await store.appendTurn(first.id, turn("hello"));
      const sessions = await store.listSessions(ALICE, 30);

      expect(sessions.map((s) => s.id)).toEqual([first.id, second.id]);
      expect(sessions[0].updatedAt).toBe(appended.createdAt);
      expect(sessions[0].createdAt).toBe(first.createdAt);
    });

    it("breaks updatedAt ties by newest id", async () => {
      const first = await store.createSession(ALICE, "First");
      const second = await store.createSession(ALICE, "Second");

      expect((await store.listSessions(ALICE, 30)).map((s) => s.id)).toEqual([
        second.id,
        first.id
      ]);
    });

    it("applies the limit and caps it at 50", async () => {
      for (let index = 0; index < 60; index += 1) {
        await store.createSession(ALICE, `Chat ${index}`);
      }

      expect(await store.listSessions(ALICE, 5)).toHaveLength(5);
      expect(await store.listSessions(ALICE, 500)).toHaveLength(50);
    });
  });

  describe("rename", () => {
    it("renames a session owned by the visitor without bumping activity", async () => {
      const session = await store.createSession(ALICE, "Auto title");
      vi.advanceTimersByTime(1000);

      const renamed = await store.renameSession(ALICE, session.id, "My title");

      expect(renamed).toEqual({ ...session, title: "My title" });
      expect(await store.getSession(ALICE, session.id)).toEqual({ ...renamed, scheduling: null, schedulingVersion: 0 });
    });

    it("refuses to rename another visitor's session", async () => {
      const session = await store.createSession(ALICE, "Auto title");

      expect(await store.renameSession(BOB, session.id, "Hijacked")).toBeNull();
      expect((await store.getSession(ALICE, session.id))?.title).toBe("Auto title");
    });
  });

  describe("delete", () => {
    it("refuses to delete another visitor's session", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      await store.appendTurn(session.id, turn("hello"));

      expect(await store.deleteSession(BOB, session.id)).toBe(false);
      expect(await store.getSession(ALICE, session.id)).not.toBeNull();
      expect(await store.recentTurns(session.id, 8)).toHaveLength(1);
    });

    it("deletes the visitor's session together with its turns", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      await appendTurns(store, session.id, 3);

      expect(await store.deleteSession(ALICE, session.id)).toBe(true);
      expect(await store.getSession(ALICE, session.id)).toBeNull();
      expect(await store.listTurns(ALICE, session.id, { limit: 10 })).toBeNull();
      expect(await store.recentTurns(session.id, 8)).toEqual([]);
      expect(await store.deleteSession(ALICE, session.id)).toBe(false);
    });
  });

  describe("turns", () => {
    it("records a turn and returns it in TurnRecord shape", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const record = await store.appendTurn(session.id, turn("hello"));

      expect(record).toEqual({
        id: expect.any(Number),
        sessionId: session.id,
        userMessage: "hello",
        assistantMessage: "Answer to hello",
        grounded: true,
        metadata: {},
        createdAt: "2026-10-16T12:00:00.000Z"
      });
    });

    it("stores turn metadata and returns it with the turn", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const metadata: TurnMetadata = { intent: "profile", sources: [], stopped: true };

      await store.appendTurn(session.id, { ...turn("hello"), metadata });
      const page = await store.listTurns(ALICE, session.id, { limit: 10 });

      expect(page?.turns[0].metadata).toEqual(metadata);
    });

    it("rejects turns for a session that does not exist", async () => {
      await expect(store.appendTurn(999, turn("hello"))).rejects.toThrow();
    });

    it("returns null from listTurns for another visitor's session", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      await store.appendTurn(session.id, turn("secret"));

      expect(await store.listTurns(BOB, session.id, { limit: 10 })).toBeNull();
    });

    it("pages backwards with an id cursor, oldest first within a page", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const ids = await appendTurns(store, session.id, 5);

      const newest = await store.listTurns(ALICE, session.id, { limit: 2 });
      expect(newest?.turns.map((t) => t.id)).toEqual([ids[3], ids[4]]);
      expect(newest?.nextCursor).toBe(ids[3]);

      const middle = await store.listTurns(ALICE, session.id, {
        before: newest?.nextCursor ?? undefined,
        limit: 2
      });
      expect(middle?.turns.map((t) => t.id)).toEqual([ids[1], ids[2]]);
      expect(middle?.nextCursor).toBe(ids[1]);

      const oldest = await store.listTurns(ALICE, session.id, {
        before: middle?.nextCursor ?? undefined,
        limit: 2
      });
      expect(oldest?.turns.map((t) => t.id)).toEqual([ids[0]]);
      expect(oldest?.nextCursor).toBeNull();
    });

    it("returns a null cursor when the last page is exactly full", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const ids = await appendTurns(store, session.id, 4);

      const newest = await store.listTurns(ALICE, session.id, { limit: 2 });
      const oldest = await store.listTurns(ALICE, session.id, {
        before: newest?.nextCursor ?? undefined,
        limit: 2
      });

      expect(oldest).toEqual({
        turns: [expect.objectContaining({ id: ids[0] }), expect.objectContaining({ id: ids[1] })],
        nextCursor: null
      });
    });

    it("returns an empty page for a session without turns", async () => {
      const session = await store.createSession(ALICE, "Alice chat");

      expect(await store.listTurns(ALICE, session.id, { limit: 10 })).toEqual({
        turns: [],
        nextCursor: null
      });
    });

    it("caps a page at 50 turns", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const ids = await appendTurns(store, session.id, 60);

      const page = await store.listTurns(ALICE, session.id, { limit: 200 });

      expect(page?.turns).toHaveLength(50);
      expect(page?.turns.at(-1)?.id).toBe(ids[59]);
      expect(page?.nextCursor).toBe(ids[10]);
    });

    it("keeps turns of different sessions apart", async () => {
      const first = await store.createSession(ALICE, "First");
      const second = await store.createSession(ALICE, "Second");
      await store.appendTurn(first.id, turn("first question"));
      await store.appendTurn(second.id, turn("second question"));

      const page = await store.listTurns(ALICE, first.id, { limit: 10 });

      expect(page?.turns.map((t) => t.userMessage)).toEqual(["first question"]);
    });

    it("returns the most recent turns in chronological order", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      await appendTurns(store, session.id, 5);

      const recent = await store.recentTurns(session.id, 3);

      expect(recent.map((t) => t.userMessage)).toEqual([
        "question 3",
        "question 4",
        "question 5"
      ]);
    });

    it("does not let callers mutate stored turns", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      await store.appendTurn(session.id, turn("hello"));

      const [recent] = await store.recentTurns(session.id, 1);
      recent.userMessage = "changed";

      expect((await store.recentTurns(session.id, 1))[0].userMessage).toBe("hello");
    });
  });

  describe("scheduling state", () => {
    it("starts without scheduling state and returns what was saved", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const state = {
        ...initialSchedulingState(new Date("2026-10-16T12:00:00.000Z")),
        step: "awaiting_day" as const,
        name: "Jane Doe"
      };

      expect(await store.getSession(ALICE, session.id)).toMatchObject({
        scheduling: null,
        schedulingVersion: 0
      });

      expect(await store.saveScheduling(session.id, state, 0)).toBe(true);

      expect(await store.getSession(ALICE, session.id)).toMatchObject({
        scheduling: state,
        schedulingVersion: 1
      });
      expect(await store.getSession(BOB, session.id)).toBeNull();
    });

    it("refuses a save over a version that another save already replaced", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const first = { ...initialSchedulingState(), step: "awaiting_day" as const };
      const second = { ...initialSchedulingState(), step: "booked" as const };

      expect(await store.saveScheduling(session.id, first, 0)).toBe(true);
      expect(await store.saveScheduling(session.id, second, 0)).toBe(false);

      expect(await store.getSession(ALICE, session.id)).toMatchObject({
        scheduling: first,
        schedulingVersion: 1
      });
    });

    it("keeps saved state independent of the caller's object", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const state = initialSchedulingState();
      const saved = structuredClone(state);

      await store.saveScheduling(session.id, state, 0);
      state.step = "booked";
      const loaded = await store.getSession(ALICE, session.id);
      if (loaded?.scheduling) loaded.scheduling.name = "Mallory";

      expect((await store.getSession(ALICE, session.id))?.scheduling).toEqual(saved);
    });

    it("does not bump session activity", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      vi.advanceTimersByTime(1000);

      await store.saveScheduling(session.id, initialSchedulingState(), 0);

      expect((await store.getSession(ALICE, session.id))?.updatedAt).toBe(session.updatedAt);
    });
  });

  describe("replaceTurn", () => {
    it("replaces the newest turn in place and keeps its id", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const [, latestId] = await appendTurns(store, session.id, 2);
      vi.advanceTimersByTime(5000);

      const replaced = await store.replaceTurn(session.id, latestId, {
        ...turn("question 2"),
        assistantMessage: "Regenerated answer",
        grounded: false,
        metadata: { intent: "profile", stopped: true }
      });

      expect(replaced).toEqual({
        id: latestId,
        sessionId: session.id,
        userMessage: "question 2",
        assistantMessage: "Regenerated answer",
        grounded: false,
        metadata: { intent: "profile", stopped: true },
        createdAt: "2026-10-16T12:00:00.000Z"
      });
      const page = await store.listTurns(ALICE, session.id, { limit: 10 });
      expect(page?.turns.map((t) => [t.id, t.assistantMessage])).toEqual([
        [latestId - 1, "Answer to question 1"],
        [latestId, "Regenerated answer"]
      ]);
      expect((await store.getSession(ALICE, session.id))?.updatedAt).toBe(
        "2026-10-16T12:00:05.000Z"
      );
    });

    it("refuses to replace a turn that is not the newest", async () => {
      const session = await store.createSession(ALICE, "Alice chat");
      const [firstId] = await appendTurns(store, session.id, 2);

      expect(await store.replaceTurn(session.id, firstId, turn("again"))).toBeNull();
      expect((await store.recentTurns(session.id, 2)).map((t) => t.userMessage)).toEqual([
        "question 1",
        "question 2"
      ]);
    });

    it("refuses to replace a turn of another session", async () => {
      const first = await store.createSession(ALICE, "First");
      const second = await store.createSession(ALICE, "Second");
      const [firstTurnId] = await appendTurns(store, first.id, 1);
      await appendTurns(store, second.id, 1);

      expect(await store.replaceTurn(second.id, firstTurnId, turn("again"))).toBeNull();
      expect(await store.replaceTurn(999, firstTurnId, turn("again"))).toBeNull();
      expect((await store.recentTurns(first.id, 1))[0].assistantMessage).toBe(
        "Answer to question 1"
      );
    });

    it("returns null for a session without turns", async () => {
      const session = await store.createSession(ALICE, "Alice chat");

      expect(await store.replaceTurn(session.id, 1, turn("hello"))).toBeNull();
    });
  });
});
