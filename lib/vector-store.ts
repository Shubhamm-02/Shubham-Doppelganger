import { getEmbeddingModel } from "@/lib/openai-client";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase";
import type { DocumentChunk } from "@/lib/chunking";

export type RetrievedDocument = {
  id: number;
  source_type: string;
  source_name: string;
  source_path: string;
  source_url: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

type ConversationLog = {
  channel: "chat" | "voice" | "eval";
  sessionId?: number;
  userMessage: string;
  assistantMessage: string;
  retrievedDocumentIds: number[];
  grounded: boolean;
  latencyMs: number;
};

export type ConversationTurn = {
  id: number;
  session_id: number | null;
  channel: string;
  user_message: string;
  assistant_message: string | null;
  grounded: boolean | null;
  latency_ms: number | null;
  created_at: string;
};

export async function upsertDocumentChunks(
  chunks: Array<DocumentChunk & { embedding: number[] }>
) {
  const supabase = getSupabaseAdmin();
  const embeddingModel = getEmbeddingModel();
  const batchSize = 100;

  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize).map((chunk) => ({
      source_type: chunk.sourceType,
      source_name: chunk.sourceName,
      source_path: chunk.sourcePath,
      source_url: chunk.sourceUrl,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      content_hash: chunk.contentHash,
      embedding_model: embeddingModel,
      metadata: chunk.metadata,
      embedding: chunk.embedding
    }));

    const { error } = await supabase
      .from("documents")
      .upsert(batch, { onConflict: "source_path,chunk_index" });

    if (error) throw error;
  }
}

export async function matchDocuments(
  queryEmbedding: number[],
  options: { matchCount?: number; threshold?: number } = {}
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: options.matchCount ?? 6,
    match_threshold: options.threshold ?? 0.18
  });

  if (error) throw error;
  return (data ?? []) as RetrievedDocument[];
}

export async function logConversation(log: ConversationLog) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("conversations").insert({
    session_id: log.sessionId ?? null,
    channel: log.channel,
    user_message: log.userMessage,
    assistant_message: log.assistantMessage,
    retrieved_document_ids: log.retrievedDocumentIds,
    grounded: log.grounded,
    latency_ms: log.latencyMs
  });

  if (error) {
    console.warn("Failed to log conversation", error.message);
  }
}

export async function tryLogConversation(log: ConversationLog) {
  if (!hasSupabaseConfig()) return;
  try {
    await logConversation(log);
  } catch (error) {
    console.warn("Failed to log conversation", error);
  }
}

export async function listRecentConversationTurns(
  sessionId: number,
  limit = 8
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id,session_id,channel,user_message,assistant_message,grounded,latency_ms,created_at"
    )
    .eq("channel", "chat")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ConversationTurn[];
}
