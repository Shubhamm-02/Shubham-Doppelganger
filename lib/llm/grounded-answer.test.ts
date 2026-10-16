import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievedChunk } from "@/lib/retrieval/types";

const { create, groqCreate, providerNames } = vi.hoisted(() => ({
  create: vi.fn(),
  groqCreate: vi.fn(),
  providerNames: { current: ["openai"] as Array<"openai" | "groq"> }
}));

vi.mock("@/lib/llm/client", async (importOriginal) => ({
  reasoningParams: (await importOriginal<typeof import("@/lib/llm/client")>()).reasoningParams,
  chatProviders: () =>
    providerNames.current.map((name) => ({
      name,
      client: { chat: { completions: { create: name === "openai" ? create : groqCreate } } },
      chat:
        name === "openai"
          ? { id: "test-chat-model", reasoningEffort: null }
          : { id: "openai/gpt-oss-120b", reasoningEffort: "low" },
      router: { id: "unused", reasoningEffort: null }
    }))
}));

import { isModelRefusal, REFUSAL, streamGroundedAnswer } from "@/lib/llm/grounded-answer";

const documents: RetrievedChunk[] = [
  {
    documentId: 7,
    kind: "project-note",
    path: "data/project-notes/comment-ai.md",
    title: "Comment AI",
    section: "Anti-Spam Guardrails",
    chunkIndex: 4,
    url: null,
    content: "Comments are rate limited and deduplicated.",
    score: 0.8
  }
];

function streamOf(tokens: string[], signal?: AbortSignal | null) {
  return (async function* () {
    for (const token of tokens) {
      if (signal?.aborted) throw new Error("Request was aborted.");
      yield { choices: [{ delta: { content: token } }] };
    }
  })();
}

function sentPrompt() {
  const [body] = create.mock.calls[0];
  return body.messages[1].content as string;
}

beforeEach(() => {
  create.mockReset();
  groqCreate.mockReset();
  providerNames.current = ["openai"];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("streamGroundedAnswer", () => {
  it("streams tokens and returns the trimmed answer", async () => {
    create.mockImplementation(async (_body, options) => streamOf([" Rate", " limits", " "], options.signal));
    const tokens: string[] = [];

    const answer = await streamGroundedAnswer({
      question: "What guardrails?",
      documents,
      style: "chat",
      onToken: (token) => {
        tokens.push(token);
      }
    });

    expect(answer).toBe("Rate limits");
    expect(tokens).toEqual([" Rate", " limits", " "]);
    const [body] = create.mock.calls[0];
    expect(body).toMatchObject({ model: "test-chat-model", temperature: 0.2, stream: true });
    expect(sentPrompt()).toContain("Keep the answer under 180 words");
    expect(sentPrompt()).toContain("Path: data/project-notes/comment-ai.md");
  });

  it("uses the spoken instructions for voice without file paths", async () => {
    create.mockImplementation(async () => streamOf(["Yes."]));

    await streamGroundedAnswer({ question: "Q", documents, style: "voice", onToken: () => {} });

    expect(sentPrompt()).toContain("under 45 words");
    expect(sentPrompt()).toContain("Verified context:");
    expect(sentPrompt()).not.toContain("Path:");
    expect(create.mock.calls[0][0].temperature).toBe(0.15);
  });

  it("includes only the last three turns of history", async () => {
    create.mockImplementation(async () => streamOf(["ok"]));
    const history = [1, 2, 3, 4].map((turn) => ({
      user: `question ${turn}`,
      assistant: turn === 4 ? null : `answer ${turn}`
    }));

    await streamGroundedAnswer({ question: "Q", documents, style: "chat", history, onToken: () => {} });

    const prompt = sentPrompt();
    expect(prompt).not.toContain("question 1");
    expect(prompt).toContain("Visitor: question 2\nWizard: answer 2");
    expect(prompt).toContain("Visitor: question 4\n");
    expect(prompt.indexOf("Recent conversation")).toBeLessThan(prompt.indexOf("Question: Q"));
  });

  it("returns the refusal when the model produces no text", async () => {
    create.mockImplementation(async () => streamOf([]));

    const answer = await streamGroundedAnswer({ question: "Q", documents, style: "chat", onToken: () => {} });

    expect(answer).toBe(REFUSAL);
    expect(isModelRefusal(` ${REFUSAL.toUpperCase()} `)).toBe(true);
  });

  it("stops emitting and returns the partial answer when aborted", async () => {
    const controller = new AbortController();
    create.mockImplementation(async (_body, options) =>
      streamOf(["One", " two", " three", " four"], options.signal)
    );
    const tokens: string[] = [];

    const answer = await streamGroundedAnswer({
      question: "Q",
      documents,
      style: "chat",
      signal: controller.signal,
      onToken: (token) => {
        tokens.push(token);
        if (tokens.length === 2) controller.abort();
      }
    });

    expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
    expect(tokens).toEqual(["One", " two"]);
    expect(answer).toBe("One two");
  });

  it("rethrows failures that are not aborts", async () => {
    create.mockRejectedValue(new Error("upstream down"));

    await expect(
      streamGroundedAnswer({ question: "Q", documents, style: "chat", onToken: () => {} })
    ).rejects.toThrow("upstream down");
  });

  it("answers with Groq when OpenAI fails before streaming", async () => {
    providerNames.current = ["openai", "groq"];
    create.mockRejectedValue(new Error("401 Incorrect API key"));
    groqCreate.mockImplementation(async () => streamOf(["From", " Groq"]));
    const tokens: string[] = [];

    const answer = await streamGroundedAnswer({
      question: "Q",
      documents,
      style: "chat",
      onToken: (token) => {
        tokens.push(token);
      }
    });

    expect(answer).toBe("From Groq");
    expect(tokens).toEqual(["From", " Groq"]);
    expect(groqCreate.mock.calls[0][0]).toMatchObject({
      model: "openai/gpt-oss-120b",
      reasoning_effort: "low"
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty("reasoning_effort");
  });

  it("uses Groq alone when OpenAI is not configured", async () => {
    providerNames.current = ["groq"];
    groqCreate.mockImplementation(async () => streamOf(["Only Groq"]));

    const answer = await streamGroundedAnswer({ question: "Q", documents, style: "voice", onToken: () => {} });

    expect(answer).toBe("Only Groq");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not switch providers once tokens have been emitted", async () => {
    providerNames.current = ["openai", "groq"];
    create.mockImplementation(async () =>
      (async function* () {
        yield { choices: [{ delta: { content: "Half" } }] };
        throw new Error("connection reset");
      })()
    );

    await expect(
      streamGroundedAnswer({ question: "Q", documents, style: "chat", onToken: () => {} })
    ).rejects.toThrow("connection reset");
    expect(groqCreate).not.toHaveBeenCalled();
  });

  it("does not switch providers after an abort", async () => {
    providerNames.current = ["openai", "groq"];
    const controller = new AbortController();
    create.mockImplementation(async () => {
      controller.abort();
      throw new Error("Request was aborted.");
    });

    const answer = await streamGroundedAnswer({
      question: "Q",
      documents,
      style: "chat",
      signal: controller.signal,
      onToken: () => {}
    });

    expect(answer).toBe("");
    expect(groqCreate).not.toHaveBeenCalled();
  });
});
