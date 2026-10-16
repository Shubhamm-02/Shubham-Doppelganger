import { ImageResponse } from "next/og";
import { MONOGRAM_PATHS, MONOGRAM_STROKE, MONOGRAM_VIEWBOX } from "@/components/ui/monogram";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#0b0b0c" }}>
        <svg width={132} height={132} viewBox={`0 0 ${MONOGRAM_VIEWBOX} ${MONOGRAM_VIEWBOX}`}>
          {MONOGRAM_PATHS.map((d) => (
            <path key={d} d={d} fill="none" stroke="#fafaf9" strokeWidth={MONOGRAM_STROKE} strokeLinejoin="round" />
          ))}
        </svg>
      </div>
    ),
    size
  );
}
