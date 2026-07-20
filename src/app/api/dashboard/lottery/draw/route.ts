import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { LOTTERY_ID } from "@/lib/loyaltyConstants";
import { phoneLookupVariants } from "@/lib/phoneVariants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import {
  zurichMonthStart,
  generateClaimToken,
  maskPhone,
  isMissingTableError,
} from "@/lib/lotteryDraw";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/lottery/draw — LE tirage mensuel.
 *
 * Séquence :
 *  1. lottery_draws existe ? sinon 503 migration_pending (navette caisse).
 *  2. Anti-double-tirage : draw (lottery_id, mois Europe/Zurich) déjà là → 409.
 *     (l'UNIQUE DB re-garantit en cas de course, INSERT → 23505 → 409)
 *  3. Convertit les lottery_participants en lottery_entries (tickets
 *     auto-numérotés par le trigger DB), en résolvant customer_id par
 *     téléphone pour que le gagnant voie son état « gagné » sur le site
 *     (l'UI client matche par customer_id).
 *  4. Tire au hasard (crypto.randomInt) parmi les tickets créés.
 *  5. Pose is_winner + claim_token (template DB) sur le ticket gagnant.
 *  6. INSERT lottery_draws (mois, gagnant, drawn_by='dashboard').
 *  7. lotteries.draw_date=now() + is_active=false → le site affiche
 *     gagnant (confettis + code) et perdants automatiquement.
 *
 * Pas de SMS (décision v1 — l'écran client affiche tout ; cf. mémoire
 * refus-sans-sms pour le template order_cancelled, jamais concerné ici).
 */
export async function POST(req: NextRequest) {
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
  const month = zurichMonthStart();

  // 1+2. Table présente ? Tirage du mois déjà fait ?
  const { data: existing, error: checkErr } = await sb
    .from("lottery_draws")
    .select("id")
    .eq("lottery_id", LOTTERY_ID)
    .eq("month", month)
    .maybeSingle();

  if (checkErr) {
    if (isMissingTableError(checkErr)) {
      return NextResponse.json(
        { ok: false, error: "migration_pending" },
        { status: 503 },
      );
    }
    console.error("[lottery/draw] check failed", checkErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "deja_tire_ce_mois" },
      { status: 409 },
    );
  }

  // Loterie (template de code retrait).
  const { data: lottery } = await sb
    .from("lotteries")
    .select("id, claim_token_template")
    .eq("id", LOTTERY_ID)
    .maybeSingle();
  if (!lottery) {
    return NextResponse.json(
      { ok: false, error: "loterie_introuvable" },
      { status: 404 },
    );
  }

  // 3. Participants → tickets.
  const { data: participants, error: pErr } = await sb
    .from("lottery_participants")
    .select("first_name, phone")
    .eq("lottery_id", LOTTERY_ID);

  if (pErr) {
    console.error("[lottery/draw] participants failed", pErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }
  if (!participants || participants.length === 0) {
    return NextResponse.json(
      { ok: false, error: "aucun_participant" },
      { status: 400 },
    );
  }

  // Résolution customer_id par téléphone (best-effort, batch).
  const allVariants = new Set<string>();
  const variantsByPhone = new Map<string, string[]>();
  for (const p of participants) {
    const { variants } = phoneLookupVariants(p.phone);
    variantsByPhone.set(p.phone, variants);
    variants.forEach((v) => allVariants.add(v));
  }
  const { data: customers } = await sb
    .from("customers")
    .select("id, phone")
    .in("phone", Array.from(allVariants));
  const customerByPhone = new Map(
    (customers ?? []).map((c) => [c.phone, c.id]),
  );
  function resolveCustomerId(phone: string): string | null {
    for (const v of variantsByPhone.get(phone) ?? []) {
      const id = customerByPhone.get(v);
      if (id) return id;
    }
    return null;
  }

  // Insertion séquentielle (trigger ticket_number = MAX+1 non verrouillé :
  // on évite toute concurrence d'insertion).
  const entryIds: string[] = [];
  for (const p of participants) {
    const { data: entry, error: eErr } = await sb
      .from("lottery_entries")
      .insert({
        lottery_id: LOTTERY_ID,
        first_name: p.first_name,
        phone: p.phone,
        customer_id: resolveCustomerId(p.phone),
      })
      .select("id")
      .single();
    if (eErr || !entry) {
      console.error("[lottery/draw] entry insert failed", eErr);
      return NextResponse.json(
        { ok: false, error: "tickets_failed" },
        { status: 500 },
      );
    }
    entryIds.push(entry.id);
  }

  // 4+5. Tirage + marquage gagnant.
  const winnerId = entryIds[crypto.randomInt(entryIds.length)];
  const claimToken = generateClaimToken(lottery.claim_token_template);

  const { data: winner, error: wErr } = await sb
    .from("lottery_entries")
    .update({ is_winner: true, claim_token: claimToken })
    .eq("id", winnerId)
    .select("id, first_name, phone, ticket_number, claim_token")
    .single();

  if (wErr || !winner) {
    console.error("[lottery/draw] winner update failed", wErr);
    return NextResponse.json(
      { ok: false, error: "winner_failed" },
      { status: 500 },
    );
  }

  // 6. Journal du tirage — l'UNIQUE(lottery_id, month) tranche les courses.
  const { error: dErr } = await sb.from("lottery_draws").insert({
    lottery_id: LOTTERY_ID,
    month,
    winner_entry_id: winner.id,
    drawn_by: "dashboard",
  });
  if (dErr) {
    if (dErr.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "deja_tire_ce_mois" },
        { status: 409 },
      );
    }
    console.error("[lottery/draw] draw insert failed", dErr);
    return NextResponse.json(
      { ok: false, error: "draw_failed" },
      { status: 500 },
    );
  }

  // 7. La loterie passe « tirée » → le site affiche gagnant/perdants.
  await sb
    .from("lotteries")
    .update({ draw_date: new Date().toISOString(), is_active: false })
    .eq("id", LOTTERY_ID);

  return NextResponse.json({
    ok: true,
    winner: {
      entry_id: winner.id,
      first_name: winner.first_name,
      phone_masked: maskPhone(winner.phone),
      phone: winner.phone,
      ticket_number: winner.ticket_number,
      claim_token: winner.claim_token,
    },
    tickets_total: entryIds.length,
    month,
  });
}
