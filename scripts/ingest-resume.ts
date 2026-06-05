import { loadEnvConfig } from "@next/env";
import { buildProfileChunks } from "../lib/chunking";
import {
  embedTexts,
  getExpectedEmbeddingDimensions,
  hasOpenAIConfig
} from "../lib/openai-client";
import { hasSupabaseConfig } from "../lib/supabase";
import { upsertDocumentChunks } from "../lib/vector-store";

loadEnvConfig(process.cwd());

async function main() {
  const chunks = buildProfileChunks();

  console.log("Profile chunk inventory");
  const counts = new Map<string, number>();
  for (const chunk of chunks) {
    counts.set(chunk.sourcePath, (counts.get(chunk.sourcePath) ?? 0) + 1);
  }

  for (const [sourcePath, count] of counts) {
    console.log(`- ${sourcePath}: ${count} chunks`);
  }

  if (!chunks.length) {
    console.log("\nNo chunks found. Add resume.md and project notes first.");
    return;
  }

  if (!hasOpenAIConfig() || !hasSupabaseConfig()) {
    console.log(
      "\nDry run only. Add OPENAI_API_KEY, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY to .env.local to embed and upload chunks."
    );
    return;
  }

  console.log(`\nEmbedding ${chunks.length} chunks...`);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  const expectedDimensions = getExpectedEmbeddingDimensions();
  const actualDimensions = embeddings[0]?.length;

  if (actualDimensions !== expectedDimensions) {
    throw new Error(
      `Embedding dimension mismatch. ${process.env.OPENAI_EMBEDDING_MODEL ?? "default embedding model"} returned ${actualDimensions} dimensions, but the app expects ${expectedDimensions}. Update OPENAI_EMBEDDING_DIMENSIONS and the Supabase vector schema, then rerun ingestion.`
    );
  }

  const embeddedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index]
  }));

  console.log("Uploading chunks to Supabase...");
  await upsertDocumentChunks(embeddedChunks);
  console.log(`Done. Upserted ${embeddedChunks.length} chunks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
