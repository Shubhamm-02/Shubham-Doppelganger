import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockScheduling } from "@/lib/chat/scheduling-lock";
import { initialSchedulingState, type SchedulingState } from "@/lib/scheduling/state";
import { createMemoryStore } from "@/lib/store/memory";
import type { ChatStore } from "@/lib/store/types";

const VISITOR = "visitor-alice";
const NOW = new Date("2026-10-16T06:30:00.000Z");

let store: ChatStore;

async function openSession(id: number) {
  const record = await store.getSession(VISITOR, id);
  if (!record) throw new Error("Session not found.");
  return { store, record };
}

async function storedState(id: number) {
  return (await store.getSession(VISITOR, id))?.scheduling;
}

function awaitingDay(): SchedulingState {
  return { ...initialSchedulingState(NOW), step: "awaiting_day" };
}

beforeEach(() => {
  store = createMemoryStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lockScheduling", () => {
  it("claims the state for one turn and saves the next state on release", async () => {
    const { id } = await store.createSession(VISITOR, "Chat");

    const lock = await lockScheduling(await openSession(id), NOW);

    expect(lock?.state).toEqual(initialSchedulingState(NOW));
    expect(await storedState(id)).toMatchObject({ step: "idle", lockedAt: NOW.toISOString() });

    await lock?.release(awaitingDay());

    expect(await storedState(id)).toEqual(awaitingDay());
    expect(await lockScheduling(await openSession(id), NOW)).not.toBeNull();
  });

  it("refuses a second turn while the first holds the lock", async () => {
    const { id } = await store.createSession(VISITOR, "Chat");
    const first = await lockScheduling(await openSession(id), NOW);

    const second = await lockScheduling(await openSession(id), new Date(NOW.getTime() + 5_000));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("refuses a turn that read the state before another turn claimed it", async () => {
    const { id } = await store.createSession(VISITOR, "Chat");
    const readEarly = await openSession(id);
    const readLate = await openSession(id);

    expect(await lockScheduling(readEarly, NOW)).not.toBeNull();
    expect(await lockScheduling(readLate, NOW)).toBeNull();
  });

  it("takes over a lock abandoned for more than a minute", async () => {
    const { id } = await store.createSession(VISITOR, "Chat");
    await lockScheduling(await openSession(id), NOW);

    const later = await lockScheduling(await openSession(id), new Date(NOW.getTime() + 61_000));

    expect(later?.state.lockedAt).toBeNull();
  });

  it("keeps the newer state when the release lost a race", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { id } = await store.createSession(VISITOR, "Chat");
    const lock = await lockScheduling(await openSession(id), NOW);
    const winner = await openSession(id);
    await store.saveScheduling(id, awaitingDay(), winner.record.schedulingVersion);

    await lock?.release({ ...awaitingDay(), step: "booked" });

    expect((await storedState(id))?.step).toBe("awaiting_day");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("works without a session and keeps going when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { id } = await store.createSession(VISITOR, "Chat");
    const session = await openSession(id);
    vi.spyOn(store, "saveScheduling").mockRejectedValue(new Error("db down"));

    const sessionless = await lockScheduling(null, NOW);
    const degraded = await lockScheduling(session, NOW);

    expect(sessionless?.state).toEqual(initialSchedulingState(NOW));
    await expect(sessionless?.release(awaitingDay())).resolves.toBeUndefined();
    expect(degraded).not.toBeNull();
    await expect(degraded?.release(awaitingDay())).resolves.toBeUndefined();
  });
});
