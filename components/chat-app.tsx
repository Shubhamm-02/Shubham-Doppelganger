"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { ProfileSummary } from "@/lib/profile-summary";
import { lastAssistant } from "@/lib/client/chat-state";
import type { SessionSummary } from "@/lib/client/types";
import { transitions } from "@/lib/client/motion";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { useSessions } from "@/hooks/use-sessions";
import { useVoiceCall } from "@/hooks/use-voice-call";
import { AppHeader } from "@/components/app-header";
import { Composer, type ComposerHandle } from "@/components/composer";
import { EmptyState } from "@/components/empty-state";
import { Sidebar, SidebarInset, useSidebarState } from "@/components/sidebar/sidebar";
import type { ThreadProps } from "@/components/thread/thread";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";
import { MicPrimer } from "@/components/voice/mic-primer";
import { VoiceButton } from "@/components/voice/voice-button";
import { VoicePanel } from "@/components/voice/voice-panel";

const BOOKING_REQUEST = "I'd like to book a 15-minute call with Shubham.";

function ThreadUnavailable() {
  return (
    <div className="flex animate-fade-in flex-col items-center gap-1 px-(--gutter) py-16 text-center">
      <p className="text-15 font-medium text-fg">Couldn’t load the conversation</p>
      <p className="text-14 text-fg-muted">Check your connection, then reload the page.</p>
      <Button size="sm" className="mt-4" leadingIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

// The thread brings markdown and booking code the landing page never renders. It loads on the
// visitor's first sign of intent (pointer, touch, focus or key), well before the first answer arrives.
// The bundler never retries a chunk that failed to load (offline, or replaced by a newer deploy), so
// that failure leaves a reload prompt instead of crashing the page.
let threadRequested = false;
const loadThread = () =>
  import("@/components/thread/thread").then(
    (module) => module.Thread,
    () => ThreadUnavailable
  );
const Thread = dynamic<ThreadProps>(loadThread, { ssr: false });

function preloadThread() {
  if (threadRequested) return;
  threadRequested = true;
  void loadThread();
}

function settleNotice(message: ReturnType<typeof lastAssistant>) {
  if (message?.status === "error" && message.error) return message.error.message;
  if (message?.status === "stopped") return "Stopped.";
  return null;
}

function plainText(markdown: string) {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+\.|#{1,6}|>)\s+/gm, "")
    .replace(/[*_`~]/g, "");
}

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transitions.enter },
  exit: { opacity: 0, transition: transitions.exit }
};

export function ChatApp({ profile }: { profile: ProfileSummary }) {
  const sessions = useSessions();
  const sidebar = useSidebarState();
  const composerRef = useRef<ComposerHandle>(null);
  const untitled = useRef(new Set<number>());
  const { upsert, touch, reload } = sessions;

  const onSessionCreated = useCallback(
    (session: SessionSummary) => {
      untitled.current.add(session.id);
      upsert(session);
    },
    [upsert]
  );

  const onTurnSettled = useCallback(
    (sessionId: number) => {
      touch(sessionId);
      if (untitled.current.delete(sessionId)) reload();
    },
    [touch, reload]
  );

  const chat = useChatStream({ onSessionCreated, onTurnSettled });
  const voice = useVoiceCall({ onTranscript: chat.appendVoiceTranscript });
  const showLanding = chat.messages.length === 0 && chat.historyStatus === "idle";
  const [announcement, setAnnouncement] = useState<{ key: number; text: string } | null>(null);
  const [announced, setAnnounced] = useState({ answerId: null as string | null, streaming: false });
  const answerId = chat.lastCompletedAnswer?.id ?? null;

  // One polite live region: a finished answer, or a short note when a turn ends in an error or a stop.
  if (announced.answerId !== answerId || announced.streaming !== chat.isStreaming) {
    setAnnounced({ answerId, streaming: chat.isStreaming });
    const text =
      chat.lastCompletedAnswer && answerId !== announced.answerId
        ? plainText(chat.lastCompletedAnswer.text)
        : announced.streaming && !chat.isStreaming
          ? settleNotice(lastAssistant(chat.messages))
          : null;
    if (text) setAnnouncement((previous) => ({ key: (previous?.key ?? 0) + 1, text }));
  }

  function focusComposer() {
    composerRef.current?.focus();
  }

  function newChat() {
    chat.newChat();
    if (sidebar.isDesktop) focusComposer();
  }

  useGlobalShortcuts({
    onNewChat: newChat,
    onFocusComposer: focusComposer,
    onEscape() {
      if (chat.isStreaming) chat.stop();
    }
  });

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden"
      onPointerMove={preloadThread}
      onPointerDown={preloadThread}
      onFocus={preloadThread}
      onKeyDown={preloadThread}
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-14 font-medium text-fg shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to conversation
      </a>
      <AppHeader
        name={profile.name}
        links={profile.links}
        isDesktop={sidebar.isDesktop}
        sidebarExpanded={sidebar.expanded}
        onToggleSidebar={sidebar.toggle}
        onNewChat={newChat}
        voice={<VoiceButton call={voice} />}
      />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          sessions={sessions}
          activeSessionId={chat.sessionId}
          desktopOpen={sidebar.desktopOpen}
          mobileOpen={sidebar.mobileOpen}
          onMobileOpenChange={sidebar.setMobileOpen}
          onSelect={chat.openSession}
          onNewChat={newChat}
          onActiveRemoved={chat.newChat}
        />
        <SidebarInset open={sidebar.desktopOpen}>
          <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
            <div className="relative min-h-0 flex-1">
              <AnimatePresence initial={false}>
                {showLanding ? (
                  <motion.div key="landing" {...fade} className="absolute inset-0 overflow-y-auto overscroll-contain">
                    <div className="mx-auto w-full max-w-thread pr-(--gutter-right) pl-(--gutter-left)">
                      <EmptyState
                        profile={profile}
                        onAsk={chat.send}
                        onBook={() => chat.send(BOOKING_REQUEST)}
                        voice={<VoiceButton call={voice} appearance="button" />}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="thread" {...fade} className="absolute inset-0 flex flex-col">
                    <h1 className="sr-only">Conversation with Shubham&apos;s AI representative</h1>
                    <Thread {...chat} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Composer
              ref={composerRef}
              isStreaming={chat.isStreaming}
              rateLimitedUntil={chat.rateLimitedUntil}
              onSend={chat.send}
              onStop={chat.stop}
            />
          </main>
        </SidebarInset>
      </div>
      <MicPrimer call={voice} />
      <VoicePanel call={voice} />
      <div aria-live="polite" className="sr-only">
        {announcement ? <p key={announcement.key}>{announcement.text}</p> : null}
      </div>
    </div>
  );
}
