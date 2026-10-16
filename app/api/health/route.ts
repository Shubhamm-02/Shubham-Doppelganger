import { NextResponse } from "next/server";
import {
  chatModel,
  embeddingModel,
  expectedEmbeddingDimensions,
  hasOpenAIConfig,
  openAIBaseURL
} from "@/lib/llm/client";
import { embedTexts } from "@/lib/llm/embeddings";
import { safeEqual } from "@/lib/secure-compare";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

const MIN_HEALTH_TOKEN_LENGTH = 32;
const PUBLIC_RESULT_TTL_MS = 60_000;

let publicCheck: { ok: Promise<boolean>; expiresAt: number } | null = null;

function canViewDetails(request: Request) {
  const token = process.env.HEALTH_TOKEN?.trim();
  const provided = request.headers.get("x-health-token");
  return Boolean(
    token &&
      token.length >= MIN_HEALTH_TOKEN_LENGTH &&
      provided &&
      safeEqual(provided, token)
  );
}

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

async function runChecks() {
  const expectedDimensions = expectedEmbeddingDimensions();
  const checks = {
    llm: {
      configured: hasOpenAIConfig(),
      baseURL: safeUrl(openAIBaseURL()),
      chatModel: chatModel(),
      embeddingModel: embeddingModel(),
      expectedEmbeddingDimensions: expectedDimensions,
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
      checks.llm.ok = embedding.length === expectedDimensions;
      if (!checks.llm.ok) {
        checks.llm.error = `Embedding dimension mismatch: got ${embedding.length}, expected ${expectedDimensions}.`;
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

      // Selecting the migrated columns also fails when a supabase/migrations file is not applied.
      const tableProbes = [
        ["conversations", "id,metadata"],
        ["chat_sessions", "id,visitor_id,updated_at,scheduling,scheduling_version"]
      ];
      for (const [table, columns] of tableProbes) {
        const tableResult = (await withTimeout(
          Promise.resolve(supabase.from(table).select(columns).limit(1)),
          8000,
          `Supabase ${table} check`
        )) as { error?: unknown };
        if (tableResult.error) throw tableResult.error;
      }

      const probeEmbedding = Array.from(
        { length: expectedDimensions },
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

  return { ok: checks.llm.ok && checks.supabase.ok, checks };
}

// Anonymous callers share one cached run so the public URL cannot be used to spend OpenAI or Supabase quota.
function cachedPublicOk() {
  const now = Date.now();
  if (!publicCheck || publicCheck.expiresAt <= now) {
    publicCheck = {
      ok: runChecks().then(({ ok }) => ok),
      expiresAt: now + PUBLIC_RESULT_TTL_MS
    };
  }
  return publicCheck.ok;
}

export async function GET(request: Request) {
  if (canViewDetails(request)) {
    const { ok, checks } = await runChecks();
    return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
  }

  const ok = await cachedPublicOk();
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
