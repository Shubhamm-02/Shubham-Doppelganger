"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ChatAction } from "@/lib/chat/types";
import { rateLimitMessage } from "@/lib/client/errors";
import type { AssistantMessage, ThreadMessage, UserMessage } from "@/lib/client/types";
import { cx } from "@/lib/client/cx";
import { formatWait } from "@/lib/client/format-time";
import { useSecondsUntil } from "@/hooks/use-countdown";
import { SchedulingBlock } from "@/components/booking/scheduling-block";
import { Markdown } from "@/components/thread/markdown";
import { SourceChips } from "@/components/thread/source-chips";
import { StatusLine } from "@/components/thread/status-line";
import { Button } from "@/components/ui/button";
import { AlertIcon, CheckIcon, CopyIcon, RefreshIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";

export type MessageProps = {
  message: ThreadMessage;
  isLatest: boolean;
  isStreaming: boolean;
  debug: boolean;
  rateLimitedUntil: number | null;
  onRetry(assistantId: string): void;
  onRegenerate(): void;
  onAction(action: ChatAction, displayText: string): void;
};

const BUSY_REASON = "Wait for the current answer to finish";

function MetaLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-12 text-fg-subtle">{children}</span>;
}

function DebugChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-xs border border-border px-1.5 font-mono text-12 text-fg-subtle">
      {children}
    </span>
  );
}

function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div className="flex flex-col items-end gap-1.5 pl-[12%]">
      <h2 className="sr-only">You</h2>
      <div className="max-w-full rounded-lg bg-sunken px-3.5 py-2 text-15 break-words whitespace-pre-wrap text-fg">
        {message.text}
      </div>
      {message.channel === "voice" ? <MetaLabel>Voice</MetaLabel> : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function copy() {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast("Copied");
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast("Couldn't copy. Select the text instead."));
  }

  return (
    <IconButton
      size="sm"
      label={copied ? "Copied" : "Copy"}
      tooltipSide="top"
      icon={copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      onClick={copy}
    />
  );
}

function RetryButton({ onRetry, disabledReason }: { onRetry(): void; disabledReason?: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      leadingIcon={<RefreshIcon />}
      disabled={Boolean(disabledReason)}
      disabledReason={disabledReason}
      onClick={onRetry}
    >
      Retry
    </Button>
  );
}

function ErrorNote({
  message,
  canRetry,
  isStreaming,
  rateLimitedUntil,
  onRetry
}: {
  message: AssistantMessage;
  canRetry: boolean;
  isStreaming: boolean;
  rateLimitedUntil: number | null;
  onRetry(): void;
}) {
  const error = message.error;
  const rateLimited = error?.kind === "rate_limited";
  const seconds = useSecondsUntil(rateLimited ? rateLimitedUntil : null);
  if (!error) return null;

  const copy = rateLimited
    ? seconds > 0
      ? rateLimitMessage(seconds)
      : rateLimitedUntil !== null
        ? "You can send again now."
        : error.message
    : error.message;
  const retryable = canRetry && error.kind !== "not_found" && error.kind !== "invalid";
  const reason = isStreaming ? BUSY_REASON : seconds > 0 ? `Available in ${formatWait(seconds)}` : undefined;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="flex min-w-0 items-start gap-2 text-14 text-fg-muted">
        <AlertIcon className="mt-0.5 shrink-0 text-danger" />
        <span className="tabular-nums">{copy}</span>
      </p>
      {retryable ? <RetryButton onRetry={onRetry} disabledReason={reason} /> : null}
    </div>
  );
}

function AssistantBody({
  message,
  isLatest,
  isStreaming,
  debug,
  rateLimitedUntil,
  onRetry,
  onRegenerate,
  onAction
}: MessageProps & { message: AssistantMessage }) {
  const { status } = message;
  const settled = status === "complete" || status === "stopped" || status === "error";
  const canRetry = isLatest && message.channel === "chat";
  const showActions = message.text.length > 0 && (status === "complete" || status === "stopped");
  const canRegenerate = canRetry && status === "complete" && message.intent !== "scheduling";
  const labels = [
    message.channel === "voice" ? <MetaLabel key="voice">Voice</MetaLabel> : null,
    debug && message.grounded !== null ? (
      <DebugChip key="grounded">{message.grounded ? "grounded" : "unverified"}</DebugChip>
    ) : null,
    debug && settled ? <DebugChip key="retrieval">retrieval {message.sources.length}</DebugChip> : null
  ].filter(Boolean);

  return (
    <div className="group/message flex flex-col gap-3" aria-busy={status === "pending" || status === "streaming"}>
      <h2 className="sr-only">AI representative</h2>
      {status === "pending" ? <StatusLine stage={message.stage} /> : null}
      {message.text ? (
        <Markdown
          text={message.text}
          streaming={status === "streaming" && message.channel === "chat"}
          className="animate-fade-in"
        />
      ) : null}
      {status === "stopped" ? (
        <div className="flex items-center gap-3">
          <MetaLabel>{message.text ? "Stopped" : "Stopped before an answer"}</MetaLabel>
          {canRetry ? (
            <RetryButton onRetry={() => onRetry(message.id)} disabledReason={isStreaming ? BUSY_REASON : undefined} />
          ) : null}
        </div>
      ) : null}
      {status === "error" ? (
        <ErrorNote
          message={message}
          canRetry={canRetry}
          isStreaming={isStreaming}
          rateLimitedUntil={rateLimitedUntil}
          onRetry={() => onRetry(message.id)}
        />
      ) : null}
      {message.scheduling ? (
        <SchedulingBlock
          snapshot={message.scheduling}
          interactive={isLatest && status === "complete"}
          busy={isStreaming}
          onAction={onAction}
        />
      ) : null}
      {status === "complete" ? <SourceChips sources={message.sources} /> : null}
      {showActions || labels.length > 0 ? (
        <div className="-my-1 flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1.5">
          {labels.length > 0 ? <div className="flex items-center gap-2">{labels}</div> : null}
          {showActions ? (
            <div
              className={cx(
                "flex items-center gap-0.5 transition-opacity first:-ml-1.5 duration-(--duration-fast) ease-out",
                "opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100 [@media(hover:none)]:opacity-100"
              )}
            >
              <CopyButton text={message.text} />
              {canRegenerate ? (
                <IconButton
                  size="sm"
                  label="Regenerate"
                  tooltipSide="top"
                  icon={<RefreshIcon />}
                  disabled={isStreaming}
                  disabledReason={isStreaming ? BUSY_REASON : undefined}
                  onClick={onRegenerate}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Message(props: MessageProps) {
  const { message } = props;
  return message.role === "user" ? <UserBubble message={message} /> : <AssistantBody {...props} message={message} />;
}
