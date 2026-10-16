import { embeddingModel, getOpenAIClient } from "@/lib/llm/client";

const BATCH_SIZE = 64;

export async function embedTexts(texts: string[]) {
  const openai = getOpenAIClient();
  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += BATCH_SIZE) {
    const response = await openai.embeddings.create({
      model: embeddingModel(),
      input: texts.slice(index, index + BATCH_SIZE)
    });

    embeddings.push(...response.data.map((item) => item.embedding));
  }

  return embeddings;
}
