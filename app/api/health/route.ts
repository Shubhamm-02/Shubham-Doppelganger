import { NextResponse } from "next/server";
import {
  embedTexts,
  getChatModel,
  getEmbeddingModel,
  getExpectedEmbeddingDimensions,
  getOpenAIBaseURL,
  hasOpenAIConfig
} from "@/lib/openai-client";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

function safeUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message) return error.message;
    if (error.cause) return errorMessage(error.cause);
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record.message ?? record.details ?? record.hint ?? record.code;
    if (message) return String(message);
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown object error";
    }
  }
  return String(error);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const expectedEmbeddingDimensions = getExpectedEmbeddingDimensions();
  const checks = {
    llm: {
      configured: hasOpenAIConfig(),
      baseURL: safeUrl(getOpenAIBaseURL()),
      chatModel: getChatModel(),
      embeddingModel: getEmbeddingModel(),
      expectedEmbeddingDimensions,
      ok: false,
      actualEmbeddingDimensions: null as number | null,
      error: null as string | null
    },
    supabase: {
      configured: hasSupabaseConfig(),
      ok: false,
      documentsCount: null as number | null,
      error: null as string | null
    }
  };

  if (checks.llm.configured) {
    try {
      const [embedding] = await withTimeout(
        embedTexts(["health check"]),
        8000,
        "Embedding check"
      );
      checks.llm.actualEmbeddingDimensions = embedding.length;
      checks.llm.ok = embedding.length === expectedEmbeddingDimensions;
      if (!checks.llm.ok) {
        checks.llm.error = `Embedding dimension mismatch: got ${embedding.length}, expected ${expectedEmbeddingDimensions}.`;
      }
    } catch (error) {
      checks.llm.error = errorMessage(error);
    }
  } else {
    checks.llm.error = "OPENAI_API_KEY is missing.";
  }

  if (checks.supabase.configured) {
    try {
      const supabase = getSupabaseAdmin();
      const documentsResult = (await withTimeout(
        Promise.resolve(
          supabase.from("documents").select("id", { count: "exact", head: true })
        ),
        8000,
        "Supabase documents check"
      )) as { count?: number | null; error?: unknown };
      if (documentsResult.error) throw documentsResult.error;
      checks.supabase.documentsCount = documentsResult.count ?? null;

      for (const table of ["conversations", "chat_sessions"]) {
        const tableResult = (await withTimeout(
          Promise.resolve(
            supabase.from(table).select("id", { count: "exact", head: true })
          ),
          8000,
          `Supabase ${table} check`
        )) as { error?: unknown };
        if (tableResult.error) throw tableResult.error;
      }

      const probeEmbedding = Array.from(
        { length: expectedEmbeddingDimensions },
        (_, index) => (index === 0 ? 1 : 0)
      );
      const rpcResult = (await withTimeout(
        Promise.resolve(
          supabase.rpc("match_documents", {
            query_embedding: probeEmbedding,
            match_count: 1,
            match_threshold: 0
          })
        ),
        8000,
        "Supabase match_documents check"
      )) as { error?: unknown };
      if (rpcResult.error) throw rpcResult.error;

      if (checks.supabase.documentsCount === 0) {
        throw new Error("The documents table is empty. Run npm run ingest:resume after installing the schema.");
      }

      checks.supabase.ok = true;
    } catch (error) {
      checks.supabase.error = errorMessage(error);
    }
  } else {
    checks.supabase.error = "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.";
  }

  const ok = checks.llm.ok && checks.supabase.ok;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
