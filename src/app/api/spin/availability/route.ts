import { NextRequest, NextResponse } from "next/server";
import { computeSpinAvailability } from "@/lib/spinAvailability";
import { SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

/**
 * GET /api/spin/availability?customer_id=X&phone=Y&wheel_id=Z
 *
 * Wrapper mince sur computeSpinAvailability (source de vérité unique, D1).
 * `business_id` est accepté mais ignoré (D3 — Place ID / business unifiés
 * par constante côté serveur).
 *
 * Retourne :
 *   {
 *     state, can_spin, config_mode, message,
 *     last_prize, wait_info, frequency_days, allowed_weekdays,
 *     require_google_review
 *   }
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id");
  const phoneArg = url.searchParams.get("phone");
  const wheelId = url.searchParams.get("wheel_id") ?? SPIN_WHEEL_ID;

  if (!customerId && !phoneArg) {
    return NextResponse.json(
      { error: "customer_id ou phone requis" },
      { status: 400 },
    );
  }

  const availability = await computeSpinAvailability({
    wheelId,
    phone: phoneArg,
    customerId,
  });

  return NextResponse.json(availability);
}
