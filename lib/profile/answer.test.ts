import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroundedAnswerInput } from "@/lib/llm/grounded-answer";
import type { RetrievedChunk } from "@/lib/retrieval/types";

const mocks = vi.hoisted(() => ({
  hasOpenAIConfig: vi.fn(),
  hasChatProvider: vi.fn(),
  hasSupabaseConfig: vi.fn(),
  retrieveVector: vi.fn(),
  streamGroundedAnswer: vi.fn()
}));

vi.mock("@/lib/llm/client", () => ({
  hasOpenAIConfig: mocks.hasOpenAIConfig,
  hasChatProvider: mocks.hasChatProvider
}));
vi.mock("@/lib/supabase", () => ({ hasSupabaseConfig: mocks.hasSupabaseConfig }));
vi.mock("@/lib/retrieval/vector", () => ({ retrieveVector: mocks.retrieveVector }));
vi.mock("@/lib/llm/grounded-answer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/grounded-answer")>()),
  streamGroundedAnswer: mocks.streamGroundedAnswer
}));

import { REFUSAL } from "@/lib/llm/grounded-answer";
import { WIZARD_PROJECT_PATH } from "@/lib/profile/local-search";
import {
  answerProfileQuestion,
  answerVoiceProfileQuestion,
  streamProfileAnswer,
  type ProfileAnswerOptions
} from "@/lib/profile/answer";

const vectorChunk: RetrievedChunk = {
  documentId: 42,
  kind: "project-note",
  path: "data/project-notes/comment-ai.md",
  title: "Comment AI",
  section: "Anti-Spam Guardrails",
  chunkIndex: 5,
  url: null,
  content: "Section: Anti-Spam Guardrails\n\nComments are rate limited.",
  score: 0.71
};

function configure({
  openAI,
  groq = false,
  supabase
}: {
  openAI: boolean;
  groq?: boolean;
  supabase: boolean;
}) {
  mocks.hasOpenAIConfig.mockReturnValue(openAI);
  mocks.hasChatProvider.mockReturnValue(openAI || groq);
  mocks.hasSupabaseConfig.mockReturnValue(supabase);
}

function llmAnswers(tokens: string[]) {
  mocks.streamGroundedAnswer.mockImplementation(async (input: GroundedAnswerInput) => {
    let answer = "";
    for (const token of tokens) {
      if (input.signal?.aborted) break;
      answer += token;
      await input.onToken(token);
    }
    return answer.trim();
  });
}

function llmDocumentPaths() {
  const [input] = mocks.streamGroundedAnswer.mock.calls[0] as [GroundedAnswerInput];
  return input.documents.map((document) => document.path);
}

async function collect(question: string, options: ProfileAnswerOptions) {
  const tokens: string[] = [];
  const result = await streamProfileAnswer(question, {
    ...options,
    onToken: (token) => {
      tokens.push(token);
    }
  });
  return { result, tokens };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("streamProfileAnswer", () => {
  it("answers from local search without any LLM when OpenAI is not configured", async () => {
    configure({ openAI: false, supabase: false });

    const { result, tokens } = await collect("What anti-spam guardrails are in CommentAI?", {
      style: "chat"
    });

    expect(mocks.streamGroundedAnswer).not.toHaveBeenCalled();
    expect(tokens).toEqual([result.answer]);
    expect(result.answer).toMatch(/^Based on Shubham's verified profile/);
    expect(result.answer).not.toMatch(/:\n#{1,6} /);
    expect(result).toMatchObject({ grounded: true, retrievalMode: "local-keyword", documentIds: [] });
    expect(result.sources[0].path).toBe("data/project-notes/comment-ai.md");
  });

  it("generates with the fallback model over local search when only Groq is configured", async () => {
    configure({ openAI: false, groq: true, supabase: true });
    llmAnswers(["Guardrails", " cap comment volume."]);

    const { result } = await collect("What anti-spam guardrails are in CommentAI?", {
      style: "chat"
    });

    expect(mocks.retrieveVector).not.toHaveBeenCalled();
    expect(mocks.streamGroundedAnswer).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      answer: "Guardrails cap comment volume.",
      grounded: true,
      retrievalMode: "local-keyword"
    });
  });

  it("uses the vector RPC for chat when OpenAI and Supabase are configured", async () => {
    configure({ openAI: true, supabase: true });
    mocks.retrieveVector.mockResolvedValue([vectorChunk]);
    llmAnswers(["It rate", " limits comments."]);
    const history = [{ user: "Tell me about CommentAI", assistant: "It is a local agent." }];

    const { result, tokens } = await collect("What guardrails does it have?", {
      style: "chat",
      history
    });

    expect(mocks.retrieveVector).toHaveBeenCalledWith("What guardrails does it have?");
    expect(mocks.streamGroundedAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ documents: [vectorChunk], style: "chat", history })
    );
    expect(tokens).toEqual(["It rate", " limits comments."]);
    expect(result).toMatchObject({
      answer: "It rate limits comments.",
      grounded: true,
      retrievalMode: "vector",
      documentIds: [42]
    });
    expect(result.sources.map((source) => source.id)).toEqual(["data/project-notes/comment-ai.md#5"]);
  });

  it("keeps voice on local search to avoid the embedding round-trip", async () => {
    configure({ openAI: true, supabase: true });
    llmAnswers(["Rate limits."]);

    const result = await answerVoiceProfileQuestion("What anti-spam guardrails are in CommentAI?");

    expect(mocks.retrieveVector).not.toHaveBeenCalled();
    expect(mocks.streamGroundedAnswer).toHaveBeenCalledWith(expect.objectContaining({ style: "voice" }));
    expect(result).toMatchObject({ answer: "Rate limits.", retrievalMode: "local-keyword" });
  });

  it("grounds Wizard questions on the Wizard note only", async () => {
    configure({ openAI: true, supabase: true });
    llmAnswers(["Through Vapi."]);

    await answerProfileQuestion("How does the voice agent work?");

    expect(mocks.retrieveVector).not.toHaveBeenCalled();
    expect(new Set(llmDocumentPaths())).toEqual(new Set([WIZARD_PROJECT_PATH]));
  });

  it("grounds overview questions on the fixed profile sections", async () => {
    configure({ openAI: true, supabase: true });
    llmAnswers(["He is a CS student."]);

    await answerProfileQuestion("Tell me about Shubham");

    expect(mocks.retrieveVector).not.toHaveBeenCalled();
    expect(new Set(llmDocumentPaths())).toEqual(
      new Set(["data/resume.md", "data/personal-background.md"])
    );
  });

  it("answers project-list questions with the deterministic digest in one token", async () => {
    configure({ openAI: true, supabase: true });

    const { result, tokens } = await collect("What projects has Shubham built?", { style: "chat" });

    expect(mocks.retrieveVector).not.toHaveBeenCalled();
    expect(mocks.streamGroundedAnswer).not.toHaveBeenCalled();
    expect(tokens).toEqual([result.answer]);
    expect(result.answer).toMatch(/^Shubham's strongest project examples include:/);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.grounded).toBe(true);
  });

  it("falls back to local search when the vector RPC fails", async () => {
    configure({ openAI: true, supabase: true });
    mocks.retrieveVector.mockRejectedValue(new Error("rpc down"));
    llmAnswers(["FAISS retrieves sections."]);

    const result = await answerProfileQuestion("What role does FAISS play in the CCPA project?");

    expect(llmDocumentPaths()[0]).toBe("data/project-notes/ccpa-compliance-system.md");
    expect(result.retrievalMode).toBe("local-keyword");
  });

  it("refuses when vector search finds nothing", async () => {
    configure({ openAI: true, supabase: true });
    mocks.retrieveVector.mockResolvedValue([]);

    const { result, tokens } = await collect("What is his salary?", { style: "chat" });

    expect(mocks.streamGroundedAnswer).not.toHaveBeenCalled();
    expect(tokens).toEqual([REFUSAL]);
    expect(result).toMatchObject({ answer: REFUSAL, grounded: false, sources: [] });
  });

  it("marks model refusals as ungrounded without sources", async () => {
    configure({ openAI: true, supabase: true });
    mocks.retrieveVector.mockResolvedValue([vectorChunk]);
    llmAnswers([REFUSAL]);

    const result = await answerProfileQuestion("Did he win the IISc hackathon?");

    expect(result).toMatchObject({ grounded: false, sources: [] });
  });

  it("uses the extractive fallback when generation fails before any token", async () => {
    configure({ openAI: true, supabase: false });
    mocks.streamGroundedAnswer.mockRejectedValue(new Error("model down"));

    const chat = await answerProfileQuestion("What anti-spam guardrails are in CommentAI?");
    const voice = await answerVoiceProfileQuestion("What anti-spam guardrails are in CommentAI?");

    expect(chat.answer).toMatch(/^Based on Shubham's verified profile/);
    expect(voice.answer).toMatch(/^Use these verified profile facts to answer briefly\./);
    expect(voice.grounded).toBe(true);
  });

  it("rethrows a generation failure after tokens were already streamed", async () => {
    configure({ openAI: true, supabase: false });
    mocks.streamGroundedAnswer.mockImplementation(async (input: GroundedAnswerInput) => {
      await input.onToken("Partial");
      throw new Error("stream broke");
    });

    await expect(
      collect("What anti-spam guardrails are in CommentAI?", { style: "chat" })
    ).rejects.toThrow("stream broke");
  });

  it("returns the partial answer and emits nothing further once aborted", async () => {
    configure({ openAI: true, supabase: false });
    const controller = new AbortController();
    llmAnswers(["One", " two", " three"]);
    const tokens: string[] = [];

    const result = await streamProfileAnswer("What anti-spam guardrails are in CommentAI?", {
      style: "chat",
      signal: controller.signal,
      onToken: (token) => {
        tokens.push(token);
        if (tokens.length === 2) controller.abort();
      }
    });

    expect(tokens).toEqual(["One", " two"]);
    expect(result.answer).toBe("One two");
  });

  it("emits nothing when aborted before generation starts", async () => {
    configure({ openAI: false, supabase: false });
    const controller = new AbortController();
    controller.abort();

    const { result, tokens } = await collect("What anti-spam guardrails are in CommentAI?", {
      style: "chat",
      signal: controller.signal
    });

    expect(tokens).toEqual([]);
    expect(result).toMatchObject({ answer: "", grounded: false, sources: [] });
  });
});
