"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  animate,
  AnimatePresence,
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  type PanInfo
} from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { SessionList } from "@/components/sidebar/session-list";
import { IconButton } from "@/components/ui/icon-button";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { Shortcut } from "@/components/ui/kbd";
import { DESKTOP_QUERY, useIsDesktop } from "@/hooks/use-media-query";
import type { SessionsController } from "@/hooks/use-sessions";
import { cx } from "@/lib/client/cx";
import { EASE_IN, transitions } from "@/lib/client/motion";

export const SIDEBAR_ID = "chat-sidebar";
export const SIDEBAR_TOGGLE_ATTR = "data-sidebar-toggle";

const DRAWER_CLOSE_RATIO = 0.35;
const DRAWER_CLOSE_VELOCITY = 500;
const drawerExit = { duration: 0.18, ease: EASE_IN };

export type SidebarState = {
  isDesktop: boolean;
  desktopOpen: boolean;
  mobileOpen: boolean;
  expanded: boolean;
  setMobileOpen(open: boolean): void;
  toggle(): void;
};

export function useSidebarState(): SidebarState {
  const isDesktop = useIsDesktop();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastLayout, setLastLayout] = useState(isDesktop);

  if (lastLayout !== isDesktop) {
    setLastLayout(isDesktop);
    setMobileOpen(false);
  }

  const toggle = useCallback(() => {
    if (isDesktop) setDesktopOpen((open) => !open);
    else setMobileOpen((open) => !open);
  }, [isDesktop]);

  return {
    isDesktop,
    desktopOpen,
    mobileOpen: mobileOpen && !isDesktop,
    expanded: isDesktop ? desktopOpen : mobileOpen,
    setMobileOpen,
    toggle
  };
}

export type SidebarProps = {
  sessions: SessionsController;
  activeSessionId: number | null;
  desktopOpen: boolean;
  mobileOpen: boolean;
  onMobileOpenChange(open: boolean): void;
  onSelect(id: number): void;
  onNewChat(): void;
  onActiveRemoved(): void;
};

export function Sidebar({
  sessions,
  activeSessionId,
  desktopOpen,
  mobileOpen,
  onMobileOpenChange,
  onSelect,
  onNewChat,
  onActiveRemoved
}: SidebarProps) {
  const reduceMotion = useReducedMotion();
  // Picking a chat or starting a new one moves focus to the conversation; any other close returns it to the toggle.
  const focusMainOnClose = useRef(false);

  function remove(id: number) {
    sessions.remove(id, { onRemoved: id === activeSessionId ? onActiveRemoved : undefined });
  }

  function panel(variant: "column" | "drawer") {
    const closeDrawer = variant === "drawer" ? () => onMobileOpenChange(false) : undefined;
    const leaveDrawer = closeDrawer
      ? () => {
          focusMainOnClose.current = true;
          closeDrawer();
        }
      : undefined;
    return (
      <SidebarPanel
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={(id) => {
          onSelect(id);
          leaveDrawer?.();
        }}
        onNewChat={() => {
          onNewChat();
          leaveDrawer?.();
        }}
        onDelete={remove}
        onClose={closeDrawer}
      />
    );
  }

  return (
    <>
      <motion.aside
        id={SIDEBAR_ID}
        aria-label="Chats"
        inert={!desktopOpen}
        initial={false}
        animate={{
          x: desktopOpen || reduceMotion ? 0 : "-100%",
          opacity: desktopOpen || !reduceMotion ? 1 : 0
        }}
        transition={reduceMotion ? transitions.enter : transitions.layout}
        className="absolute inset-y-0 left-0 z-20 hidden w-sidebar flex-col border-r border-border bg-sunken pl-[env(safe-area-inset-left)] md:flex"
      >
        {panel("column")}
      </motion.aside>
      <Drawer
        open={mobileOpen}
        onOpenChange={onMobileOpenChange}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const toMain = focusMainOnClose.current;
          focusMainOnClose.current = false;
          const target = toMain
            ? document.getElementById("main")
            : document.querySelector<HTMLElement>(`[${SIDEBAR_TOGGLE_ATTR}]`);
          target?.focus({ preventScroll: true });
        }}
      >
        {panel("drawer")}
      </Drawer>
    </>
  );
}

type SidebarPanelProps = {
  sessions: SessionsController;
  activeSessionId: number | null;
  onSelect(id: number): void;
  onNewChat(): void;
  onDelete(id: number): void;
  onClose?(): void;
};

function SidebarPanel({ sessions, activeSessionId, onSelect, onNewChat, onDelete, onClose }: SidebarPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <button
          type="button"
          onClick={onNewChat}
          className={cx(
            "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface pr-1.5 pl-2.5 text-14 font-medium text-fg shadow-sm",
            "transition-colors duration-(--duration-fast) ease-out hover:bg-surface/60 pointer-coarse:h-10",
            "dark:bg-fg/5 dark:hover:bg-fg/8"
          )}
        >
          <PlusIcon className="text-fg-muted" />
          <span className="flex-1 text-left">New chat</span>
          <Shortcut keys={["mod", "K"]} className="pointer-coarse:hidden" />
        </button>
        {onClose ? <IconButton label="Close chats" icon={<XIcon />} onClick={onClose} /> : null}
      </div>
      <nav aria-label="Chat history" className="flex min-h-0 flex-1 flex-col">
        <motion.div
          layoutScroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <SessionList
            status={sessions.status}
            groups={sessions.groups}
            activeSessionId={activeSessionId}
            onSelect={onSelect}
            onRename={(id, title) => void sessions.rename(id, title)}
            onDelete={onDelete}
            onRetry={sessions.reload}
          />
        </motion.div>
      </nav>
    </div>
  );
}

function Drawer({
  open,
  onOpenChange,
  onCloseAutoFocus,
  children
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onCloseAutoFocus(event: Event): void;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const dim = useMotionValue(1);

  function panelWidth() {
    return panelRef.current?.offsetWidth || 288;
  }

  function handleDrag(_: PointerEvent, info: PanInfo) {
    dim.set(Math.max(0, 1 + Math.min(0, info.offset.x) / panelWidth()));
  }

  function handleDragEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.x < -panelWidth() * DRAWER_CLOSE_RATIO || info.velocity.x < -DRAWER_CLOSE_VELOCITY) {
      onOpenChange(false);
    } else {
      animate(dim, 1, transitions.enter);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) dim.set(1);
        onOpenChange(next);
      }}
    >
      <AnimatePresence onExitComplete={() => dim.set(1)}>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-40 md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: transitions.enter }}
                exit={{ opacity: 0, transition: drawerExit }}
              >
                <motion.div className="absolute inset-0 bg-overlay" style={{ opacity: dim }} />
              </motion.div>
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              asChild
              aria-describedby={undefined}
              onCloseAutoFocus={onCloseAutoFocus}
              onEscapeKeyDown={(event) => {
                if (event.target instanceof Element && event.target.closest("[data-session-rename]")) {
                  event.preventDefault();
                }
              }}
              onInteractOutside={(event) => {
                // A deleted chat's Undo toast sits outside the drawer; using it keeps the drawer open.
                if (event.target instanceof Element && event.target.closest("[data-sonner-toaster]")) {
                  event.preventDefault();
                }
              }}
            >
              <motion.div
                ref={panelRef}
                drag={reduceMotion ? false : "x"}
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 1, right: 0 }}
                dragMomentum={false}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                initial={reduceMotion ? { opacity: 0 } : { x: "-100%" }}
                animate={reduceMotion ? { opacity: 1, transition: transitions.enter } : { x: 0, transition: transitions.layout }}
                exit={reduceMotion ? { opacity: 0, transition: drawerExit } : { x: "-100%", transition: drawerExit }}
                style={{ width: "calc(min(18rem, 100vw - 3rem) + env(safe-area-inset-left))" }}
                className={cx(
                  "fixed inset-y-0 left-0 z-50 flex flex-col bg-sunken shadow-lg outline-none md:hidden",
                  "pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]"
                )}
              >
                <Dialog.Title className="sr-only">Chats</Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function remToken(name: string) {
  const root = getComputedStyle(document.documentElement);
  return parseFloat(root.getPropertyValue(name)) * parseFloat(root.fontSize);
}

// Left edge of the centered thread column inside an inset of `width`, with or without the sidebar.
function columnLeft(width: number, sidebarOpen: boolean) {
  const offset = sidebarOpen ? remToken("--container-sidebar") : 0;
  const available = width - offset;
  return offset + (available - Math.min(available, remToken("--container-thread"))) / 2;
}

export type SidebarInsetProps = {
  open: boolean;
  className?: string;
  children: React.ReactNode;
};

export function SidebarInset({ open, className, children }: SidebarInsetProps) {
  const [scope, animateScope] = useAnimate<HTMLDivElement>();
  const insetRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const previous = useRef(open);

  useLayoutEffect(() => {
    if (previous.current === open) return;
    previous.current = open;
    const width = insetRef.current?.offsetWidth;
    if (reduceMotion || !width || !window.matchMedia(DESKTOP_QUERY).matches) return;
    const shift = columnLeft(width, !open) - columnLeft(width, open);
    if (Math.abs(shift) < 1) return;
    animateScope(scope.current, { x: [shift, 0] }, transitions.layout);
  }, [open, reduceMotion, animateScope, scope]);

  return (
    <div
      ref={insetRef}
      className={cx(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        open && "md:pl-(--container-sidebar)",
        className
      )}
    >
      <div ref={scope} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
