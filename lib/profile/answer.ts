import type { Source } from "@/lib/chat/types";
import { hasOpenAIConfig } from "@/lib/llm/client";
import {
  isModelRefusal,
  REFUSAL,
  streamGroundedAnswer,
  type ConversationTurn
} from "@/lib/llm/grounded-answer";
import type { AnswerStyle } from "@/lib/llm/prompts";
import {
  profileOverviewChunks,
  searchLocalChunks,
  wizardProjectChunks
} from "@/lib/profile/local-search";
import { projectDigest } from "@/lib/profile/project-digest";
import {
  isProfileOverviewQuestion,
  isProjectListQuestion,
  isWizardProjectQuestion,
  normalizeProfileQuestion
} from "@/lib/profile/question";
import { chunkBody, plainText, toSources } from "@/lib/profile/sources";
import type { RetrievedChunk } from "@/lib/retrieval/types";
import { retrieveVector } from "@/lib/retrieval/vector";
import { hasSupabaseConfig } from "@/lib/supabase";

type RetrievalMode = "vector" | "local-keyword";

export type ProfileAnswer = {
  answer: string;
  sources: Source[];
  grounded: boolean;
  retrievalMode: RetrievalMode;
  documentIds: number[];
};

export type ProfileAnswerOptions = {
  style: AnswerStyle;
  history?: ConversationTurn[];
  signal?: AbortSignal;
};

type TokenSink = (token: string) => void | Promise<void>;

const LOCAL_CONTEXT_LIMIT: Record<AnswerStyle, number> = { chat: 7, voice: 6 };
const FALLBACK_CHUNK_LIMIT = 4;
const EXCERPT_LENGTH = 850;
const VOICE_FACT_LENGTH = 260;

async function retrieve(
  question: string,
  style: AnswerStyle
): Promise<{ chunks: RetrievedChunk[]; mode: RetrievalMode }> {
  const limit = LOCAL_CONTEXT_LIMIT[style];
  if (isWizardProjectQuestion(question)) {
    return { chunks: wizardProjectChunks().slice(0, limit), mode: "local-keyword" };
  }
  if (isProfileOverviewQuestion(question)) {
    return { chunks: profileOverviewChunks().slice(0, limit), mode: "local-keyword" };
  }
  if (style === "chat" && hasOpenAIConfig() && hasSupabaseConfig()) {
    try {
      return { chunks: await retrieveVector(question), mode: "vector" };
    } catch (error) {
      console.warn("Vector retrieval failed. Falling back to local search.", error);
    }
  }
  return { chunks: searchLocalChunks(question).slice(0, limit), mode: "local-keyword" };
}

function documentIds(chunks: RetrievedChunk[]) {
  return chunks.flatMap((chunk) => (chunk.documentId === null ? [] : [chunk.documentId]));
}

// Each excerpt is already labelled with its section, so the section's own heading line is dropped.
function excerpt(content: string) {
  const body = chunkBody(content).replace(/^#{1,6}\s.*(?:\n+|$)/, "");
  return body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH).trim()}...` : body;
}

function extractiveAnswer(chunks: RetrievedChunk[]) {
  const details = chunks
    .map((chunk, index) => `${index + 1}. ${chunk.section}:\n${excerpt(chunk.content)}`)
    .join("\n\n");
  return `Based on Shubham's verified profile, these are the most relevant details:\n\n${details}`;
}

function voiceFacts(chunks: RetrievedChunk[]) {
  const facts = chunks
    .map((chunk) => {
      const summary = plainText(excerpt(chunk.content)).slice(0, VOICE_FACT_LENGTH).trim();
      return `- ${chunk.section}: ${summary}`;
    })
    .join("\n");
  return `Use these verified profile facts to answer briefly. Do not mention file names, folders, citations, or source labels.\n${facts}`;
}

function stoppedAnswer(retrievalMode: RetrievalMode): ProfileAnswer {
  return { answer: "", sources: [], grounded: false, retrievalMode, documentIds: [] };
}

async function deliver(result: ProfileAnswer, onToken: TokenSink, signal?: AbortSignal) {
  if (signal?.aborted) return stoppedAnswer(result.retrievalMode);
  await onToken(result.answer);
  return result;
}

// When `signal` aborts, resolves with whatever was already emitted and emits nothing further.
export async function streamProfileAnswer(
  question: string,
  { style, history, signal, onToken }: ProfileAnswerOptions & { onToken: TokenSink }
): Promise<ProfileAnswer> {
  const normalizedQuestion = normalizeProfileQuestion(question);

  if (!isWizardProjectQuestion(normalizedQuestion) && isProjectListQuestion(normalizedQuestion)) {
    const digest = projectDigest(searchLocalChunks(normalizedQuestion));
    if (digest) {
      return deliver(
        {
          answer: digest.answer,
          sources: toSources(digest.chunks),
          grounded: true,
          retrievalMode: "local-keyword",
          documentIds: []
        },
        onToken,
        signal
      );
    }
  }

  const { chunks, mode } = await retrieve(normalizedQuestion, style);

  if (!chunks.length) {
    return deliver(
      { answer: REFUSAL, sources: [], grounded: false, retrievalMode: mode, documentIds: [] },
      onToken,
      signal
    );
  }

  if (signal?.aborted) return stoppedAnswer(mode);

  if (hasOpenAIConfig()) {
    let emitted = false;
    try {
      const answer = await streamGroundedAnswer({
        question: normalizedQuestion,
        documents: chunks,
        style,
        history,
        signal,
        onToken: (token) => {
          emitted = true;
          return onToken(token);
        }
      });
      const grounded = answer.length > 0 && !isModelRefusal(answer);
      return {
        answer,
        sources: grounded ? toSources(chunks) : [],
        grounded,
        retrievalMode: mode,
        documentIds: documentIds(chunks)
      };
    } catch (error) {
      if (emitted) throw error;
      console.warn("Grounded answer generation failed. Using the extractive fallback.", error);
    }
  }

  const fallbackChunks = chunks.slice(0, FALLBACK_CHUNK_LIMIT);
  return deliver(
    {
      answer: style === "voice" ? voiceFacts(fallbackChunks) : extractiveAnswer(fallbackChunks),
      sources: toSources(fallbackChunks),
      grounded: true,
      retrievalMode: mode,
      documentIds: documentIds(fallbackChunks)
    },
    onToken,
    signal
  );
}

export function answerProfileQuestion(
  question: string,
  options: ProfileAnswerOptions = { style: "chat" }
) {
  return streamProfileAnswer(question, { ...options, onToken: () => {} });
}

export function answerVoiceProfileQuestion(question: string) {
  return answerProfileQuestion(question, { style: "voice" });
}
