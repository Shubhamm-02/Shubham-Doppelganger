import { chatProviders, type ChatProvider } from "@/lib/llm/client";

type FallbackOptions = {
  signal?: AbortSignal;
  canFallBack?: () => boolean;
};

export async function withChatProviderFallback<T>(
  run: (provider: ChatProvider) => Promise<T>,
  { signal, canFallBack = () => true }: FallbackOptions = {}
): Promise<T> {
  const providers = chatProviders();
  if (providers.length === 0) {
    throw new Error("No chat model provider is configured.");
  }

  for (let index = 0; ; index += 1) {
    const provider = providers[index];
    try {
      return await run(provider);
    } catch (error) {
      const next = providers[index + 1];
      if (!next || signal?.aborted || !canFallBack()) throw error;
      console.warn(`${provider.name} request failed; retrying with ${next.name}.`, error);
    }
  }
}
