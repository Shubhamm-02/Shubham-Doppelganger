"use client";

import { AnimatePresence, motion } from "motion/react";
import { transitions } from "@/lib/client/motion";
import { ArrowDownIcon } from "@/components/ui/icons";

export function JumpToLatest({ visible, onJump }: { visible: boolean; onJump(): void }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          key="jump"
          type="button"
          onClick={onJump}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: transitions.enter }}
          exit={{ opacity: 0, y: 6, transition: transitions.exit }}
          className="pointer-events-auto relative inline-flex h-8 items-center gap-1.5 rounded-full bg-surface pr-3.5 pl-3 text-13 font-medium text-fg shadow-md transition-colors duration-(--duration-fast) before:absolute before:-inset-1 before:content-[''] hover:bg-sunken"
        >
          <ArrowDownIcon className="text-fg-muted" />
          Jump to latest
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
