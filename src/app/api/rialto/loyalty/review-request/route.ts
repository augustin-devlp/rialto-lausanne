import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";
import { reviewGateMode, reviewProvider } from "@/lib/reviews";
import {
  matchReview,
  normalizeName,
  RECHECK_MIN_INTERVAL_MS,
  REQUEST_EXPIRY_MS,
  REVALIDATION_MATCH_SLACK_MS,
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
 * RENOUVELLEMENT (décision Augustin 15.08) : Google = UN avis par
 * personne et par fiche, À VIE — au cycle de roue suivant (claim
 * expiré), on RE-VALIDE que l'avis déjà vérifié existe toujours au lieu
 * d'exiger un avis neuf (tenteRevalidation). Avis supprimé → 'expired',
 * le gate repart de zéro.
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
  matched_review_time: string | null;
  claim_id: string | null;
};

const REQUETE_COLS =
  "id, customer_id, google_name, status, created_at, last_checked_at, check_count, seen_review_ids, matched_review_time, claim_id";

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

/** Durée de validité d'un claim, alignée sur la fréquence de la roue
 * (pattern verify-review-degraded), plafonnée à 365 j. */
async function expirationClaim(
  sb: ReturnType<typeof supabaseService>,
): Promise<string> {
  const { data: wheel } = await sb
    .from("spin_wheels")
    .select("frequency, frequency_days")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();
  const ms = wheel?.frequency_days
    ? Number(wheel.frequency_days) * 24 * 60 * 60 * 1000
    : frequencyToMs(wheel?.frequency as string | undefined);
  return new Date(
    Date.now() + Math.min(ms, 365 * 24 * 60 * 60 * 1000),
  ).toISOString();
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
  const expiresAt = await expirationClaim(sb);

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

type Revalidation = { requete: RequeteRow; claimActif: boolean };

/**
 * RE-VALIDATION (décision Augustin 15.08) : Google n'autorise qu'UN avis
 * par personne et par fiche, à vie — exiger un avis NEUF à chaque cycle
 * de roue serait un cul-de-sac structurel. Au cycle suivant (claim
 * expiré), on vérifie donc que l'avis DÉJÀ vérifié du client existe
 * TOUJOURS (pas supprimé) :
 *   - toujours en ligne → nouveau claim (review_time = now(), pattern du
 *     claim manuel : la contrainte UNIQUE des claims reste saine) ; le
 *     matched_review_time de la requête N'EST JAMAIS réécrit — c'est
 *     l'ancrage permanent des re-validations futures ;
 *   - suppression PROUVÉE → la requête passe 'expired', le gate repart
 *     de zéro (après suppression, Google AUTORISE un nouvel avis) ;
 *   - verdict NON CONCLUANT (couverture non prouvée, liste vide, échec
 *     provider, throttle) → AUCUNE écriture destructive, on réessaie au
 *     prochain passage. Relecture 15.08 : « absence dans une liste
 *     tronquée ≠ suppression » — seule listReviewsCovering (pagination
 *     avec preuve de couverture) peut fonder un « supprimé ».
 *
 * Ancrage STRICT : nom normalisé + createTime original (tolérance
 * REVALIDATION_MATCH_SLACK_MS) — un homonyme ne renouvelle pas le tour
 * d'un autre. Deux familles SANS renouvellement automatique :
 *   - manual_approved : pas d'ancrage API (review_time posé par
 *     l'humain) → claim expiré = 'expired', re-déclaration ou nouvelle
 *     validation manuelle ;
 *   - ancrage établi SANS snapshot (seen_review_ids null : provider
 *     injoignable à la déclaration, tolérance 10 min) : confiance
 *     insuffisante pour une rente automatique — un avis capté par un
 *     tiers dans cette fenêtre deviendrait un tour À VIE (relecture
 *     15.08). Claim expiré = 'expired', le vrai auteur passe par la
 *     voie manuelle, le fraudeur n'a plus rien à renouveler.
 *
 * Retourne aussi claimActif : l'UI ne doit annoncer « débloqué » que si
 * un claim VALIDE existe réellement (sinon boucle/cul-de-sac côté roue).
 */
async function tenteRevalidation(
  sb: ReturnType<typeof supabaseService>,
  requete: RequeteRow,
): Promise<Revalidation> {
  if (requete.claim_id) {
    const { data: claim } = await sb
      .from("google_review_claims")
      .select("expires_at")
      .eq("id", requete.claim_id)
      .maybeSingle();
    if (
      claim &&
      new Date(claim.expires_at as string).getTime() > Date.now()
    ) {
      return { requete, claimActif: true }; // rien à renouveler
    }
  }

  // Claim absent/expiré SANS ancrage renouvelable → retour au formulaire.
  if (
    requete.status !== "verified" ||
    !requete.matched_review_time ||
    requete.seen_review_ids === null
  ) {
    const { data } = await sb
      .from("review_verification_requests")
      .update({ status: "expired" })
      .eq("id", requete.id)
      .eq("status", requete.status)
      .select(REQUETE_COLS)
      .maybeSingle();
    return {
      requete: (data as RequeteRow) ?? { ...requete, status: "expired" },
      claimActif: false,
    };
  }

  // Throttle-first : même porte conditionnelle que tenteVerification.
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
    .eq("status", "verified");
  if (requete.last_checked_at) {
    porte = porte.lt("last_checked_at", seuilThrottle);
  }
  const { data: verrou } = await porte.select("id").maybeSingle();
  if (!verrou) return { requete, claimActif: false }; // throttlé

  const provider = reviewProvider();
  if (!provider) return { requete, claimActif: false };

  const cible = normalizeName(requete.google_name);
  const ancrage = new Date(requete.matched_review_time).getTime();
  let toujoursLa = null;
  let suppressionProuvee = false;
  try {
    const { avis, complete } = await provider.listReviewsCovering(
      ancrage - REVALIDATION_MATCH_SLACK_MS,
    );
    toujoursLa =
      avis.find(
        (r) =>
          normalizeName(r.authorName) === cible &&
          Math.abs(new Date(r.publishedAt).getTime() - ancrage) <
            REVALIDATION_MATCH_SLACK_MS,
      ) ?? null;
    // « Supprimé » exige une couverture PROUVÉE et une liste non vide
    // (une fiche subitement à zéro avis = anomalie, pas une preuve).
    suppressionProuvee = !toujoursLa && complete && avis.length > 0;
  } catch (err) {
    console.warn("[review-gate] provider en échec (re-validation)", err);
    return { requete, claimActif: false }; // re-tenté au prochain passage
  }

  if (!toujoursLa) {
    if (!suppressionProuvee) {
      console.warn(
        "[review-gate] re-validation non concluante, on réessaiera",
        requete.id,
      );
      return { requete, claimActif: false };
    }
    console.warn(
      "[review-gate] avis supprimé (couverture prouvée), gate remis à zéro",
      requete.id,
    );
    const { data } = await sb
      .from("review_verification_requests")
      .update({ status: "expired" })
      .eq("id", requete.id)
      .eq("status", "verified")
      .select(REQUETE_COLS)
      .maybeSingle();
    return {
      requete: (data as RequeteRow) ?? { ...requete, status: "expired" },
      claimActif: false,
    };
  }

  const expiresAt = await expirationClaim(sb);
  const { data: nouveau, error: claimErr } = await sb
    .from("google_review_claims")
    .insert({
      customer_id: requete.customer_id,
      business_id: BUSINESS_ID,
      review_author_name: toujoursLa.authorName,
      review_time: new Date().toISOString(),
      expires_at: expiresAt,
      is_degraded_mode: false,
    })
    .select("id")
    .single();
  if (claimErr || !nouveau) {
    console.error("[review-gate] claim de renouvellement échoué", claimErr);
    return { requete, claimActif: false }; // transitoire — re-tenté
  }

  const { data: renouvele } = await sb
    .from("review_verification_requests")
    .update({ claim_id: nouveau.id as string })
    .eq("id", requete.id)
    .select(REQUETE_COLS)
    .maybeSingle();

  console.log("[review-gate] 🔄 claim renouvelé (avis toujours en ligne)", {
    requete: requete.id,
    claim: nouveau.id,
  });
  return {
    requete: (renouvele as RequeteRow) ?? requete,
    claimActif: true,
  };
}

function publie(requete: RequeteRow | null, claimActif?: boolean) {
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
      // Pour verified/manual_approved UNIQUEMENT : un claim VALIDE
      // existe-t-il vraiment ? L'UI ne déclenche le déblocage que sur
      // true — un statut verified à claim expiré non renouvelé n'est PAS
      // un déblocage (relecture 15.08 : boucle + écran de succès menteur).
      ...(claimActif !== undefined ? { claim_actif: claimActif } : {}),
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
    if (!row) return publie(row);
    if (row.status === "pending") {
      const apres = await tenteVerification(sb, row);
      return publie(apres, apres.status === "verified" ? true : undefined);
    }
    if (["verified", "manual_approved"].includes(row.status)) {
      // Claim expiré ? → re-validation (l'avis existe-t-il toujours ?).
      const r = await tenteRevalidation(sb, row);
      return publie(r.requete, r.claimActif);
    }
    return publie(row);
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

    // verified/manual_approved : claim valide → bloquant ; claim expiré
    // → RE-VALIDATION d'abord (avis toujours en ligne = claim renouvelé
    // sans nouvelle déclaration). Seul 'expired' en sortie (suppression
    // prouvée ou pas d'ancrage renouvelable) ouvre une nouvelle
    // déclaration.
    if (row && ["verified", "manual_approved"].includes(row.status)) {
      const r = await tenteRevalidation(sb, row);
      if (r.requete.status !== "expired") {
        return publie(r.requete, r.claimActif);
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
    const verifie = await tenteVerification(sb, cree as RequeteRow);
    return publie(verifie, verifie.status === "verified" ? true : undefined);
  } catch (err) {
    console.error("[review-gate] POST échoué", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
