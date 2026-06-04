import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/supabase";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions
} from "@/lib/sessions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ sessions: [] });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "12") || 12, 40);

  const sessions = await listChatSessions(limit);
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : "New chat";

  const session = await createChatSession(title);
  return NextResponse.json({ session });
}

export async function DELETE(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const sessionId = Number(url.searchParams.get("id"));

  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return NextResponse.json(
      { error: "Valid session id is required." },
      { status: 400 }
    );
  }

  await deleteChatSession(sessionId);
  return NextResponse.json({ ok: true });
}
