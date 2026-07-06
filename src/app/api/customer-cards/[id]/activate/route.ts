import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { calculateAgeRange } from "@/lib/age";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer-cards/[id]/activate
 * Body : { date_of_birth: 'YYYY-MM-DD', gender?: 'H'|'F'|'Autre'|'Non precise' }
 *
 * Complète l'activation d'une carte fidélité en enregistrant la date
 * d'anniversaire + tranche d'âge calculée + genre.
 *
 * Set customer_cards.is_fully_activated = true.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json().catch(() => null)) as {
    date_of_birth?: string;
    gender?: string;
  } | null;

  if (!body?.date_of_birth) {
    return NextResponse.json(
      { error: "date_of_birth requis" },
      { status: 400 },
    );
  }

  const ageRange = calculateAgeRange(body.date_of_birth);
  if (!ageRange) {
    return NextResponse.json(
      { error: "invalid_date_of_birth_or_underage" },
      { status: 400 },
    );
  }

  const validGenders = ["H", "F", "Autre", "Non precise"];
  const gender =
    body.gender && validGenders.includes(body.gender)
      ? body.gender
      : "Non precise";

  const admin = supabaseService();

  const { data: card } = await admin
    .from("customer_cards")
    .select("id, customer_id, short_code")
    .eq("id", params.id)
    .maybeSingle();

  if (!card) {
    return NextResponse.json(
      { error: "card_not_found" },
      { status: 404 },
    );
  }

  const { error: custErr } = await admin
    .from("customers")
    .update({
      date_of_birth: body.date_of_birth,
      age_range: ageRange,
      gender,
      activated_at: new Date().toISOString(),
    })
    .eq("id", card.customer_id);

  if (custErr) {
    console.error("[card/activate] customer update failed", custErr);
    return NextResponse.json(
      { error: "update_failed", detail: custErr.message },
      { status: 500 },
    );
  }

  const { error: cardErr } = await admin
    .from("customer_cards")
    .update({ is_fully_activated: true })
    .eq("id", params.id);

  if (cardErr) {
    return NextResponse.json(
      { error: "card_update_failed", detail: cardErr.message },
      { status: 500 },
    );
  }

  console.log("[card/activate] ✅ SUCCESS", {
    card_id: params.id,
    age_range: ageRange,
    short_code: card.short_code,
  });

  return NextResponse.json({
    ok: true,
    age_range: ageRange,
    short_code: card.short_code,
  });
}
