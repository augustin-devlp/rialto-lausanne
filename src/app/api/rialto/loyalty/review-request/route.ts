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
  seen_review_ids: string[] | null;
  claim_id: string | null;
};

const REQUETE_COLS =
  "id, customer_id, google_name, status, created_at, last_checked_at, check_count, seen_review_ids, claim_id";

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
    .select(REQUETE_COLS)
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

  // Throttle POSÉ AVANT l'appel provider, par update CONDITIONNEL : deux
  // GET quasi simultanés (interval 90 s + visibilitychange) ne doivent
  // faire qu'UN appel Google — le perdant du conditionnel s'arrête là
  // (relecture 14.08 : le throttle après-coup laissait passer les deux).
  const seuilThrottle = new Date(
    Date.now() - RECHECK_MIN_INTERVAL_MS,
  ).toISOString();
  let porte = sb
    .from("review_verification_requests")
    .update({
      last_checked_at: new Date().toISOString(),
      check_count: requete.check_count + 1,
    })
    .eq("id", requete.id)
    .eq("status", "pending");
  if (requete.last_checked_at) {
    porte = porte.lt("last_checked_at", seuilThrottle);
  }
  const { data: verrou } = await porte.select("id").maybeSingle();
  if (!verrou) return requete; // throttlé (ou statut changé sous nos pieds)

  const provider = reviewProvider();
  if (!provider) return requete;

  let match = null;
  try {
    const avis = await provider.listRecentReviews();
    match = matchReview(
      avis,
      requete.google_name,
      requete.created_at,
      requete.seen_review_ids,
    );
  } catch (err) {
    console.warn("[review-gate] provider en échec, re-check plus tard", err);
    return { ...requete, check_count: requete.check_count + 1 };
  }

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
      // Cet avis a DÉJÀ débloqué une roue (« 1 avis = 1 roue max »).
      // Re-checker en boucle re-sélectionnerait le MÊME avis jusqu'à
      // expiration en brûlant du quota (relecture 14.08) : on route vers
      // la voie MANUELLE — le restaurateur tranche, les checks
      // s'arrêtent. C'est aussi l'issue de la victime d'un vol d'avis.
      console.warn(
        "[review-gate] avis déjà consommé → voie manuelle",
        requete.id,
        match.id,
      );
      const { data: manuel } = await sb
        .from("review_verification_requests")
        .update({ status: "manual_pending" })
        .eq("id", requete.id)
        .eq("status", "pending")
        .select(REQUETE_COLS)
        .maybeSingle();
      return (
        (manuel as RequeteRow) ?? { ...requete, status: "manual_pending" }
      );
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
  // `mode` dans chaque réponse : si les env serveur et UI divergent un
  // jour, le diagnostic se lit dans le payload au lieu d'un 503 muet.
  if (!requete) {
    return NextResponse.json({
      ok: true,
      mode: reviewGateMode(),
      request: null,
    });
  }
  return NextResponse.json({
    ok: true,
    mode: reviewGateMode(),
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

    // Une requête VIVANTE à la fois : pending/manual_pending → renvoyée.
    if (row && ["pending", "manual_pending"].includes(row.status)) {
      return publie(
        row.status === "pending" ? await tenteVerification(sb, row) : row,
      );
    }

    // verified/manual_approved : bloquant SEULEMENT tant que le claim lié
    // est valide — claim expiré (le client retombe en état B au cycle de
    // roue suivant) = NOUVELLE déclaration possible. Le blocage à vie
    // était un cul-de-sac irrécupérable (bloquant relecteur 14.08), et
    // asymétrique : la voie manuelle se renouvelait, la voie API non.
    if (
      row &&
      ["verified", "manual_approved"].includes(row.status) &&
      row.claim_id
    ) {
      const { data: claim } = await sb
        .from("google_review_claims")
        .select("expires_at")
        .eq("id", row.claim_id)
        .maybeSingle();
      if (
        claim &&
        new Date(claim.expires_at as string).getTime() > Date.now()
      ) {
        return publie(row);
      }
    }

    // ANTI-VOL (relecture 14.08) : snapshot des reviewId DÉJÀ publics au
    // moment de la déclaration — jamais matchables ensuite (le nom d'un
    // avis public n'est un secret pour personne). Best-effort : provider
    // injoignable → null → le matching applique la tolérance réduite.
    let seen: string[] | null = null;
    const provider = reviewProvider();
    if (provider) {
      try {
        seen = (await provider.listRecentReviews()).map((r) => r.id);
      } catch {
        seen = null;
      }
    }

    const { data: cree, error } = await sb
      .from("review_verification_requests")
      .insert({
        customer_id: customerId,
        business_id: BUSINESS_ID,
        google_name: googleName,
        seen_review_ids: seen,
      })
      .select(REQUETE_COLS)
      .single();
    if (error) {
      if (tableAbsente(error)) return indisponible("rv1_non_executee");
      if (error.code === "23505") {
        // Course de deux POST simultanés : l'index unique partiel (RV1) a
        // tranché — on renvoie la requête gagnante.
        const { row: existante } = await derniereRequete(sb, customerId);
        return publie(existante);
      }
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
