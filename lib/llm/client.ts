import OpenAI from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";
const DEFAULT_ROUTER_MODEL = "gpt-4.1-nano";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

let client: OpenAI | null = null;

export function hasOpenAIConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function openAIBaseURL() {
  return process.env.OPENAI_BASE_URL;
}

export function chatModel() {
  return process.env.OPENAI_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
}

export function routerModel() {
  return process.env.OPENAI_ROUTER_MODEL ?? DEFAULT_ROUTER_MODEL;
}

export function embeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}

export function expectedEmbeddingDimensions() {
  const configuredDimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS);
  if (Number.isInteger(configuredDimensions) && configuredDimensions > 0) {
    return configuredDimensions;
  }

  const model = embeddingModel().toLowerCase();
  if (
    model.includes("gemini-embedding-001") ||
    model.includes("text-embedding-3-large")
  ) {
    return 3072;
  }

  return 1536;
}

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {})
  });
  return client;
}
