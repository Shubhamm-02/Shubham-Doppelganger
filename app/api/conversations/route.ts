import { NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ conversations: [] });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "10") || 10, 30);
  const channel = (url.searchParams.get("channel") ?? "chat").toLowerCase();
  const sessionIdRaw = url.searchParams.get("sessionId");
  const sessionId = sessionIdRaw ? Number(sessionIdRaw) : null;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("conversations")
    .select(
      "id,session_id,channel,user_message,assistant_message,grounded,latency_ms,created_at"
    )
    .eq("channel", channel)
    .order("created_at", { ascending: false });

  if (sessionId && Number.isFinite(sessionId)) {
    query = query.eq("session_id", sessionId);
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    return NextResponse.json(
      { error: error.message, conversations: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ conversations: data ?? [] });
}
