import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { toCsv, zurichDateStamp, zurichDateTime } from "@/lib/csvExport";
import { STATUS_LABELS } from "@/components/dashboard/orderStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/export/commandes?format=csv|json
 * Export CONTRACTUEL : historique complet des commandes du restaurant.
 * Auth dashboard + service_role.
 */

type OrderRow = {
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: string;
  total_amount: number;
  delivery_fee: number | null;
  promo_discount_amount: number;
  fulfillment_type: "pickup" | "delivery";
  payment_method: string | null;
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
};

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

  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";

  const sb = supabaseService();
  const { data, error } = await sb
    .from("orders")
    .select(
      "order_number, created_at, customer_name, customer_phone, customer_email, status, total_amount, delivery_fee, promo_discount_amount, fulfillment_type, payment_method, delivery_address, delivery_postal_code, delivery_city",
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[export/commandes] query failed", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as OrderRow[];
  const stamp = zurichDateStamp();

  const PAYMENT_LABELS: Record<string, string> = {
    cash: "Espèces",
    card: "Carte",
    twint: "Twint",
  };
  const paymentLabel = (r: OrderRow) =>
    r.payment_method ? (PAYMENT_LABELS[r.payment_method] ?? r.payment_method) : "";
  const modeLabel = (r: OrderRow) =>
    r.fulfillment_type === "delivery" ? "Livraison" : "Retrait";
  const adresse = (r: OrderRow) =>
    r.fulfillment_type === "delivery"
      ? `${r.delivery_address ?? ""}, ${r.delivery_postal_code ?? ""} ${r.delivery_city ?? ""}`.trim()
      : "";

  if (format === "json") {
    const payload = rows.map((r) => ({
      numero: r.order_number,
      date: zurichDateTime(r.created_at),
      client: r.customer_name,
      telephone: r.customer_phone,
      email: r.customer_email ?? "",
      statut: STATUS_LABELS[r.status] ?? r.status,
      total_chf: Number(r.total_amount),
      frais_livraison_chf: Number(r.delivery_fee ?? 0),
      remise_promo_chf: Number(r.promo_discount_amount ?? 0),
      mode: modeLabel(r),
      paiement: paymentLabel(r),
      adresse: adresse(r),
    }));
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="rialto-commandes-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  const csv = toCsv(rows, [
    { header: "Numéro", value: (r) => r.order_number },
    { header: "Date", value: (r) => zurichDateTime(r.created_at) },
    { header: "Client", value: (r) => r.customer_name },
    { header: "Téléphone", value: (r) => r.customer_phone },
    { header: "Email", value: (r) => r.customer_email ?? "" },
    { header: "Statut", value: (r) => STATUS_LABELS[r.status] ?? r.status },
    { header: "Total CHF", value: (r) => Number(r.total_amount).toFixed(2) },
    {
      header: "Frais livraison CHF",
      value: (r) => Number(r.delivery_fee ?? 0).toFixed(2),
    },
    {
      header: "Remise promo CHF",
      value: (r) => Number(r.promo_discount_amount ?? 0).toFixed(2),
    },
    { header: "Mode", value: modeLabel },
    { header: "Paiement", value: paymentLabel },
    { header: "Adresse", value: adresse },
  ]);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rialto-commandes-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
