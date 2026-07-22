import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  CARD_ID,
  BUSINESS_ID,
  SPIN_WHEEL_ID,
  LOTTERY_ID,
  RIALTO_PLACE_ID,
} from "@/lib/loyaltyConstants";
import { normalizePhone } from "@/lib/phone";
import { computeSpinAvailability } from "@/lib/spinAvailability";
import { zurichMonthStart } from "@/lib/lotteryDraw";
import { toStampRule } from "@/lib/loyalty/rule";
import { formatStampRule } from "@/lib/loyalty/copy";
import {
  computePending,
  EMPTY_PENDING,
  type PendingOrder,
} from "@/lib/loyalty/pending";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/loyalty/lookup?phone=+41...
 * Retourne la carte fidélité + roue + review_gate + orders pour ce téléphone.
 * Réponse 200 avec customer: null si aucune carte n'existe encore.
 *
 * ⚠️ Portage (Lot 3 D2 → Lot 5 → Lot 6) : spin_wheel et review_gate sont
 * RÉELS (Lot 5 — roue + review gate branchés). can_spin passe par
 * computeSpinAvailability (source unique D1). place_id = RIALTO_PLACE_ID
 * (D3, zéro table businesses). `lottery` est RÉEL (Lot 6) : lecture de
 * lotteries + lottery_participants (already_entered). Divergence de shape
 * assumée vs /api/lottery/current : ce bloc N'inclut PAS prize_description.
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

  // Seuil (stamps_required) + barème de fidélité (F0/M1, lu par F2).
  const { data: loyalty } = await admin
    .from("loyalty_cards")
    .select(
      "stamps_required, reward_description, card_name, stamp_credit_mode, stamp_amount_step, stamp_amount_basis, stamp_max_per_order, stamp_online_enabled",
    )
    .eq("id", CARD_ID)
    .single();

  const stampRule = toStampRule(loyalty as Record<string, unknown> | null);

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

  // 3) Loterie
  const { data: lottery } = await admin
    .from("lotteries")
    .select(
      "id, title, reward_description, draw_date, start_date, end_date, is_active, is_permanent, max_winners, require_google_review",
    )
    .eq("id", LOTTERY_ID)
    .maybeSingle();

  let alreadyEntered = false;
  if (lottery && card) {
    // Design 3 (21.07.2026) : la participation vaut pour le MOIS courant —
    // sans ce filtre, un participant d'un mois précédent serait bloqué de
    // l'opt-in du mois. Repli sans mois tant que la migration L1 (navette)
    // n'est pas exécutée (42703 = colonne inconnue).
    let { data: existing, error: aeErr } = await admin
      .from("lottery_participants")
      .select("id")
      .eq("lottery_id", LOTTERY_ID)
      .eq("phone", phone)
      .eq("month", zurichMonthStart())
      .maybeSingle();
    if (aeErr && aeErr.code === "42703") {
      ({ data: existing } = await admin
        .from("lottery_participants")
        .select("id")
        .eq("lottery_id", LOTTERY_ID)
        .eq("phone", phone)
        .maybeSingle());
    }
    alreadyEntered = !!existing;
  }

  // 4) 10 dernières commandes Rialto
  //    delivery_fee ajouté à la projection pour le calcul du pending (F2) :
  //    ZÉRO requête supplémentaire. Le filtre .eq("customer_id", ...) garantit
  //    structurellement la règle « pas de customer_id = aucun pending ».
  const { data: orders } = card
    ? await admin
        .from("orders")
        .select(
          "id, order_number, status, total_amount, delivery_fee, customer_id, created_at",
        )
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("customer_id", card.customer_id)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };

  // Tampons EN ATTENTE — état DÉRIVÉ, jamais écrit (F2). Objet SÉPARÉ de
  // `card` : la forme de l'API interdit mécaniquement current_stamps + pending.
  const pending = computePending(
    (orders ?? []) as unknown as PendingOrder[],
    stampRule,
  );

  // Palier calculé SERVEUR à partir du seul solde SOLIDIFIÉ : le client ne
  // compare plus jamais rien à stamps_required, et un pending ne peut pas
  // rendre reward_available vrai.
  const stampsRequired = loyalty?.stamps_required ?? 10;
  const acquis = card ? Number(card.current_stamps ?? 0) : 0;
  const rewardAvailable = card ? acquis >= stampsRequired : false;

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
          stamps_required: stampsRequired,
          // Calculés serveur sur le SOLIDIFIÉ uniquement (F2).
          reward_available: rewardAvailable,
          stamps_remaining: Math.max(0, stampsRequired - acquis),
          reward_description:
            loyalty?.reward_description ?? "Une pizza offerte",
          card_name: loyalty?.card_name ?? "Rialto Club",
          qr_code_value: card.qr_code_value,
          rewards_claimed: card.rewards_claimed,
          short_code: (card as { short_code?: string | null }).short_code ?? null,
        }
      : null,
    // Univers TYPÉ distinct de `card` — jamais un entier frère de current_stamps.
    pending: card ? pending : EMPTY_PENDING,
    stamps_rule: {
      mode: stampRule.mode,
      step: stampRule.step,
      basis: stampRule.basis,
      max_per_order: stampRule.maxPerOrder,
      enabled: stampRule.enabled,
      label: formatStampRule(stampRule),
    },
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
    lottery: lottery
      ? {
          id: lottery.id,
          title: lottery.title,
          reward_description: lottery.reward_description,
          draw_date: lottery.draw_date,
          start_date: lottery.start_date,
          end_date: lottery.end_date,
          is_active: lottery.is_active,
          is_permanent: lottery.is_permanent,
          already_entered: alreadyEntered,
          require_google_review: !!(lottery as { require_google_review?: boolean }).require_google_review,
        }
      : null,
    orders: orders ?? [],
    review_gate: {
      place_id: RIALTO_PLACE_ID,
      active_claim: activeClaim,
    },
  });
}
