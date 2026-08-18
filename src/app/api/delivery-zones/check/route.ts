import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery-zones/check?restaurant_id=X&postal_code=XXXX
 * Vérifie qu'un code postal est desservi par le restaurant.
 * Réponse : { covered: boolean, reason?: "po_box" | "not_covered", zone?: {...} }
 *
 * `reason: "po_box"` (chantier zones décision 8) : 1001 et 1002 Lausanne
 * sont des NPA de CASES POSTALES — aucune adresse de rue n'y existe. Les
 * refuser en « on ne livre pas » serait mensonger : le client habite bien
 * dans la zone, il a juste indiqué le NPA de sa boîte postale.
 */

/** NPA cases postales : jamais dans delivery_zones, refus dédié. */
const NPA_CASES_POSTALES = new Set(["1001", "1002"]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get("restaurant_id");
  const postalCode = url.searchParams.get("postal_code")?.trim();

  if (!restaurantId || !postalCode) {
    return NextResponse.json(
      { error: "restaurant_id et postal_code requis" },
      { status: 400 },
    );
  }

  if (NPA_CASES_POSTALES.has(postalCode)) {
    return NextResponse.json({ covered: false, reason: "po_box" });
  }

  const admin = supabaseService();
  const { data: zone } = await admin
    .from("delivery_zones")
    .select(
      "id, postal_code, city, delivery_fee, min_order_amount, estimated_delivery_minutes, is_active",
    )
    .eq("restaurant_id", restaurantId)
    .eq("postal_code", postalCode)
    .eq("is_active", true)
    .maybeSingle();

  if (!zone) {
    return NextResponse.json({ covered: false, reason: "not_covered" });
  }
  return NextResponse.json({ covered: true, zone });
}
