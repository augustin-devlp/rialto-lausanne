import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { toCsv, zurichDateStamp, zurichDateTime } from "@/lib/csvExport";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/export/clients?format=csv|json
 * Export CONTRACTUEL (art. 8) : la base clients appartient au restaurateur,
 * remise à tout moment en 1 clic. Source : customers × customer_cards
 * (carte Rialto). Auth dashboard + service_role — jamais accessible
 * sans session.
 */

type CardRow = {
  current_stamps: number;
  current_points: number | null;
  rewards_claimed: number;
  short_code: string | null;
  created_at: string;
  customers: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
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
    .from("customer_cards")
    .select(
      "current_stamps, current_points, rewards_claimed, short_code, created_at, customers:customer_id (first_name, last_name, phone, email)",
    )
    .eq("card_id", CARD_ID)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[export/clients] query failed", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as CardRow[];
  const stamp = zurichDateStamp();

  if (format === "json") {
    const payload = rows.map((r) => ({
      prenom: r.customers?.first_name ?? "",
      nom: r.customers?.last_name ?? "",
      telephone: r.customers?.phone ?? "",
      email: r.customers?.email ?? "",
      tampons: r.current_stamps,
      recompenses_obtenues: r.rewards_claimed,
      code_carte: r.short_code ?? "",
      inscrit_le: zurichDateTime(r.created_at),
    }));
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="rialto-clients-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  const csv = toCsv(rows, [
    { header: "Prénom", value: (r) => r.customers?.first_name ?? "" },
    { header: "Nom", value: (r) => r.customers?.last_name ?? "" },
    { header: "Téléphone", value: (r) => r.customers?.phone ?? "" },
    { header: "Email", value: (r) => r.customers?.email ?? "" },
    { header: "Tampons", value: (r) => r.current_stamps },
    { header: "Récompenses obtenues", value: (r) => r.rewards_claimed },
    { header: "Code carte", value: (r) => r.short_code ?? "" },
    { header: "Inscrit le", value: (r) => zurichDateTime(r.created_at) },
  ]);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="rialto-clients-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
