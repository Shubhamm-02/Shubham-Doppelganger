const DEFAULT_BASE_URL = "https://api.cal.com/v2";
const DEFAULT_BOOKINGS_API_VERSION = "2026-02-25";
const DEFAULT_SLOTS_API_VERSION = "2024-09-04";
const REQUEST_TIMEOUT_MS = 10_000;

type CalEndpoint = "slots" | "bookings";

export class CalApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`Cal.com request failed (${status}): ${detail}`);
    this.name = "CalApiError";
    this.status = status;
    this.detail = detail;
  }
}

function baseUrl() {
  return process.env.CAL_API_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

function apiVersion(endpoint: CalEndpoint) {
  return endpoint === "slots"
    ? process.env.CAL_SLOTS_API_VERSION?.trim() || DEFAULT_SLOTS_API_VERSION
    : process.env.CAL_API_VERSION?.trim() || DEFAULT_BOOKINGS_API_VERSION;
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function describeError(payload: unknown) {
  if (typeof payload === "string") return payload.slice(0, 500) || "empty response";

  const record = asRecord(payload);
  if (!record) return "unknown error";

  const error = asRecord(record.error);
  const details = error?.details;
  const message =
    record.message ?? error?.message ?? asRecord(details)?.message ?? record.error;
  const detailText =
    details && typeof details !== "string"
      ? JSON.stringify(details).slice(0, 500)
      : details;

  if (typeof message === "string") {
    return detailText && detailText !== message ? `${message}: ${detailText}` : message;
  }
  return JSON.stringify(payload).slice(0, 500);
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function calFetch<T>(
  path: string,
  init: { endpoint: CalEndpoint; method?: "GET" | "POST"; body?: string }
): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.CAL_API_KEY?.trim()}`,
      "cal-api-version": apiVersion(init.endpoint),
      ...(init.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new CalApiError(response.status, describeError(payload));
  }
  if (typeof payload === "string") {
    throw new CalApiError(response.status, "Cal.com returned a non-JSON response.");
  }

  return payload as T;
}
