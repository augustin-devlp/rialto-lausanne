import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID, LOTTERY_ID } from "@/lib/loyaltyConstants";
import { zurichMonthStart } from "@/lib/lotteryDraw";

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
 *   PARTICIPE — Le customer a une participation du MOIS courant
 *       (lottery_participants, système B) mais pas encore de ticket (les
 *       tickets ne naissent qu'au tirage). UI : « Vous participez —
 *       tirage le X ». Phone résolu côté serveur (22.07.2026, BUG B).
 *
 *   D — Customer n'a JAMAIS participé + loterie active en ce moment.
 *       UI : CTA « 1 commande dans le mois = 1 participation au tirage
 *       du mois » (design 3, 21.07.2026 — câblé dans POST /api/orders).
 *
 *   E — Aucune loterie active. UI : "Pas de loterie en ce moment, on
 *       te préviendra par SMS".
 *
 *   Priorité : C > A > PARTICIPE > B > D > E (le gain passe avant tout ;
 *   un participant du mois passe avant une défaite d'un tirage antérieur).
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

  // Helpers pour trouver un ticket du customer dans une loterie.
  // sinceIso (design 3, 21.07.2026) : les tickets sont créés au tirage et
  // persistent d'un mois sur l'autre pour la même loterie — l'état A doit
  // ignorer les tickets des cycles précédents (sinon, après reopen, un
  // participant du mois passé verrait un ticket périmé au lieu de D).
  async function findTicket(lotteryId: string, sinceIso?: string) {
    let q = admin
      .from("lottery_entries")
      .select(
        "id, ticket_number, is_winner, claim_token, claimed_at, customer_id, phone",
      )
      .eq("lottery_id", lotteryId)
      .eq("customer_id", customerId);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data: entries } = await q
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

  // 4. Check ÉTAT A : a un ticket du CYCLE COURANT dans la loterie active.
  // Borne = 1er du mois (comparaison en minuit UTC : ~2 h d'à-peu-près au
  // changement de mois, sans enjeu — les tirages se font en fin de mois).
  if (activeLottery) {
    const activeTicket = await findTicket(
      activeLottery.id as string,
      zurichMonthStart(),
    );
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

  // 4bis. Check ÉTAT PARTICIPE : participation du MOIS courant dans
  // lottery_participants (système B) mais pas encore de ticket (les
  // tickets ne naissent qu'au tirage). Le phone est résolu CÔTÉ SERVEUR
  // depuis customers.id — jamais reçu du client (server-authoritative).
  // Priorité C > A > PARTICIPE > B : un participant du mois passe avant
  // une défaite d'un tirage antérieur.
  //
  // ⚠️ Le système B est clouté à la CONSTANTE LOTTERY_ID (writer
  // orders/route.ts + reader lookup/route.ts) — on filtre donc sur
  // LOTTERY_ID (pas activeLottery.id) et on ne propose PARTICIPE que si
  // la loterie active EST celle des participations, sinon on afficherait
  // « vous participez » pour une loterie à laquelle l'inscription ne
  // correspond pas.
  if (activeLottery && activeLottery.id === LOTTERY_ID) {
    const { data: customer } = await admin
      .from("customers")
      .select("phone")
      .eq("id", customerId)
      .maybeSingle();
    const phone = customer?.phone ?? null;
    if (phone) {
      let participation: { id: string } | null = null;
      const res = await admin
        .from("lottery_participants")
        .select("id")
        .eq("lottery_id", LOTTERY_ID)
        .eq("phone", phone)
        .eq("month", zurichMonthStart())
        .maybeSingle();
      participation = res.data;
      // Repli défensif si la colonne month n'existe pas (42703) — aligné
      // sur lookup/route.ts ; mort depuis L1 exécutée, gardé par cohérence.
      if (res.error?.code === "42703") {
        const legacy = await admin
          .from("lottery_participants")
          .select("id")
          .eq("lottery_id", LOTTERY_ID)
          .eq("phone", phone)
          .maybeSingle();
        participation = legacy.data;
      }
      if (participation) {
        return NextResponse.json({ state: "PARTICIPE", lottery: activeLottery });
      }
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
