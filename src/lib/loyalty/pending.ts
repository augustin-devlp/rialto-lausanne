/**
 * Tampons EN ATTENTE — état DÉRIVÉ, jamais écrit nulle part (F2, 22.07.2026).
 *
 * Architecture « pending dérivé, acquis écrit » : un tampon en attente n'est
 * PAS une donnée (ni ligne, ni colonne, ni cache). Il est calculé ici, en
 * aval de la base, à partir des commandes encore en statut 'new'.
 *
 * CONSÉQUENCE DIRECTE — la règle absolue anti « donné-repris » :
 * le palier/la récompense est évalué EXCLUSIVEMENT en amont, dans Postgres,
 * sur customer_cards.current_stamps (le solde SOLIDIFIÉ). Un pending ne peut
 * donc pas entrer dans ce calcul — non pas parce qu'on a pris soin de l'en
 * exclure, mais parce qu'il n'existe pas dans la couche où le palier se
 * calcule. Rien à filtrer, donc rien à oublier de filtrer.
 *
 * Refus d'une commande = elle cesse de matcher 'new' → le tampon en attente
 * disparaît de lui-même. Zéro écriture, zéro ligne de code.
 *
 * ⚠️ ORDRE DE DÉPLOIEMENT NON NÉGOCIABLE : F3 (solidification) et F4 (copie
 * dynamique) DOIVENT précéder F5 (activation du killswitch). Tant que rien
 * n'écrit le statut 'accepted', un pending affiché s'évaporerait à H+24 sans
 * qu'aucun tampon ne soit jamais acquis — précisément le donné-repris que
 * cette architecture existe pour interdire.
 */

import { stampsForOrder, type StampRule, type StampableOrder } from "./rule";

/**
 * Fenêtre au-delà de laquelle une commande restée 'new' cesse d'afficher un
 * pending. EXPORTÉE : la garde anti-rétroactivité du réglage de barème
 * (api/dashboard/loyalty/rule) borne son comptage sur la MÊME fenêtre, pour
 * que les deux ne puissent pas diverger.
 */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Statut d'une commande qui n'est ni validée ni refusée : c'est là que vit le pending. */
const PENDING_STATUS = "new";

export type PendingOrder = StampableOrder & {
  order_number: string;
  status: string;
  created_at: string;
  customer_id?: string | null;
};

export type PendingResult = {
  stamps: number;
  orders: Array<{ order_number: string; stamps: number }>;
};

export const EMPTY_PENDING: PendingResult = { stamps: 0, orders: [] };

/**
 * Somme des tampons en attente de validation par le restaurant.
 *
 * @param orders commandes DU CLIENT — elles doivent déjà être filtrées par
 *   customer_id côté appelant. C'est ce qui garantit structurellement la règle
 *   « pas de customer_id = aucun pending affiché » : une commande orpheline
 *   n'appartient à aucun client, elle n'entre donc jamais dans cette liste.
 *   Une commande sans customer_id qu'on afficherait quand même ne se
 *   solidifierait JAMAIS — ce serait un donné-repris déguisé.
 *
 * Retourne un objet IMBRIQUÉ (et non un entier frère de current_stamps) :
 * la forme de l'API interdit mécaniquement le `current_stamps + pending`.
 */
export function computePending(
  orders: PendingOrder[] | null | undefined,
  rule: StampRule,
  now: Date = new Date(),
): PendingResult {
  // Killswitch : tant que la fidélité en ligne est éteinte, aucun pending.
  if (!rule.enabled) return EMPTY_PENDING;
  if (!orders || orders.length === 0) return EMPTY_PENDING;

  const floor = now.getTime() - PENDING_MAX_AGE_MS;
  const lignes: Array<{ order_number: string; stamps: number }> = [];
  let total = 0;

  for (const o of orders) {
    if (o.status !== PENDING_STATUS) continue;
    // Ceinture : une commande orpheline ne peut pas se solidifier. Teste la
    // valeur falsy (null ET undefined) : une projection qui oublierait la
    // colonne laisserait sinon passer des commandes sans client.
    if (!o.customer_id) continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t) || t < floor) continue;

    const n = stampsForOrder(o, rule);
    if (n <= 0) continue;

    lignes.push({ order_number: o.order_number, stamps: n });
    total += n;
  }

  return { stamps: total, orders: lignes };
}
