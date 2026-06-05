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

  try {
    const sessions = await listChatSessions(limit);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.warn("Chat sessions unavailable.", error);
    return NextResponse.json({ sessions: [] });
  }
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

  try {
    const session = await createChatSession(title);
    return NextResponse.json({ session });
  } catch (error) {
    console.warn("Chat session creation failed.", error);
    return NextResponse.json(
      { error: "Chat sessions are temporarily unavailable." },
      { status: 503 }
    );
  }
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

  try {
    await deleteChatSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn("Chat session deletion failed.", error);
    return NextResponse.json(
      { error: "Chat sessions are temporarily unavailable." },
      { status: 503 }
    );
  }
}
