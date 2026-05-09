"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  grounded?: boolean;
  retrievalMode?: string;
};

type ConversationRow = {
  id: number;
  session_id?: number | null;
  user_message: string;
  assistant_message: string | null;
  grounded: boolean | null;
  latency_ms: number | null;
  created_at: string;
};

type SessionRow = {
  id: number;
  title: string;
  created_at: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hi, I am Shubham Shah's AI representative. Chat is now RAG-grounded over the resume and project notes. Ask about projects, skills, or say you want to book an interview."
  }
];

function formatCitationLabel(path: string) {
  if (path.endsWith("data/resume.md")) return "Resume";
  if (path.includes("data/project-notes/")) {
    const file = path.split("/").at(-1) ?? path;
    const base = file.replace(/\.md$/, "");
    return base
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return path;
}

const quickPrompts = [
  "Why are you a good fit for this role?",
  "What anti-spam guardrails are in CommentAI?",
  "How does the PDF Grounded Chatbot avoid hallucinations?",
  "Book a call"
];

function IconButton({
  label,
  onClick,
  children
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="rail-btn" type="button" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRailCollapsed, setIsRailCollapsed] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [voiceError, setVoiceError] = useState("");
  const [schedulingMode, setSchedulingMode] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);

  const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const vapiAssistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
  const isVoiceConfigured = Boolean(vapiPublicKey && vapiAssistantId);

  useEffect(() => {
    let cancelled = false;

    const stored =
      typeof window !== "undefined"
        ? Number(window.localStorage.getItem("va.activeSessionId") ?? "")
        : NaN;

    fetch("/api/sessions?limit=20")
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload?.sessions) ? payload.sessions : [];
        setSessions(rows);

        const nextSessionId =
          Number.isFinite(stored) && stored > 0 ? stored : rows?.[0]?.id ?? null;
        if (nextSessionId) setActiveSessionId(nextSessionId);
      })
      .catch(() => {
        if (cancelled) return;
        setSessions([]);
        if (Number.isFinite(stored) && stored > 0) setActiveSessionId(stored);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    window.localStorage.setItem("va.activeSessionId", String(activeSessionId));

    fetch(`/api/conversations?limit=60&channel=chat&sessionId=${activeSessionId}`)
      .then((res) => res.json())
      .then((payload) => {
        const rows: ConversationRow[] = Array.isArray(payload?.conversations)
          ? payload.conversations
          : [];

        const reconstructed: ChatMessage[] = [initialMessages[0]];
        rows
          .slice()
          .reverse()
          .forEach((row) => {
            reconstructed.push({
              id: `u-${row.id}`,
              role: "user",
              content: row.user_message
            });
            if (row.assistant_message) {
              reconstructed.push({
                id: `a-${row.id}`,
                role: "assistant",
                content: row.assistant_message,
                grounded: row.grounded ?? undefined
              });
            }
          });

        setMessages(reconstructed);
        const latestAssistant = reconstructed
          .slice()
          .reverse()
          .find((message) => message.role === "assistant")?.content;
        setSchedulingMode(
          Boolean(
            latestAssistant &&
              /i can book an interview|i can help schedule|i still need|available interview slots|reply with the slot|book it end-to-end|could not find an open slot/i.test(
                latestAssistant
              ) &&
              !/booked|confirmed for|calendar invite/i.test(latestAssistant)
          )
        );
      })
      .catch(() => {});
  }, [activeSessionId]);

  useEffect(() => {
    return () => {
      void vapiRef.current?.stop();
      vapiRef.current?.removeAllListeners();
      vapiRef.current = null;
    };
  }, []);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          sessionId: activeSessionId ?? undefined,
          schedulingMode,
          schedulingContext: schedulingMode
            ? messages
                .filter((item) => item.role === "user")
                .slice(-6)
                .map((item) => item.content)
                .join("\n")
            : undefined
        })
      });

      const payload = await response.json();
      if (payload?.sessionId && typeof payload.sessionId === "number") {
        setActiveSessionId(payload.sessionId);
      }
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.answer ?? "I could not produce an answer.",
        citations: payload.citations ?? [],
        grounded: payload.grounded ?? undefined,
        retrievalMode: payload.retrievalMode ?? undefined
      };

      setMessages((current) => [...current, assistantMessage]);
      setSchedulingMode(Boolean(payload?.schedulingActive));
      fetch("/api/sessions?limit=20")
        .then((res) => res.json())
        .then((data) => {
          setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
        })
        .catch(() => {});
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "I hit a local scaffold error while answering. The next step is to wire the API route and RAG service fully."
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function resetChat() {
    setMessages(initialMessages);
    setDraft("");
    setSchedulingMode(false);
    setActiveSessionId(null);
    window.localStorage.removeItem("va.activeSessionId");
  }

  async function deleteSession(sessionId: number, title: string) {
    const confirmed = window.confirm(`Delete "${title}"?`);
    if (!confirmed) return;

    await fetch(`/api/sessions?id=${sessionId}`, {
      method: "DELETE"
    });

    setSessions((current) => current.filter((session) => session.id !== sessionId));
    if (activeSessionId === sessionId) {
      resetChat();
    }
  }

  async function copyMessage(messageId: string, content: string) {
    await navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 1600);
  }

  function startPrompt(prompt: string) {
    setDraft(prompt);
    queueMicrotask(() => {
      const form = document.querySelector("form.composer") as HTMLFormElement | null;
      form?.requestSubmit();
    });
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    const form = document.querySelector("form.composer") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  async function toggleVoiceCall() {
    if (!isVoiceConfigured || !vapiPublicKey || !vapiAssistantId) {
      setVoiceStatus("error");
      setVoiceError(
        "Add NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID to .env.local."
      );
      return;
    }

    if (voiceStatus === "connected" || voiceStatus === "connecting") {
      await vapiRef.current?.stop();
      setVoiceStatus("idle");
      return;
    }

    try {
      setVoiceError("");
      setVoiceStatus("connecting");

      if (!vapiRef.current) {
        const { default: VapiClient } = await import("@vapi-ai/web");
        const client = new VapiClient(vapiPublicKey);

        client.on("call-start", () => setVoiceStatus("connected"));
        client.on("call-end", () => setVoiceStatus("idle"));
        client.on("call-start-failed", (event) => {
          setVoiceStatus("error");
          setVoiceError(event?.error ?? "Voice call failed to start.");
        });
        client.on("error", (error) => {
          setVoiceStatus("error");
          setVoiceError(error?.message ?? "Voice call failed.");
        });

        vapiRef.current = client;
      }

      await vapiRef.current.start(vapiAssistantId);
    } catch (error) {
      setVoiceStatus("error");
      setVoiceError(error instanceof Error ? error.message : "Voice call failed.");
    }
  }

  const hasUserMessages = messages.some((message) => message.role === "user");
  const sessionSummaries = useMemo(() => sessions.slice(0, 12), [sessions]);

  return (
    <main className="poe-shell">
      <aside className={`rail ${isRailCollapsed ? "rail-collapsed" : ""}`}>
        <div className="rail-top">
          <div className="rail-header">
            <IconButton
              label={isRailCollapsed ? "Open sidebar" : "Collapse sidebar"}
              onClick={() => setIsRailCollapsed((current) => !current)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5.75 3h12.5A2.75 2.75 0 0 1 21 5.75v12.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25V5.75A2.75 2.75 0 0 1 5.75 3ZM8 5v14h10.25c.41 0 .75-.34.75-.75V5.75a.75.75 0 0 0-.75-.75H8Zm-2.25 0a.75.75 0 0 0-.75.75v12.5c0 .41.34.75.75.75H6V5h-.25Z" />
              </svg>
            </IconButton>
            {!isRailCollapsed ? (
              <div className="rail-brand">
                <span>Shubham AI</span>
              </div>
            ) : null}
          </div>

          <IconButton label="New chat" onClick={resetChat}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1Z" />
            </svg>
          </IconButton>

          <div className="rail-divider" />

          {!isRailCollapsed ? (
            <div className="rail-recent" aria-label="Recent chats">
              <div className="rail-recent-title">Chats</div>
              <div className="rail-recent-list">
                {sessionSummaries.map((row) => (
                  <div
                    key={row.id}
                    className="rail-recent-item"
                    data-active={activeSessionId === row.id ? "true" : "false"}
                  >
                    <button
                      type="button"
                      className="rail-session-open"
                      title={row.title}
                      onClick={() => setActiveSessionId(row.id)}
                    >
                      <span className="rail-recent-dot" aria-hidden="true" />
                      <span className="rail-recent-text">{row.title}</span>
                    </button>
                    <button
                      type="button"
                      className="rail-session-delete"
                      aria-label={`Delete ${row.title}`}
                      onClick={() => deleteSession(row.id, row.title)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 3h6l1 2h4a1 1 0 1 1 0 2h-1.1l-.8 12.1A3.1 3.1 0 0 1 15 22H9a3.1 3.1 0 0 1-3.1-2.9L5.1 7H4a1 1 0 0 1 0-2h4l1-2Zm1.24 2h3.52l-.5-1h-2.52l-.5 1ZM7.11 7l.78 11.97A1.1 1.1 0 0 0 9 20h6c.58 0 1.06-.45 1.1-1.03L16.89 7H7.11ZM10 10a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1Zm4 0a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1Z" />
                      </svg>
                    </button>
                  </div>
                ))}
                {!sessionSummaries.length ? (
                  <div className="rail-recent-empty">No chats yet</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rail-footer">
          <div className="rail-avatar" aria-hidden="true">
            S
          </div>
        </div>
      </aside>

      <section className="stage" aria-label="Chat with AI representative">
        <header className="stage-header">
          <div className="stage-title">
            <span className="stage-dot" aria-hidden="true" />
            <div className="stage-title-text">
              <div className="stage-title-name">Shubham Shah</div>
              <div className="stage-title-sub">AI representative (RAG-grounded)</div>
            </div>
          </div>

          <div className="stage-actions">
            <button
              type="button"
              className="voice-call-button"
              data-status={voiceStatus}
              disabled={!isVoiceConfigured}
              onClick={toggleVoiceCall}
              title={
                isVoiceConfigured
                  ? voiceStatus === "connected" || voiceStatus === "connecting"
                    ? "End voice call"
                    : "Start voice call"
                  : "Add Vapi public key and assistant id"
              }
            >
              <span className="voice-call-dot" aria-hidden="true" />
              <span className="voice-call-label">
                {voiceStatus === "connecting"
                  ? "Connecting"
                  : voiceStatus === "connected"
                    ? "End call"
                    : "Voice"}
              </span>
            </button>
            <button type="button" className="stage-action" onClick={resetChat}>
              New chat
            </button>
          </div>
        </header>
        {voiceStatus === "error" && voiceError ? (
          <div className="voice-error" role="status">
            {voiceError}
          </div>
        ) : null}

        {!hasUserMessages ? (
          <div className="start-screen">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2c5.52 0 10 3.9 10 8.7 0 2.85-1.61 5.39-4.14 6.97-.61 2.35-2.73 4.33-5.86 4.33-1.38 0-2.66-.36-3.78-1.01l-3.01.8.9-2.71C4.17 17.58 2 14.38 2 10.7 2 5.9 6.48 2 12 2Zm-2.05 8.1a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Zm4.1 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z" />
                </svg>
              </div>
              <h1>Shubham Shah</h1>
              <p>RAG-grounded interview representative</p>
            </div>

            <div className="prompt-row" role="group" aria-label="Quick prompts">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="prompt-pill"
                  onClick={() => startPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={`thread ${hasUserMessages ? "thread-active" : ""}`}>
          {messages.map((message) => (
            <article className={`bubble ${message.role}`} key={message.id}>
              <div className="bubble-meta">
                <span className="bubble-role">{message.role}</span>
                {message.role === "assistant" && typeof message.grounded === "boolean" ? (
                  <span className={`chip ${message.grounded ? "chip-ok" : "chip-warn"}`}>
                    {message.grounded ? "grounded" : "unverified"}
                  </span>
                ) : null}
                {message.role === "assistant" && message.retrievalMode ? (
                  <span className="chip chip-muted">{message.retrievalMode}</span>
                ) : null}
                <button
                  type="button"
                  className="copy-message"
                  data-copied={copiedMessageId === message.id ? "true" : "false"}
                  aria-label={
                    copiedMessageId === message.id ? "Message copied" : "Copy message"
                  }
                  onClick={() => copyMessage(message.id, message.content)}
                >
                  {copiedMessageId === message.id ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9.55 16.2 5.8 12.45a1 1 0 1 0-1.42 1.42l4.46 4.46a1 1 0 0 0 1.42 0L20.03 8.56a1 1 0 1 0-1.42-1.42L9.55 16.2Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1V7Zm2 1h3a3 3 0 0 1 3 3v3h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v1Zm-3 2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H7Z" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="bubble-body">{message.content}</div>
              {message.citations?.length ? (
                <div className="bubble-citations">
                  Sources:{" "}
                  {Array.from(new Set(message.citations))
                    .map((citation) => formatCitationLabel(citation))
                    .join(", ")}
                </div>
              ) : null}
            </article>
          ))}
          {isSending ? (
            <article className="bubble assistant" aria-live="polite">
              <div className="bubble-meta">
                <span className="bubble-role">assistant</span>
              </div>
              <div className="bubble-body">Thinking...</div>
            </article>
          ) : null}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <div className="composer-inner">
            <div className="composer-leading" aria-hidden="true" />

            <textarea
              aria-label="Message"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Ask anything"
              value={draft}
            />

            <div className="composer-trailing">
              <button
                className="composer-send"
                disabled={isSending || !draft.trim()}
                type="submit"
                aria-label="Send message"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11.293 4.293a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 .25.414l.015.061q.027.112.028.232-.001.125-.031.24l-.013.051a1 1 0 0 1-.165.317 1 1 0 0 1-.084.099l-7 7a1 1 0 1 1-1.414-1.414L16.586 13H5a1 1 0 0 1 0-2h11.586l-5.293-5.293a1 1 0 0 1 0-1.414" />
                </svg>
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
