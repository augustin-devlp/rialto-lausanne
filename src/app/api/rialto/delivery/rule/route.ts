import { NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { toFreeDeliveryRule } from "@/lib/delivery/rule";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/delivery/rule — réglage PUBLIC « livraison offerte à
 * partir d'un seuil » (LS1, pattern loyalty/rule).
 *
 * Sert les surfaces client (panier, checkout, encouragement au palier —
 * LS2) : le fee de zone figé dans localStorage à la qualification
 * d'adresse ne suffit pas, le fee EFFECTIF dépend du panier courant et de
 * ce réglage. Sans cet endpoint, le client réafficherait des frais en dur
 * qui deviendraient faux au premier changement de réglage.
 *
 * AUCUNE donnée personnelle : configuration commerciale, affichée à tous.
 * Pas d'auth.
 */
export async function GET() {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("restaurants")
    .select("free_delivery_threshold, free_delivery_enabled")
    .eq("id", RESTAURANT_ID)
    .maybeSingle();

  if (error || !data) {
    console.error("[delivery/rule] lecture échouée", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const rule = toFreeDeliveryRule(data as Record<string, unknown>);
  return NextResponse.json(
    { ok: true, rule },
    // s-maxage indispensable : sans lui Vercel ne met RIEN en cache CDN et
    // chaque visiteur déclenche une invocation + une requête Supabase.
    {
      headers: {
        "cache-control":
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
