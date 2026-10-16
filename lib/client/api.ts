import { createSseParser } from "@/lib/chat/sse";
import type { ChatStreamEvent } from "@/lib/chat/types";
import { ApiRequestError, clientError, errorFromResponse, isAbortError, isOffline } from "@/lib/client/errors";
import type { ChatRequest, SessionSummary, TurnPage } from "@/lib/client/types";

const SESSION_LIMIT = 50;
const TURN_PAGE_SIZE = 30;

async function request(input: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(input, { credentials: "same-origin", ...init });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiRequestError(clientError(isOffline() ? "offline" : "network"));
  }
  if (!response.ok) throw new ApiRequestError(await errorFromResponse(response));
  return response;
}

function jsonInit(method: string, body: unknown, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

export async function fetchSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
  const response = await request(`/api/sessions?limit=${SESSION_LIMIT}`, { signal });
  const body = (await response.json()) as { sessions?: SessionSummary[] };
  return body.sessions ?? [];
}

export async function renameSession(id: number, title: string): Promise<SessionSummary> {
  const response = await request(`/api/sessions/${id}`, jsonInit("PATCH", { title }));
  const body = (await response.json()) as { session: SessionSummary };
  return body.session;
}

export async function deleteSession(id: number, options: { keepalive?: boolean } = {}): Promise<void> {
  await request(`/api/sessions/${id}`, { method: "DELETE", keepalive: options.keepalive });
}

export async function fetchTurns(
  sessionId: number,
  options: { before?: number | null; limit?: number; signal?: AbortSignal } = {}
): Promise<TurnPage> {
  const params = new URLSearchParams({
    sessionId: String(sessionId),
    limit: String(options.limit ?? TURN_PAGE_SIZE)
  });
  if (options.before) params.set("before", String(options.before));
  const response = await request(`/api/conversations?${params}`, { signal: options.signal });
  return (await response.json()) as TurnPage;
}

export async function streamChat(
  body: ChatRequest,
  options: { signal?: AbortSignal; onEvent: (event: ChatStreamEvent) => void }
): Promise<void> {
  const response = await request("/api/chat/stream", {
    ...jsonInit("POST", body),
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    signal: options.signal
  });
  if (!response.body) throw new ApiRequestError(clientError("server"));

  const parser = createSseParser(options.onEvent);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(value);
    }
    parser.flush();
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) throw error;
    throw new ApiRequestError(clientError(isOffline() ? "offline" : "network"));
  } finally {
    reader.releaseLock();
  }
}
