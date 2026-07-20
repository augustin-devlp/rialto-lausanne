import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/orders/lookup?q=<texte scanné ou saisi>
 * Résout un QR de commande (contenu = order_number, ex. "R-2026-042")
 * ou une saisie manuelle (tolère minuscules/espaces) vers l'id commande.
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

  const raw = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "q_requis" }, { status: 400 });
  }
  const orderNumber = raw.toUpperCase().replace(/\s+/g, "");

  const sb = supabaseService();
  const { data: order, error } = await sb
    .from("orders")
    .select("id, order_number, status, customer_name, total_amount")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) {
    console.error("[dashboard/lookup] query failed", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }
  if (!order) {
    return NextResponse.json(
      { ok: false, error: "commande_introuvable" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { ok: true, order },
    { headers: { "cache-control": "no-store" } },
  );
}
