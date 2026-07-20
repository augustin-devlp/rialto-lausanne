import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/orders/[id] — fiche commande complète pour le patron.
 * Contrairement au GET public /api/orders/[id] (suivi client), celui-ci
 * inclut cancellation_reason (note interne) et tous les champs livraison
 * (codes d'entrée, étage, sonnette) + paiement (méthode, billets, rendu).
 * IDOR-safe : scope restaurant_id + auth dashboard obligatoire.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const { data: order, error } = await sb
    .from("orders")
    .select(
      "id, order_number, status, cancellation_reason, customer_name, customer_phone, customer_email, payer_phone, total_amount, notes, created_at, requested_pickup_time, fulfillment_type, delivery_address, delivery_postal_code, delivery_city, delivery_floor_door, delivery_instructions, delivery_fee, housing_type, entry_code_1, entry_code_2, floor, apartment_number, doorbell_name, payment_method, payment_card_timing, payment_cash_bills, promo_discount_amount",
    )
    .eq("id", params.id)
    .eq("restaurant_id", RESTAURANT_ID)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  const [{ data: items }, { data: history }] = await Promise.all([
    sb
      .from("order_items")
      .select(
        "id, item_name_snapshot, item_price_snapshot, quantity, selected_options, subtotal, notes",
      )
      .eq("order_id", order.id),
    sb
      .from("order_status_history")
      .select("old_status, new_status, changed_at, changed_by")
      .eq("order_id", order.id)
      .order("changed_at", { ascending: true }),
  ]);

  return NextResponse.json(
    { ok: true, order: { ...order, items: items ?? [], history: history ?? [] } },
    { headers: { "cache-control": "no-store" } },
  );
}
