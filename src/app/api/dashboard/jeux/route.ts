import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { LOTTERY_ID, SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { maskPhone } from "@/lib/lotteryDraw";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/jeux — réconciliation roue + loterie (D3).
 *
 * SOURCES UNIQUES (anti-doublon, documenté à l'écran) :
 *  - Codes matérialisés : promo_codes, filtrés par source
 *    ('spin_wheel' = roue, 'lottery' = loterie) — LA vérité des gains
 *    convertibles, avec statut utilisé/actif/expiré + commande liée.
 *  - Participations roue : spin_entries (compteur) ; journal brut des
 *    spins : spin_results (compteur — inclut les segments perdants).
 *  - Gains loterie non-code : lottery_entries is_winner (claim_token),
 *    déjà pilotés par l'écran Loterie — comptés ici, détaillés là-bas.
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

  const [
    { count: spinsCount },
    { count: spinResultsCount },
    { count: lotteryParticipants },
    { count: lotteryWinners },
    { data: codes, error: codesErr },
  ] = await Promise.all([
    sb
      .from("spin_entries")
      .select("id", { count: "exact", head: true })
      .eq("wheel_id", SPIN_WHEEL_ID),
    sb
      .from("spin_results")
      .select("id", { count: "exact", head: true })
      .eq("wheel_id", SPIN_WHEEL_ID),
    sb
      .from("lottery_participants")
      .select("id", { count: "exact", head: true })
      .eq("lottery_id", LOTTERY_ID),
    sb
      .from("lottery_entries")
      .select("id", { count: "exact", head: true })
      .eq("lottery_id", LOTTERY_ID)
      .eq("is_winner", true),
    sb
      .from("promo_codes")
      .select(
        "id, code, source, phone, customer_id, discount_type, discount_value, free_item_label, uses_count, max_uses, used_at, used_on_order_id, valid_until, created_at",
      )
      .in("source", ["spin_wheel", "lottery"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (codesErr) {
    console.error("[dashboard/jeux] codes query failed", codesErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  // Numéros de commande des codes consommés (petit volume → 1 query).
  const orderIds = (codes ?? [])
    .map((c) => c.used_on_order_id)
    .filter((v): v is string => Boolean(v));
  const orderNumberById = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await sb
      .from("orders")
      .select("id, order_number")
      .in("id", orderIds);
    (orders ?? []).forEach((o) => orderNumberById.set(o.id, o.order_number));
  }

  function codeStatus(c: {
    uses_count: number;
    max_uses: number;
    valid_until: string;
  }): "utilise" | "actif" | "expire" {
    if (c.uses_count >= c.max_uses) return "utilise";
    // Comparaison par timestamp : Postgres renvoie « +00:00 », pas
    // « Z » — la comparaison lexicale d'ISO mixtes est fragile.
    if (new Date(c.valid_until).getTime() < Date.now()) return "expire";
    return "actif";
  }

  const codesOut = (codes ?? []).map((c) => ({
    code: c.code,
    source: c.source as "spin_wheel" | "lottery",
    phone_masked: c.phone ? maskPhone(c.phone) : null,
    gain:
      c.free_item_label ??
      (Number(c.discount_value) > 0
        ? `${c.discount_value}${c.discount_type?.startsWith("percent") ? " %" : " CHF"}`
        : c.code),
    statut: codeStatus(c),
    emis_le: c.created_at,
    valable_jusqu_au: c.valid_until,
    utilise_le: c.used_at,
    commande: c.used_on_order_id
      ? (orderNumberById.get(c.used_on_order_id) ?? null)
      : null,
  }));

  const stats = {
    codes_emis: codesOut.length,
    codes_utilises: codesOut.filter((c) => c.statut === "utilise").length,
    codes_actifs: codesOut.filter((c) => c.statut === "actif").length,
    codes_expires: codesOut.filter((c) => c.statut === "expire").length,
  };

  return NextResponse.json(
    {
      ok: true,
      roue: {
        spins: spinsCount ?? 0,
        resultats_journal: spinResultsCount ?? 0,
      },
      loterie: {
        participants: lotteryParticipants ?? 0,
        gagnants: lotteryWinners ?? 0,
      },
      codes: codesOut,
      stats,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
