import type { TurnPage, TurnRecord } from "@/lib/store/types";

const MAX_PAGE_SIZE = 50;

export function pageSize(limit: number) {
  return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
}

// Expects up to size + 1 turns, newest first; the extra turn only signals that an older page exists.
export function turnPage(newestFirst: TurnRecord[], size: number): TurnPage {
  const turns = newestFirst.slice(0, size);
  const nextCursor = newestFirst.length > size ? turns[turns.length - 1].id : null;
  return { turns: turns.reverse(), nextCursor };
}
