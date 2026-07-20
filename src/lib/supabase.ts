import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) browserClient = createClient(url, anon);
  return browserClient;
}

// Next.js 14 met en cache (Data Cache) les fetch GET des route handlers GET :
// sans no-store, les lectures Supabase resservent des données périmées
// (ex. config de roue, tampons d'une carte) après une écriture.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export function supabaseServer(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}

export function supabaseService(): SupabaseClient {
  // FAIL-FAST (backlog 1bis-d, 2026) : plus de fallback silencieux vers
  // l'anon key. Depuis le durcissement RLS, une SERVICE_ROLE_KEY manquante
  // doit crier (500 explicite) — le fallback anon donnait des lectures
  // filtrées à 0 ligne SANS erreur (checkout cassé, numéros de commande
  // en collision, pages 404) impossibles à diagnostiquer.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante : configuration incomplète (voir env Vercel).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}

export const RESTAURANT_ID = process.env.NEXT_PUBLIC_RESTAURANT_ID!;
