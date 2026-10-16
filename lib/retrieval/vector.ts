import { embedTexts } from "@/lib/llm/embeddings";
import type { RetrievedChunk } from "@/lib/retrieval/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type MatchedDocument = {
  id: number;
  source_type: string;
  source_name: string;
  source_path: string;
  source_url: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

const MATCH_COUNT = 14;
const MATCH_THRESHOLD = 0.12;
const CONTEXT_LIMIT = 10;

function sectionTitle(document: MatchedDocument) {
  return String(document.metadata?.sectionTitle ?? "").trim();
}

function isBoilerplateSection(document: MatchedDocument) {
  return /^(questions this note can answer|extra details to add later)$/i.test(
    sectionTitle(document)
  );
}

function toRetrievedChunk(document: MatchedDocument): RetrievedChunk {
  return {
    documentId: document.id,
    kind: document.source_type,
    path: document.source_path,
    title: document.source_name,
    section: sectionTitle(document) || document.source_name,
    chunkIndex: document.chunk_index,
    url: document.source_url,
    content: document.content,
    score: document.similarity
  };
}

export async function retrieveVector(query: string): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embedTexts([query]);
  const { data, error } = await getSupabaseAdmin().rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    match_threshold: MATCH_THRESHOLD
  });

  if (error) throw error;
  const documents = (data ?? []) as MatchedDocument[];
  const substantive = documents.filter((document) => !isBoilerplateSection(document));
  return (substantive.length ? substantive : documents)
    .slice(0, CONTEXT_LIMIT)
    .map(toRetrievedChunk);
}
