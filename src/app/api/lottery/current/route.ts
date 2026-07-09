import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID } from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

/**
 * GET /api/lottery/current?customer_id=X[&business_id=Y]
 *
 * Retourne l'état contextuel de la loterie pour un customer donné.
 * 5 états possibles (voir brief Phase 6 FIX 3) :
 *
 *   A — Le customer a déjà un ticket dans la loterie EN COURS (pas
 *       tirée). UI : affiche son ticket_number + date du tirage.
 *
 *   B — Dernière loterie tirée, customer a PERDU. UI : message
 *       "ton ticket n°X n'a pas été tiré, le gagnant était n°Y".
 *
 *   C — Customer a GAGNÉ une loterie récente. UI : confettis + QR
 *       claim_token + bouton "J'ai réclamé mon lot".
 *
 *   D — Customer n'a JAMAIS participé + loterie active en ce moment.
 *       UI : CTA "Passe commande pour recevoir ton ticket".
 *
 *   E — Aucune loterie active. UI : "Pas de loterie en ce moment, on
 *       te préviendra par SMS".
 *
 *   Priorité : C > A > B > D > E (le gain passe avant tout).
 *
 * ⚠️ Fossé Système A/B hérité (D1) : cet endpoint LIT les tickets du tirage
 * (lottery_entries — système A alimenté par le dashboard Stampify). Les
 * participations du site vont dans lottery_participants (système B, via
 * /api/rialto/loyalty/lottery/enter). Le tirage et la génération des tickets
 * restent côté dashboard Stampify (futur lot) — AUCUN SMS ici (D5).
 * Porté VERBATIM depuis loyalty-cards (moins le CORS).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id");
  const businessId = url.searchParams.get("business_id") ?? BUSINESS_ID;

  if (!customerId) {
    return NextResponse.json(
      { error: "customer_id requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();

  // 1. Loterie active actuellement
  const nowIso = new Date().toISOString();
  const { data: activeLottery } = await admin
    .from("lotteries")
    .select(
      "id, title, prize_description, reward_description, draw_date, start_date, end_date, is_active, max_winners",
    )
    .eq("business_id", businessId)
    .eq("is_active", true)
    .or(`end_date.is.null,end_date.gte.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Dernière loterie tirée (inactive + avec un gagnant récent)
  const { data: lastDrawn } = await admin
    .from("lotteries")
    .select(
      "id, title, prize_description, reward_description, draw_date, end_date",
    )
    .eq("business_id", businessId)
    .eq("is_active", false)
    .not("draw_date", "is", null)
    .order("draw_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Helpers pour trouver un ticket du customer dans une loterie
  async function findTicket(lotteryId: string) {
    const { data: entries } = await admin
      .from("lottery_entries")
      .select(
        "id, ticket_number, is_winner, claim_token, claimed_at, customer_id, phone",
      )
      .eq("lottery_id", lotteryId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1);
    return entries && entries.length > 0 ? entries[0] : null;
  }

  // 3. Check ÉTAT C : a gagné une loterie récente
  if (lastDrawn) {
    const winTicket = await findTicket(lastDrawn.id as string);
    if (winTicket && (winTicket as { is_winner?: boolean }).is_winner) {
      return NextResponse.json({
        state: "C",
        lottery: lastDrawn,
        ticket: {
          number: winTicket.ticket_number,
          entry_id: winTicket.id,
          claim_token: winTicket.claim_token,
          claimed_at: winTicket.claimed_at,
        },
        result: { won: true, winner_ticket: winTicket.ticket_number },
      });
    }
  }

  // 4. Check ÉTAT A : a un ticket dans la loterie active
  if (activeLottery) {
    const activeTicket = await findTicket(activeLottery.id as string);
    if (activeTicket) {
      return NextResponse.json({
        state: "A",
        lottery: activeLottery,
        ticket: {
          number: activeTicket.ticket_number,
          entry_id: activeTicket.id,
        },
      });
    }
  }

  // 5. Check ÉTAT B : a perdu la dernière loterie tirée
  if (lastDrawn) {
    const ticket = await findTicket(lastDrawn.id as string);
    if (ticket && !(ticket as { is_winner?: boolean }).is_winner) {
      // Trouver le ticket gagnant pour le message
      const { data: winnerEntry } = await admin
        .from("lottery_entries")
        .select("ticket_number")
        .eq("lottery_id", lastDrawn.id)
        .eq("is_winner", true)
        .limit(1)
        .maybeSingle();

      return NextResponse.json({
        state: "B",
        lottery: lastDrawn,
        ticket: {
          number: ticket.ticket_number,
          entry_id: ticket.id,
        },
        result: {
          won: false,
          winner_ticket: winnerEntry?.ticket_number ?? null,
        },
      });
    }
  }

  // 6. ÉTAT D : loterie active mais pas de ticket pour ce customer
  if (activeLottery) {
    return NextResponse.json({ state: "D", lottery: activeLottery });
  }

  // 7. ÉTAT E : aucune loterie active
  return NextResponse.json({ state: "E", lottery: null });
}
