import { initialSchedulingState, type SchedulingState } from "@/lib/scheduling/state";
import type { ChatStore, SessionRecord } from "@/lib/store/types";

// A turn that died while holding the lock (a crashed or timed-out function) stops blocking
// the chat after this long; Cal.com calls time out well before it.
const LOCK_TIMEOUT_MS = 60_000;

export type SchedulingLock = {
  state: SchedulingState;
  release(next: SchedulingState): Promise<void>;
};

function isLocked(state: SchedulingState, now: Date) {
  return Boolean(state.lockedAt && now.getTime() - Date.parse(state.lockedAt) < LOCK_TIMEOUT_MS);
}

// Claims the chat's scheduling state for one turn, so two requests in one chat (a double
// click, two tabs, a client retry) cannot both reach Cal.com or overwrite each other's
// booking. Resolves to null while another turn holds the claim or saved first.
export async function lockScheduling(
  session: { store: ChatStore; record: SessionRecord } | null,
  now: Date
): Promise<SchedulingLock | null> {
  const stored = session?.record.scheduling ?? initialSchedulingState(now);
  const state: SchedulingState = { ...stored, lockedAt: null };
  if (!session) return { state, release: async () => {} };
  if (isLocked(stored, now)) return null;

  const { store, record } = session;
  let version = record.schedulingVersion;
  try {
    const locked = { ...state, lockedAt: now.toISOString() };
    if (!(await store.saveScheduling(record.id, locked, version))) return null;
    version += 1;
  } catch (error) {
    console.error("Scheduling state could not be locked; continuing without the lock.", error);
  }

  return {
    state,
    async release(next) {
      try {
        if (!(await store.saveScheduling(record.id, next, version))) {
          console.warn("Scheduling state changed while this turn held its lock; keeping the newer state.");
        }
      } catch (error) {
        console.error("Scheduling state could not be saved.", error);
      }
    }
  };
}
