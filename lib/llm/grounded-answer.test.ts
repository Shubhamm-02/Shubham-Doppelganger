import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RetrievedChunk } from "@/lib/retrieval/types";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/llm/client", () => ({
  chatModel: () => "test-chat-model",
  getOpenAIClient: () => ({ chat: { completions: { create } } })
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
});
