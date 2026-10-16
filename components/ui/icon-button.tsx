"use client";

import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { cx } from "@/lib/client/cx";

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  label: string;
  icon: React.ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  size?: "sm" | "md";
  pending?: boolean;
  disabledReason?: string;
  shortcut?: string[];
  tooltipSide?: "top" | "right" | "bottom" | "left";
};

const VARIANTS = {
  ghost: "text-fg-muted hover:bg-sunken hover:text-fg data-[state=open]:bg-sunken data-[state=open]:text-fg",
  secondary: "bg-surface text-fg shadow-sm hover:bg-sunken",
  primary: cx(
    "bg-accent text-accent-fg shadow-xs not-data-disabled:hover:bg-accent/90",
    "data-disabled:bg-sunken data-disabled:text-fg-subtle data-disabled:shadow-none dark:data-disabled:bg-fg/8"
  )
};

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  pending = false,
  disabled = false,
  disabledReason,
  shortcut,
  tooltipSide = "bottom",
  type = "button",
  className,
  onClick,
  ...props
}: IconButtonProps) {
  const inert = disabled || pending;
  const explained = disabled && Boolean(disabledReason);
  // Hide the tooltip while this button's menu or popover is open; a plain disclosure keeps it.
  const expanded =
    (props["aria-expanded"] === true || props["aria-expanded"] === "true") && Boolean(props["aria-haspopup"]);

  return (
    <Tooltip
      content={explained ? disabledReason : label}
      shortcut={inert ? undefined : shortcut}
      side={tooltipSide}
      disabled={expanded}
    >
      <button
        type={type}
        {...props}
        aria-label={label}
        disabled={disabled && !disabledReason}
        aria-disabled={inert || undefined}
        aria-busy={pending || undefined}
        data-disabled={disabled ? "" : undefined}
        className={cx(
          "relative inline-flex shrink-0 items-center justify-center rounded-md",
          "transition-[background-color,color,box-shadow,opacity] duration-(--duration-fast) ease-out",
          "data-disabled:cursor-not-allowed",
          variant !== "primary" && "data-disabled:opacity-50",
          size === "md" ? "size-10" : "size-8 before:absolute before:-inset-1 before:content-['']",
          VARIANTS[variant],
          className
        )}
        onClick={(event) => {
          if (inert) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {pending ? <Spinner size={size === "sm" ? 14 : 16} /> : icon}
      </button>
    </Tooltip>
  );
}
