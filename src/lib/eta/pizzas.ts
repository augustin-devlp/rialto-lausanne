/**
 * Comptage des pizzas d'un panier (moteur ETA par ressource, 18.08.2026).
 * Module PARTAGÉ client/serveur — server.ts importe les matchers pour que
 * la règle soit unique.
 *
 * MATCH PAR MOTIF, pas par égalité stricte (contre-passe 18.08) : un
 * renommage de catégorie (« Pizzas Ø33 cm »…) faisait s'effondrer tout le
 * comptage en 0 CONFIANT — panne totale, silencieuse, du côté court.
 * /pizza/i est le pattern déjà acté dans l'upsell (genericPairingMessage).
 *   - catégorie contenant « pizza » = pizza ;
 *   - catégorie commençant par « combo » = UNE pizza par quantité
 *     (défaut prudent, GO 18.08 — côté serveur, dish_role='combo' double
 *     ce filet).
 */

const MOTIF_PIZZA = /pizza/i;
const MOTIF_COMBO = /^combo/i;

export function estCategoriePizza(nom: string | null | undefined): boolean {
  return nom != null && MOTIF_PIZZA.test(nom) && !MOTIF_COMBO.test(nom);
}

export function estCategorieCombo(nom: string | null | undefined): boolean {
  return nom != null && MOTIF_COMBO.test(nom);
}

/**
 * Retourne NULL quand le compte n'est pas FIABLE : panier vide, ou une
 * ligne sans catégorie (paniers persistés pré-Lot D, anciens chemins).
 * « Je ne sais pas » ≠ « zéro pizza » — un null laisse le défaut prudent
 * serveur s'appliquer (relecture 18.08 : une re-commande de 6 pizzas
 * sans catégories annonçait ~20-25 min).
 */
export function comptePizzasPanier(
  items: Array<{ category?: string | null; quantity: number }>,
): number | null {
  if (items.length === 0) return null;
  let pizzas = 0;
  for (const it of items) {
    if (it.category == null) return null; // ligne inconnue → tout est incertain
    if (estCategoriePizza(it.category) || estCategorieCombo(it.category)) {
      pizzas += it.quantity ?? 1;
    }
  }
  return pizzas;
}
