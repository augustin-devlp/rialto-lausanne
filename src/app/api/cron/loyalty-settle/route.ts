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
import { envoieCadeauxAnniversaire } from "@/lib/birthday";

export const dynamic = "force-dynamic";
// Budget temps explicite : la greffe anniversaire consomme du temps AVANT
// le filet de solidification — sans borne, un Brevo lent ferait expirer la
// fonction et le crédit des tampons ne tournerait pas du tout ce jour-là
// (même valeur que dashboard/push/send).
export const maxDuration = 60;

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
 * ⚠️ IL PORTE AUSSI LA CLÔTURE DU SERVICE PRÉCÉDENT (CL1, 21.08.2026) —
 * greffée faute d'un second cron (plan Vercel). Les commandes acceptées
 * du service écoulé passent en `completed` : l'écran de la caisse repart
 * vierge. Voir db/orders/CL1_cloture_service.sql. La clôture ne touche
 * JAMAIS une commande `new` (jamais décidée) ni `cancelled` (décision
 * inverse) — liste POSITIVE de statuts, garde levée en base.
 *
 * Il JOURNALISE aussi, sans agir, les commandes restées 'new' au-delà de 2 h
 * (leur pending client s'évaporera à H+24 sans jamais se solidifier). Pas de
 * table de dead-letter : au volume de Rialto, le rapport en logs suffit.
 *
 * Auth (corrigée 04.08.2026 — l'ancienne vérifiait un header
 * `x-vercel-cron: 1` QUI N'EXISTE PAS : 401 silencieux sur CHAQUE
 * passage depuis le 22.07, jamais détecté car le settle-on-read faisait
 * le travail nominal) : Vercel envoie `Authorization: Bearer CRON_SECRET`
 * quand la variable d'env CRON_SECRET est posée (doc officielle) ;
 * x-cron-secret reste le chemin des déclenchements manuels/ordonnanceurs
 * externes. CRON_SECRET OBLIGATOIRE : sans elle, tout est refusé (et
 * loggé) plutôt qu'ouvert à quiconque.
 */
export async function GET(req: NextRequest) {
  const validSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const manualSecret = req.headers.get("x-cron-secret");
  const authorized =
    !!validSecret &&
    (authHeader === `Bearer ${validSecret}` || manualSecret === validSecret);
  if (!authorized) {
    if (!validSecret) {
      console.error(
        "[loyalty-settle] REFUS : CRON_SECRET non configurée sur Vercel — le cron quotidien ne peut PAS tourner",
      );
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const debut = Date.now();
  const sb = supabaseService();

  // Cadeaux d'anniversaire (03.08.2026) : greffés sur CE cron — Hobby
  // n'autorise qu'une exécution quotidienne par cron, un second cron
  // dédié ferait rejeter le déploiement (leçon F3). AVANT le check du
  // killswitch tampons : les vœux ne dépendent pas de la fidélité en
  // ligne.
  const anniversaires = await envoieCadeauxAnniversaire(sb);

  // ─── CLÔTURE DU SERVICE PRÉCÉDENT (CL1, 21.08.2026) ─────────────────
  // Greffée ICI, et pas plus bas, pour DEUX raisons :
  //   1. les returns anticipés du barème (`!rule` → 500, `!rule.enabled`
  //      → inactif) sont juste en dessous : greffer après aurait rendu
  //      l'hygiène des commandes otage du killswitch FIDÉLITÉ, deux
  //      choses sans le moindre rapport ;
  //   2. même raison que les vœux d'anniversaire, qui sont placés là
  //      pour ce motif exact.
  // Toute la logique (frontière 05:00 Europe/Zurich, liste positive de
  // statuts, signature des écritures) vit dans le RPC — voir
  // db/orders/CL1_cloture_service.sql. Ce code ne fait que l'appeler.
  // ⚠️ TOLÉRANT À L'ABSENCE DU RPC (pattern `attribution`) : tant que la
  // navette CL1 n'est pas exécutée, l'erreur « fonction inconnue » est
  // journalisée et le cron continue. Le code peut donc partir avant le
  // DDL, dans n'importe quel ordre.
  let cloture: unknown = { ok: false, raison: "non_executee" };
  try {
    const volees: unknown[] = [];
    // Volées bornées : une transaction géante prendrait des verrous sur
    // toutes les lignes d'un coup et pèserait sur le budget maxDuration.
    for (let i = 0; i < 4; i++) {
      const { data, error } = await sb.rpc("rialto_cloture_service", {
        p_restaurant_id: RESTAURANT_ID,
        p_limit: 50,
      });
      if (error) throw error;
      volees.push(data);
      const n = (data as { nb_closes?: number } | null)?.nb_closes ?? 0;
      if (n < 50) break; // plus rien à clore
    }
    cloture = volees.length === 1 ? volees[0] : volees;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    // 42883 / PGRST202 = la fonction n'existe pas encore (navette non
    // exécutée). Tout le reste est une vraie anomalie.
    console.error(
      code === "42883" || code === "PGRST202"
        ? "[cloture] RPC absent — navette CL1 pas encore exécutée"
        : "[cloture] échec — le reste du cron continue",
      code ?? e,
    );
    cloture = { ok: false, code: code ?? "inconnue" };
  }

  const rule = await loadStampRule(sb);
  if (!rule) {
    // Les vœux sont DÉJÀ partis : le rapport doit le dire même en échec
    // du barème, sinon un retry manuel croirait la fournée jamais servie.
    return NextResponse.json(
      { ok: false, error: "bareme_introuvable", anniversaires, cloture },
      { status: 500 },
    );
  }
  if (!rule.enabled) {
    return NextResponse.json({
      ok: true,
      inactif: true,
      raison: "stamp_online_enabled = false",
      anniversaires,
      cloture,
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
    anniversaires,
    cloture,
    duration_ms: Date.now() - debut,
  };
  console.log("[loyalty-settle]", JSON.stringify(rapport));
  return NextResponse.json(rapport);
}
