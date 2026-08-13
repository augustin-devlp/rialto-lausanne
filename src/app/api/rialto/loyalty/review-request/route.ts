import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";
import { reviewGateMode, reviewProvider } from "@/lib/reviews";
import {
  matchReview,
  RECHECK_MIN_INTERVAL_MS,
  REQUEST_EXPIRY_MS,
} from "@/lib/reviews/verify";

export const dynamic = "force-dynamic";

/**
 * Gate avis roue — vérification RÉELLE (14.08.2026).
 *
 * POST { customer_id, google_name }        → déclare « mon nom Google »
 * POST { customer_id, flag_manual: true }  → « mon avis n'apparaît pas »
 * GET  ?customer_id=…                      → statut + RE-CHECK auto
 *
 * Le re-check est du settle-on-read (pattern maison) : chaque lecture
 * re-tente le matching si le dernier essai date de plus de 2 min — pas de
 * cron, pas de file. Un match crée le claim google_review_claims
 * (is_degraded_mode=false) : la roue se débloque par le flux EXISTANT,
 * spin/route.ts inchangé. « 1 avis = 1 roue max » = contrainte UNIQUE
 * existante du claim (un avis déjà consommé re-matché → 23505, traité).
 *
 * En mode 'declarative' (ACTIF aujourd'hui) : 503 — le flux honor-based
 * verify-review-degraded reste la voie. Table RV1 absente (navette en
 * cours) : 503 aussi. GARDE-FOUS : on demande UN avis, jamais un avis
 * positif ; « chance de gagner » côté UI.
 */

type RequeteRow = {
  id: string;
  customer_id: string;
  google_name: string;
  status: string;
  created_at: string;
  last_checked_at: string | null;
  check_count: number;
  claim_id: string | null;
};

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

function indisponible(raison: string) {
  return NextResponse.json(
    { ok: false, error: raison },
    { status: 503 },
  );
}

/** 42P01 = table absente (migration RV1 en navette, pas encore exécutée). */
function tableAbsente(err: { code?: string } | null): boolean {
  return err?.code === "42P01";
}

async function derniereRequete(
  sb: ReturnType<typeof supabaseService>,
  customerId: string,
): Promise<{ row: RequeteRow | null; absent: boolean }> {
  const { data, error } = await sb
    .from("review_verification_requests")
    .select(
      "id, customer_id, google_name, status, created_at, last_checked_at, check_count, claim_id",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (tableAbsente(error)) return { row: null, absent: true };
    throw error;
  }
  return { row: (data as RequeteRow) ?? null, absent: false };
}

/**
 * Tente le matching pour une requête pending. Retourne la requête à jour.
 * Les échecs PROVIDER laissent la requête intacte (re-check suivant).
 */
async function tenteVerification(
  sb: ReturnType<typeof supabaseService>,
  requete: RequeteRow,
): Promise<RequeteRow> {
  // Expiration de la fenêtre de re-checks.
  if (
    Date.now() - new Date(requete.created_at).getTime() >
    REQUEST_EXPIRY_MS
  ) {
    const { data } = await sb
      .from("review_verification_requests")
      .update({ status: "expired" })
      .eq("id", requete.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    return (data as RequeteRow) ?? { ...requete, status: "expired" };
  }

  // Throttle : pas plus d'un appel API toutes les RECHECK_MIN_INTERVAL_MS.
  if (
    requete.last_checked_at &&
    Date.now() - new Date(requete.last_checked_at).getTime() <
      RECHECK_MIN_INTERVAL_MS
  ) {
    return requete;
  }

  const provider = reviewProvider();
  if (!provider) return requete;

  let match = null;
  try {
    const avis = await provider.listRecentReviews();
    match = matchReview(avis, requete.google_name, requete.created_at);
  } catch (err) {
    console.warn("[review-gate] provider en échec, re-check plus tard", err);
    return requete;
  }

  // Trace du check, match ou pas.
  await sb
    .from("review_verification_requests")
    .update({
      last_checked_at: new Date().toISOString(),
      check_count: requete.check_count + 1,
    })
    .eq("id", requete.id);

  if (!match) return { ...requete, check_count: requete.check_count + 1 };

  // Match → claim (déblocage roue par le flux existant). Durée alignée
  // sur la fréquence de la roue (pattern verify-review-degraded).
  const { data: wheel } = await sb
    .from("spin_wheels")
    .select("frequency, frequency_days")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();
  const ms = wheel?.frequency_days
    ? Number(wheel.frequency_days) * 24 * 60 * 60 * 1000
    : frequencyToMs(wheel?.frequency as string | undefined);
  const expiresAt = new Date(
    Date.now() + Math.min(ms, 365 * 24 * 60 * 60 * 1000),
  ).toISOString();

  const { data: claim, error: claimErr } = await sb
    .from("google_review_claims")
    .insert({
      customer_id: requete.customer_id,
      business_id: BUSINESS_ID,
      review_author_name: match.authorName,
      review_time: match.publishedAt,
      expires_at: expiresAt,
      is_degraded_mode: false,
    })
    .select("id")
    .single();

  if (claimErr) {
    if (claimErr.code === "23505") {
      // Cet avis a DÉJÀ débloqué une roue (« 1 avis = 1 roue max ») —
      // on ne vérifie pas, la voie manuelle reste ouverte.
      console.warn(
        "[review-gate] avis déjà consommé par un claim",
        requete.id,
        match.id,
      );
      return { ...requete, check_count: requete.check_count + 1 };
    }
    console.error("[review-gate] insert claim échoué", claimErr);
    return { ...requete, check_count: requete.check_count + 1 };
  }

  const { data: verifie } = await sb
    .from("review_verification_requests")
    .update({
      status: "verified",
      matched_review_time: match.publishedAt,
      claim_id: claim.id as string,
    })
    .eq("id", requete.id)
    .select("*")
    .maybeSingle();

  console.log("[review-gate] ✅ avis vérifié via API", {
    requete: requete.id,
    claim: claim.id,
  });
  return (verifie as RequeteRow) ?? { ...requete, status: "verified" };
}

function publie(requete: RequeteRow | null) {
  if (!requete) return NextResponse.json({ ok: true, request: null });
  return NextResponse.json({
    ok: true,
    request: {
      id: requete.id,
      status: requete.status,
      google_name: requete.google_name,
      created_at: requete.created_at,
      check_count: requete.check_count,
    },
  });
}

export async function GET(req: NextRequest) {
  if (reviewGateMode() === "declarative") {
    return indisponible("mode_declaratif_actif");
  }
  const customerId = new URL(req.url).searchParams
    .get("customer_id")
    ?.trim();
  if (!customerId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sb = supabaseService();
  try {
    const { row, absent } = await derniereRequete(sb, customerId);
    if (absent) return indisponible("rv1_non_executee");
    if (!row || row.status !== "pending") return publie(row);
    return publie(await tenteVerification(sb, row));
  } catch (err) {
    console.error("[review-gate] GET échoué", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (reviewGateMode() === "declarative") {
    return indisponible("mode_declaratif_actif");
  }
  const body = (await req.json().catch(() => null)) as {
    customer_id?: string;
    google_name?: string;
    flag_manual?: boolean;
  } | null;
  const customerId = body?.customer_id?.trim();
  if (!customerId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sb = supabaseService();
  try {
    const { row, absent } = await derniereRequete(sb, customerId);
    if (absent) return indisponible("rv1_non_executee");

    // « Mon avis n'apparaît pas » → file de validation manuelle dashboard.
    if (body?.flag_manual) {
      if (!row || (row.status !== "pending" && row.status !== "expired")) {
        return publie(row);
      }
      const { data } = await sb
        .from("review_verification_requests")
        .update({ status: "manual_pending" })
        .eq("id", row.id)
        .select("*")
        .maybeSingle();
      return publie((data as RequeteRow) ?? row);
    }

    const googleName = body?.google_name?.trim();
    if (!googleName || googleName.length < 2 || googleName.length > 120) {
      return NextResponse.json(
        { ok: false, error: "nom_invalide" },
        { status: 400 },
      );
    }

    // Une requête vivante à la fois : pending/manual → renvoyée telle
    // quelle ; verified → déjà débloqué. Un nouveau nom remplace une
    // requête expirée uniquement.
    if (row && ["pending", "manual_pending", "verified"].includes(row.status)) {
      return publie(
        row.status === "pending" ? await tenteVerification(sb, row) : row,
      );
    }

    const { data: cree, error } = await sb
      .from("review_verification_requests")
      .insert({
        customer_id: customerId,
        business_id: BUSINESS_ID,
        google_name: googleName,
      })
      .select(
        "id, customer_id, google_name, status, created_at, last_checked_at, check_count, claim_id",
      )
      .single();
    if (error) {
      if (tableAbsente(error)) return indisponible("rv1_non_executee");
      throw error;
    }

    // Premier check dans la foulée : le client qui a déjà posté voit
    // « débloqué » immédiatement.
    return publie(await tenteVerification(sb, cree as RequeteRow));
  } catch (err) {
    console.error("[review-gate] POST échoué", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
