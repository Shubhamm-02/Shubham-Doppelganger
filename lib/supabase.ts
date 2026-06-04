import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseAdmin: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function describeSupabaseKey(key: string) {
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.split(".").length === 3) return "legacy-jwt";
  return "unknown";
}

export function requireSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local after creating the Supabase project."
    );
  }

  const keyType = describeSupabaseKey(serviceRoleKey);
  if (keyType === "publishable") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is set to a publishable key. Use a Supabase secret key beginning with sb_secret_ or the legacy service_role JWT key. Publishable keys cannot bypass RLS for ingestion."
    );
  }

  return { url, serviceRoleKey };
}

export function getSupabaseAdmin() {
  const { url, serviceRoleKey } = requireSupabaseConfig();

  supabaseAdmin ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseAdmin;
}
