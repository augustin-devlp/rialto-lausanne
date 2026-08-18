import { NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — sonde d'uptime (audit de publication 19.08).
 *
 * Vérifie la chaîne COMPLÈTE (runtime Vercel + variables d'env + accès
 * Supabase) par une lecture d'une ligne : un site « up » dont la base est
 * injoignable est un site en panne pour le client. 200 {"ok":true} /
 * 503 {"ok":false}. AUCUNE donnée métier ni sensible dans la réponse.
 *
 * Consommateur prévu : un monitor externe (config au runbook GO_LIVE —
 * cadence 5 min, alerte email, mot-clé "ok").
 */
export async function GET() {
  try {
    const sb = supabaseService();
    const { data, error } = await sb
      .from("restaurants")
      .select("id")
      .eq("id", RESTAURANT_ID)
      .maybeSingle();
    if (error || !data) throw error ?? new Error("restaurant_absent");
    return NextResponse.json(
      { ok: true, db: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] check failed", err);
    return NextResponse.json(
      { ok: false, db: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
