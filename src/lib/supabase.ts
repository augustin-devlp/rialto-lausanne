import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) browserClient = createClient(url, anon);
  return browserClient;
}

export function supabaseServer(): SupabaseClient {
  return createClient(url, anon, { auth: { persistSession: false } });
}

export function supabaseService(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || anon;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const RESTAURANT_ID = process.env.NEXT_PUBLIC_RESTAURANT_ID!;
