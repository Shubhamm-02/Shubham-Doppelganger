import type { DocumentChunk } from "@/lib/chunking";
import { embeddingModel } from "@/lib/llm/client";
import { getSupabaseAdmin } from "@/lib/supabase";

type StoredChunk = { id: number; source_path: string; chunk_index: number };

const UPSERT_BATCH_SIZE = 100;
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 200;

export async function upsertDocumentChunks(
  chunks: Array<DocumentChunk & { embedding: number[] }>
) {
  const supabase = getSupabaseAdmin();
  const model = embeddingModel();

  for (let index = 0; index < chunks.length; index += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(index, index + UPSERT_BATCH_SIZE).map((chunk) => ({
      source_type: chunk.sourceType,
      source_name: chunk.sourceName,
      source_path: chunk.sourcePath,
      source_url: chunk.sourceUrl,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      content_hash: chunk.contentHash,
      embedding_model: model,
      metadata: chunk.metadata,
      embedding: chunk.embedding
    }));

    const { error } = await supabase
      .from("documents")
      .upsert(batch, { onConflict: "source_path,chunk_index" });

    if (error) throw error;
  }
}

async function listStoredChunks() {
  const supabase = getSupabaseAdmin();
  const rows: StoredChunk[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("documents")
      .select("id,source_path,chunk_index")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as StoredChunk[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// `keep` must be the full local chunk set: rows for missing paths, and trailing chunks of
// documents that got shorter, are deleted.
export async function pruneDocumentsExcept(
  keep: Array<Pick<DocumentChunk, "sourcePath" | "chunkIndex">>
) {
  const chunkCounts = new Map<string, number>();
  for (const chunk of keep) {
    chunkCounts.set(
      chunk.sourcePath,
      Math.max(chunkCounts.get(chunk.sourcePath) ?? 0, chunk.chunkIndex + 1)
    );
  }

  const staleRows = (await listStoredChunks()).filter(
    (row) => row.chunk_index >= (chunkCounts.get(row.source_path) ?? 0)
  );
  const supabase = getSupabaseAdmin();

  for (let index = 0; index < staleRows.length; index += DELETE_BATCH_SIZE) {
    const ids = staleRows.slice(index, index + DELETE_BATCH_SIZE).map((row) => row.id);
    const { error } = await supabase.from("documents").delete().in("id", ids);
    if (error) throw error;
  }

  return staleRows.length;
}
