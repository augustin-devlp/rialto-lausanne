import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  crediteCommandes,
  loadStampRule,
  ORDER_COLS,
  SOLID_STATUSES,
  SETTLE_WINDOW_MS,
  type SettleableOrder,
} from "@/lib/loyalty/settle";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/loyalty-settle — FILET de la solidification (F3).
 *
 * Le chemin NOMINAL est le polling de /confirmation (settleForOrder sur
 * GET /api/orders/[id]) : un client qui garde sa page ouverte voit son tampon
 * se solidifier en ~15 s. La lecture de la fidélité (lookup) solidifie elle
 * aussi. Ce cron ne rattrape que les clients qui ont fermé l'onglet avant
 * l'acceptation ET ne rouvrent pas leur carte.
 *
 * ⚠️ CADENCE JOURNALIÈRE IMPOSÉE PAR LE PLAN VERCEL (Hobby = 1 exécution/jour
 * par cron). Une cadence horaire fait REJETER le déploiement — c'est ce qui
 * a silencieusement empêché F3/F3b/F4 de partir en production le 22.07.
 * Ne pas repasser en sub-journalier sans changement de plan ; si un filet
 * plus serré devient nécessaire, passer par un ordonnanceur externe
 * (QStash, GitHub Actions) tapant ce même endpoint avec x-cron-secret.
 *
 * ⚠️ Il RÉUTILISE crediteCommandes() et ORDER_COLS de settle.ts — il ne
 * redéveloppe NI la boucle de crédit NI la liste de colonnes. Recopier la
 * projection ferait perdre silencieusement promo_discount_amount et
 * rouvrirait la faille des codes de parrainage à −100 %.
 *
 * Il JOURNALISE aussi, sans agir, les commandes restées 'new' au-delà de 2 h
 * (leur pending client s'évaporera à H+24 sans jamais se solidifier). Pas de
 * table de dead-letter : au volume de Rialto, le rapport en logs suffit.
 *
 * Auth : header Vercel x-vercel-cron OU x-cron-secret == CRON_SECRET.
 * Aucun secret par défaut en dur (même discipline que reward-referrals).
 */
export async function GET(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const cronSecret = req.headers.get("x-cron-secret");
  const validSecret = process.env.CRON_SECRET;
  if (!isCron && (!validSecret || cronSecret !== validSecret)) {
    if (!validSecret) {
      console.warn(
        "[loyalty-settle] appel manuel refusé : CRON_SECRET non configurée",
      );
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const debut = Date.now();
  const sb = supabaseService();

  const rule = await loadStampRule(sb);
  if (!rule) {
    return NextResponse.json(
      { ok: false, error: "bareme_introuvable" },
      { status: 500 },
    );
  }
  if (!rule.enabled) {
    return NextResponse.json({
      ok: true,
      inactif: true,
      raison: "stamp_online_enabled = false",
    });
  }

  const depuis = new Date(Date.now() - SETTLE_WINDOW_MS).toISOString();

  const { data: orders, error } = await sb
    .from("orders")
    .select(ORDER_COLS)
    .eq("restaurant_id", RESTAURANT_ID)
    .in("status", SOLID_STATUSES as unknown as string[])
    .not("customer_id", "is", null)
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[loyalty-settle] lecture commandes échouée", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const liste = (orders ?? []) as SettleableOrder[];
  const bilan = await crediteCommandes(sb, liste, rule);

  // Anomalie journalisée SANS agir : une commande laissée 'new' trop longtemps
  // verra son pending client s'évaporer sans jamais se solidifier.
  const ilYaDeuxHeures = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { count: newVieilles } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("status", "new")
    .lt("created_at", ilYaDeuxHeures);

  const rapport = {
    ok: true,
    scanned: liste.length,
    credited_stamps: bilan.credited,
    credited_orders: bilan.orders,
    skipped: bilan.skipped,
    commandes_new_de_plus_de_2h: newVieilles ?? 0,
    duration_ms: Date.now() - debut,
  };
  console.log("[loyalty-settle]", JSON.stringify(rapport));
  return NextResponse.json(rapport);
}
