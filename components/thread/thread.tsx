"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { ChatAction } from "@/lib/chat/types";
import { lastAssistant } from "@/lib/client/chat-state";
import { cx } from "@/lib/client/cx";
import { transitions } from "@/lib/client/motion";
import type { ChatStream } from "@/hooks/use-chat-stream";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { JumpToLatest } from "@/components/thread/jump-to-latest";
import { Message } from "@/components/thread/message";
import { MessageSkeleton } from "@/components/thread/message-skeleton";
import { Button } from "@/components/ui/button";
import { RefreshIcon } from "@/components/ui/icons";

export type ThreadProps = Pick<
  ChatStream,
  | "sessionId"
  | "messages"
  | "historyStatus"
  | "hasEarlier"
  | "earlierStatus"
  | "isStreaming"
  | "rateLimitedUntil"
  | "send"
  | "retry"
  | "regenerate"
  | "loadEarlier"
  | "reloadHistory"
> & { className?: string };

function subscribeNever() {
  return () => {};
}

function readDebugFlag() {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function useDebugFlag() {
  return useSyncExternalStore(subscribeNever, readDebugFlag, () => false);
}

function isLocal(id: string) {
  return !id.startsWith("turn-");
}

function hasLostFocus() {
  return !document.activeElement || document.activeElement === document.body;
}

function EarlierControl({ status, onLoad }: { status: ThreadProps["earlierStatus"]; onLoad(): void }) {
  return (
    <div className="mb-8 flex min-h-8 items-center justify-center gap-3">
      {status === "error" ? <span className="text-13 text-fg-muted">Couldn’t load earlier messages.</span> : null}
      <Button
        size="sm"
        variant="ghost"
        pending={status === "loading"}
        leadingIcon={status === "error" ? <RefreshIcon /> : undefined}
        onClick={onLoad}
      >
        {status === "error" ? "Retry" : "Load earlier messages"}
      </Button>
    </div>
  );
}

function HistoryError({ onRetry }: { onRetry(): void }) {
  return (
    <div className="flex animate-fade-in flex-col items-center gap-1 py-16 text-center">
      <p className="text-15 font-medium text-fg">Couldn’t load this chat</p>
      <p className="text-14 text-fg-muted">Check your connection and try again.</p>
      <Button size="sm" className="mt-4" leadingIcon={<RefreshIcon />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function Thread({
  sessionId,
  messages,
  historyStatus,
  hasEarlier,
  earlierStatus,
  isStreaming,
  rateLimitedUntil,
  send,
  retry,
  regenerate,
  loadEarlier,
  reloadHistory,
  className
}: ThreadProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom();
  const debug = useDebugFlag();
  const anchor = useRef<{ height: number; top: number; firstId: string | null } | null>(null);
  const latestAssistantId = lastAssistant(messages)?.id ?? null;
  const firstId = messages[0]?.id ?? null;
  const lastUserId = messages.findLast((message) => message.role === "user" && isLocal(message.id))?.id ?? null;

  useLayoutEffect(() => {
    if (historyStatus === "ready") scrollToBottom();
  }, [historyStatus, sessionId, scrollToBottom]);

  useLayoutEffect(() => {
    if (lastUserId) scrollToBottom();
  }, [lastUserId, scrollToBottom]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const saved = anchor.current;
    if (!element || !saved) return;
    anchor.current = null;
    element.scrollTop = saved.top + (element.scrollHeight - saved.height);
    // The control unmounts once everything is loaded; land on the newest of the loaded messages.
    if (!hasLostFocus() || !saved.firstId) return;
    const previousFirst = element.querySelector(`[data-message-id="${CSS.escape(saved.firstId)}"]`);
    const loaded = previousFirst?.previousElementSibling;
    if (loaded instanceof HTMLElement && loaded.tagName === "ARTICLE") loaded.focus({ preventScroll: true });
  }, [firstId, scrollRef]);

  useEffect(() => {
    if (earlierStatus === "error") anchor.current = null;
  }, [earlierStatus]);

  function handleLoadEarlier() {
    const element = scrollRef.current;
    if (element) anchor.current = { height: element.scrollHeight, top: element.scrollTop, firstId };
    loadEarlier();
  }

  function handleJump() {
    // The button unmounts as the thread reaches the bottom, so hand focus to the latest message first.
    const articles = contentRef.current?.querySelectorAll<HTMLElement>("article");
    articles?.[articles.length - 1]?.focus({ preventScroll: true });
    scrollToBottom("smooth");
  }

  function handleAction(action: ChatAction, displayText: string) {
    send(displayText, { action });
  }

  return (
    <div className={cx("relative min-h-0 flex-1", className)}>
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain [overflow-anchor:none]">
        <div ref={contentRef} className="mx-auto w-full max-w-thread pt-6 pr-(--gutter-right) pb-10 pl-(--gutter-left) md:pt-10">
          {historyStatus === "loading" ? (
            <MessageSkeleton />
          ) : historyStatus === "error" ? (
            <HistoryError onRetry={reloadHistory} />
          ) : (
            <>
              {hasEarlier ? <EarlierControl status={earlierStatus} onLoad={handleLoadEarlier} /> : null}
              {messages.map((message, index) => (
                <motion.article
                  key={message.id}
                  data-message-id={message.id}
                  tabIndex={-1}
                  initial={isLocal(message.id) ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0, transition: transitions.enter }}
                  className={cx(
                    "outline-none",
                    index > 0 && (message.role === "user" ? "mt-7" : "mt-5"),
                    message.role === "assistant" && "min-h-6"
                  )}
                >
                  <Message
                    message={message}
                    isLatest={message.id === latestAssistantId}
                    isStreaming={isStreaming}
                    debug={debug}
                    rateLimitedUntil={rateLimitedUntil}
                    onRetry={retry}
                    onRegenerate={regenerate}
                    onAction={handleAction}
                  />
                </motion.article>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <JumpToLatest
          visible={!isAtBottom && historyStatus === "ready" && messages.length > 0}
          onJump={handleJump}
        />
      </div>
    </div>
  );
}
