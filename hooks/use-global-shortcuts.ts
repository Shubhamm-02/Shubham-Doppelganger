"use client";

import { useEffect, useEffectEvent } from "react";
import { isTooltipEscape } from "@/components/ui/tooltip";

export type GlobalShortcuts = {
  onNewChat(): void;
  onFocusComposer(): void;
  onEscape(): void;
};

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

function hasOpenLayer() {
  return document.querySelector('[role="dialog"], [role="menu"]') !== null;
}

export function useGlobalShortcuts({ onNewChat, onFocusComposer, onEscape }: GlobalShortcuts) {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      // An Esc that only closed a tooltip still counts, unless a dialog or menu is open underneath.
      const tooltipOnly = event.defaultPrevented && isTooltipEscape(event);
      if (!event.defaultPrevented || (tooltipOnly && !hasOpenLayer())) onEscape();
      return;
    }
    if (event.defaultPrevented) return;
    const modified = event.metaKey || event.ctrlKey;

    if (modified && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      onNewChat();
    } else if (event.key === "/" && !modified && !event.altKey && !isEditable(event.target) && !hasOpenLayer()) {
      event.preventDefault();
      onFocusComposer();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
