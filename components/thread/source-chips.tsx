"use client";

import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { Source } from "@/lib/chat/types";
import { ExternalIcon } from "@/components/ui/icons";

const OPEN_DELAY = 350;
const CLOSE_DELAY = 150;

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

function distinctSources(sources: Source[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.path}#${source.section}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A note's opening section carries the note's own title, which says nothing new.
function sectionOf(source: Source) {
  return source.section === source.title ? "" : source.section;
}

function labelsFor(sources: Source[]) {
  const counts = new Map<string, number>();
  sources.forEach((source) => counts.set(source.title, (counts.get(source.title) ?? 0) + 1));
  return sources.map((source) =>
    (counts.get(source.title) ?? 0) > 1 && sectionOf(source) ? `${source.title} · ${source.section}` : source.title
  );
}

function SourceChip({ source, label, index }: { source: Source; label: string; index: number }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const openedByHover = useRef(false);
  const titleId = useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function schedule(next: boolean, delay: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      openedByHover.current = next;
      setOpen(next);
    }, delay);
  }

  function onPointerEnter(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    if (open) window.clearTimeout(timer.current);
    else schedule(true, OPEN_DELAY);
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    if (!open) window.clearTimeout(timer.current);
    else if (openedByHover.current) schedule(false, CLOSE_DELAY);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        window.clearTimeout(timer.current);
        openedByHover.current = false;
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onClick={(event) => {
            if (open && openedByHover.current) {
              event.preventDefault();
              openedByHover.current = false;
            }
          }}
          className="relative inline-flex h-7 max-w-60 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 text-12 text-fg-muted transition-colors duration-(--duration-fast) before:absolute before:-inset-1.5 before:content-[''] hover:border-border-strong hover:text-fg data-[state=open]:border-border-strong data-[state=open]:text-fg"
        >
          <span className="font-mono text-fg-subtle tabular-nums">{index + 1}</span>
          <span className="truncate">{label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={titleId}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onOpenAutoFocus={(event) => {
            if (openedByHover.current) event.preventDefault();
          }}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] origin-(--radix-popover-content-transform-origin) rounded-lg bg-surface p-4 shadow-md outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <p id={titleId} className="text-14 font-medium text-fg">
            {source.title}
          </p>
          {sectionOf(source) ? <p className="mt-0.5 font-mono text-12 text-fg-subtle">{source.section}</p> : null}
          {source.snippet ? (
            <p className="mt-3 line-clamp-5 border-l-2 border-border pl-3 text-13 text-fg-muted">{source.snippet}</p>
          ) : null}
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-sm text-13 font-medium text-accent underline decoration-accent/0 underline-offset-[3px] transition-[text-decoration-color] duration-(--duration-fast) hover:decoration-accent"
            >
              Open on {hostname(source.url)}
              <ExternalIcon />
            </a>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SourceChips({ sources }: { sources: Source[] }) {
  const distinct = distinctSources(sources);
  if (distinct.length === 0) return null;
  const labels = labelsFor(distinct);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 font-mono text-12 text-fg-subtle">Sources</span>
      {distinct.map((source, index) => (
        <SourceChip key={source.id} source={source} label={labels[index]} index={index} />
      ))}
    </div>
  );
}
