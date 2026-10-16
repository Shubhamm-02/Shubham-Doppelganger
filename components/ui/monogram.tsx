import { useId } from "react";

export const MONOGRAM_VIEWBOX = 32;
export const MONOGRAM_STROKE = 3;
export const MONOGRAM_RADIUS = 7.5;
export const MONOGRAM_PATHS = [
  "M14.5 9.5H9.5A2.5 2.5 0 0 0 7 12V13.5A2.5 2.5 0 0 0 9.5 16H10.5A2.5 2.5 0 0 1 13 18.5V20A2.5 2.5 0 0 1 10.5 22.5H5.5",
  "M26.5 9.5H21.5A2.5 2.5 0 0 0 19 12V13.5A2.5 2.5 0 0 0 21.5 16H22.5A2.5 2.5 0 0 1 25 18.5V20A2.5 2.5 0 0 1 22.5 22.5H17.5"
] as const;

type MonogramProps = {
  size?: number;
  variant?: "badge" | "glyph";
  title?: string;
  className?: string;
};

export function Monogram({ size = 24, variant = "badge", title, className }: MonogramProps) {
  const maskId = useId();
  const a11y = title ? { role: "img" as const } : { "aria-hidden": true as const };
  const letters = MONOGRAM_PATHS.map((d) => (
    <path key={d} d={d} fill="none" strokeWidth={MONOGRAM_STROKE} strokeLinejoin="round" />
  ));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MONOGRAM_VIEWBOX} ${MONOGRAM_VIEWBOX}`}
      className={className}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      {variant === "badge" ? (
        <>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={MONOGRAM_VIEWBOX} height={MONOGRAM_VIEWBOX}>
            <rect width={MONOGRAM_VIEWBOX} height={MONOGRAM_VIEWBOX} fill="white" />
            <g stroke="black">{letters}</g>
          </mask>
          <rect
            width={MONOGRAM_VIEWBOX}
            height={MONOGRAM_VIEWBOX}
            rx={MONOGRAM_RADIUS}
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </>
      ) : (
        <g stroke="currentColor">{letters}</g>
      )}
    </svg>
  );
}
