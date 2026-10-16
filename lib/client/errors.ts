import type { ApiErrorCode } from "@/lib/http";
import { formatWait } from "@/lib/client/format-time";
import type { ClientError, ClientErrorKind } from "@/lib/client/types";

export class ApiRequestError extends Error {
  readonly clientError: ClientError;

  constructor(clientError: ClientError) {
    super(clientError.message);
    this.name = "ApiRequestError";
    this.clientError = clientError;
  }
}

const COPY: Record<Exclude<ClientErrorKind, "rate_limited">, string> = {
  offline: "You're offline. Your message will be ready to send when you reconnect.",
  network: "Couldn't reach the server. Check your connection and try again.",
  not_found: "This chat no longer exists. Start a new one to keep going.",
  invalid: "That message couldn't be sent. Keep it under 2,000 characters and try again.",
  server: "Something went wrong on our end. Try again in a moment."
};

const UNAVAILABLE_COPY = "Chat is temporarily unavailable. Try again in a minute.";

export function rateLimitMessage(retryAfter?: number) {
  return retryAfter && retryAfter > 0
    ? `You're sending messages quickly. Try again in ${formatWait(retryAfter)}.`
    : "You're sending messages quickly. Try again in a moment.";
}

export function clientError(kind: ClientErrorKind, retryAfter?: number): ClientError {
  if (kind === "rate_limited") return { kind, message: rateLimitMessage(retryAfter), retryAfter };
  return { kind, message: COPY[kind] };
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function parseRetryAfter(value: unknown) {
  const seconds = typeof value === "string" ? Number(value) : value;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function fromStatus(status: number, retryAfter?: number): ClientError {
  if (status === 429) return clientError("rate_limited", retryAfter);
  if (status === 404) return clientError("not_found");
  if (status === 400 || status === 413 || status === 422) return clientError("invalid");
  if (status === 503) return { kind: "server", message: UNAVAILABLE_COPY };
  return clientError("server");
}

export function fromApiErrorCode(code: ApiErrorCode, retryAfter?: number): ClientError {
  switch (code) {
    case "rate_limited":
      return clientError("rate_limited", retryAfter);
    case "not_found":
      return clientError("not_found");
    case "invalid_request":
      return clientError("invalid");
    case "unavailable":
      return { kind: "server", message: UNAVAILABLE_COPY };
    default:
      return clientError("server");
  }
}

export function toClientError(input: unknown): ClientError {
  if (input instanceof ApiRequestError) return input.clientError;
  if (input instanceof Response) return fromStatus(input.status, parseRetryAfter(input.headers.get("Retry-After")));
  if (isOffline()) return clientError("offline");
  if (input instanceof TypeError) return clientError("network");
  return clientError("server");
}

export async function errorFromResponse(response: Response): Promise<ClientError> {
  const headerRetry = parseRetryAfter(response.headers.get("Retry-After"));
  try {
    const body = (await response.json()) as { error?: { code?: ApiErrorCode; retryAfter?: number } };
    const code = body.error?.code;
    const retryAfter = parseRetryAfter(body.error?.retryAfter) ?? headerRetry;
    if (code) return fromApiErrorCode(code, retryAfter);
    return fromStatus(response.status, retryAfter);
  } catch {
    return fromStatus(response.status, headerRetry);
  }
}
