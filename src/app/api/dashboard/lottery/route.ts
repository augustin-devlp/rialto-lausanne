import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { LOTTERY_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import {
  zurichMonthStart,
  monthLabel,
  maskPhone,
  isMissingTableError,
} from "@/lib/lotteryDraw";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/lottery — état loterie pour l'écran patron :
 * loterie (titre, active/tirée, lot), nb de participants, tirage du mois
 * courant (avec gagnant), historique des tirages.
 * Tolère l'absence de lottery_draws (migration en navette) →
 * migration_pending: true, le reste de l'écran fonctionne.
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

  // Compteur = inscrits DU MOIS courant (design 3 : participation
  // mensuelle) ; repli total historique si la colonne month n'existe pas
  // encore (migration L1 en navette — 42703).
  const [{ data: lottery, error: lotteryErr }, participantsRes] =
    await Promise.all([
      sb
        .from("lotteries")
        .select(
          "id, title, reward_description, prize_description, is_active, draw_date, claim_token_template",
        )
        .eq("id", LOTTERY_ID)
        .maybeSingle(),
      sb
        .from("lottery_participants")
        .select("id", { count: "exact", head: true })
        .eq("lottery_id", LOTTERY_ID)
        .eq("month", zurichMonthStart()),
    ]);
  let participantsCount = participantsRes.count;
  if (participantsRes.error?.code === "42703") {
    ({ count: participantsCount } = await sb
      .from("lottery_participants")
      .select("id", { count: "exact", head: true })
      .eq("lottery_id", LOTTERY_ID));
  }

  if (lotteryErr || !lottery) {
    console.error("[dashboard/lottery] lottery query failed", lotteryErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  // Tirages : la table peut ne pas exister encore (navette caisse).
  let migrationPending = false;
  let draws: Array<{
    id: string;
    month: string;
    drawn_at: string;
    winner: {
      entry_id: string;
      first_name: string;
      phone_masked: string;
      ticket_number: number | null;
      claim_token: string | null;
      claimed_at: string | null;
    } | null;
  }> = [];

  const { data: drawRows, error: drawsErr } = await sb
    .from("lottery_draws")
    .select("id, month, drawn_at, winner_entry_id")
    .eq("lottery_id", LOTTERY_ID)
    .order("month", { ascending: false });

  if (drawsErr) {
    if (isMissingTableError(drawsErr)) {
      migrationPending = true;
    } else {
      console.error("[dashboard/lottery] draws query failed", drawsErr);
      return NextResponse.json(
        { ok: false, error: "query_failed" },
        { status: 500 },
      );
    }
  } else if (drawRows && drawRows.length > 0) {
    const entryIds = drawRows.map((d) => d.winner_entry_id);
    const { data: entries } = await sb
      .from("lottery_entries")
      .select("id, first_name, phone, ticket_number, claim_token, claimed_at")
      .in("id", entryIds);
    const byId = new Map((entries ?? []).map((e) => [e.id, e]));
    draws = drawRows.map((d) => {
      const w = byId.get(d.winner_entry_id);
      return {
        id: d.id,
        month: d.month,
        drawn_at: d.drawn_at,
        winner: w
          ? {
              entry_id: w.id,
              first_name: w.first_name,
              phone_masked: maskPhone(w.phone),
              ticket_number: w.ticket_number,
              claim_token: w.claim_token,
              claimed_at: w.claimed_at,
            }
          : null,
      };
    });
  }

  const currentMonth = zurichMonthStart();
  const currentDraw = draws.find((d) => d.month === currentMonth) ?? null;

  return NextResponse.json(
    {
      ok: true,
      lottery: {
        title: lottery.title,
        reward: lottery.prize_description ?? lottery.reward_description,
        is_active: lottery.is_active,
        draw_date: lottery.draw_date,
      },
      participants_count: participantsCount ?? 0,
      current_month: currentMonth,
      current_month_label: monthLabel(currentMonth),
      current_draw: currentDraw,
      history: draws,
      migration_pending: migrationPending,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
