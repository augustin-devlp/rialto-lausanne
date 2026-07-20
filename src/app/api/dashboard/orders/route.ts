import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/orders — liste pour l'écran Commandes du patron.
 * Renvoie les commandes ACTIVES (new/accepted/preparing/ready, sans limite
 * de date) + les commandes TERMINÉES/ANNULÉES des dernières 48 h.
 * Tri : nouvelles d'abord, puis par date décroissante.
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
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const SELECT =
    "id, order_number, status, customer_name, customer_phone, total_amount, fulfillment_type, requested_pickup_time, created_at, delivery_address, delivery_postal_code, delivery_city, payment_method";

  const [{ data: active, error: e1 }, { data: recent, error: e2 }] =
    await Promise.all([
      sb
        .from("orders")
        .select(SELECT)
        .eq("restaurant_id", RESTAURANT_ID)
        .in("status", ["new", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: false }),
      sb
        .from("orders")
        .select(SELECT)
        .eq("restaurant_id", RESTAURANT_ID)
        .in("status", ["completed", "cancelled"])
        .gte("created_at", twoDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (e1 || e2) {
    console.error("[dashboard/orders] query failed", e1 ?? e2);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, active: active ?? [], recent: recent ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
