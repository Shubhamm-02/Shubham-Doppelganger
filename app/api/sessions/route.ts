import { NextResponse } from "next/server";
import { jsonError, parseOptionalPositiveInt } from "@/lib/http";
import { getChatStore } from "@/lib/store";
import { getVisitor } from "@/lib/visitor";

export const runtime = "nodejs";

const DEFAULT_SESSION_LIMIT = 30;

export async function GET(request: Request) {
  const limit = parseOptionalPositiveInt(new URL(request.url).searchParams.get("limit"));

  if (limit === null) {
    return jsonError(400, "invalid_request", "limit must be a positive integer.");
  }

  try {
    const visitor = await getVisitor();
    const store = getChatStore();
    if (!store) return NextResponse.json({ sessions: [] });

    const sessions = await store.listSessions(visitor.id, limit ?? DEFAULT_SESSION_LIMIT);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Chat sessions request failed.", error);
    return jsonError(503, "unavailable", "Chat history is temporarily unavailable.");
  }
}
