"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { MoreIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { SESSION_TITLE_MAX } from "@/hooks/use-sessions";
import { cx } from "@/lib/client/cx";
import type { SessionSummary } from "@/lib/client/types";

export type SessionRowProps = {
  session: SessionSummary;
  active: boolean;
  onSelect(id: number): void;
  onRename(id: number, title: string): void;
  onDelete(id: number): void;
};

export function SessionRow({ session, active, onSelect, onRename, onDelete }: SessionRowProps) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const renameChosen = useRef(false);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    selectRef.current?.focus();
  }, [editing]);

  function finishRename(title: string | null, returnFocus: boolean) {
    refocus.current = returnFocus;
    setEditing(false);
    if (title !== null) onRename(session.id, title);
  }

  if (editing) {
    return (
      <div className="px-0.5 py-0.5" data-session-id={session.id}>
        <RenameField initial={session.title} onDone={finishRename} />
      </div>
    );
  }

  return (
    <div
      data-session-id={session.id}
      className={cx(
        "group/row relative flex items-center rounded-md transition-colors duration-(--duration-fast) ease-out",
        active ? "bg-surface shadow-sm dark:bg-fg/8" : "hover:bg-fg/5"
      )}
    >
      <button
        ref={selectRef}
        type="button"
        data-row-select=""
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(session.id)}
        onDoubleClick={() => setEditing(true)}
        className={cx(
          "flex h-9 min-w-0 flex-1 items-center rounded-md px-2.5 text-left text-14 focus-visible:-outline-offset-2 pointer-coarse:h-10",
          "group-hover/row:pr-[4.5rem] group-has-focus-visible/row:pr-[4.5rem] pointer-coarse:pr-11",
          active ? "font-medium text-fg" : "text-fg-muted group-hover/row:text-fg"
        )}
      >
        <span className="truncate">{session.title}</span>
      </button>
      <div
        className={cx(
          "absolute inset-y-0 right-0.5 flex items-center opacity-0 transition-opacity duration-(--duration-fast) ease-out pointer-coarse:hidden",
          "group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100"
        )}
      >
        <IconButton size="sm" label="Rename" icon={<PencilIcon />} onClick={() => setEditing(true)} />
        <IconButton size="sm" label="Delete" icon={<TrashIcon />} onClick={() => onDelete(session.id)} />
      </div>
      <div className="absolute inset-y-0 right-0 hidden items-center pointer-coarse:flex">
        <Menu>
          <MenuTrigger asChild>
            <IconButton label="Chat actions" icon={<MoreIcon />} />
          </MenuTrigger>
          <MenuContent
            onCloseAutoFocus={(event) => {
              // Rename focuses its own field; every other close returns focus to the trigger.
              if (!renameChosen.current) return;
              renameChosen.current = false;
              event.preventDefault();
            }}
          >
            <MenuItem
              icon={<PencilIcon />}
              onSelect={() => {
                renameChosen.current = true;
                setEditing(true);
              }}
            >
              Rename
            </MenuItem>
            <MenuItem icon={<TrashIcon />} onSelect={() => onDelete(session.id)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}

function RenameField({
  initial,
  onDone
}: {
  initial: string;
  onDone(title: string | null, returnFocus: boolean): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function settle(title: string | null, returnFocus: boolean) {
    if (settled.current) return;
    settled.current = true;
    onDone(title, returnFocus);
  }

  return (
    <input
      ref={inputRef}
      defaultValue={initial}
      maxLength={SESSION_TITLE_MAX}
      aria-label="Chat title"
      data-session-rename=""
      enterKeyHint="done"
      autoComplete="off"
      spellCheck={false}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          settle(event.currentTarget.value, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          settle(null, true);
        }
      }}
      onBlur={(event) => settle(event.currentTarget.value, false)}
      className={cx(
        "h-8 w-full min-w-0 rounded-sm bg-surface px-2 text-14 text-fg shadow-sm pointer-coarse:h-9",
        "outline-2 outline-offset-0 outline-accent focus-visible:outline-offset-0"
      )}
    />
  );
}
