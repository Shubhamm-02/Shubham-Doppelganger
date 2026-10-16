import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parsePositiveInt } from "@/lib/http";
import { getChatStore } from "@/lib/store";
import { getVisitor } from "@/lib/visitor";

export const runtime = "nodejs";

type SessionRouteContext = { params: Promise<{ id: string }> };

const renameSchema = z.object({
  title: z.string().trim().min(1).max(80)
});

function sessionNotFound() {
  return jsonError(404, "not_found", "Chat session not found.");
}

export async function PATCH(request: Request, context: SessionRouteContext) {
  const sessionId = parsePositiveInt((await context.params).id);
  if (sessionId === null) {
    return jsonError(400, "invalid_request", "Session id must be a positive integer.");
  }

  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return jsonError(400, "invalid_request", "Request body must be JSON.");
  }

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "title must be a string of 1 to 80 characters.");
  }

  try {
    const visitor = await getVisitor();
    const session = await getChatStore()?.renameSession(
      visitor.id,
      sessionId,
      parsed.data.title
    );

    return session ? NextResponse.json({ session }) : sessionNotFound();
  } catch (error) {
    console.error("Chat session rename failed.", error);
    return jsonError(503, "unavailable", "Chat history is temporarily unavailable.");
  }
}

export async function DELETE(_request: Request, context: SessionRouteContext) {
  const sessionId = parsePositiveInt((await context.params).id);
  if (sessionId === null) {
    return jsonError(400, "invalid_request", "Session id must be a positive integer.");
  }

  try {
    const visitor = await getVisitor();
    const deleted = await getChatStore()?.deleteSession(visitor.id, sessionId);

    return deleted ? NextResponse.json({ ok: true }) : sessionNotFound();
  } catch (error) {
    console.error("Chat session delete failed.", error);
    return jsonError(503, "unavailable", "Chat history is temporarily unavailable.");
  }
}
