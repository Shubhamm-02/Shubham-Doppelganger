import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase";
import { createMemoryStore } from "@/lib/store/memory";
import { createSupabaseStore } from "@/lib/store/supabase";
import type { ChatStore } from "@/lib/store/types";

// Kept on globalThis so dev hot reloads do not wipe in-memory sessions.
const storeGlobal = globalThis as typeof globalThis & {
  wizardMemoryChatStore?: ChatStore;
};

let supabaseStore: ChatStore | null = null;

export function getChatStore(): ChatStore | null {
  if (hasSupabaseConfig()) {
    supabaseStore ??= createSupabaseStore(getSupabaseAdmin());
    return supabaseStore;
  }

  if (process.env.NODE_ENV === "production") return null;

  storeGlobal.wizardMemoryChatStore ??= createMemoryStore();
  return storeGlobal.wizardMemoryChatStore;
}
