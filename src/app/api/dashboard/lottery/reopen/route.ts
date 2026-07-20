import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { LOTTERY_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/lottery/reopen — rouvre la loterie après un tirage
 * (is_active=true, draw_date=NULL) : le site repasse à l'état « participez »
 * pour le mois suivant. Les inscrits restent inscrits (tombola permanente,
 * tirage mensuel parmi les inscrits) ; l'historique lottery_draws et les
 * tickets gagnants passés sont conservés.
 * L'anti-double-tirage reste garanti : rouvrir ne permet PAS de retirer le
 * même mois (UNIQUE lottery_id+month dans lottery_draws).
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

  const sb = supabaseService();
  const { error } = await sb
    .from("lotteries")
    .update({ is_active: true, draw_date: null })
    .eq("id", LOTTERY_ID);

  if (error) {
    console.error("[lottery/reopen] failed", error);
    return NextResponse.json(
      { ok: false, error: "update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
