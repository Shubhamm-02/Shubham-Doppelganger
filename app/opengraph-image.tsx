import { ImageResponse } from "next/og";
import { MONOGRAM_PATHS, MONOGRAM_RADIUS, MONOGRAM_STROKE, MONOGRAM_VIEWBOX } from "@/components/ui/monogram";
import { getProfileSummary } from "@/lib/profile-summary";

export const alt = "Shubham Shah, AI/ML engineer. AI representative: ask about his work or book a 15-minute call.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const profile = getProfileSummary();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 80,
          background: "#fafaf9",
          color: "#0b0b0c"
        }}
      >
        <svg width={72} height={72} viewBox={`0 0 ${MONOGRAM_VIEWBOX} ${MONOGRAM_VIEWBOX}`}>
          <rect width={MONOGRAM_VIEWBOX} height={MONOGRAM_VIEWBOX} rx={MONOGRAM_RADIUS} fill="#0b0b0c" />
          {MONOGRAM_PATHS.map((d) => (
            <path key={d} d={d} fill="none" stroke="#fafaf9" strokeWidth={MONOGRAM_STROKE} strokeLinejoin="round" />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 96, letterSpacing: "-0.04em", lineHeight: 1 }}>{profile.name}</div>
          <div style={{ fontSize: 40, lineHeight: 1.25, color: "#5e5d59", maxWidth: 1040 }}>{profile.positioning}</div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            paddingTop: 32,
            borderTop: "1px solid #e7e6e3",
            fontSize: 28,
            color: "#5e5d59"
          }}
        >
          <span>AI representative</span>
          <span style={{ color: "#d6d5d1" }}>·</span>
          <span style={{ color: "#2f55d4" }}>Book a 15-min call</span>
        </div>
      </div>
    ),
    size
  );
}
