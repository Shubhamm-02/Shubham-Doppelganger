"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useState } from "react";
import { useModifierKey } from "@/components/ui/kbd";

type TooltipProps = {
  content: React.ReactNode;
  shortcut?: string[];
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  disabled?: boolean;
  children: React.ReactElement;
};

// Radix gives an open tooltip the first Escape and marks it handled. Global shortcuts use this
// to tell "closed a tooltip" apart from "closed a menu or dialog", so Esc still stops a stream.
const tooltipEscapes = new WeakSet<KeyboardEvent>();

export function isTooltipEscape(event: KeyboardEvent) {
  return tooltipEscapes.has(event);
}

function ShortcutHint({ keys }: { keys: string[] }) {
  const modifier = useModifierKey();
  return (
    <span className="font-mono text-canvas/60">
      {keys.map((key) => (key === "mod" ? modifier : key)).join(modifier === "⌘" ? "" : "+")}
    </span>
  );
}

export function Tooltip({ content, shortcut, side = "bottom", align = "center", disabled = false, children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipPrimitive.Root open={open && !disabled} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          onEscapeKeyDown={(event) => tooltipEscapes.add(event)}
          className="z-50 flex max-w-64 origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-sm bg-fg px-2 py-1 text-12 text-balance text-canvas shadow-md select-none data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in"
        >
          {content}
          {shortcut ? <ShortcutHint keys={shortcut} /> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
