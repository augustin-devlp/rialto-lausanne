import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { requireDashboardAuth, isDashboardConfigured } from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/summary — chiffres du jour pour l'accueil patron.
 * Journée = Europe/Zurich (pas UTC) : le "jour" du restaurant.
 */

/** Début de la journée courante en Europe/Zurich, exprimé en ISO UTC. */
function startOfTodayZurichISO(): string {
  const now = new Date();
  const zurich = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => zurich.find((p) => p.type === t)?.value ?? "";
  // Minuit heure suisse ce jour-là. On construit la date en heure locale
  // suisse puis on la convertit — l'offset exact (été/hiver) est obtenu en
  // comparant la même heure interprétée en UTC vs Zurich.
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  // Approche robuste : minuit Zurich = l'instant t tel que formaté en
  // Europe/Zurich il vaut 00:00 de la date du jour. On teste les deux
  // offsets possibles (UTC+1 / UTC+2).
  for (const offset of [2, 1]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, -offset + 24, 0, 0));
    candidate.setUTCDate(candidate.getUTCDate() - 1);
    const check = new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      day: "2-digit",
    }).formatToParts(candidate);
    const hh = check.find((p) => p.type === "hour")?.value;
    const dd = check.find((p) => p.type === "day")?.value;
    if (hh === "00" && Number(dd) === d) return candidate.toISOString();
  }
  // Fallback improbable : minuit UTC.
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

export async function GET(req: NextRequest) {
  if (!isDashboardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "dashboard_not_configured" },
      { status: 500 },
    );
  }
  if (!requireDashboardAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseService();
  const since = startOfTodayZurichISO();

  const { data: todayOrders, error } = await sb
    .from("orders")
    .select("id, status, total_amount")
    .eq("restaurant_id", RESTAURANT_ID)
    .gte("created_at", since);

  if (error) {
    console.error("[dashboard/summary] orders query failed", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const rows = todayOrders ?? [];
  const active = rows.filter((o) =>
    ["new", "accepted", "preparing", "ready"].includes(o.status),
  );
  const revenue = rows
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total_amount), 0);

  return NextResponse.json(
    {
      ok: true,
      today: {
        orders: rows.length,
        active: active.length,
        newCount: rows.filter((o) => o.status === "new").length,
        revenue,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
