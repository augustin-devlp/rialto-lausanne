import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/loyalty/lookup?phone=+41...
 * Retourne la carte fidélité + orders pour ce téléphone.
 * Réponse 200 avec customer: null si aucune carte n'existe encore.
 *
 * ⚠️ Portage CŒUR-ONLY (décision D2) : les champs spin_wheel / lottery /
 * review_gate sont PRÉSENTS dans le JSON (parité de forme avec Stampify)
 * mais figés à null. Aucune lecture des tables spin_*, lotteries,
 * lottery_participants, google_review_claims, businesses.
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

  // 2) 10 dernières commandes Rialto
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
    spin_wheel: null,
    lottery: null,
    orders: orders ?? [],
    review_gate: {
      place_id: null,
      active_claim: null,
    },
  });
}
