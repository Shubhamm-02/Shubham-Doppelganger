"use client";

import { AnimatePresence, motion } from "motion/react";
import type { VoiceSpeaker } from "@/hooks/use-voice-call";
import { transitions } from "@/lib/client/motion";
import { cx } from "@/lib/client/cx";

export type SpeakingIndicatorProps = {
  speaker: VoiceSpeaker;
  muted: boolean;
  className?: string;
};

function label(speaker: VoiceSpeaker, muted: boolean) {
  if (speaker === "assistant") return "Speaking";
  if (muted) return "You're muted";
  return "Listening";
}

export function SpeakingIndicator({ speaker, muted, className }: SpeakingIndicatorProps) {
  const text = label(speaker, muted);
  const assistant = speaker === "assistant";

  return (
    <p className={cx("relative flex h-5 items-center gap-2 text-13 text-fg-muted", className)}>
      <span
        aria-hidden="true"
        className={cx(
          "size-1.5 shrink-0 rounded-full transition-colors duration-(--duration-base) ease-out",
          assistant ? "bg-accent" : muted ? "bg-danger" : "bg-fg-subtle"
        )}
      />
      <span className="relative grid">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={text}
            className="col-start-1 row-start-1 whitespace-nowrap"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: transitions.enter }}
            exit={{ opacity: 0, y: -4, transition: transitions.exit }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
    </p>
  );
}
