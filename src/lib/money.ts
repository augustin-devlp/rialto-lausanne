/**
 * ARGENT — LA SEULE FAÇON DE COMPARER DES MONTANTS (Augustin, 22.08.2026).
 *
 * 🔴 RÈGLE : AUCUNE COMPARAISON D'ARGENT NE SE FAIT EN FLOTTANT. Les
 * montants se comparent en CENTIMES ENTIERS, partout, client et serveur.
 *
 * ────────────────────────────────────────────────────────────────────
 * CE QUI A COÛTÉ CETTE RÈGLE
 * ────────────────────────────────────────────────────────────────────
 * Le 22.08, sur un panier de trois plats aux prix pratiqués chez Rialto :
 *
 *     19.90 + 12.20 + 12.90 = 44.99999999999999
 *
 * Dans une zone à 45 de minimum, ce panier vaut 45 francs et pèse moins de
 * 45 en IEEE 754. Le gate du checkout testait `missing === 0` — une
 * ÉGALITÉ FLOTTANTE À ZÉRO. Résultat à l'écran : « Encore 0.00 CHF » et le
 * bouton « Passer la commande » DÉSACTIVÉ. Le client ne pouvait pas
 * commander, et rien ne lui disait quoi ajouter.
 *
 * C'est le pire genre de bug : il coûte une vente à chaque occurrence, en
 * silence, et aucun client ne peut le rapporter — il croit que le site est
 * cassé et il s'en va.
 *
 * ────────────────────────────────────────────────────────────────────
 * POURQUOI LES CENTIMES ET PAS UNE TOLÉRANCE
 * ────────────────────────────────────────────────────────────────────
 * Le dépôt portait DEUX parades différentes au même problème :
 *   · `deriveOrderPricing.ts` comparait déjà en centimes entiers — avec un
 *     commentaire qui disait « toute comparaison monétaire passe par là »,
 *     alors que la fonction était LOCALE et non exportée ;
 *   · `delivery/rule.ts` et `delivery/minimum.ts` utilisaient une tolérance
 *     d'un demi-centime.
 * Les deux marchent. Mais deux parades, c'est deux comportements à tenir
 * d'accord, et une tolérance laisse la question « combien ? » ouverte à
 * chaque nouvel appelant. Les centimes entiers ne laissent rien d'ouvert :
 * un montant en francs suisses N'A PAS de troisième décimale.
 *
 * ⚠️ CE MODULE NE CALCULE RIEN. Il ne fait qu'ARBITRER des comparaisons.
 * Les sommes, remises et arrondis restent chez ceux qui les font — et les
 * ASSIETTES ne sont jamais unifiées (règle du 24.07.2026).
 */

/**
 * Un montant en francs → un entier de centimes.
 *
 * ⚠️ `Math.round` et pas `Math.trunc` : c'est ce qui absorbe le résidu.
 * `Math.round(4499.999999999999)` vaut 4500 — le panier à 44.99999999999999
 * pèse bien 45 francs, ce qu'il a toujours valu pour le client.
 *
 * ⚠️ Un montant non fini vaut 0. Jamais NaN : un NaN qui se propage dans
 * une comparaison la rend TOUJOURS fausse, ce qui ouvre ou ferme une porte
 * au hasard selon le sens du test.
 */
export function centimes(montant: number | string | null | undefined): number {
  const n = Number(montant);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** `montant >= seuil`, en centimes. Le prédicat des SEUILS ATTEINTS. */
export function atteint(montant: number, seuil: number): boolean {
  return centimes(montant) >= centimes(seuil);
}

/** `montant < seuil`, en centimes. Le prédicat des REFUS. */
export function enDessous(montant: number, seuil: number): boolean {
  return centimes(montant) < centimes(seuil);
}

/** `montant > seuil`, en centimes. */
export function auDessus(montant: number, seuil: number): boolean {
  return centimes(montant) > centimes(seuil);
}

/** Deux montants sont-ils le même montant ? Remplace tout `a === b`. */
export function memeMontant(a: number, b: number): boolean {
  return centimes(a) === centimes(b);
}

/** Le montant est-il nul ? Remplace tout `montant === 0`. */
export function estNul(montant: number): boolean {
  return centimes(montant) === 0;
}

/**
 * Ce qu'il manque pour atteindre le seuil, en francs. 0 si atteint.
 *
 * ⚠️ REMPLACE LA FORMULE À `Math.ceil` qui traînait en deux exemplaires
 * (`milestones.ts`, `minimum.ts`) : `Math.ceil(Math.round((seuil - montant)
 * * 10000) / 100) / 100`, avec un plancher à 0.01 pour qu'un résidu ne
 * s'affiche jamais « 0.00 ». En centimes entiers, le plancher n'a plus lieu
 * d'être : soit le seuil est atteint et il manque 0, soit il manque au
 * moins 1 centime. Le cas « affiche 0.00 mais bloque » ne peut plus exister
 * — c'est une propriété de la représentation, pas une garde à maintenir.
 */
export function manqueJusqua(montant: number, seuil: number): number {
  const ecart = centimes(seuil) - centimes(montant);
  return ecart <= 0 ? 0 : ecart / 100;
}
