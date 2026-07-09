import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/loyalty/verify-review-degraded
 * Body: { customer_id, opened_at (ms timestamp) }
 *
 * TODO HACK TEMPORAIRE — jusqu'à configuration de GOOGLE_PLACES_API_KEY.
 *
 * Le flow normal de vérification d'avis Google (voir verify-review/route.ts)
 * appelle l'API Google Places pour détecter un avis récent. En attendant
 * d'avoir la clé API, on utilise une vérif côté client "honor-based" :
 *   1. Le user clique "Laisser un avis" → ouvre search.google.com/.../writereview
 *   2. On stocke opened_at en localStorage
 *   3. Après 60s, le bouton "J'ai laissé mon avis" devient actif
 *   4. Au clic, on appelle cet endpoint avec opened_at
 *   5. Le serveur vérifie que opened_at > now - 15min (pour éviter replay
 *      d'un vieux timestamp) et crée un claim avec is_degraded_mode=true
 *
 * Sécurité : pas de vraie protection anti-fraude, c'est le but d'un hack.
 * À remplacer par verify-review quand la clé Google sera configurée.
 */
function frequencyToMs(f?: string | null): number {
  switch (f) {
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "monthly":
      return 30 * 24 * 60 * 60 * 1000;
    case "once":
      return Number.MAX_SAFE_INTEGER;
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    customer_id?: string;
    opened_at?: number;
  } | null;

  if (!body?.customer_id || typeof body.opened_at !== "number") {
    return NextResponse.json(
      { ok: false, error: "customer_id et opened_at requis" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const elapsed = now - body.opened_at;
  const MIN_WAIT = 60 * 1000; // 60s
  const MAX_WAIT = 15 * 60 * 1000; // 15 min (anti-replay)

  if (elapsed < MIN_WAIT) {
    return NextResponse.json({
      ok: false,
      reason: "too_soon",
      wait_remaining_ms: MIN_WAIT - elapsed,
    });
  }
  if (elapsed > MAX_WAIT) {
    return NextResponse.json({
      ok: false,
      reason: "expired_intent",
      user_message:
        "Temps écoulé. Rouvrez Google et réessayez la vérification.",
    });
  }

  const admin = supabaseService();

  // Check claim actif existant
  const nowIso = new Date(now).toISOString();
  const { data: existing } = await admin
    .from("google_review_claims")
    .select("id, claimed_at, expires_at")
    .eq("customer_id", body.customer_id)
    .eq("business_id", BUSINESS_ID)
    .gt("expires_at", nowIso)
    .order("claimed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      claim: existing,
      reason: "existing-claim",
    });
  }

  // Récupère la frequency de la roue pour déterminer expires_at
  const { data: wheel } = await admin
    .from("spin_wheels")
    .select("frequency, frequency_days")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();

  // Si frequency_days défini (nouveau schéma), on l'utilise ; sinon fallback
  // sur l'ancien champ frequency text.
  const ms = wheel?.frequency_days
    ? Number(wheel.frequency_days) * 24 * 60 * 60 * 1000
    : frequencyToMs(wheel?.frequency as string | undefined);
  const expiresAt = new Date(
    now + Math.min(ms, 365 * 24 * 60 * 60 * 1000),
  ).toISOString();

  // Insert claim en mode dégradé. On utilise un author placeholder car on
  // n'a pas accès à l'info Google. L'unique constraint (business_id,
  // review_author_name, review_time) est satisfaite car on génère un
  // review_time unique (= opened_at) par claim.
  const { data: inserted, error } = await admin
    .from("google_review_claims")
    .insert({
      customer_id: body.customer_id,
      business_id: BUSINESS_ID,
      review_author_name: `degraded-${body.customer_id.slice(0, 8)}`,
      review_time: new Date(body.opened_at).toISOString(),
      expires_at: expiresAt,
      is_degraded_mode: true,
    })
    .select("id, claimed_at, expires_at")
    .single();

  if (error) {
    console.error("[verify-review-degraded] insert failed", error);
    return NextResponse.json(
      { ok: false, error: "Erreur serveur" },
      { status: 500 },
    );
  }

  console.log("[verify-review-degraded] ✅ claim created in degraded mode", {
    customer_id: body.customer_id,
    claim_id: inserted.id,
    elapsed_s: Math.round(elapsed / 1000),
  });

  return NextResponse.json({
    ok: true,
    claim: inserted,
    reason: "new-claim",
    mode: "degraded",
  });
}
