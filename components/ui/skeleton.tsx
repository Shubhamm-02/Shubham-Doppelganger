import { cx } from "@/lib/client/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "relative overflow-hidden rounded-sm bg-sunken",
        "after:absolute after:inset-0 after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-fg/5 after:to-transparent",
        "motion-reduce:after:hidden",
        className
      )}
    />
  );
}
