import OpenAI from "openai";
import { PERSONA_SYSTEM_PROMPT } from "@/lib/prompts";
import type { RetrievedDocument } from "@/lib/vector-store";

const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const REFUSAL =
  "I do not have that information in the indexed resume or project notes.";

let client: OpenAI | null = null;

export function hasOpenAIConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}

export function getChatModel() {
  return process.env.OPENAI_MODEL ?? DEFAULT_CHAT_MODEL;
}

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function embedTexts(texts: string[]) {
  const openai = getOpenAIClient();
  const embeddings: number[][] = [];
  const batchSize = 64;

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const response = await openai.embeddings.create({
      model: getEmbeddingModel(),
      input: batch
    });

    embeddings.push(...response.data.map((item) => item.embedding));
  }

  return embeddings;
}

export async function generateGroundedAnswer(
  question: string,
  documents: RetrievedDocument[]
) {
  const openai = getOpenAIClient();
  const context = documents
    .map((document, index) => {
      return [
        `[${index + 1}] ${document.source_name}`,
        `Path: ${document.source_path}`,
        `Section: ${String(document.metadata?.sectionTitle ?? "Unknown")}`,
        `Similarity: ${document.similarity.toFixed(3)}`,
        "",
        document.content
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const response = await openai.responses.create({
    model: getChatModel(),
    input: [
      {
        role: "system",
        content: PERSONA_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: [
          "Answer the question using only the retrieved context below.",
          `If the context does not support the answer, reply exactly: ${REFUSAL}`,
          "Do not add facts that are not present in the context.",
          "Be specific, concise, and interview-friendly.",
          "",
          `Question: ${question}`,
          "",
          "Retrieved context:",
          context
        ].join("\n")
      }
    ],
    temperature: 0.2
  });

  const answer = response.output_text?.trim();
  return answer || REFUSAL;
}

export function isModelRefusal(answer: string) {
  return answer.trim().toLowerCase() === REFUSAL.toLowerCase();
}
