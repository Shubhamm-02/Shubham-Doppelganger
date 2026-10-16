"use client";

import type { ComponentProps } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { cx } from "@/lib/client/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cx(
    "bg-accent text-accent-fg shadow-xs not-data-disabled:hover:bg-accent/90",
    "data-disabled:bg-sunken data-disabled:text-fg-subtle data-disabled:shadow-none dark:data-disabled:bg-fg/8"
  ),
  secondary: "bg-surface text-fg shadow-sm hover:bg-sunken data-disabled:opacity-50",
  ghost: "text-fg-muted hover:bg-sunken hover:text-fg data-disabled:opacity-50",
  danger: "bg-danger text-canvas shadow-xs hover:bg-danger/90 data-disabled:opacity-50"
};

// Small buttons stay 32px tall but get a 40px hit area, matching IconButton sm.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-13 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
  md: "h-10 gap-2 px-4 text-14"
};

function buttonStyles({ variant = "secondary", size = "md" }: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cx(
    "relative inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none",
    "transition-[background-color,color,box-shadow,opacity] duration-(--duration-fast) ease-out",
    "data-disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size]
  );
}

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  disabledReason?: string;
  leadingIcon?: React.ReactNode;
};

export function Button({
  variant,
  size = "md",
  pending = false,
  disabled = false,
  disabledReason,
  leadingIcon,
  type = "button",
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  const inert = disabled || pending;
  const button = (
    <button
      type={type}
      {...props}
      disabled={disabled && !disabledReason}
      aria-disabled={inert || undefined}
      aria-busy={pending || undefined}
      data-disabled={disabled ? "" : undefined}
      className={cx(buttonStyles({ variant, size }), className)}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      <span className={cx("inline-flex items-center gap-[inherit]", pending && "opacity-0")}>
        {leadingIcon}
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === "sm" ? 14 : 16} />
        </span>
      ) : null}
    </button>
  );

  return disabled && disabledReason ? <Tooltip content={disabledReason}>{button}</Tooltip> : button;
}
