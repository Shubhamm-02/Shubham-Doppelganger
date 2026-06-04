import { getSupabaseAdmin } from "@/lib/supabase";

export type ChatSession = {
  id: number;
  title: string;
  created_at: string;
};

function defaultTitleFromMessage(message: string) {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 48 ? `${trimmed.slice(0, 48).trim()}...` : trimmed;
}

function titleFromAssistantAnswer(answer: string) {
  const cleaned = String(answer ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!cleaned) return "New chat";
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/).at(0) ?? cleaned;
  const normalized = firstSentence.length > 64 ? `${firstSentence.slice(0, 64).trim()}...` : firstSentence;
  return normalized;
}

export async function createChatSession(title: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ title })
    .select("id,title,created_at")
    .single();

  if (error) throw error;
  return data as ChatSession;
}

export async function ensureChatSession(message: string, sessionId?: number) {
  if (sessionId) return { id: sessionId, created: false };
  const session = await createChatSession(defaultTitleFromMessage(message));
  return { id: session.id, created: true };
}

export async function updateChatSessionTitle(
  sessionId: number,
  title: string
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function autoTitleSessionFromAnswer(
  sessionId: number,
  answer: string
) {
  const title = titleFromAssistantAnswer(answer);
  await updateChatSessionTitle(sessionId, title);
}

export async function listChatSessions(limit = 12) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id,title,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ChatSession[];
}

export async function deleteChatSession(sessionId: number) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) throw error;
}
