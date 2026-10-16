"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { SessionRow } from "@/components/sidebar/session-row";
import { SessionSkeleton } from "@/components/sidebar/session-skeleton";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import type { SessionGroup, SessionsStatus } from "@/hooks/use-sessions";
import { transitions } from "@/lib/client/motion";

export type SessionListProps = {
  status: SessionsStatus;
  groups: SessionGroup[];
  activeSessionId: number | null;
  onSelect(id: number): void;
  onRename(id: number, title: string): void;
  onDelete(id: number): void;
  onRetry(): void;
};

const itemMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.enter },
  exit: { opacity: 0, transition: transitions.exit },
  transition: { layout: transitions.layout }
};

export function SessionList({
  status,
  groups,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  onRetry
}: SessionListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  if (groups.length === 0) {
    if (status === "loading") return <SessionSkeleton />;
    if (status === "error") {
      return (
        <div role="alert" className="flex flex-col items-start gap-3 px-4.5 pt-4 animate-fade-in">
          <p className="text-13 text-fg-muted">Couldn&apos;t load your chats.</p>
          <Button size="sm" leadingIcon={<RefreshIcon />} onClick={onRetry}>
            Retry
          </Button>
        </div>
      );
    }
    return (
      <p className="px-4.5 pt-4 text-13 text-pretty text-fg-subtle animate-fade-in">
        No conversations yet. Questions you ask will show up here.
      </p>
    );
  }

  function focusRow(id: number) {
    listRef.current?.querySelector<HTMLButtonElement>(`[data-session-id="${id}"] [data-row-select]`)?.focus();
  }

  function handleDelete(id: number) {
    const ids = groups.flatMap((group) => group.sessions.map((session) => session.id));
    const index = ids.indexOf(id);
    const neighbor = ids[index + 1] ?? ids[index - 1];
    const row = listRef.current?.querySelector(`[data-session-id="${id}"]`);
    const hadFocus = Boolean(row?.contains(document.activeElement));
    onDelete(id);
    if (hadFocus && neighbor !== undefined) requestAnimationFrame(() => focusRow(neighbor));
  }

  return (
    <ul ref={listRef} className="relative flex flex-col px-2 pt-3 animate-fade-in">
      <AnimatePresence initial={false} mode="popLayout">
        {groups.flatMap((group, index) => [
          <motion.li key={`group-${group.label}`} layout="position" className={index > 0 ? "pt-3" : undefined} {...itemMotion}>
            <h2 className="flex h-7 items-center px-2.5 text-12 font-medium text-fg-subtle">{group.label}</h2>
          </motion.li>,
          ...group.sessions.map((session) => (
            <motion.li key={session.id} layout="position" {...itemMotion}>
              <SessionRow
                session={session}
                active={session.id === activeSessionId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={handleDelete}
              />
            </motion.li>
          ))
        ])}
      </AnimatePresence>
    </ul>
  );
}
