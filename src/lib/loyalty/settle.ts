/**
 * Solidification des tampons (F3, 22.07.2026).
 *
 * Le tampon EN ATTENTE est dérivé (jamais écrit). Le tampon ACQUIS est écrit
 * ICI, une seule fois, quand la caisse a fait passer la commande en statut
 * solide (accepted/preparing/ready/completed).
 *
 * DÉCLENCHEURS (aucun n'est dans la transaction de la caisse) :
 *   - GET /api/orders/[id]           → pollé toutes les 15 s par /confirmation,
 *                                      qui relit sa carte au changement de
 *                                      statut : c'est le chemin le plus rapide
 *   - GET /api/rialto/loyalty/lookup → quand le client regarde sa fidélité
 *   - GET /api/cron/loyalty-settle   → filet pour les clients qui ont fermé
 *
 * RÈGLES :
 *   - JAMAIS bloquant : toute erreur est avalée et journalisée, la lecture
 *     appelante renvoie l'état non réglé ; le cron rattrape.
 *   - Idempotent : l'index UNIQUE partiel transactions(order_id) WHERE
 *     type='stamp_added' (migration F0/M2) fait foi ; le RPC absorbe le
 *     doublon. Rejouable à l'infini.
 *   - Inerte tant que le killswitch stamp_online_enabled est à false.
 */

import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import { stampsForOrder, toStampRule, type StampRule } from "./rule";

/**
 * Valeur de transactions.source pour un crédit issu d'une commande en ligne.
 *
 * ⚠️ CONSTANTE PARTAGÉE OBLIGATOIRE : la colonne transactions.source n'a
 * AUCUN CHECK en base, et le quota anti-abus du comptoir (credit_stamp,
 * migration F0/M5) exclut son comptage via `source <> 'order'`. Une faute de
 * frappe ('orders', 'ORDER'…) ferait silencieusement recompter les crédits
 * en ligne dans le quota comptoir et referait refuser des scans légitimes.
 * Ne JAMAIS écrire ce littéral en dur ailleurs.
 */
export const ORDER_STAMP_SOURCE = "order";

/**
 * Statuts qui valent validation par le restaurant.
 * ⚠️ MIROIR de l'étape (1) de credit_order_stamps (db/fidelite/F3b…sql) :
 * toute évolution du vocabulaire OrderStatus doit être répercutée des DEUX
 * côtés, sinon le RPC refuse ce que le TS croit créditable (ou l'inverse).
 */
const SOLID_STATUSES = ["accepted", "preparing", "ready", "completed"] as const;

/** Fenêtre de rattrapage : au-delà, on ne solidifie plus à la volée. */
const SETTLE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Borne dure par appel : une lecture client ne doit jamais devenir lourde. */
const MAX_ORDERS_PER_CALL = 5;

type Sb = ReturnType<typeof supabaseService>;

export type SettleSummary = {
  credited: number;
  orders: number;
  skipped: string[];
};

/**
 * Fabrique (et non constante partagée) : chaque appelant reçoit SON objet.
 * Une constante retournée par référence verrait son tableau `skipped`
 * corrompu globalement au premier .push() d'un futur appelant.
 */
const noop = (): SettleSummary => ({ credited: 0, orders: 0, skipped: [] });

/** Lit le barème (une requête). Retourne null si la carte est introuvable. */
export async function loadStampRule(sb: Sb): Promise<StampRule | null> {
  const { data, error } = await sb
    .from("loyalty_cards")
    .select(
      "stamp_credit_mode, stamp_amount_step, stamp_amount_basis, stamp_max_per_order, stamp_online_enabled",
    )
    .eq("id", CARD_ID)
    .maybeSingle();
  if (error || !data) return null;
  return toStampRule(data as Record<string, unknown>);
}

export type SettleableOrder = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number | string;
  delivery_fee: number | string | null;
  promo_discount_amount: number | string | null;
  customer_id: string | null;
};

/**
 * Colonnes indispensables au calcul. EXPORTÉE et à utiliser TELLE QUELLE
 * partout — recopier cette chaîne à la main est le vecteur n°1 de perte
 * silencieuse de colonnes. NB : depuis le fix total_amount (23.07.2026),
 * `promo_discount_amount` n'entre plus dans le calcul (la remise est déjà
 * dans total_amount) ; il reste projeté à titre informatif.
 */
export const ORDER_COLS =
  "id, order_number, status, total_amount, delivery_fee, promo_discount_amount, customer_id, created_at";

/**
 * Crédite les commandes fournies qui n'ont pas encore de tampon.
 * Le RPC re-vérifie tout côté base : on ne lui fait pas confiance sur parole.
 * EXPORTÉE : le cron filet l'appelle au lieu de redévelopper la boucle.
 */
export async function crediteCommandes(
  sb: Sb,
  orders: SettleableOrder[],
  rule: StampRule,
): Promise<SettleSummary> {
  if (orders.length === 0) return noop();

  // Quelles commandes ont DÉJÀ un tampon ? (1 requête, pas N)
  const ids = orders.map((o) => o.id);
  const { data: dejaCreditees } = await sb
    .from("transactions")
    .select("order_id")
    .eq("type", "stamp_added")
    .in("order_id", ids);
  const dejaFait = new Set(
    (dejaCreditees ?? []).map((t) => t.order_id as string),
  );

  let credited = 0;
  let touched = 0;
  const skipped: string[] = [];

  for (const o of orders) {
    if (dejaFait.has(o.id)) continue;
    if (!o.customer_id) {
      skipped.push(`${o.order_number}:sans_client`);
      continue;
    }

    const stamps = stampsForOrder(o, rule);
    if (stamps <= 0) {
      skipped.push(`${o.order_number}:sous_le_seuil`);
      continue;
    }

    // Carte de fidélité du client (le RPC revérifiera l'appariement).
    const { data: cc } = await sb
      .from("customer_cards")
      .select("id")
      .eq("card_id", CARD_ID)
      .eq("customer_id", o.customer_id)
      .maybeSingle();
    if (!cc) {
      skipped.push(`${o.order_number}:sans_carte`);
      continue;
    }

    const { data: res, error } = await sb.rpc("credit_order_stamps", {
      p_order_id: o.id,
      p_customer_card_id: cc.id,
      p_stamps: stamps,
      p_source: ORDER_STAMP_SOURCE,
    });

    if (error) {
      console.error("[loyalty/settle] RPC échoué", o.order_number, error.code);
      skipped.push(`${o.order_number}:rpc_erreur`);
      continue;
    }
    const out = (res ?? {}) as {
      ok?: boolean;
      credited?: number;
      error?: string;
      reason?: string;
    };
    if (out.ok === false) {
      // Refus EXPLICITE du RPC (mismatch carte/commande, killswitch, carte
      // introuvable…) : journalisé, jamais avalé en succès silencieux.
      console.error(
        "[loyalty/settle] refus RPC",
        o.order_number,
        out.error ?? "inconnu",
      );
      skipped.push(`${o.order_number}:${out.error ?? "refus"}`);
      continue;
    }
    if ((out.credited ?? 0) > 0) {
      credited += out.credited ?? 0;
      touched += 1;
    }
  }

  return { credited, orders: touched, skipped };
}

/**
 * Solidifie les commandes récentes d'UN client. Appelé depuis la lecture
 * fidélité. Borné à MAX_ORDERS_PER_CALL et à la fenêtre de rattrapage.
 */
export async function settleForCard(
  sb: Sb,
  customerId: string,
  rule: StampRule,
): Promise<SettleSummary> {
  if (!rule.enabled || !customerId) return noop();
  try {
    const depuis = new Date(Date.now() - SETTLE_WINDOW_MS).toISOString();
    const { data: orders } = await sb
      .from("orders")
      .select(ORDER_COLS)
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("customer_id", customerId)
      .in("status", SOLID_STATUSES as unknown as string[])
      .gte("created_at", depuis)
      .order("created_at", { ascending: false })
      .limit(MAX_ORDERS_PER_CALL);
    return await crediteCommandes(sb, (orders ?? []) as SettleableOrder[], rule);
  } catch (err) {
    console.error("[loyalty/settle] settleForCard échoué", err);
    return noop();
  }
}

/**
 * Solidifie UNE commande précise. Appelé depuis le polling de /confirmation.
 */
export async function settleForOrder(
  sb: Sb,
  orderId: string,
): Promise<SettleSummary> {
  try {
    const rule = await loadStampRule(sb);
    if (!rule || !rule.enabled) return noop();

    // MÊME fenêtre que settleForCard et le cron : sans elle, rouvrir une
    // /confirmation vieille de 6 mois créditerait la commande au moment de
    // l'activation du killswitch, avec le barème du jour — et contournerait
    // la garde anti-rétroactivité du réglage de barème.
    const depuis = new Date(Date.now() - SETTLE_WINDOW_MS).toISOString();
    const { data: order } = await sb
      .from("orders")
      .select(ORDER_COLS)
      .eq("id", orderId)
      .eq("restaurant_id", RESTAURANT_ID)
      .gte("created_at", depuis)
      .maybeSingle();
    if (!order) return noop();
    const o = order as SettleableOrder;
    if (!SOLID_STATUSES.includes(o.status as (typeof SOLID_STATUSES)[number])) {
      return noop();
    }
    return await crediteCommandes(sb, [o], rule);
  } catch (err) {
    console.error("[loyalty/settle] settleForOrder échoué", err);
    return noop();
  }
}

export { SOLID_STATUSES, SETTLE_WINDOW_MS };
