import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { maskPhone } from "@/lib/lotteryDraw";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/parrainage — réconciliation parrainage (D4).
 * Funnel (codes émis / claims / récompensés) + détail par parrainage :
 * les DEUX codes -100% (parrain MARG…P / filleul MARG…F) avec statut
 * chacun, et le statut RÉEL des SMS (sms_logs via context_meta).
 * Lien code filleul : referrals.referee_promo_code (colonne D4a en
 * navette) avec repli convention MARG{shortId}F.
 */

type PromoInfo = {
  code: string;
  statut: "utilise" | "actif" | "expire" | "non_emis";
  utilise_le: string | null;
  commande: string | null;
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

  const sb = supabaseService();

  // Referrals (nouveau modèle uniquement : referrer_customer_id présent).
  // NB : referee_promo_code volontairement ABSENT du select tant que la
  // migration D4a n'est pas exécutée (colonne inexistante → 400) ; le
  // repli convention MARG{shortId}F ci-dessous donne la même valeur.
  // À ajouter au select dans le commit post-D4a.
  const { data: refs, error: rErr } = await sb
    .from("referrals")
    .select(
      "id, referrer_customer_id, referral_code, referee_phone, referee_customer_id, status, created_at, rewarded_at, reward_promo_code",
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .not("referrer_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (rErr) {
    console.error("[dashboard/parrainage] referrals failed", rErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const rows = refs ?? [];

  // Funnel : codes parrain émis (lignes sans filleul), claims, récompensés.
  const funnel = {
    codes_emis: rows.filter((r) => !r.referee_phone && r.status === "pending")
      .length,
    filleuls_en_attente: rows.filter(
      (r) => r.referee_phone && r.status === "claimed",
    ).length,
    parrainages_recompenses: rows.filter((r) => r.status === "rewarded").length,
  };

  // Batch lookups : parrains, codes promo, sms_logs.
  const referrerIds = Array.from(
    new Set(rows.map((r) => r.referrer_customer_id).filter(Boolean)),
  ) as string[];
  const { data: referrers } = referrerIds.length
    ? await sb
        .from("customers")
        .select("id, first_name, last_name")
        .in("id", referrerIds)
    : { data: [] };
  const referrerById = new Map(
    (referrers ?? []).map((c) => [
      c.id,
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Client",
    ]),
  );

  const rewardedRows = rows.filter((r) => r.status === "rewarded");
  const wantedCodes = new Set<string>();
  for (const r of rewardedRows) {
    // Même dérivation que le cron reward-referrals (6 hex).
    const shortId = (r.id as string).slice(0, 6).toUpperCase();
    if (r.reward_promo_code) wantedCodes.add(r.reward_promo_code);
    wantedCodes.add(`MARG${shortId}P`);
    wantedCodes.add(`MARG${shortId}F`);
    const withCol = r as { referee_promo_code?: string | null };
    if (withCol.referee_promo_code) wantedCodes.add(withCol.referee_promo_code);
  }
  const { data: promos } = wantedCodes.size
    ? await sb
        .from("promo_codes")
        .select("code, uses_count, max_uses, used_at, used_on_order_id, valid_until")
        .in("code", Array.from(wantedCodes))
    : { data: [] };
  const promoByCode = new Map((promos ?? []).map((p) => [p.code, p]));

  const usedOrderIds = (promos ?? [])
    .map((p) => p.used_on_order_id)
    .filter((v): v is string => Boolean(v));
  const orderNumberById = new Map<string, string>();
  if (usedOrderIds.length) {
    const { data: orders } = await sb
      .from("orders")
      .select("id, order_number")
      .in("id", usedOrderIds);
    (orders ?? []).forEach((o) => orderNumberById.set(o.id, o.order_number));
  }

  const refIds = rewardedRows.map((r) => r.id as string);
  const { data: smsRows } = refIds.length
    ? await sb
        .from("sms_logs")
        .select("status, sender_used, error_message, created_at, context_meta")
        .eq("restaurant_id", RESTAURANT_ID)
        .in(
          "template_key",
          ["referral_success", "referral_claim_reward"],
        )
        .order("created_at", { ascending: false })
        .limit(400)
    : { data: [] };

  function smsFor(referralId: string, role: "parrain" | "filleul") {
    const hit = (smsRows ?? []).find((s) => {
      const meta = s.context_meta as {
        referral_id?: string;
        role?: string;
      } | null;
      return meta?.referral_id === referralId && meta?.role === role;
    });
    if (!hit) return { statut: "aucun" as const, envoye_le: null, erreur: null };
    return {
      statut: hit.status as "sent" | "failed",
      envoye_le: hit.created_at as string,
      erreur: (hit.error_message as string | null) ?? null,
    };
  }

  function promoInfo(code: string | null): PromoInfo {
    if (!code)
      return { code: "—", statut: "non_emis", utilise_le: null, commande: null };
    const p = promoByCode.get(code);
    if (!p)
      return { code, statut: "non_emis", utilise_le: null, commande: null };
    const statut =
      p.uses_count >= p.max_uses
        ? "utilise"
        : new Date(p.valid_until).getTime() < Date.now()
          ? "expire"
          : "actif";
    return {
      code,
      statut,
      utilise_le: p.used_at,
      commande: p.used_on_order_id
        ? (orderNumberById.get(p.used_on_order_id) ?? null)
        : null,
    };
  }

  const detail = rewardedRows.map((r) => {
    const shortId = (r.id as string).slice(0, 6).toUpperCase();
    const withCol = r as { referee_promo_code?: string | null };
    const codeFilleul = withCol.referee_promo_code ?? `MARG${shortId}F`;
    return {
      id: r.id,
      parrain: referrerById.get(r.referrer_customer_id as string) ?? "Client",
      filleul_phone_masked: r.referee_phone ? maskPhone(r.referee_phone) : null,
      recompense_le: r.rewarded_at,
      code_parrain: promoInfo(r.reward_promo_code ?? `MARG${shortId}P`),
      code_filleul: promoInfo(codeFilleul),
      sms_parrain: smsFor(r.id as string, "parrain"),
      sms_filleul: smsFor(r.id as string, "filleul"),
    };
  });

  return NextResponse.json(
    { ok: true, funnel, detail },
    { headers: { "cache-control": "no-store" } },
  );
}
