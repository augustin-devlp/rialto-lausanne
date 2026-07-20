import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/lottery/claim { entry_id } — « Lot remis ».
 * Pose claimed_at sur le ticket gagnant ; l'écran client affiche alors
 * « réclamé le … ». Idempotent (claimed_at déjà posé → 409).
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
    .select("id, claimed_at")
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

  return NextResponse.json({ ok: true, claimed_at: updated.claimed_at });
}
