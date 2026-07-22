import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import { toStampRule } from "@/lib/loyalty/rule";
import {
  formatStampRule,
  formatStampRuleLong,
  formatCardGoal,
} from "@/lib/loyalty/copy";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/loyalty/rule — barème PUBLIC de la carte (F4).
 *
 * Sert les surfaces qui décrivent la fidélité AVANT tout lookup client :
 * en-tête de la section Fidélité, page d'inscription, bloc « créez votre
 * carte » de la confirmation. Sans lui, ces écrans réafficheraient une règle
 * en dur qui redeviendrait fausse au premier changement de barème.
 *
 * AUCUNE donnée personnelle : uniquement la configuration d'affichage du
 * programme (comment on gagne un tampon, combien il en faut, quel lot).
 * Pas d'auth — c'est une information commerciale, affichée à tous.
 */
export async function GET() {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("loyalty_cards")
    .select(
      "stamps_required, reward_description, stamp_credit_mode, stamp_amount_step, stamp_amount_basis, stamp_max_per_order, stamp_online_enabled",
    )
    .eq("id", CARD_ID)
    .maybeSingle();

  if (error || !data) {
    console.error("[loyalty/rule] lecture échouée", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const rule = toStampRule(data as Record<string, unknown>);
  const stampsRequired = (data as { stamps_required?: number }).stamps_required ?? 10;
  const reward =
    (data as { reward_description?: string }).reward_description ??
    "une pizza offerte";

  return NextResponse.json(
    {
      ok: true,
      // Comment on GAGNE un tampon (dépend du barème réglé au dashboard).
      rule: {
        mode: rule.mode,
        step: rule.step,
        basis: rule.basis,
        max_per_order: rule.maxPerOrder,
        enabled: rule.enabled,
        label: formatStampRule(rule),
        label_long: formatStampRuleLong(rule),
      },
      // Le BUT de la carte (indépendant du barème).
      goal: {
        stamps_required: stampsRequired,
        reward_description: reward,
        label: formatCardGoal(stampsRequired, reward),
      },
    },
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
