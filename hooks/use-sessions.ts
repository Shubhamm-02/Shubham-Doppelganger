"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteSession, fetchSessions, renameSession } from "@/lib/client/api";
import { isAbortError, toClientError } from "@/lib/client/errors";
import { sessionGroup, type SessionGroupLabel } from "@/lib/client/format-time";
import type { ClientError, SessionSummary } from "@/lib/client/types";

export const SESSION_TITLE_MAX = 80;

const UNDO_WINDOW_MS = 5000;
const GROUP_ORDER: SessionGroupLabel[] = ["Today", "Yesterday", "Earlier"];

export type SessionsStatus = "loading" | "ready" | "error";

export type SessionGroup = { label: SessionGroupLabel; sessions: SessionSummary[] };

export type SessionsController = {
  status: SessionsStatus;
  sessions: SessionSummary[];
  groups: SessionGroup[];
  reload(): void;
  rename(id: number, title: string): Promise<void>;
  remove(id: number, options?: { onRemoved?(): void }): void;
  upsert(session: SessionSummary): void;
  touch(id: number): void;
};

type PendingDelete = { session: SessionSummary; toastId: string };

function byRecent(a: SessionSummary, b: SessionSummary) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id - a.id;
}

function withSession(list: SessionSummary[], session: SessionSummary) {
  return [...list.filter((item) => item.id !== session.id), session].sort(byRecent);
}

function retryHint(error: ClientError) {
  return error.kind === "offline" ? "You're offline. Try again when you reconnect." : "Try again in a moment.";
}

export function useSessions(): SessionsController {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [status, setStatus] = useState<SessionsStatus>("loading");
  const latest = useRef(sessions);
  const pending = useRef(new Map<number, PendingDelete>());
  const upsertedDuringLoad = useRef(new Set<number>());
  const loadController = useRef<AbortController | null>(null);
  const loaded = useRef(false);

  useLayoutEffect(() => {
    latest.current = sessions;
  }, [sessions]);

  const load = useCallback(() => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    upsertedDuringLoad.current.clear();

    fetchSessions(controller.signal).then(
      (fetched) => {
        loaded.current = true;
        setSessions((current) => {
          const fetchedIds = new Set(fetched.map((session) => session.id));
          const local = current.filter(
            (session) => upsertedDuringLoad.current.has(session.id) && !fetchedIds.has(session.id)
          );
          return [...fetched, ...local].filter((session) => !pending.current.has(session.id)).sort(byRecent);
        });
        setStatus("ready");
      },
      (error: unknown) => {
        if (isAbortError(error)) return;
        if (!loaded.current) setStatus("error");
      }
    );
  }, []);

  useEffect(() => {
    load();
    return () => loadController.current?.abort();
  }, [load]);

  const reload = useCallback(() => {
    if (!loaded.current) setStatus("loading");
    load();
  }, [load]);

  const commit = useCallback((id: number, keepalive = false) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    pending.current.delete(id);
    deleteSession(id, { keepalive }).catch((error: unknown) => {
      const clientError = toClientError(error);
      if (keepalive || clientError.kind === "not_found") return;
      setSessions((list) => withSession(list, entry.session));
      toast("Couldn't delete chat", { description: `It's back in your list. ${retryHint(clientError)}` });
    });
  }, []);

  const undo = useCallback((id: number) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    pending.current.delete(id);
    setSessions((list) => withSession(list, entry.session));
  }, []);

  const remove = useCallback(
    (id: number, options: { onRemoved?(): void } = {}) => {
      const session = latest.current.find((item) => item.id === id);
      if (!session || pending.current.has(id)) return;

      const toastId = `session-delete-${id}`;
      pending.current.set(id, { session, toastId });
      setSessions((list) => list.filter((item) => item.id !== id));
      options.onRemoved?.();

      toast("Chat deleted", {
        id: toastId,
        description: session.title,
        duration: UNDO_WINDOW_MS,
        action: { label: "Undo", onClick: () => undo(id) },
        onDismiss: () => commit(id),
        onAutoClose: () => commit(id)
      });
    },
    [commit, undo]
  );

  useEffect(() => {
    const deletes = pending.current;
    function flush() {
      for (const [id, entry] of deletes) {
        commit(id, true);
        toast.dismiss(entry.toastId);
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commit]);

  const rename = useCallback(async (id: number, title: string) => {
    const next = title.trim().slice(0, SESSION_TITLE_MAX);
    const previous = latest.current.find((item) => item.id === id);
    if (!previous || !next || next === previous.title) return;

    setSessions((list) => list.map((item) => (item.id === id ? { ...item, title: next } : item)));
    try {
      const saved = await renameSession(id, next);
      setSessions((list) => list.map((item) => (item.id === id ? { ...item, title: saved.title } : item)));
    } catch (error) {
      const clientError = toClientError(error);
      if (clientError.kind === "not_found") {
        setSessions((list) => list.filter((item) => item.id !== id));
        toast("That chat no longer exists");
        return;
      }
      setSessions((list) =>
        list.map((item) => (item.id === id && item.title === next ? { ...item, title: previous.title } : item))
      );
      toast("Couldn't rename chat", { description: retryHint(clientError) });
    }
  }, []);

  const upsert = useCallback((session: SessionSummary) => {
    if (pending.current.has(session.id)) return;
    upsertedDuringLoad.current.add(session.id);
    setSessions((list) => withSession(list, session));
  }, []);

  const touch = useCallback((id: number) => {
    const updatedAt = new Date().toISOString();
    setSessions((list) => list.map((item) => (item.id === id ? { ...item, updatedAt } : item)).sort(byRecent));
  }, []);

  const groups = useMemo(() => {
    const buckets = new Map<SessionGroupLabel, SessionSummary[]>();
    for (const session of sessions) {
      const label = sessionGroup(session.updatedAt);
      buckets.set(label, [...(buckets.get(label) ?? []), session]);
    }
    return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
      label,
      sessions: buckets.get(label) ?? []
    }));
  }, [sessions]);

  return useMemo(
    () => ({ status, sessions, groups, reload, rename, remove, upsert, touch }),
    [status, sessions, groups, reload, rename, remove, upsert, touch]
  );
}
