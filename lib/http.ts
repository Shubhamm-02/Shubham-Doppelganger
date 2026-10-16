export type ApiErrorCode =
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "unauthorized"
  | "unavailable"
  | "internal";

type ApiError = {
  code: ApiErrorCode;
  message: string;
  retryAfter?: number;
};

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options: { retryAfter?: number } = {}
) {
  const headers = new Headers();
  const error: ApiError = { code, message };

  if (options.retryAfter !== undefined) {
    headers.set("Retry-After", String(options.retryAfter));
    error.retryAfter = options.retryAfter;
  }

  return Response.json({ error }, { status, headers });
}

export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function parsePositiveInt(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseOptionalPositiveInt(value: string | null) {
  return value === null ? undefined : parsePositiveInt(value);
}
