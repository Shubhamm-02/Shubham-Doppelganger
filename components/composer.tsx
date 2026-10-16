"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type Ref
} from "react";
import { cx } from "@/lib/client/cx";
import { formatWait } from "@/lib/client/format-time";
import { transitions } from "@/lib/client/motion";
import { useSecondsUntil } from "@/hooks/use-countdown";
import { SendIcon, StopIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";

const MESSAGE_LIMIT = 2000;
const COUNTER_FROM = 1800;
const LINE_HEIGHT = 24;
const MAX_LINES = 8;
const VERTICAL_PADDING = 16;
const MIN_HEIGHT = LINE_HEIGHT + VERTICAL_PADDING;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES + VERTICAL_PADDING;
const PLACEHOLDER = "Ask about his work or availability";

export type ComposerHandle = { focus(): void };

export type ComposerProps = {
  isStreaming: boolean;
  rateLimitedUntil?: number | null;
  onSend(text: string): void;
  onStop(): void;
  ref?: Ref<ComposerHandle>;
  className?: string;
};

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
}

const numberFormat = new Intl.NumberFormat("en-US");

// The placeholder stays on one line (truncated) so the empty composer is one line tall at every width.
const TEXTAREA_CLASS =
  "block w-full resize-none bg-transparent px-3 py-2 text-15 text-fg outline-none placeholder:truncate placeholder:text-fg-subtle";

export function Composer({ isStreaming, rateLimitedUntil = null, onSend, onStop, ref, className }: ComposerProps) {
  const [text, setText] = useState("");
  const [height, setHeight] = useState(MIN_HEIGHT);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLTextAreaElement>(null);
  const online = useOnline();
  const waitSeconds = useSecondsUntil(rateLimitedUntil);

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

  const measure = useCallback(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, mirror.scrollHeight)));
  }, []);

  useLayoutEffect(measure, [text, measure]);

  useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    const observer = new ResizeObserver(measure);
    observer.observe(mirror);
    return () => observer.disconnect();
  }, [measure]);

  const trimmed = text.trim();
  const length = text.length;
  const overLimit = length > MESSAGE_LIMIT;
  const disabledReason = !online
    ? "You're offline"
    : waitSeconds > 0
      ? `You can send again in ${formatWait(waitSeconds)}`
      : overLimit
        ? `Shorten your message to ${numberFormat.format(MESSAGE_LIMIT)} characters`
        : !trimmed
          ? "Type a message first"
          : undefined;

  function submit() {
    if (isStreaming || disabledReason) return;
    onSend(trimmed);
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  }

  return (
    <div
      className={cx(
        "mx-auto w-full max-w-thread pt-2 pr-(--gutter-right) pb-[max(env(safe-area-inset-bottom),0.75rem)] pl-(--gutter-left)",
        className
      )}
    >
      <form
        className={cx(
          "flex w-full items-end gap-1 rounded-xl bg-surface p-1.5 shadow-sm",
          "transition-shadow duration-(--duration-fast) ease-out",
          "has-[textarea:focus-visible]:shadow-[0_0_0_1px_var(--color-accent),0_1px_2px_rgb(0_0_0/0.06)]"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <div
            className="overflow-hidden transition-[height] duration-(--duration-fast) ease-out"
            style={{ height }}
          >
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={PLACEHOLDER}
              aria-label="Message"
              aria-describedby={length > COUNTER_FROM ? "composer-counter" : undefined}
              aria-invalid={overLimit || undefined}
              enterKeyHint="send"
              autoComplete="off"
              style={{ height }}
              className={cx(TEXTAREA_CLASS, height >= MAX_HEIGHT ? "overflow-y-auto" : "overflow-y-hidden")}
            />
          </div>
          <textarea
            ref={mirrorRef}
            value={text || " "}
            readOnly
            rows={1}
            tabIndex={-1}
            aria-hidden="true"
            className={cx(TEXTAREA_CLASS, "pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden")}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {length > COUNTER_FROM ? (
            <span
              id="composer-counter"
              className={cx("font-mono text-12 tabular-nums", overLimit ? "text-danger" : "text-fg-subtle")}
            >
              {numberFormat.format(length)}/{numberFormat.format(MESSAGE_LIMIT)}
            </span>
          ) : null}
          <IconButton
            type={isStreaming ? "button" : "submit"}
            variant={isStreaming ? "secondary" : "primary"}
            label={isStreaming ? "Stop" : "Send"}
            shortcut={isStreaming ? ["Esc"] : ["↵"]}
            tooltipSide="top"
            disabled={!isStreaming && Boolean(disabledReason)}
            disabledReason={isStreaming ? undefined : disabledReason}
            onClick={isStreaming ? onStop : undefined}
            className="rounded-lg"
            icon={
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={isStreaming ? "stop" : "send"}
                  className="flex"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, transition: transitions.enter }}
                  exit={{ opacity: 0, scale: 0.8, transition: transitions.exit }}
                >
                  {isStreaming ? <StopIcon /> : <SendIcon />}
                </motion.span>
              </AnimatePresence>
            }
          />
        </div>
      </form>
    </div>
  );
}
