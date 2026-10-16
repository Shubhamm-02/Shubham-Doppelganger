import type { Transition } from "motion/react";

const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const transitions = {
  enter: { duration: 0.18, ease: EASE_OUT },
  exit: { duration: 0.12, ease: EASE_IN },
  layout: { type: "spring", bounce: 0, duration: 0.24 }
} satisfies Record<string, Transition>;

export const rise = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: transitions.enter },
  exit: { opacity: 0, transition: transitions.exit }
};
