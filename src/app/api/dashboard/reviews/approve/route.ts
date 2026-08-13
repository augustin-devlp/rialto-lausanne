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
 * du gate avis (RV1) : le restaurateur a vu l'avis de ses yeux (ou fait
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
    .select("id, customer_id, google_name, status")
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
  if (!["manual_pending", "pending", "expired"].includes(requete.status as string)) {
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
  const jours = wheel?.frequency_days
    ? Number(wheel.frequency_days)
    : wheel?.frequency === "daily"
      ? 1
      : wheel?.frequency === "weekly"
        ? 7
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

  await sb
    .from("review_verification_requests")
    .update({
      status: "manual_approved",
      matched_review_time: maintenant,
      claim_id: claim.id as string,
    })
    .eq("id", requete.id);

  console.log("[dashboard/reviews] ✅ validation manuelle", {
    requete: requete.id,
    claim: claim.id,
  });
  return NextResponse.json({ ok: true });
}
