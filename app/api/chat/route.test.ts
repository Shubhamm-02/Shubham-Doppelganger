import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { PreparedChatTurn } from "@/lib/chat/handle-message";
import type { ChatDone } from "@/lib/chat/types";

const mocks = vi.hoisted(() => ({ startChatTurn: vi.fn(), runChatTurn: vi.fn() }));

vi.mock("@/lib/chat/handle-message", () => mocks);

import { POST } from "@/app/api/chat/route";

const DONE: ChatDone = {
  turnId: 1,
  sessionId: 2,
  answer: "Hi there",
  intent: "profile",
  grounded: true,
  sources: [],
  scheduling: null
};

function chatRequest() {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-id": "bom1::abc" },
    body: JSON.stringify({ message: "Hi" })
  });
}

let info: MockInstance<typeof console.info>;

function loggedOutcome() {
  return JSON.parse(String(info.mock.calls[0][0])).outcome;
}

beforeEach(() => {
  mocks.startChatTurn.mockReset().mockResolvedValue({ message: "Hi" } as PreparedChatTurn);
  mocks.runChatTurn.mockReset();
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/chat", () => {
  it("collects the turn into a JSON ChatDone with the request id", async () => {
    mocks.runChatTurn.mockResolvedValue(DONE);
    const request = chatRequest();

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("bom1::abc");
    expect(await response.json()).toEqual(DONE);
    expect(mocks.runChatTurn.mock.calls[0][2].signal).toBe(request.signal);
    expect(loggedOutcome()).toBe("ok");
  });

  it("returns a rejection from startChatTurn as is", async () => {
    const rejection = Response.json({ error: { code: "not_found" } }, { status: 404 });
    mocks.startChatTurn.mockResolvedValue(rejection);

    expect(await POST(chatRequest())).toBe(rejection);
    expect(mocks.runChatTurn).not.toHaveBeenCalled();
  });

  it("answers 499 with an empty body when the client went away", async () => {
    mocks.runChatTurn.mockResolvedValue(null);

    const response = await POST(chatRequest());

    expect(response.status).toBe(499);
    expect(await response.text()).toBe("");
    expect(response.headers.get("x-request-id")).toBe("bom1::abc");
    expect(loggedOutcome()).toBe("stopped");
  });

  it("answers 500 with the internal error copy when the turn fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runChatTurn.mockRejectedValue(new Error("model went away"));

    const response = await POST(chatRequest());

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("bom1::abc");
    expect(await response.json()).toEqual({
      error: {
        code: "internal",
        message: "I hit an error while answering. Please try again in a moment."
      }
    });
    expect(loggedOutcome()).toBe("error");
  });
});
