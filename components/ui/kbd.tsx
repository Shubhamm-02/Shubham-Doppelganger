"use client";

import { useSyncExternalStore } from "react";
import { cx } from "@/lib/client/cx";

function subscribe() {
  return () => {};
}

function isApplePlatform() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function useModifierKey() {
  return useSyncExternalStore(subscribe, () => (isApplePlatform() ? "⌘" : "Ctrl"), () => "⌘");
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border px-1",
        "font-mono text-12 font-normal text-fg-muted",
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function Shortcut({ keys, className }: { keys: string[]; className?: string }) {
  const modifier = useModifierKey();
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)}>
      {keys.map((key) => (
        <Kbd key={key}>{key === "mod" ? modifier : key}</Kbd>
      ))}
    </span>
  );
}
