import OpenAI from "openai";

const DEFAULT_CHAT_MODEL = "gpt-4.1-mini";
const DEFAULT_ROUTER_MODEL = "gpt-4.1-nano";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_CHAT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_GROQ_ROUTER_MODEL = "openai/gpt-oss-20b";

let client: OpenAI | null = null;
let groqClient: OpenAI | null = null;

export type ProviderModel = {
  id: string;
  reasoningEffort: "low" | null;
};

export type ChatProvider = {
  name: "openai" | "groq";
  client: OpenAI;
  chat: ProviderModel;
  router: ProviderModel;
};

export function hasOpenAIConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function hasGroqConfig() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function hasChatProvider() {
  return hasOpenAIConfig() || hasGroqConfig();
}

export function groqChatModel() {
  return process.env.GROQ_CHAT_MODEL ?? DEFAULT_GROQ_CHAT_MODEL;
}

export function groqRouterModel() {
  return process.env.GROQ_ROUTER_MODEL ?? DEFAULT_GROQ_ROUTER_MODEL;
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

export function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY.");
  }

  groqClient ??= new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
  return groqClient;
}

// Groq's gpt-oss models reason before answering; low effort keeps the first token fast.
function groqModel(id: string): ProviderModel {
  return { id, reasoningEffort: id.startsWith("openai/gpt-oss") ? "low" : null };
}

export function reasoningParams(model: ProviderModel) {
  return model.reasoningEffort ? { reasoning_effort: model.reasoningEffort } : {};
}

// OpenAI answers first; Groq takes over when OpenAI is unconfigured or failing.
export function chatProviders(): ChatProvider[] {
  return [
    ...(hasOpenAIConfig()
      ? [
          {
            name: "openai" as const,
            client: getOpenAIClient(),
            chat: { id: chatModel(), reasoningEffort: null },
            router: { id: routerModel(), reasoningEffort: null }
          }
        ]
      : []),
    ...(hasGroqConfig()
      ? [
          {
            name: "groq" as const,
            client: getGroqClient(),
            chat: groqModel(groqChatModel()),
            router: groqModel(groqRouterModel())
          }
        ]
      : [])
  ];
}
