import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { isPushConfigured } from "@/lib/pushSend";
import { isMissingTableError } from "@/lib/lotteryDraw";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/push/status — état de la cascade push :
 * config VAPID, nombre de destinataires actifs, journal des envois
 * (tolérant à l'absence de push_logs — migration D5b en navette).
 */
export async function GET(req: NextRequest) {
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

  const { count: recipients, error: cErr } = await sb
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (cErr) {
    console.error("[push/status] count failed", cErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  let logs: Array<{
    id: string;
    title: string;
    body: string;
    recipients_total: number;
    sent_count: number;
    failed_count: number;
    deactivated_count: number;
    created_at: string;
  }> = [];
  let logsPending = false;

  const { data: logRows, error: lErr } = await sb
    .from("push_logs")
    .select(
      "id, title, body, recipients_total, sent_count, failed_count, deactivated_count, created_at",
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .order("created_at", { ascending: false })
    .limit(20);

  if (lErr) {
    if (isMissingTableError(lErr) || lErr.code === "42P01") {
      logsPending = true;
    } else {
      console.error("[push/status] logs failed", lErr);
    }
  } else {
    logs = logRows ?? [];
  }

  return NextResponse.json(
    {
      ok: true,
      push_configured: isPushConfigured(),
      recipients: recipients ?? 0,
      logs,
      logs_migration_pending: logsPending,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
