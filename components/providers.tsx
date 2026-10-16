"use client";

import { TooltipProvider } from "@radix-ui/react-tooltip";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme";

const toastClassNames = {
  // A modal drawer turns pointer events off for the page; toasts such as Undo must stay usable.
  toast: "pointer-events-auto flex w-full items-center gap-3 rounded-lg bg-surface px-4 py-3 text-14 text-fg shadow-md",
  content: "flex min-w-0 flex-1 flex-col gap-0.5",
  title: "font-medium",
  description: "text-13 text-fg-muted",
  icon: "shrink-0 text-fg-muted",
  actionButton:
    "relative shrink-0 rounded-md before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] px-2.5 h-8 text-13 font-medium text-accent transition-colors duration-(--duration-fast) hover:bg-accent-soft",
  cancelButton:
    "relative shrink-0 rounded-md before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] px-2.5 h-8 text-13 font-medium text-fg-muted transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-fg",
  closeButton: "text-fg-muted"
};

export function Providers({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        {children}
        <Toaster
          theme={resolvedTheme}
          position="bottom-right"
          offset={{ bottom: 96, right: 24 }}
          mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)", left: 16, right: 16 }}
          gap={8}
          toastOptions={{ unstyled: true, classNames: toastClassNames }}
        />
      </TooltipProvider>
    </MotionConfig>
  );
}
