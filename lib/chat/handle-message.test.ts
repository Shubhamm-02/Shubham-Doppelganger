import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingConfirmation, OfferedSlot, Source } from "@/lib/chat/types";
import type { ProfileAnswer } from "@/lib/profile/answer";

const mocks = vi.hoisted(() => ({
  getVisitor: vi.fn(),
  limitChatRequest: vi.fn(),
  limitBookingAttempt: vi.fn(),
  getChatStore: vi.fn(),
  streamProfileAnswer: vi.fn(),
  findSlots: vi.fn(),
  createBooking: vi.fn()
}));

vi.mock("@/lib/visitor", () => ({ getVisitor: mocks.getVisitor }));
vi.mock("@/lib/rate-limit", () => ({
  limitChatRequest: mocks.limitChatRequest,
  limitBookingAttempt: mocks.limitBookingAttempt
}));
vi.mock("@/lib/store", () => ({ getChatStore: mocks.getChatStore }));
vi.mock("@/lib/profile/answer", () => ({ streamProfileAnswer: mocks.streamProfileAnswer }));
vi.mock("@/lib/calendar/slots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/slots")>()),
  findSlots: mocks.findSlots
}));
vi.mock("@/lib/calendar/booking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/booking")>()),
  createBooking: mocks.createBooking
}));

import { slotIdFor } from "@/lib/calendar/slots";
import {
  prepareChatTurn,
  runChatTurn,
  startChatTurn,
  type ChatSink,
  type PreparedChatTurn
} from "@/lib/chat/handle-message";
import type { ChatRequest } from "@/lib/chat/schema";
import { createRequestLogger, type RequestLogger } from "@/lib/logger";
import { createMemoryStore } from "@/lib/store/memory";
import type { ChatStore, TurnRecord } from "@/lib/store/types";

const ALICE = "visitor-alice";
const ALICE_IDENTITY = { ip: "203.0.113.7", visitorId: "visitor-alice" };
const BOB = "visitor-bob";
// Friday, Oct 16 2026, 12:00 IST.
const NOW = new Date("2026-10-16T06:30:00.000Z");
const TOMORROW = "2026-10-17";

function slot(start: string, label: string): OfferedSlot {
  return { id: slotIdFor(start), start, end: null, label };
}

const SATURDAY_SLOTS = [
  slot("2026-10-17T04:30:00.000Z", "10:00 AM"),
  slot("2026-10-17T05:00:00.000Z", "10:30 AM"),
  slot("2026-10-17T09:30:00.000Z", "3:00 PM")
];

const SOURCE: Source = {
  id: "data/project-notes/comment-ai.md#2",
  path: "data/project-notes/comment-ai.md",
  title: "Comment AI",
  section: "Overview",
  snippet: "CommentAI drafts replies to social posts.",
  url: null
};

function chatRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
    body: JSON.stringify(body)
  });
}

function testLogger(): RequestLogger {
  return createRequestLogger("test", new Request("http://localhost/api/chat"));
}

async function errorBody(result: PreparedChatTurn | Response) {
  if (!(result instanceof Response)) throw new Error("Expected an error response.");
  return { status: result.status, body: await result.json() };
}

async function startTurn(body: unknown) {
  const turn = await startChatTurn(chatRequest(body), testLogger());
  if (turn instanceof Response) {
    throw new Error(`Expected a chat turn, got HTTP ${turn.status}.`);
  }
  return turn;
}

function recordingSink() {
  const events: Array<[string, unknown]> = [];
  const sink: ChatSink = {
    meta: (sessionId) => events.push(["meta", sessionId]),
    status: (stage) => events.push(["status", stage]),
    token: (token) => events.push(["token", token])
  };
  return { events, sink };
}

async function prepare(body: ChatRequest) {
  return prepareChatTurn({ identity: ALICE_IDENTITY, body });
}

async function run(turn: PreparedChatTurn, signal = new AbortController().signal) {
  const { events, sink } = recordingSink();
  const done = await runChatTurn(turn, sink, { signal, logger: testLogger() });
  return { done, events };
}

async function send(body: ChatRequest, signal = new AbortController().signal) {
  return run(await prepare(body), signal);
}

function profileAnswer(answer: string, overrides: Partial<ProfileAnswer> = {}): ProfileAnswer {
  return {
    answer,
    sources: [SOURCE],
    grounded: true,
    retrievalMode: "local-keyword",
    documentIds: [11, 12],
    ...overrides
  };
}

function answerWith(tokens: string[]) {
  mocks.streamProfileAnswer.mockImplementation(
    async (_question: string, options: { onToken: (token: string) => void }) => {
      tokens.forEach((token) => options.onToken(token));
      return profileAnswer(tokens.join(""));
    }
  );
}

function confirmation(start: string, name: string, email: string): BookingConfirmation {
  return {
    uid: "booking-1",
    start,
    end: new Date(Date.parse(start) + 15 * 60_000).toISOString(),
    timeZone: "Asia/Kolkata",
    attendeeName: name,
    attendeeEmail: email,
    meetingUrl: "https://cal.com/video/abc"
  };
}

async function savedTurns(store: ChatStore, sessionId: number): Promise<TurnRecord[]> {
  const page = await store.listTurns(ALICE, sessionId, { limit: 50 });
  return page?.turns ?? [];
}

async function savedScheduling(sessionId: number) {
  return (await store.getSession(ALICE, sessionId))?.scheduling;
}

async function readyToConfirm() {
  const first = await send({ message: "Book a call" });
  const sessionId = first.done!.sessionId!;
  for (const message of ["tomorrow", "2", "Jane Doe, jane@example.com"]) {
    await send({ message, sessionId });
  }
  return sessionId;
}

const BUSY_REPLY =
  "I'm still working on your previous booking request in this chat. Give it a moment, then check the latest reply.";

let store: ChatStore;

beforeEach(() => {
  store = createMemoryStore();
  mocks.getChatStore.mockReset().mockReturnValue(store);
  mocks.getVisitor.mockReset().mockResolvedValue({ id: ALICE, isNew: false });
  mocks.limitChatRequest.mockReset().mockResolvedValue({ ok: true });
  mocks.limitBookingAttempt.mockReset().mockResolvedValue({ ok: true });
  mocks.streamProfileAnswer.mockReset();
  mocks.findSlots
    .mockReset()
    .mockImplementation(async (dateKey: string) => (dateKey === TOMORROW ? SATURDAY_SLOTS : []));
  mocks.createBooking
    .mockReset()
    .mockImplementation(async ({ start, name, email }) => confirmation(start, name, email));
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("CAL_API_KEY", "cal-test-key");
  vi.stubEnv("CAL_EVENT_TYPE_ID", "123");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startChatTurn", () => {
  it("rejects a body that is not sent as JSON, so cross-site pages need a preflight", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8", "x-vercel-id": "bom1::abc" },
      body: JSON.stringify({ message: "Hi" })
    });

    const response = await startChatTurn(request, createRequestLogger("chat", request));
    const result = await errorBody(response);

    expect(result.status).toBe(415);
    expect(result.body.error.code).toBe("invalid_request");
    expect((response as Response).headers.get("x-request-id")).toBe("bom1::abc");
    expect(mocks.getVisitor).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with a fixed message", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    });

    expect(await errorBody(await startChatTurn(request, testLogger()))).toEqual({
      status: 400,
      body: { error: { code: "invalid_request", message: "Request body must be JSON." } }
    });
  });

  it("names the field when sessionId or replaceTurnId is invalid", async () => {
    const badSession = await errorBody(
      await startChatTurn(chatRequest({ message: "Hi", sessionId: "3" }), testLogger())
    );
    const badReplace = await errorBody(
      await startChatTurn(chatRequest({ message: "Hi", replaceTurnId: 0 }), testLogger())
    );

    expect(badSession.body.error.message).toBe("sessionId must be a positive integer.");
    expect(badReplace.body.error.message).toBe("replaceTurnId must be a positive integer.");
  });

  it("rejects an over-long message before identifying the visitor", async () => {
    const result = await errorBody(
      await startChatTurn(chatRequest({ message: "x".repeat(2001) }), testLogger())
    );

    expect(result).toEqual({
      status: 400,
      body: {
        error: { code: "invalid_request", message: "Message must be 2000 characters or fewer." }
      }
    });
    expect(mocks.getVisitor).not.toHaveBeenCalled();
  });

  it("validates slot picker actions", async () => {
    const badDay = await errorBody(
      await startChatTurn(
        chatRequest({ message: "Check", action: { type: "check_day", dateKey: "17/10/2026" } }),
        testLogger()
      )
    );
    const badType = await errorBody(
      await startChatTurn(
        chatRequest({ message: "Go", action: { type: "reschedule" } }),
        testLogger()
      )
    );
    const longName = await errorBody(
      await startChatTurn(
        chatRequest({
          message: "Book",
          action: { type: "book", slotId: "s1", name: "x".repeat(101), email: "a@b.co" }
        }),
        testLogger()
      )
    );

    expect(badDay.body.error.message).toBe("action.dateKey must be a date in YYYY-MM-DD format.");
    expect(badType.body.error.message).toBe("action.type must be check_day or book.");
    expect(longName.body.error.message).toBe("action.name must be 100 characters or fewer.");
  });

  it.each(["2026-13-45", "2026-02-31"])("rejects the impossible date %s", async (dateKey) => {
    const result = await errorBody(
      await startChatTurn(
        chatRequest({ message: "Check", action: { type: "check_day", dateKey } }),
        testLogger()
      )
    );

    expect(result).toEqual({
      status: 400,
      body: {
        error: {
          code: "invalid_request",
          message: "action.dateKey must be a date in YYYY-MM-DD format."
        }
      }
    });
  });

  it("rejects a regenerate request that carries a slot picker action", async () => {
    const result = await errorBody(
      await startChatTurn(
        chatRequest({
          message: "Check",
          sessionId: 1,
          replaceTurnId: 2,
          action: { type: "check_day", dateKey: TOMORROW }
        }),
        testLogger()
      )
    );

    expect(result.status).toBe(400);
    expect(result.body.error.message).toBe("replaceTurnId cannot be combined with action.");
  });

  it("returns 503 when the visitor cookie cannot be issued", async () => {
    mocks.getVisitor.mockRejectedValue(new Error("missing secret"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await errorBody(await startChatTurn(chatRequest({ message: "Hi" }), testLogger()));

    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("unavailable");
    expect(mocks.limitChatRequest).not.toHaveBeenCalled();
  });

  it("rate limits by visitor and client IP with a Retry-After header", async () => {
    mocks.limitChatRequest.mockResolvedValue({ ok: false, retryAfter: 1 });

    const response = await startChatTurn(chatRequest({ message: "Hi" }), testLogger());
    const result = await errorBody(response);

    expect(mocks.limitChatRequest).toHaveBeenCalledWith({ ip: "203.0.113.7", visitorId: ALICE });
    expect(result.status).toBe(429);
    expect((response as Response).headers.get("Retry-After")).toBe("1");
    expect(result.body.error).toEqual({
      code: "rate_limited",
      message: "You're sending messages faster than I can answer. Try again in 1 second.",
      retryAfter: 1
    });
  });

  it("returns 404 for a session owned by another visitor", async () => {
    const bobSession = await store.createSession(BOB, "Bob's chat");

    const result = await errorBody(
      await startChatTurn(chatRequest({ message: "Hi", sessionId: bobSession.id }), testLogger())
    );

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("not_found");
  });

  it("returns 404 when replaceTurnId is not the session's latest turn", async () => {
    const session = await store.createSession(ALICE, "Chat");
    const first = await store.appendTurn(session.id, {
      userMessage: "First",
      assistantMessage: "One",
      grounded: true,
      retrievedDocumentIds: [],
      latencyMs: 5
    });
    await store.appendTurn(session.id, {
      userMessage: "Second",
      assistantMessage: "Two",
      grounded: true,
      retrievedDocumentIds: [],
      latencyMs: 5
    });

    const stale = await errorBody(
      await startChatTurn(
        chatRequest({ message: "First", sessionId: session.id, replaceTurnId: first.id }),
        testLogger()
      )
    );
    const sessionless = await errorBody(
      await startChatTurn(chatRequest({ message: "First", replaceTurnId: first.id }), testLogger())
    );

    expect(stale.status).toBe(404);
    expect(stale.body.error.code).toBe("not_found");
    expect(sessionless.status).toBe(404);
    expect(await store.listSessions(ALICE, 10)).toHaveLength(1);
  });

  it("refuses to regenerate a booking reply", async () => {
    const first = await send({ message: "Book a call" });

    const result = await errorBody(
      await startChatTurn(
        chatRequest({
          message: "Book a call",
          sessionId: first.done!.sessionId,
          replaceTurnId: first.done!.turnId
        }),
        testLogger()
      )
    );

    expect(result).toEqual({
      status: 404,
      body: {
        error: {
          code: "not_found",
          message: "Booking replies can't be regenerated. Send a new message instead."
        }
      }
    });
  });

  it("creates a session titled from the first message", async () => {
    const turn = await startTurn({ message: "What projects has he built?" });

    expect(turn.session?.isNew).toBe(true);
    expect(await store.listSessions(ALICE, 10)).toEqual([
      expect.objectContaining({ title: "Projects overview" })
    ]);
  });

  it("answers without a session when no store is configured", async () => {
    mocks.getChatStore.mockReturnValue(null);

    const turn = await startTurn({ message: "Hi", sessionId: 42, replaceTurnId: 7 });

    expect(turn.session).toBeNull();
    expect(turn.replaceTurnId).toBeNull();
  });

  it("answers without history when the store fails", async () => {
    vi.spyOn(store, "createSession").mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const turn = await startTurn({ message: "Hi" });

    expect(turn.session).toBeNull();
  });
});

describe("runChatTurn: profile answers", () => {
  it("streams meta, a searching status and tokens, then saves the turn with its sources and retitles the new chat", async () => {
    answerWith(["Shubham built ", "CommentAI."]);

    const { done, events } = await send({ message: "hello" });

    expect(events).toEqual([
      ["meta", done?.sessionId],
      ["status", "searching"],
      ["token", "Shubham built "],
      ["token", "CommentAI."]
    ]);
    expect(done).toEqual({
      turnId: expect.any(Number),
      sessionId: expect.any(Number),
      answer: "Shubham built CommentAI.",
      intent: "profile",
      grounded: true,
      sources: [SOURCE],
      scheduling: null
    });
    const [saved] = await savedTurns(store, done!.sessionId!);
    expect(saved).toEqual(
      expect.objectContaining({
        id: done!.turnId,
        assistantMessage: "Shubham built CommentAI.",
        grounded: true,
        metadata: { intent: "profile", sources: [SOURCE] }
      })
    );
    expect((await store.getSession(ALICE, done!.sessionId!))?.title).toBe("CommentAI");
  });

  it("passes recent turns as history for follow-up questions", async () => {
    const session = await store.createSession(ALICE, "Projects");
    for (let index = 1; index <= 7; index += 1) {
      await store.appendTurn(session.id, {
        userMessage: `Question ${index}`,
        assistantMessage: `Answer ${index}`,
        grounded: true,
        retrievedDocumentIds: [],
        latencyMs: 5
      });
    }
    answerWith(["It uses FastAPI."]);

    await send({ message: "What stack does it use?", sessionId: session.id });

    const [question, options] = mocks.streamProfileAnswer.mock.calls[0];
    expect(question).toBe("What stack does it use?");
    expect(options.style).toBe("chat");
    expect(options.history).toHaveLength(6);
    expect(options.history.at(-1)).toEqual({ user: "Question 7", assistant: "Answer 7" });
  });

  it("saves a stopped turn with the partial answer when the client aborts", async () => {
    const controller = new AbortController();
    mocks.streamProfileAnswer.mockImplementation(
      async (_question: string, options: { onToken: (token: string) => void }) => {
        options.onToken("Shubham built ");
        controller.abort();
        return profileAnswer("Shubham built");
      }
    );

    const { done, events } = await send({ message: "What did he build?" }, controller.signal);

    expect(done).toBeNull();
    expect(events.at(-1)).toEqual(["token", "Shubham built "]);
    const [session] = await store.listSessions(ALICE, 10);
    const [saved] = await savedTurns(store, session.id);
    expect(saved.assistantMessage).toBe("Shubham built");
    expect(saved.metadata).toEqual({ intent: "profile", sources: [SOURCE], stopped: true });
  });

  it("replaces the latest turn in place and leaves it out of the history", async () => {
    const session = await store.createSession(ALICE, "Projects");
    await store.appendTurn(session.id, {
      userMessage: "Earlier",
      assistantMessage: "Earlier answer",
      grounded: true,
      retrievedDocumentIds: [],
      latencyMs: 5
    });
    const latest = await store.appendTurn(session.id, {
      userMessage: "Tell me about CommentAI",
      assistantMessage: "A weak answer",
      grounded: true,
      retrievedDocumentIds: [],
      latencyMs: 5
    });
    answerWith(["A better answer."]);

    const { done } = await send({
      message: "Tell me about CommentAI",
      sessionId: session.id,
      replaceTurnId: latest.id
    });

    expect(done?.turnId).toBe(latest.id);
    expect(mocks.streamProfileAnswer.mock.calls[0][1].history).toEqual([
      { user: "Earlier", assistant: "Earlier answer" }
    ]);
    const turns = await savedTurns(store, session.id);
    expect(turns.map((turn) => [turn.id, turn.assistantMessage])).toEqual([
      [expect.any(Number), "Earlier answer"],
      [latest.id, "A better answer."]
    ]);
    expect((await store.getSession(ALICE, session.id))?.title).toBe("Projects");
  });

  it("keeps a regenerated answer a profile answer and leaves the booking alone", async () => {
    const first = await send({ message: "Can we schedule a call tomorrow?" });
    const sessionId = first.done!.sessionId!;
    answerWith(["He used FastAPI."]);
    const profile = await send({ message: "What tech stack did CommentAI use?", sessionId });
    expect(profile.done?.intent).toBe("profile");
    answerWith(["Mostly FastAPI."]);

    const regenerated = await send({
      message: "Book a call tomorrow",
      sessionId,
      replaceTurnId: profile.done!.turnId!
    });

    expect(regenerated.done).toMatchObject({
      turnId: profile.done!.turnId,
      intent: "profile",
      answer: "Mostly FastAPI.",
      scheduling: null
    });
    expect(mocks.findSlots).toHaveBeenCalledTimes(1);
    expect(await savedScheduling(sessionId)).toMatchObject({
      step: "awaiting_slot",
      dateKey: TOMORROW
    });
  });

  it("reports a regenerated answer as unsaved when a newer turn arrived first", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    answerWith(["A weak answer"]);
    const first = await send({ message: "Tell me about CommentAI" });
    vi.spyOn(store, "replaceTurn").mockResolvedValue(null);
    answerWith(["A better answer."]);

    const { done } = await send({
      message: "Tell me about CommentAI",
      sessionId: first.done!.sessionId!,
      replaceTurnId: first.done!.turnId!
    });

    expect(done?.answer).toBe("A better answer.");
    expect(done?.turnId).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "A newer turn arrived before the regenerated answer was saved."
    );
  });

  it("still reports the saved turn when retitling the new chat fails", async () => {
    answerWith(["Shubham built CommentAI."]);
    vi.spyOn(store, "renameSession").mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { done } = await send({ message: "hello" });

    const [saved] = await savedTurns(store, done!.sessionId!);
    expect(done?.turnId).toBe(saved.id);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("still answers when the turn cannot be saved", async () => {
    answerWith(["Python and TypeScript."]);
    vi.spyOn(store, "appendTurn").mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { done } = await send({ message: "What are his skills?" });

    expect(done?.answer).toBe("Python and TypeScript.");
    expect(done?.turnId).toBeNull();
  });
});

describe("runChatTurn: scheduling", () => {
  it("books a call over several messages using the session's saved state", async () => {
    const first = await send({ message: "Book a call" });
    const sessionId = first.done!.sessionId!;
    const next = (message: string) => send({ message, sessionId });

    expect(first.events).toEqual([["meta", sessionId], ["token", first.done!.answer]]);
    expect(first.done).toEqual(
      expect.objectContaining({
        intent: "scheduling",
        grounded: false,
        sources: [],
        scheduling: expect.objectContaining({ step: "awaiting_day" })
      })
    );

    const day = await next("tomorrow");
    expect(day.events.slice(0, 2)).toEqual([
      ["meta", sessionId],
      ["status", "checking_calendar"]
    ]);
    expect(mocks.findSlots).toHaveBeenCalledWith(TOMORROW, { preference: undefined });
    expect(day.done?.scheduling).toEqual(
      expect.objectContaining({ step: "awaiting_slot", dateKey: TOMORROW, slots: SATURDAY_SLOTS })
    );
    expect(day.done?.answer).toContain("2. 10:30 AM");

    const picked = await next("2");
    expect(picked.done?.scheduling).toEqual(
      expect.objectContaining({ step: "awaiting_details", selectedSlotId: SATURDAY_SLOTS[1].id })
    );

    const details = await next("Jane Doe, jane@example.com");
    expect(details.done?.scheduling?.step).toBe("awaiting_confirmation");
    expect(details.done?.answer).toContain("Jane Doe (jane@example.com)");

    const booked = await next("yes");
    expect(booked.events).toContainEqual(["status", "booking"]);
    expect(mocks.createBooking).toHaveBeenCalledWith({
      start: SATURDAY_SLOTS[1].start,
      name: "Jane Doe",
      email: "jane@example.com"
    });
    expect(booked.done?.scheduling).toEqual(
      expect.objectContaining({
        step: "booked",
        booking: confirmation(SATURDAY_SLOTS[1].start, "Jane Doe", "jane@example.com")
      })
    );

    const turns = await savedTurns(store, sessionId);
    expect(turns).toHaveLength(5);
    expect(turns.at(-1)?.metadata).toEqual({
      intent: "scheduling",
      scheduling: booked.done?.scheduling
    });
    expect((await store.getSession(ALICE, sessionId))?.scheduling?.step).toBe("booked");
  });

  it("offers a day's slots and books straight from slot picker actions", async () => {
    const checked = await send({
      message: "Check Sat, Oct 17",
      action: { type: "check_day", dateKey: TOMORROW }
    });
    const sessionId = checked.done!.sessionId!;

    expect(checked.events).toContainEqual(["status", "checking_calendar"]);
    expect(checked.done?.scheduling?.slots).toEqual(SATURDAY_SLOTS);

    const foreign = await send({
      message: "Book 9:00 PM",
      sessionId,
      action: { type: "book", slotId: "s-foreign", name: "Jane Doe", email: "jane@example.com" }
    });
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(foreign.done?.scheduling?.booking).toBeNull();

    const booked = await send({
      message: "Book 3:00 PM",
      sessionId,
      action: {
        type: "book",
        slotId: SATURDAY_SLOTS[2].id,
        name: "Jane Doe",
        email: "jane@example.com"
      }
    });
    expect(booked.events).toContainEqual(["status", "booking"]);
    expect(booked.done?.scheduling?.step).toBe("booked");
    expect(booked.done?.scheduling?.booking?.start).toBe(SATURDAY_SLOTS[2].start);
  });

  it("cancels a booking in progress", async () => {
    const first = await send({ message: "Can we schedule a call tomorrow?" });
    const sessionId = first.done!.sessionId!;
    expect(first.done?.scheduling?.step).toBe("awaiting_slot");

    const cancelled = await send({ message: "never mind", sessionId });

    expect(cancelled.done?.intent).toBe("scheduling");
    expect(cancelled.done?.scheduling?.step).toBe("idle");
    expect((await store.getSession(ALICE, sessionId))?.scheduling?.step).toBe("idle");
  });

  it("lets only one of two simultaneous confirmations reach Cal.com", async () => {
    const sessionId = await readyToConfirm();
    const first = await prepare({ message: "yes", sessionId });
    const second = await prepare({ message: "yes", sessionId });

    const results = await Promise.all([run(first), run(second)]);

    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    const answers = results.map(({ done }) => done?.answer);
    expect(answers).toContain(BUSY_REPLY);
    expect(answers.filter((answer) => answer?.startsWith("You're booked"))).toHaveLength(1);
    expect(await savedScheduling(sessionId)).toMatchObject({
      step: "booked",
      lockedAt: null,
      booking: { uid: "booking-1" }
    });
  });

  it("asks a retry sent while the booking is in flight to wait", async () => {
    const sessionId = await readyToConfirm();
    let finishBooking = () => {};
    mocks.createBooking.mockImplementationOnce(
      ({ start, name, email }) =>
        new Promise((resolve) => {
          finishBooking = () => resolve(confirmation(start, name, email));
        })
    );

    const firstRun = send({ message: "yes", sessionId });
    await vi.waitFor(() => expect(mocks.createBooking).toHaveBeenCalled());
    const retry = await send({ message: "yes", sessionId });
    finishBooking();
    const first = await firstRun;

    expect(retry.done).toMatchObject({ answer: BUSY_REPLY, scheduling: null });
    expect(first.done?.scheduling?.step).toBe("booked");
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    expect((await savedScheduling(sessionId))?.step).toBe("booked");
    expect((await savedTurns(store, sessionId)).map((turn) => turn.assistantMessage)).toContain(
      BUSY_REPLY
    );
  });

  it("checks the booking limit before reaching Cal.com", async () => {
    const sessionId = await readyToConfirm();
    mocks.limitBookingAttempt.mockResolvedValue({ ok: false, retryAfter: 3600 });

    const { done } = await send({ message: "yes", sessionId });

    expect(mocks.limitBookingAttempt).toHaveBeenCalledWith(ALICE_IDENTITY);
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(done?.answer).toMatch(/^You've reached today's limit for booking calls here\./);
    expect(done?.scheduling?.step).toBe("idle");
  });

  it("saves the full scheduling reply and state as stopped when the client aborts mid-lookup", async () => {
    const first = await send({ message: "Book a call" });
    const sessionId = first.done!.sessionId!;
    const controller = new AbortController();
    mocks.findSlots.mockImplementationOnce(async () => {
      controller.abort();
      return SATURDAY_SLOTS;
    });

    const { done } = await send({ message: "tomorrow", sessionId }, controller.signal);

    expect(done).toBeNull();
    const latest = (await savedTurns(store, sessionId)).at(-1);
    expect(latest?.assistantMessage).toMatch(/^Here's what's open on Sat, Oct 17 \(IST\):/);
    expect(latest?.metadata).toMatchObject({
      intent: "scheduling",
      stopped: true,
      scheduling: { step: "awaiting_slot", slots: SATURDAY_SLOTS }
    });
    expect(await savedScheduling(sessionId)).toMatchObject({
      step: "awaiting_slot",
      lockedAt: null
    });
  });

  it("does not reach Cal.com when the client stopped before the booking started", async () => {
    const sessionId = await readyToConfirm();
    const controller = new AbortController();
    controller.abort();

    const { done, events } = await send({ message: "yes", sessionId }, controller.signal);

    expect(done).toBeNull();
    expect(events).toEqual([["meta", sessionId]]);
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect((await savedTurns(store, sessionId)).at(-1)).toMatchObject({
      assistantMessage: "",
      metadata: { intent: "scheduling", stopped: true }
    });
    expect(await savedScheduling(sessionId)).toMatchObject({
      step: "awaiting_confirmation",
      lockedAt: null
    });
  });

  it("answers a profile question in the middle of a booking without losing its state", async () => {
    const first = await send({ message: "Book a call" });
    const sessionId = first.done!.sessionId!;
    await send({ message: "tomorrow", sessionId });
    answerWith(["He used FastAPI."]);

    const profile = await send({ message: "What tech stack did CommentAI use?", sessionId });

    expect(profile.done?.intent).toBe("profile");
    expect(profile.done?.scheduling).toBeNull();
    expect((await store.getSession(ALICE, sessionId))?.scheduling?.step).toBe("awaiting_slot");
  });
});
