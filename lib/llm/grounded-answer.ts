import { chatModel, getOpenAIClient } from "@/lib/llm/client";
import {
  answerInstructions,
  CONTEXT_HEADING,
  HISTORY_HEADING,
  PERSONA_SYSTEM_PROMPT,
  type AnswerStyle
} from "@/lib/llm/prompts";
import type { RetrievedChunk } from "@/lib/retrieval/types";

export const REFUSAL =
  "I do not have that detail in Shubham's verified profile yet.";

const HISTORY_TURNS = 3;
const HISTORY_ANSWER_CHARS = 300;
const TEMPERATURE: Record<AnswerStyle, number> = { chat: 0.2, voice: 0.15 };

export type ConversationTurn = { user: string; assistant: string | null };

export type GroundedAnswerInput = {
  question: string;
  documents: RetrievedChunk[];
  style: AnswerStyle;
  history?: ConversationTurn[];
  signal?: AbortSignal;
  onToken: (token: string) => void | Promise<void>;
};

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}…` : value;
}

function renderHistory(history: ConversationTurn[]) {
  return history
    .slice(-HISTORY_TURNS)
    .flatMap((turn) => [
      `Visitor: ${turn.user}`,
      ...(turn.assistant ? [`Wizard: ${truncate(turn.assistant, HISTORY_ANSWER_CHARS)}`] : [])
    ])
    .join("\n");
}

function renderContext(documents: RetrievedChunk[], style: AnswerStyle) {
  return documents
    .map((document, index) =>
      [
        `[${index + 1}] ${document.title}`,
        ...(style === "chat" ? [`Path: ${document.path}`] : []),
        `Section: ${document.section}`,
        "",
        document.content
      ].join("\n")
    )
    .join("\n\n---\n\n");
}

function userPrompt({ question, documents, style, history = [] }: GroundedAnswerInput) {
  return [
    ...answerInstructions(style, REFUSAL),
    ...(history.length ? ["", HISTORY_HEADING, renderHistory(history)] : []),
    "",
    `Question: ${question}`,
    "",
    CONTEXT_HEADING[style],
    renderContext(documents, style)
  ].join("\n");
}

export function isModelRefusal(answer: string) {
  return answer.trim().toLowerCase() === REFUSAL.toLowerCase();
}

// Resolves with the partial answer (possibly empty) instead of throwing when `signal` aborts.
export async function streamGroundedAnswer(input: GroundedAnswerInput) {
  const { signal, onToken } = input;
  let answer = "";

  try {
    const stream = await getOpenAIClient().chat.completions.create(
      {
        model: chatModel(),
        messages: [
          { role: "system", content: PERSONA_SYSTEM_PROMPT },
          { role: "user", content: userPrompt(input) }
        ],
        temperature: TEMPERATURE[input.style],
        stream: true
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (!token) continue;
      answer += token;
      await onToken(token);
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
  }

  if (signal?.aborted) return answer.trim();
  return answer.trim() || REFUSAL;
}
