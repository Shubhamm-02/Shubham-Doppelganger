import { describe, expect, it } from "vitest";
import { ApiRequestError, clientError, errorFromResponse, isAbortError, toClientError } from "@/lib/client/errors";

function errorResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("errorFromResponse", () => {
  it("uses retryAfter for rate limits and never echoes server text", async () => {
    const response = errorResponse(429, { error: { code: "rate_limited", message: "raw server text", retryAfter: 12 } }, { "Retry-After": "12" });
    expect(await errorFromResponse(response)).toEqual({
      kind: "rate_limited",
      message: "You're sending messages quickly. Try again in 12s.",
      retryAfter: 12
    });
  });

  it("falls back to the Retry-After header and the status when the body is not JSON", async () => {
    const response = new Response("<html>", { status: 429, headers: { "Retry-After": "3" } });
    expect(await errorFromResponse(response)).toMatchObject({ kind: "rate_limited", retryAfter: 3 });
    expect(await errorFromResponse(new Response("", { status: 502 }))).toMatchObject({ kind: "server" });
  });

  it("maps API codes to client kinds", async () => {
    expect(await errorFromResponse(errorResponse(404, { error: { code: "not_found", message: "x" } }))).toMatchObject({ kind: "not_found" });
    expect(await errorFromResponse(errorResponse(400, { error: { code: "invalid_request", message: "x" } }))).toMatchObject({ kind: "invalid" });
    expect(await errorFromResponse(errorResponse(503, { error: { code: "unavailable", message: "x" } }))).toEqual({
      kind: "server",
      message: "Chat is temporarily unavailable. Try again in a minute."
    });
  });
});

describe("toClientError", () => {
  it("unwraps ApiRequestError and classifies fetch failures", () => {
    expect(toClientError(new ApiRequestError(clientError("not_found")))).toMatchObject({ kind: "not_found" });
    expect(toClientError(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network" });
    expect(toClientError(new Error("Vapi: ws closed 1006")).message).not.toContain("Vapi");
  });

  it("detects aborts", () => {
    expect(isAbortError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
  });
});
