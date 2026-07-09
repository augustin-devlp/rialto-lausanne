import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  CARD_ID,
  BUSINESS_ID,
  SPIN_WHEEL_ID,
  RIALTO_PLACE_ID,
} from "@/lib/loyaltyConstants";
import { normalizePhone } from "@/lib/phone";
import { computeSpinAvailability } from "@/lib/spinAvailability";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/loyalty/lookup?phone=+41...
 * Retourne la carte fidélité + roue + review_gate + orders pour ce téléphone.
 * Réponse 200 avec customer: null si aucune carte n'existe encore.
 *
 * ⚠️ Portage (Lot 3 D2 → Lot 5) : spin_wheel et review_gate sont désormais
 * RÉELS (Lot 5 — roue + review gate branchés). can_spin passe par
 * computeSpinAvailability (source unique D1). place_id = RIALTO_PLACE_ID
 * (D3, zéro table businesses). `lottery` RESTE null (lot ultérieur) :
 * aucune lecture des tables lotteries / lottery_participants.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const phoneRaw = url.searchParams.get("phone")?.trim();
  if (!phoneRaw) {
    return NextResponse.json({ error: "phone requis" }, { status: 400 });
  }
  // Normalise en E.164 pour matcher quelle que soit la façon de saisir
  const phone = normalizePhone(phoneRaw) ?? phoneRaw;

  const admin = supabaseService();

  // 1) Lookup carte client pour le programme Rialto
  const { data: cards } = await admin
    .from("customer_cards")
    .select(
      "id, customer_id, current_stamps, rewards_claimed, qr_code_value, short_code, customers!inner (id, first_name, last_name, phone, email)",
    )
    .eq("card_id", CARD_ID)
    .eq("customers.phone", phone)
    .limit(1);

  const card = Array.isArray(cards) && cards.length > 0 ? cards[0] : null;

  // Seuil (stamps_required)
  const { data: loyalty } = await admin
    .from("loyalty_cards")
    .select("stamps_required, reward_description, card_name")
    .eq("id", CARD_ID)
    .single();

  // 2) Spin wheel
  const { data: wheel } = await admin
    .from("spin_wheels")
    .select("id, segments, frequency, is_active, require_google_review")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();

  const { data: wheelRewards } = await admin
    .from("spin_rewards")
    .select("id, label, probability, color")
    .eq("wheel_id", SPIN_WHEEL_ID);

  // can_spin via computeSpinAvailability (D1 — source unique, PAS le calcul
  // legacy inline). last_reward = reward_won de la dernière spin.
  let canSpin = false;
  let lastSpinReward: string | null = null;
  if (wheel?.is_active && phone) {
    const { data: entry } = await admin
      .from("spin_entries")
      .select("last_spin_at, reward_won")
      .eq("wheel_id", SPIN_WHEEL_ID)
      .eq("phone", phone)
      .order("last_spin_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastSpinReward = (entry?.reward_won as string | null) ?? null;

    const availability = await computeSpinAvailability({
      wheelId: SPIN_WHEEL_ID,
      phone,
      customerId: card ? (card.customer_id as string) : null,
    });
    canSpin = availability.can_spin;
  }

  // 2b) Review gate : place_id (D3 — constante, zéro table businesses) +
  // claim actif pour ce customer.
  let activeClaim: { id: string; expires_at: string } | null = null;
  if (card) {
    const { data: claim } = await admin
      .from("google_review_claims")
      .select("id, expires_at")
      .eq("customer_id", card.customer_id)
      .eq("business_id", BUSINESS_ID)
      .gt("expires_at", new Date().toISOString())
      .order("claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (claim) {
      activeClaim = {
        id: claim.id as string,
        expires_at: claim.expires_at as string,
      };
    }
  }

  // 3) 10 dernières commandes Rialto
  const { data: orders } = card
    ? await admin
        .from("orders")
        .select("id, order_number, status, total_amount, created_at")
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("customer_id", card.customer_id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  return NextResponse.json({
    customer: card
      ? {
          id: card.customer_id,
          first_name: (card.customers as unknown as { first_name: string })
            .first_name,
          last_name: (card.customers as unknown as { last_name: string })
            .last_name,
          phone: (card.customers as unknown as { phone: string }).phone,
          email: (card.customers as unknown as { email: string | null }).email,
        }
      : null,
    card: card
      ? {
          id: card.id,
          current_stamps: card.current_stamps,
          stamps_required: loyalty?.stamps_required ?? 10,
          reward_description:
            loyalty?.reward_description ?? "Une pizza offerte",
          card_name: loyalty?.card_name ?? "Rialto Club",
          qr_code_value: card.qr_code_value,
          rewards_claimed: card.rewards_claimed,
          short_code: (card as { short_code?: string | null }).short_code ?? null,
        }
      : null,
    spin_wheel: wheel
      ? {
          id: wheel.id,
          is_active: wheel.is_active,
          frequency: wheel.frequency,
          segments: wheel.segments ?? [],
          rewards: wheelRewards ?? [],
          can_spin: canSpin,
          last_reward: lastSpinReward,
          require_google_review: !!wheel.require_google_review,
        }
      : null,
    lottery: null,
    orders: orders ?? [],
    review_gate: {
      place_id: RIALTO_PLACE_ID,
      active_claim: activeClaim,
    },
  });
}
