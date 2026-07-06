import { NextRequest, NextResponse } from "next/server";
import { lookupCardByShortCode } from "@/lib/loyaltyCards";

export const dynamic = "force-dynamic";

/**
 * GET /api/loyalty-cards/lookup?short_code=XXXXXXXX
 *
 * Endpoint public : récupère les infos publiques d'une carte fidélité à
 * partir de son short_code (pas d'email, pas d'adresse).
 *
 * Wrapper mince sur lookupCardByShortCode() (@/lib/loyaltyCards).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const shortCode = url.searchParams.get("short_code")?.trim().toUpperCase();

  if (!shortCode || shortCode.length !== 8) {
    return NextResponse.json(
      { error: "short_code (8 chars) requis" },
      { status: 400 },
    );
  }

  const card = await lookupCardByShortCode(shortCode);

  if (!card) {
    return NextResponse.json({ error: "Carte introuvable" }, { status: 404 });
  }

  return NextResponse.json({ card });
}
