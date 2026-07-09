import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, CARD_ID, LOTTERY_ID } from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/loyalty/lottery/enter
 * Body: { phone, first_name }
 *
 * Ajoute une participation à la loterie mensuelle de Rialto.
 * Idempotent : si déjà inscrit, retourne 200 avec already_entered=true.
 *
 * ⚠️ Fossé Système A/B hérité (D1) : cette route écrit dans
 * lottery_participants (système B) — ce N'EST PAS la table des tickets du
 * tirage (lottery_entries, système A alimenté par le dashboard Stampify).
 * Réconciliation participants ↔ tickets = au lot dashboard. AUCUN SMS (D5).
 * Porté VERBATIM depuis loyalty-cards (moins le CORS).
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
  const phone = body.phone.trim();

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

  const { data: existing } = await admin
    .from("lottery_participants")
    .select("id")
    .eq("lottery_id", LOTTERY_ID)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already_entered: true });
  }

  const { error } = await admin.from("lottery_participants").insert({
    lottery_id: LOTTERY_ID,
    first_name: body.first_name.trim(),
    phone,
  });
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, already_entered: false });
}
