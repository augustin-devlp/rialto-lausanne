import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/lottery/claim { entry_id } — « Lot remis ».
 * Pose claimed_at sur le ticket gagnant ; l'écran client affiche alors
 * « réclamé le … ». Idempotent (claimed_at déjà posé → 409).
 *
 * Unification 19.08 : si le token du gagnant est un CODE PROMO
 * (RIA-XXXXX), la remise au comptoir EXPIRE le code — sinon le lot
 * serait servi deux fois (comptoir + checkout, relecture 19.08). Le sens
 * inverse (code consommé en ligne PUIS réclamation comptoir) reste une
 * vérification humaine : le patron voit le nom et l'état de la commande.
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
    entry_id?: string;
  } | null;
  if (!body?.entry_id) {
    return NextResponse.json(
      { ok: false, error: "entry_id_requis" },
      { status: 400 },
    );
  }

  const sb = supabaseService();
  const { data: updated, error } = await sb
    .from("lottery_entries")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", body.entry_id)
    .eq("is_winner", true)
    .is("claimed_at", null)
    .select("id, claimed_at, claim_token")
    .maybeSingle();

  if (error) {
    console.error("[lottery/claim] failed", error);
    return NextResponse.json(
      { ok: false, error: "update_failed" },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "deja_remis_ou_introuvable" },
      { status: 409 },
    );
  }

  // Anti-double-remise : lot remis en main propre → le code promo associé
  // n'est plus encaissable en ligne. Best-effort (le claim reste valide).
  if (updated.claim_token && /^RIA-/.test(updated.claim_token)) {
    const { error: expErr } = await sb
      .from("promo_codes")
      .update({ valid_until: new Date().toISOString() })
      .eq("business_id", BUSINESS_ID)
      .eq("code", updated.claim_token);
    if (expErr) {
      console.warn("[lottery/claim] expiration du code promo échouée", expErr);
    }
  }

  return NextResponse.json({ ok: true, claimed_at: updated.claimed_at });
}
