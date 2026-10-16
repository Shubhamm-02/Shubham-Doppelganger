"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

export type VoiceStatus = "idle" | "priming" | "requesting" | "connecting" | "live" | "ending" | "error";
export type VoiceErrorKind = "permission_denied" | "unavailable" | "failed";
export type VoiceError = { kind: VoiceErrorKind; message: string };
export type VoiceTranscriptEntry = { role: "user" | "assistant"; text: string; final: boolean };
export type VoiceSpeaker = "assistant" | "user" | null;

export type VoiceCall = {
  configured: boolean;
  status: VoiceStatus;
  error: VoiceError | null;
  speaker: VoiceSpeaker;
  muted: boolean;
  startedAt: number | null;
  subscribeVolume(listener: (level: number) => void): () => void;
  prewarm(): void;
  begin(): void;
  confirmPrimer(): void;
  cancel(): void;
  toggleMute(): void;
  end(): void;
};

const ERRORS: Record<"denied" | "noMic" | "busyMic" | "unsupported" | "connect", VoiceError> = {
  denied: {
    kind: "permission_denied",
    message: "Your browser is blocking the microphone for this page."
  },
  noMic: { kind: "unavailable", message: "No microphone found. Connect one and try again." },
  busyMic: {
    kind: "unavailable",
    message: "Your microphone is being used by another app. Close it and try again."
  },
  unsupported: {
    kind: "unavailable",
    message: "This browser can't share a microphone with this page. Try a recent Chrome, Safari, or Firefox."
  },
  connect: { kind: "failed", message: "The voice service didn't respond. You can keep chatting here or try again." }
};

type VapiConstructor = typeof Vapi;

let sdk: Promise<VapiConstructor> | null = null;

function loadVapi() {
  sdk ??= import("@vapi-ai/web").then(
    (module) => module.default,
    (error: unknown) => {
      sdk = null;
      throw error;
    }
  );
  return sdk;
}

async function microphonePermission(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

function mediaError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return ERRORS.denied;
  if (name === "NotFoundError" || name === "OverconstrainedError") return ERRORS.noMic;
  if (name === "NotReadableError" || name === "AbortError") return ERRORS.busyMic;
  return ERRORS.connect;
}

type TranscriptMessage = {
  type: "transcript";
  role: "user" | "assistant";
  transcriptType: "partial" | "final";
  transcript: string;
};

type SpeechUpdateMessage = { type: "speech-update"; role: "user" | "assistant"; status: "started" | "stopped" };

function isTranscript(message: unknown): message is TranscriptMessage {
  const candidate = message as Partial<TranscriptMessage> | null;
  return (
    candidate?.type === "transcript" &&
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.transcript === "string"
  );
}

function isSpeechUpdate(message: unknown): message is SpeechUpdateMessage {
  const candidate = message as Partial<SpeechUpdateMessage> | null;
  return candidate?.type === "speech-update" && (candidate.role === "user" || candidate.role === "assistant");
}

export function useVoiceCall({ onTranscript }: { onTranscript(entry: VoiceTranscriptEntry): void }): VoiceCall {
  const configured = Boolean(PUBLIC_KEY && ASSISTANT_ID);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<VoiceError | null>(null);
  const [speaker, setSpeaker] = useState<VoiceSpeaker>(null);
  const [muted, setMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const attemptRef = useRef(0);
  const statusRef = useRef<VoiceStatus>("idle");
  const volumeListeners = useRef(new Set<(level: number) => void>());
  const transcriptRef = useRef(onTranscript);

  useEffect(() => {
    transcriptRef.current = onTranscript;
  }, [onTranscript]);

  const transition = useCallback((next: VoiceStatus, nextError: VoiceError | null = null) => {
    statusRef.current = next;
    setStatus(next);
    setError(nextError);
    if (next !== "live" && next !== "ending") {
      setSpeaker(null);
      setMuted(false);
      setStartedAt(null);
    }
  }, []);

  const teardown = useCallback(() => {
    const vapi = vapiRef.current;
    vapiRef.current = null;
    if (!vapi) return;
    vapi.removeAllListeners();
    void vapi.stop().catch(() => undefined);
  }, []);

  const fail = useCallback(
    (attempt: number, nextError: VoiceError) => {
      if (attempt !== attemptRef.current) return;
      teardown();
      transition("error", nextError);
    },
    [teardown, transition]
  );

  const connect = useCallback(
    async (attempt: number, prompting: boolean) => {
      if (!PUBLIC_KEY || !ASSISTANT_ID) return;
      transition(prompting ? "requesting" : "connecting");

      if (!navigator.mediaDevices?.getUserMedia) {
        fail(attempt, ERRORS.unsupported);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (mediaFailure) {
        fail(attempt, mediaError(mediaFailure));
        return;
      }
      if (attempt !== attemptRef.current) return;
      if (prompting) transition("connecting");

      let vapi: Vapi;
      try {
        const VapiClient = await loadVapi();
        if (attempt !== attemptRef.current) return;
        vapi = new VapiClient(PUBLIC_KEY);
      } catch {
        fail(attempt, ERRORS.connect);
        return;
      }
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        if (attempt !== attemptRef.current || statusRef.current !== "connecting") return;
        transition("live");
        setStartedAt(Date.now());
      });
      vapi.on("call-end", () => {
        if (attempt !== attemptRef.current) return;
        const wasLive = statusRef.current === "live" || statusRef.current === "ending";
        vapiRef.current = null;
        vapi.removeAllListeners();
        if (wasLive) transition("idle");
        else if (statusRef.current === "connecting") transition("error", ERRORS.connect);
      });
      vapi.on("call-start-failed", () => fail(attempt, ERRORS.connect));
      vapi.on("speech-start", () => setSpeaker("assistant"));
      vapi.on("speech-end", () => setSpeaker((current) => (current === "assistant" ? null : current)));
      vapi.on("volume-level", (level) => {
        volumeListeners.current.forEach((listener) => listener(level));
      });
      vapi.on("message", (message: unknown) => {
        if (isTranscript(message)) {
          const text = message.transcript.trim();
          if (text) transcriptRef.current({ role: message.role, text, final: message.transcriptType === "final" });
          return;
        }
        if (isSpeechUpdate(message)) {
          setSpeaker((current) => {
            if (message.status === "started") return message.role;
            return current === message.role ? null : current;
          });
        }
      });

      try {
        const call = await vapi.start(ASSISTANT_ID);
        if (attempt !== attemptRef.current) void vapi.stop().catch(() => undefined);
        else if (!call) fail(attempt, ERRORS.connect);
      } catch {
        fail(attempt, ERRORS.connect);
      }
    },
    [fail, transition]
  );

  const prewarm = useCallback(() => {
    if (configured) void loadVapi().catch(() => undefined);
  }, [configured]);

  const confirmPrimer = useCallback(() => {
    if (!configured) return;
    const current = statusRef.current;
    if (current !== "priming" && current !== "error" && current !== "idle") return;
    prewarm();
    attemptRef.current += 1;
    void connect(attemptRef.current, current === "priming" || (current === "error" && error?.kind !== "failed"));
  }, [configured, connect, prewarm, error]);

  const begin = useCallback(() => {
    const current = statusRef.current;
    if (!configured || (current !== "idle" && current !== "error")) return;
    const attempt = ++attemptRef.current;
    prewarm();
    void microphonePermission().then((permission) => {
      if (attempt !== attemptRef.current) return;
      if (permission === "granted") void connect(attempt, false);
      else if (permission === "denied") transition("error", ERRORS.denied);
      else transition("priming");
    });
  }, [configured, connect, prewarm, transition]);

  const cancel = useCallback(() => {
    attemptRef.current += 1;
    teardown();
    transition("idle");
  }, [teardown, transition]);

  const end = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi || statusRef.current !== "live") {
      cancel();
      return;
    }
    const attempt = attemptRef.current;
    transition("ending");
    void vapi
      .stop()
      .catch(() => undefined)
      .finally(() => {
        if (attempt !== attemptRef.current || statusRef.current !== "ending") return;
        vapi.removeAllListeners();
        vapiRef.current = null;
        transition("idle");
      });
  }, [cancel, transition]);

  const toggleMute = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi || statusRef.current !== "live") return;
    vapi.setMuted(!vapi.isMuted());
    setMuted(vapi.isMuted());
  }, []);

  const subscribeVolume = useCallback((listener: (level: number) => void) => {
    const listeners = volumeListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    function hangUp() {
      if (statusRef.current === "idle") return;
      attemptRef.current += 1;
      teardown();
      transition("idle");
    }
    window.addEventListener("pagehide", hangUp);
    return () => {
      window.removeEventListener("pagehide", hangUp);
      attemptRef.current += 1;
      teardown();
    };
  }, [teardown, transition]);

  return useMemo(
    () => ({
      configured,
      status,
      error,
      speaker,
      muted,
      startedAt,
      subscribeVolume,
      prewarm,
      begin,
      confirmPrimer,
      cancel,
      toggleMute,
      end
    }),
    [configured, status, error, speaker, muted, startedAt, subscribeVolume, prewarm, begin, confirmPrimer, cancel, toggleMute, end]
  );
}
