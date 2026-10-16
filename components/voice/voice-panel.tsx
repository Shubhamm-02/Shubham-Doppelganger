"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { VoiceCall, VoiceStatus } from "@/hooks/use-voice-call";
import { Button } from "@/components/ui/button";
import { AlertIcon, MicIcon, MicOffIcon, PhoneOffIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { LevelMeter } from "@/components/voice/level-meter";
import { focusVoiceTrigger } from "@/components/voice/voice-button";
import { SpeakingIndicator } from "@/components/voice/speaking-indicator";
import { formatDuration } from "@/lib/client/format-time";
import { transitions } from "@/lib/client/motion";
import { cx } from "@/lib/client/cx";

export type VoicePanelProps = {
  call: Pick<
    VoiceCall,
    "status" | "error" | "speaker" | "muted" | "startedAt" | "subscribeVolume" | "toggleMute" | "end" | "confirmPrimer" | "cancel"
  >;
  className?: string;
};

const STATUS_LABEL: Partial<Record<VoiceStatus, string>> = {
  connecting: "Connecting…",
  live: "Live",
  ending: "Ending call…"
};

function isPanelStatus(call: VoicePanelProps["call"]) {
  return (
    call.status === "connecting" ||
    call.status === "live" ||
    call.status === "ending" ||
    (call.status === "error" && call.error?.kind === "failed")
  );
}

function CallTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  return (
    <span
      role="timer"
      aria-label="Call duration"
      className={cx("font-mono text-12 text-fg-muted tabular-nums", startedAt === null && "invisible")}
    >
      {formatDuration(startedAt === null ? 0 : Math.max(0, now - startedAt))}
    </span>
  );
}

function PanelBody({ call }: { call: VoicePanelProps["call"] }) {
  const { status, error, speaker, muted, startedAt } = call;

  if (status === "error" && error) {
    return (
      <>
        <div className="flex items-start gap-3">
          <AlertIcon className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-14 font-medium text-fg">{"Call didn't connect"}</p>
            <p className="mt-0.5 text-13 text-fg-muted">{error.message}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" size="sm" className="ml-auto" onClick={call.cancel}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={call.confirmPrimer}>
            Try again
          </Button>
        </div>
      </>
    );
  }

  const live = status === "live";

  return (
    <>
      <div className="flex h-5 items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-13 font-medium text-fg">
          {live ? (
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          ) : (
            <Spinner size={12} className="text-fg-subtle" />
          )}
          {STATUS_LABEL[status]}
        </p>
        <CallTimer startedAt={startedAt} />
      </div>

      <LevelMeter subscribe={call.subscribeVolume} active={live && speaker === "assistant"} className="mt-4" />

      {status === "connecting" ? (
        <p className="mt-3 flex h-5 items-center text-13 text-fg-subtle">Picking up in a moment</p>
      ) : (
        <SpeakingIndicator
          speaker={live ? speaker : null}
          muted={muted}
          className={cx("mt-3 transition-opacity duration-(--duration-base) ease-out", !live && "opacity-0")}
        />
      )}

      <div className="mt-4 flex gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={muted}
          disabled={!live}
          disabledReason={status === "connecting" ? "Available once the call connects." : undefined}
          leadingIcon={muted ? <MicOffIcon /> : <MicIcon />}
          className={cx("flex-1 sm:flex-none", muted && "bg-sunken text-fg")}
          onClick={call.toggleMute}
        >
          {muted ? "Unmute" : "Mute"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          pending={status === "ending"}
          leadingIcon={<PhoneOffIcon />}
          className="flex-1 sm:ml-auto sm:flex-none"
          onClick={call.end}
        >
          {status === "connecting" ? "Cancel" : "End call"}
        </Button>
      </div>
    </>
  );
}

function announcement(call: VoicePanelProps["call"]) {
  if (call.status === "connecting") return "Connecting the call";
  if (call.status === "live") return "Call connected";
  if (call.status === "ending") return "Ending the call";
  return call.error?.message ?? "";
}

export function VoicePanel({ call, className }: VoicePanelProps) {
  const open = isPanelStatus(call);
  const panelRef = useRef<HTMLElement>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const [ended, setEnded] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    setEnded(!open && call.status === "idle");
  }

  useEffect(() => {
    const panel = panelRef.current;
    if (open && panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {open ? announcement(call) : ended ? "Call ended" : ""}
      </p>
      <AnimatePresence
        onExitComplete={() => {
          const active = document.activeElement;
          if (!active || active === document.body || panelRef.current?.contains(active)) focusVoiceTrigger();
        }}
      >
        {open ? (
          <motion.section
            key="voice-panel"
            ref={panelRef}
            tabIndex={-1}
            aria-label="Voice call"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: transitions.enter }}
            exit={{ opacity: 0, y: 8, transition: transitions.exit }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && call.status === "error") call.cancel();
            }}
            className={cx(
              "fixed inset-x-0 bottom-0 z-40 rounded-t-xl bg-surface px-(--gutter) pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg outline-none",
              "md:inset-x-auto md:right-(--gutter) md:bottom-28 md:w-80 md:rounded-xl md:p-4 md:shadow-md",
              className
            )}
          >
            <PanelBody call={call} />
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
