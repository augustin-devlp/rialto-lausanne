import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { isScanConfigured, requireScanAuth } from "@/lib/scanAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/scan/card?qr=<texte scanné>  OU  ?short_code=<8 chars>
 *
 * Lookup d'une carte client pour le scanner de comptoir. Auth par cookie
 * de session scan (sinon 401). Utilise la service key (fail-fast si absente
 * pour ne JAMAIS retomber silencieusement sur la clé anon).
 *
 * Réponse succès :
 *   { ok:true, card:{ id, current_stamps, current_points, rewards_claimed,
 *     first_name, last_name, card_name, stamps_required, reward_description },
 *     promo:{ multiplier, title } | null }
 */

interface CustomerRel {
  first_name: string | null;
  last_name: string | null;
}
interface CardRel {
  id: string;
  card_name: string | null;
  card_type: string | null;
  stamps_required: number | null;
  reward_description: string | null;
}
interface CustomerCardRow {
  id: string;
  current_stamps: number | null;
  current_points: number | null;
  rewards_claimed: number | null;
  customer: CustomerRel | CustomerRel[] | null;
  card: CardRel | CardRel[] | null;
}

function one<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

export async function GET(req: NextRequest) {
  if (!isScanConfigured()) {
    return NextResponse.json(
      { ok: false, error: "scan_not_configured" },
      { status: 500 },
    );
  }
  if (!requireScanAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "service_key_missing" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const qr = url.searchParams.get("qr")?.trim() ?? "";
  const shortCodeRaw = url.searchParams.get("short_code")?.trim() ?? "";
  const shortCode = shortCodeRaw.toUpperCase();

  const byQr = qr.length > 0;
  const byShort = !byQr && shortCode.length === 8;

  if (!byQr && !byShort) {
    return NextResponse.json(
      { ok: false, error: "qr ou short_code requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();

  const select = `id, current_stamps, current_points, rewards_claimed,
     customer:customer_id (first_name, last_name),
     card:card_id (id, card_name, card_type, stamps_required, reward_description)`;

  const query = admin.from("customer_cards").select(select);
  const { data } = byQr
    ? await query.eq("qr_code_value", qr).maybeSingle()
    : await query.eq("short_code", shortCode).maybeSingle();

  if (!data) {
    // Messages VERBATIM : QR non reconnu (ScanPage L61) vs carte introuvable.
    return byQr
      ? NextResponse.json(
          { ok: false, error: "QR code non reconnu. Veuillez réessayer." },
          { status: 404 },
        )
      : NextResponse.json(
          { ok: false, error: "Carte introuvable" },
          { status: 404 },
        );
  }

  const row = data as unknown as CustomerCardRow;
  const customer = one(row.customer);
  const card = one(row.card);

  // Promo active éventuelle sur cette carte.
  let promo: { multiplier: number; title: string | null } | null = null;
  if (card?.id) {
    const nowIso = new Date().toISOString();
    const { data: promoData } = await admin
      .from("promotions")
      .select("multiplier, title")
      .eq("card_id", card.id)
      .eq("is_active", true)
      .lte("start_date", nowIso)
      .gte("end_date", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (promoData) {
      promo = promoData as { multiplier: number; title: string | null };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      card: {
        id: row.id,
        current_stamps: row.current_stamps ?? 0,
        current_points: row.current_points ?? 0,
        rewards_claimed: row.rewards_claimed ?? 0,
        first_name: customer?.first_name ?? "",
        last_name: customer?.last_name ?? "",
        card_name: card?.card_name ?? "",
        stamps_required: card?.stamps_required ?? 10,
        reward_description: card?.reward_description ?? "",
      },
      promo,
    },
    { status: 200 },
  );
}
