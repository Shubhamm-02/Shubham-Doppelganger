import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLlmClassifier,
  fastPathRoute,
  routeMessage,
  type RouteInput
} from "@/lib/chat/router";
import type { SchedulingStep } from "@/lib/chat/types";

const { parse, hasOpenAIConfig } = vi.hoisted(() => ({
  parse: vi.fn(),
  hasOpenAIConfig: vi.fn(() => false)
}));

vi.mock("@/lib/llm/client", () => ({
  getOpenAIClient: () => ({ chat: { completions: { parse } } }),
  hasOpenAIConfig,
  routerModel: () => "router-test-model"
}));

const COMMENT_AI_HISTORY = [
  {
    user: "Tell me about CommentAI",
    assistant: "CommentAI is a Chrome extension that drafts LinkedIn comments with an LLM."
  }
];

function input(
  message: string,
  schedulingStep: SchedulingStep = "idle",
  history: RouteInput["history"] = []
): RouteInput {
  return { message, schedulingStep, history };
}

beforeEach(() => {
  parse.mockReset();
  hasOpenAIConfig.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("regression cases that are not scheduling", () => {
  const profileMessages = [
    "How does the OAuth callback work in his project?",
    "Can his app handle a webhook callback?",
    "Does Shubham meet the requirements for a backend role?",
    "He meets the requirements, right?",
    "What is his browser extension called?",
    "Is he good at meeting deadlines?",
    "What did Shubham build first?",
    "Which project did he build second?",
    "May I know his tech stack?",
    "What was his first internship?",
    "Is he available for full-time roles?",
    "Is he available next month for an internship?",
    "Good morning!",
    "Does his agent run on Python 3.12?",
    "Is his bot up 24/7?"
  ];

  it.each(profileMessages)("fast path never schedules %j", (message) => {
    const decision = fastPathRoute(input(message));
    expect(decision === null || decision.intent === "profile").toBe(true);
  });

  it.each(profileMessages)("routes %j to profile without the LLM", async (message) => {
    const decision = await routeMessage(input(message), { classify: null });
    expect(decision).toMatchObject({ intent: "profile", query: message });
    expect(decision.via).not.toBe("llm");
  });

  it.each([
    "How does the OAuth callback work in his project?",
    "He meets the requirements, right?",
    "What is his browser extension called?",
    "What did Shubham build first?",
    "Which project did he build second?",
    "May I know his tech stack?"
  ])("answers %j as a profile question on the fast path", (message) => {
    expect(fastPathRoute(input(message))).toEqual({
      intent: "profile",
      query: message,
      via: "fast-path"
    });
  });

  it("keeps a profile question asked mid-booking out of the scheduler", async () => {
    const message = "What did Shubham build first?";
    expect(fastPathRoute(input(message, "awaiting_slot"))?.intent).toBe("profile");
    expect((await routeMessage(input(message, "awaiting_day"), { classify: null })).intent).toBe("profile");
  });
});

describe("explicit scheduling requests", () => {
  it.each([
    "Can I book a call?",
    "I'd like to schedule an interview with Shubham",
    "Could we set up a meeting?",
    "Can we talk tomorrow?",
    "Is he available?",
    "Is he available tomorrow afternoon?",
    "Is Shubham free on Friday?",
    "What's his availability next week?",
    "I want a 15-minute call",
    "Let's book a quick chat",
    "When is he free?",
    "Is he available next week?",
    "Is Shubham free this week?",
    "Is he available sometime next week for a call?",
    "Can I get 15 minutes with him?",
    "Could I have a few minutes of his time?"
  ])("routes %j to scheduling on the fast path", async (message) => {
    const expected = { intent: "scheduling", query: message, via: "fast-path" };
    expect(fastPathRoute(input(message))).toEqual(expected);
    expect(await routeMessage(input(message), { classify: null })).toEqual(expected);
  });

  it("defers a bare day and time to the LLM and books it without one", async () => {
    expect(fastPathRoute(input("tomorrow at 3pm"))).toBeNull();
    expect(await routeMessage(input("tomorrow at 3pm"), { classify: null })).toEqual({
      intent: "scheduling",
      query: "tomorrow at 3pm",
      via: "fallback"
    });
  });

  it("starts a new booking after a finished one", () => {
    expect(fastPathRoute(input("Book another call", "booked", COMMENT_AI_HISTORY))?.intent).toBe(
      "scheduling"
    );
  });
});

describe("messages during an active booking", () => {
  it.each<[SchedulingStep, string]>([
    ["awaiting_day", "tomorrow"],
    ["awaiting_day", "Oct 17 please"],
    ["awaiting_day", "How about May 3 in the afternoon, if that suits him"],
    ["awaiting_day", "next Monday works"],
    ["awaiting_slot", "2"],
    ["awaiting_slot", "#2"],
    ["awaiting_slot", "option 3"],
    ["awaiting_slot", "second"],
    ["awaiting_slot", "the second one"],
    ["awaiting_slot", "I think the 3:30 one would be best for me"],
    ["awaiting_slot", "3.30pm"],
    ["awaiting_details", "Jane Doe"],
    ["awaiting_details", "Jane Doe, jane@acme.com"],
    ["awaiting_details", "it's rahul dot verma at gmail dot com if you need it"],
    ["awaiting_details", "Sure, my name is Rahul Verma and you can reach me there"],
    ["awaiting_confirmation", "yes"],
    ["awaiting_confirmation", "Yes please, go ahead and lock it in for me"],
    ["awaiting_confirmation", "no, make it 4pm instead"]
  ])("%s: %j continues the booking", async (step, message) => {
    expect(fastPathRoute(input(message, step, COMMENT_AI_HISTORY))).toEqual({
      intent: "scheduling",
      query: message,
      via: "fast-path"
    });
    expect((await routeMessage(input(message, step, COMMENT_AI_HISTORY), { classify: null })).intent).toBe(
      "scheduling"
    );
  });

  it.each(["cancel", "Never mind", "forget it, thanks", "I don't want to book anymore"])(
    "%j cancels the booking",
    async (message) => {
      const decision = { intent: "cancel_scheduling", query: message, via: "fast-path" };
      expect(fastPathRoute(input(message, "awaiting_slot"))).toEqual(decision);
      expect(await routeMessage(input(message, "awaiting_details"), { classify: null })).toEqual(decision);
    }
  );

  it("answers an unambiguous profile question without the LLM", () => {
    expect(fastPathRoute(input("What projects has he built?", "awaiting_slot", COMMENT_AI_HISTORY)))
      .toEqual({ intent: "profile", query: "What projects has he built?", via: "fast-path" });
  });

  it("defers a question that mixes booking details and profile topics", async () => {
    const message = "Tomorrow works, and what projects has he built?";
    expect(fastPathRoute(input(message, "awaiting_day"))).toBeNull();
    expect(await routeMessage(input(message, "awaiting_day"), { classify: null })).toEqual({
      intent: "scheduling",
      query: message,
      via: "fallback"
    });
  });

  it("treats a cancel phrase outside a booking as an ordinary message", () => {
    expect(fastPathRoute(input("never mind", "idle"))?.intent).toBe("profile");
  });
});

describe("follow-ups and the LLM classifier", () => {
  it("defers follow-ups with history to the LLM and uses its rewrite", async () => {
    const message = "What were the tradeoffs there?";
    const classify = vi.fn(async () => ({
      intent: "profile" as const,
      standaloneQuestion: "What were the tradeoffs in CommentAI?"
    }));

    expect(fastPathRoute(input(message, "idle", COMMENT_AI_HISTORY))).toBeNull();
    expect(await routeMessage(input(message, "idle", COMMENT_AI_HISTORY), { classify })).toEqual({
      intent: "profile",
      query: "What were the tradeoffs in CommentAI?",
      via: "llm"
    });
    expect(classify).toHaveBeenCalledWith(input(message, "idle", COMMENT_AI_HISTORY), undefined);
  });

  it("rewrites anaphoric profile questions asked mid-booking", async () => {
    const message = "Tell me more about that project";
    const classify = vi.fn(async () => ({
      intent: "profile" as const,
      standaloneQuestion: "Tell me more about CommentAI"
    }));

    expect(fastPathRoute(input(message, "awaiting_slot", COMMENT_AI_HISTORY))).toBeNull();
    expect(
      await routeMessage(input(message, "awaiting_slot", COMMENT_AI_HISTORY), { classify })
    ).toEqual({ intent: "profile", query: "Tell me more about CommentAI", via: "llm" });
  });

  it("keeps the visitor's own words as the query for scheduling", async () => {
    const message = "Is he good at meeting deadlines or should we meet first?";
    const classify = vi.fn(async () => ({
      intent: "scheduling" as const,
      standaloneQuestion: "Book a meeting with Shubham"
    }));

    expect(await routeMessage(input(message), { classify })).toEqual({
      intent: "scheduling",
      query: message,
      via: "llm"
    });
  });

  it("falls back to the message when the rewrite is blank", async () => {
    const message = "Why did he pick it?";
    const classify = async () => ({ intent: "profile" as const, standaloneQuestion: "  " });
    expect((await routeMessage(input(message, "idle", COMMENT_AI_HISTORY), { classify })).query).toBe(
      message
    );
  });

  it("skips the classifier when the fast path decides", async () => {
    const classify = vi.fn();
    await routeMessage(input("Can I book a call?"), { classify });
    expect(classify).not.toHaveBeenCalled();
  });

  it("falls back to heuristics when the classifier fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const classify = vi.fn(async () => {
      throw new Error("timeout");
    });

    expect(
      await routeMessage(input("Is he good at meeting deadlines?", "idle", COMMENT_AI_HISTORY), { classify })
    ).toEqual({ intent: "profile", query: "Is he good at meeting deadlines?", via: "fallback" });
    expect(
      await routeMessage(input("Rahul Verma, from Acme hiring team, for the role", "awaiting_details"), { classify })
    ).toMatchObject({ intent: "scheduling", via: "fallback" });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("passes the request's abort signal to the classifier and stays quiet when it aborts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const controller = new AbortController();
    const classify = vi.fn(async (_input: RouteInput, signal?: AbortSignal) => {
      controller.abort();
      signal?.throwIfAborted();
      return { intent: "profile" as const, standaloneQuestion: "" };
    });
    const message = "Why did he pick it?";

    const decision = await routeMessage(input(message, "idle", COMMENT_AI_HISTORY), {
      classify,
      signal: controller.signal
    });

    expect(classify.mock.calls[0][1]).toBe(controller.signal);
    expect(decision.via).toBe("fallback");
    expect(warn).not.toHaveBeenCalled();
  });

  it("is unavailable without OpenAI config", () => {
    expect(createLlmClassifier()).toBeNull();
  });

  it("asks the router model for a strict structured decision with context", async () => {
    hasOpenAIConfig.mockReturnValue(true);
    parse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: { intent: "profile", standaloneQuestion: "What were the tradeoffs in CommentAI?" }
          }
        }
      ]
    });

    const classify = createLlmClassifier();
    const controller = new AbortController();
    const history = [
      { user: "Hi", assistant: null },
      ...COMMENT_AI_HISTORY,
      { user: "Who used it?", assistant: "x".repeat(500) },
      { user: "Anything else?", assistant: "It also ships a popup UI." }
    ];
    const result = await classify?.(
      input("What were the tradeoffs there?", "awaiting_slot", history),
      controller.signal
    );

    expect(result).toEqual({
      intent: "profile",
      standaloneQuestion: "What were the tradeoffs in CommentAI?"
    });
    const [body, options] = parse.mock.calls[0];
    expect(body).toMatchObject({
      model: "router-test-model",
      temperature: 0,
      max_completion_tokens: 150,
      response_format: { type: "json_schema", json_schema: { name: "route", strict: true } }
    });
    expect(body.response_format.json_schema.schema).toMatchObject({
      type: "object",
      required: ["intent", "standaloneQuestion"],
      additionalProperties: false
    });
    expect(body.messages[1]).toEqual({ role: "user", content: "What were the tradeoffs there?" });

    const system: string = body.messages[0].content;
    expect(system).toContain("waiting for a pick");
    expect(system).not.toContain("Visitor: Hi");
    expect(system).toContain("Visitor: Tell me about CommentAI");
    expect(system).toContain(`Assistant: ${"x".repeat(300)}…`);
    expect(system).not.toContain("x".repeat(301));
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
    expect(options.maxRetries).toBe(0);
  });

  it("rejects a completion without a parsed decision", async () => {
    hasOpenAIConfig.mockReturnValue(true);
    parse.mockResolvedValue({ choices: [{ message: { parsed: null, refusal: "no" } }] });
    await expect(createLlmClassifier()?.(input("Why?"))).rejects.toThrow("no decision");
  });
});
