import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, CARD_ID, LOTTERY_ID } from "@/lib/loyaltyConstants";
import { normalizePhone } from "@/lib/phone";
import { zurichMonthStart } from "@/lib/lotteryDraw";

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/loyalty/lottery/enter
 * Body: { phone, first_name }
 *
 * Ajoute une participation à la loterie mensuelle de Rialto.
 * Design 3 (décision 21.07.2026) : la participation vaut pour le MOIS
 * courant (Europe/Zurich) — insert-first idempotent sur l'UNIQUE
 * (lottery_id, phone, month) : 23505 → already_entered=true. Tant que la
 * migration L1 (navette) n'est pas exécutée, PGRST204 → repli sur
 * l'insert historique sans mois (unicité à vie).
 *
 * ⚠️ Fossé Système A/B hérité (D1) : cette route écrit dans
 * lottery_participants (système B) — ce N'EST PAS la table des tickets du
 * tirage (lottery_entries, système A). Conversion participants → tickets
 * au tirage D2. AUCUN SMS (D5).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    phone?: string;
    first_name?: string;
  } | null;

  if (!body?.phone?.trim() || !body.first_name?.trim()) {
    return NextResponse.json(
      { error: "phone et first_name requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();
  // Harmonisation D2 : normalise en E.164 quand possible (évite les
  // doublons de format entre lottery_participants et customers lors des
  // réconciliations) ; repli sur le trim historique si format inconnu.
  const phone = normalizePhone(body.phone) ?? body.phone.trim();

  const { data: lottery } = await admin
    .from("lotteries")
    .select("id, is_active, end_date, require_google_review")
    .eq("id", LOTTERY_ID)
    .maybeSingle();
  if (!lottery || !lottery.is_active) {
    return NextResponse.json(
      { error: "La loterie n'est pas active." },
      { status: 409 },
    );
  }

  // Si avis Google requis, vérifier le claim actif
  if (lottery.require_google_review) {
    const { data: cards } = await admin
      .from("customer_cards")
      .select("customer_id, customers!inner (phone)")
      .eq("card_id", CARD_ID)
      .eq("customers.phone", phone)
      .limit(1);
    const customerId =
      Array.isArray(cards) && cards.length > 0
        ? (cards[0].customer_id as string)
        : null;
    if (!customerId) {
      return NextResponse.json(
        {
          error: "Aucune carte fidélité trouvée pour ce numéro.",
          requires_review: true,
        },
        { status: 403 },
      );
    }
    const { data: claim } = await admin
      .from("google_review_claims")
      .select("id")
      .eq("customer_id", customerId)
      .eq("business_id", BUSINESS_ID)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (!claim) {
      return NextResponse.json(
        {
          error: "Laissez un avis Google pour participer à la loterie.",
          requires_review: true,
          customer_id: customerId,
        },
        { status: 403 },
      );
    }
  }

  // Insert-first (pas de select préalable : l'UNIQUE tranche, sans course).
  const base = {
    lottery_id: LOTTERY_ID,
    first_name: body.first_name.trim(),
    phone,
  };
  const { error } = await admin
    .from("lottery_participants")
    .insert({ ...base, month: zurichMonthStart() });
  if (!error) {
    return NextResponse.json({ ok: true, already_entered: false });
  }
  if (error.code === "23505") {
    return NextResponse.json({ ok: true, already_entered: true });
  }
  if (error.code === "PGRST204" || error.code === "42703") {
    // Colonne month absente (migration L1 en attente ; le code exact
    // dépend de la version PostgREST) → comportement historique : une
    // participation par téléphone.
    const { error: legacyErr } = await admin
      .from("lottery_participants")
      .insert(base);
    if (!legacyErr) {
      return NextResponse.json({ ok: true, already_entered: false });
    }
    if (legacyErr.code === "23505") {
      return NextResponse.json({ ok: true, already_entered: true });
    }
    return NextResponse.json({ error: legacyErr.message }, { status: 500 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}
