import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/reviews/approve { request_id } — validation MANUELLE
 * du gate avis (RV1b) : le restaurateur a vu l'avis de ses yeux (ou fait
 * confiance), la roue se débloque via un claim classique.
 *
 * review_time = maintenant : la contrainte UNIQUE des claims reste saine
 * (un même client re-validé manuellement plus tard = autre review_time),
 * et « 1 avis = 1 roue max » reste garanti pour les claims API.
 */
export async function POST(req: NextRequest) {
  if (!isDashboardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "dashboard_not_configured" },
      { status: 500 },
    );
  }
  if (!requireDashboardAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    request_id?: string;
  } | null;
  if (!body?.request_id) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sb = supabaseService();
  const { data: requete, error } = await sb
    .from("review_verification_requests")
    .select("id, customer_id, google_name, status, last_checked_at")
    .eq("id", body.request_id)
    .maybeSingle();

  if (error?.code === "42P01") {
    return NextResponse.json(
      { ok: false, error: "rv1_non_executee" },
      { status: 503 },
    );
  }
  if (!requete) {
    return NextResponse.json({ ok: false, error: "introuvable" }, { status: 404 });
  }
  // manual_pending UNIQUEMENT (relecture 17.08) : combiné à l'index
  // unique partiel (une seule ligne pending/manual_pending par client),
  // le CAS par LIGNE devient un verrou de fait par CLIENT — deux approves
  // simultanés sur deux vieilles lignes (pending/expired) du même client
  // créaient deux claims. Aucun appelant n'envoyait ces statuts (l'UI ne
  // rend Valider que sur manual_pending).
  if (requete.status !== "manual_pending") {
    return NextResponse.json(
      { ok: false, error: "deja_traitee" },
      { status: 409 },
    );
  }

  // GARDE anti-double-déblocage (relecture 14.08) : un client qui détient
  // déjà un claim VALIDE ne peut pas cumuler un second tour via la voie
  // manuelle — le bouton Valider ne doit pas contourner « 1 avis = 1 roue ».
  const { data: claimActif } = await sb
    .from("google_review_claims")
    .select("id, expires_at")
    .eq("customer_id", requete.customer_id as string)
    .eq("business_id", BUSINESS_ID)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (claimActif) {
    return NextResponse.json(
      { ok: false, error: "claim_deja_actif" },
      { status: 409 },
    );
  }

  // SÉRIALISATION (navette 15.08, point b) : prise de main ATOMIQUE sur
  // la requête AVANT l'insert du claim — le double-clic perd ICI au lieu
  // de créer un double claim. CAS sur last_checked_at et non passage
  // direct en manual_approved : le claim n'existe pas encore, la
  // contrainte chk_review_requests_claim_coherent (RV1b, point 2)
  // interdit manual_approved sans claim_id. En cas de crash entre le CAS
  // et l'insert du claim, la requête reste dans son statut → re-validable
  // au clic suivant. APRÈS l'insert, un échec de l'update final laisse un
  // claim actif + une ligne manual_pending grisée par claim_actif — d'où
  // le log de réparation plus bas.
  const jeton = new Date().toISOString();
  let cas = sb
    .from("review_verification_requests")
    .update({ last_checked_at: jeton })
    .eq("id", requete.id as string)
    .eq("status", "manual_pending");
  cas = requete.last_checked_at
    ? cas.eq("last_checked_at", requete.last_checked_at as string)
    : cas.is("last_checked_at", null);
  const { data: verrou, error: casErr } = await cas
    .select("id")
    .maybeSingle();
  if (casErr) {
    // Incident DB transitoire ≠ « quelqu'un a gagné la course » : ne pas
    // répondre 409 deja_traitee (message faux et rassurant à tort).
    console.error("[dashboard/reviews] CAS échoué", casErr);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!verrou) {
    return NextResponse.json(
      { ok: false, error: "deja_traitee" },
      { status: 409 },
    );
  }

  const { data: wheel } = await sb
    .from("spin_wheels")
    .select("frequency, frequency_days")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();
  // Aligné sur frequencyToMs de review-request ('once' = plafond 365 j).
  const jours = wheel?.frequency_days
    ? Number(wheel.frequency_days)
    : wheel?.frequency === "daily"
      ? 1
      : wheel?.frequency === "weekly"
        ? 7
        : wheel?.frequency === "once"
          ? 365
          : 30;
  const expiresAt = new Date(
    Date.now() + Math.min(jours, 365) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const maintenant = new Date().toISOString();
  const { data: claim, error: claimErr } = await sb
    .from("google_review_claims")
    .insert({
      customer_id: requete.customer_id,
      business_id: BUSINESS_ID,
      review_author_name: requete.google_name as string,
      review_time: maintenant,
      expires_at: expiresAt,
      is_degraded_mode: false,
    })
    .select("id")
    .single();

  if (claimErr || !claim) {
    console.error("[dashboard/reviews] claim manuel échoué", claimErr);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Garde de statut + jeton (réserve caisse n°3, 17.08) : croisé avec la
  // voie API, un update par id seul pouvait écraser un verified
  // fraîchement gagné — et détruire l'ancrage matched_review_time.
  const { data: classee, error: majErr } = await sb
    .from("review_verification_requests")
    .update({
      status: "manual_approved",
      matched_review_time: maintenant,
      claim_id: claim.id as string,
    })
    .eq("id", requete.id)
    .eq("status", "manual_pending")
    .eq("last_checked_at", jeton)
    .select("id")
    .maybeSingle();
  if (majErr) {
    // Le claim EST créé (la roue du client est réellement débloquée —
    // spinAvailability ne lit que les claims), mais la ligne reste
    // manual_pending grisée dans la file. Le claim.id au log est la clé
    // de réparation manuelle.
    console.error(
      "[dashboard/reviews] claim CRÉÉ mais requête non mise à jour — réparation manuelle",
      { requete: requete.id, claim: claim.id, majErr },
    );
    return NextResponse.json(
      { ok: false, error: "claim_cree_maj_ko" },
      { status: 500 },
    );
  }
  if (!classee) {
    // 0 ligne sans erreur : la voie API a verrouillé la requête pendant
    // l'approve (verified frais, ancrage posé) — ne JAMAIS l'écraser. Le
    // client est réellement débloqué (par l'API) ; le claim manuel créé
    // reste un doublon inoffensif (le déblocage teste l'existence), on
    // le loggue pour le ménage.
    console.warn(
      "[dashboard/reviews] requête vérifiée par l'API pendant l'approve — claim manuel en doublon",
      { requete: requete.id, claim: claim.id },
    );
    return NextResponse.json({ ok: true, note: "verifie_par_api" });
  }

  console.log("[dashboard/reviews] ✅ validation manuelle", {
    requete: requete.id,
    claim: claim.id,
  });
  return NextResponse.json({ ok: true });
}
