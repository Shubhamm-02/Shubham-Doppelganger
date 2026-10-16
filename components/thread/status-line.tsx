"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ChatStage } from "@/lib/chat/types";
import { transitions } from "@/lib/client/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

const STAGE_LABELS: Record<ChatStage, string> = {
  searching: "Searching resume and project notes",
  checking_calendar: "Checking Shubham's calendar",
  booking: "Booking your slot"
};

export function StatusLine({ stage }: { stage: ChatStage | null }) {
  return (
    <div className="relative h-6">
      <AnimatePresence initial={false}>
        <motion.div
          key={stage ?? "waiting"}
          className="absolute inset-0 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: transitions.enter }}
          exit={{ opacity: 0, transition: transitions.exit }}
        >
          {stage ? (
            <>
              <Spinner size={12} className="text-fg-subtle" />
              <span className="truncate text-14 text-fg-muted">{STAGE_LABELS[stage]}</span>
            </>
          ) : (
            <>
              <Skeleton className="h-2 w-[min(15rem,60%)] rounded-full" />
              <span className="sr-only">Preparing a reply</span>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
