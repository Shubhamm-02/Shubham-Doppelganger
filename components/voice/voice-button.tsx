"use client";

import type { VoiceCall } from "@/hooks/use-voice-call";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MicIcon } from "@/components/ui/icons";

export type VoiceButtonProps = {
  call: Pick<VoiceCall, "configured" | "status" | "begin" | "prewarm">;
  appearance?: "icon" | "button";
  variant?: ButtonVariant;
  className?: string;
};

export function focusVoiceTrigger() {
  const triggers = document.querySelectorAll<HTMLElement>("[data-voice-trigger]");
  const visible = Array.from(triggers).find((trigger) => trigger.getClientRects().length > 0);
  visible?.focus({ preventScroll: true });
}

const NOT_CONFIGURED = "Voice isn't set up on this deployment.";
const IN_CALL = "You're already on a call.";

export function VoiceButton({ call, appearance = "icon", variant = "secondary", className }: VoiceButtonProps) {
  const { configured, status, begin, prewarm } = call;
  const connecting = status === "requesting" || status === "connecting";
  const inCall = status === "live" || status === "ending";
  const disabledReason = !configured ? NOT_CONFIGURED : inCall ? IN_CALL : undefined;
  const shared = {
    "data-voice-trigger": "",
    disabled: Boolean(disabledReason),
    disabledReason,
    pending: connecting,
    onPointerEnter: prewarm,
    onFocus: prewarm,
    onClick: begin,
    className
  };

  if (appearance === "icon") {
    return <IconButton {...shared} label="Talk by voice" icon={<MicIcon />} />;
  }

  return (
    <Button {...shared} variant={variant} leadingIcon={<MicIcon />}>
      Talk by voice
    </Button>
  );
}
