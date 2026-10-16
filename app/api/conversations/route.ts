import { NextResponse } from "next/server";
import { jsonError, parseOptionalPositiveInt, parsePositiveInt } from "@/lib/http";
import { getChatStore } from "@/lib/store";
import { getVisitor } from "@/lib/visitor";

export const runtime = "nodejs";

const DEFAULT_TURN_LIMIT = 20;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sessionId = parsePositiveInt(params.get("sessionId"));
  const before = parseOptionalPositiveInt(params.get("before"));
  const limit = parseOptionalPositiveInt(params.get("limit"));

  if (sessionId === null) {
    return jsonError(400, "invalid_request", "sessionId must be a positive integer.");
  }

  if (before === null || limit === null) {
    return jsonError(400, "invalid_request", "before and limit must be positive integers.");
  }

  try {
    const visitor = await getVisitor();
    const page = await getChatStore()?.listTurns(visitor.id, sessionId, {
      before,
      limit: limit ?? DEFAULT_TURN_LIMIT
    });

    if (!page) return jsonError(404, "not_found", "Chat session not found.");
    return NextResponse.json(page);
  } catch (error) {
    console.error("Chat history request failed.", error);
    return jsonError(503, "unavailable", "Chat history is temporarily unavailable.");
  }
}
