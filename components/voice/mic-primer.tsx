"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { VoiceCall } from "@/hooks/use-voice-call";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { AlertIcon, MicIcon, XIcon } from "@/components/ui/icons";
import { focusVoiceTrigger } from "@/components/voice/voice-button";

export type MicPrimerProps = {
  call: Pick<VoiceCall, "status" | "error" | "confirmPrimer" | "cancel">;
};

const BLOCKED_STEPS = [
  "Select the site settings icon at the left of the address bar.",
  "Set Microphone to Allow.",
  "Come back here and select Try again."
];

export function MicPrimer({ call }: MicPrimerProps) {
  const { status, error, confirmPrimer, cancel } = call;
  const micError = status === "error" && error && error.kind !== "failed" ? error : null;
  const open = status === "priming" || status === "requesting" || micError !== null;
  const requesting = status === "requesting";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby="mic-primer-description"
          onCloseAutoFocus={(event) => {
            // There is no Dialog.Trigger, so return focus ourselves. When the call panel opened, it already took focus.
            event.preventDefault();
            const active = document.activeElement;
            if (!active || active === document.body) focusVoiceTrigger();
          }}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2*var(--gutter))] max-w-100 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-6 shadow-lg outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <div className="flex items-start justify-between gap-4">
            <span
              aria-hidden="true"
              className={
                micError
                  ? "flex size-10 items-center justify-center rounded-lg bg-sunken text-danger"
                  : "flex size-10 items-center justify-center rounded-lg bg-sunken text-fg"
              }
            >
              {micError ? <AlertIcon size={20} /> : <MicIcon size={20} />}
            </span>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={<XIcon />} size="sm" className="-mt-1 -mr-1" tooltipSide="left" />
            </Dialog.Close>
          </div>

          {micError ? (
            <>
              <Dialog.Title className="mt-4 text-17 font-medium text-fg">
                {micError.kind === "permission_denied" ? "Microphone is blocked" : "Microphone unavailable"}
              </Dialog.Title>
              <Dialog.Description id="mic-primer-description" className="mt-1.5 text-14 text-fg-muted">
                {micError.message}
              </Dialog.Description>
              {micError.kind === "permission_denied" ? (
                <>
                  <ol className="mt-4 flex flex-col gap-2 text-14 text-fg">
                    {BLOCKED_STEPS.map((step, index) => (
                      <li key={step} className="flex gap-3">
                        <span className="w-4 shrink-0 font-mono text-12 leading-5 text-fg-subtle tabular-nums">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-13 text-fg-subtle">
                    On iPhone or iPad, tap aA in the address bar, then Website Settings › Microphone › Allow.
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Dialog.Title className="mt-4 text-17 font-medium text-fg">Talk by voice</Dialog.Title>
              <Dialog.Description id="mic-primer-description" className="mt-1.5 text-14 text-fg-muted">
                Shubham&apos;s AI representative talks with you over your microphone, like a phone call. Your
                browser will ask for permission next.
              </Dialog.Description>
              <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-13 text-fg-muted">
                <li>
                  Your voice streams to Vapi, the voice provider, so it can understand and reply. The transcript
                  appears in this chat.
                </li>
                <li>You can mute or end the call at any time.</li>
              </ul>
            </>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="ghost">{micError ? "Close" : "Not now"}</Button>
            </Dialog.Close>
            <Button variant="primary" pending={requesting} onClick={confirmPrimer} autoFocus>
              {micError ? "Try again" : "Continue"}
            </Button>
          </div>
          <p aria-live="polite" className="sr-only">
            {requesting ? "Waiting for microphone permission" : ""}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
