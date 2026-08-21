/**
 * Le NOM du paramètre de requête qui porte le jeton d'accès à une commande,
 * et la fabrique de chemin relatif — la partie ISOMORPHE de `orderAccess`.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE SÉPARÉMENT. `orderAccess.ts` importe
 * `node:crypto` : l'importer depuis un composant « use client » casserait
 * le build. Les trois surfaces client qui construisent le lien codaient
 * donc `?t=` EN DUR — et `PARAM_JETON`, exporté précisément pour être la
 * source unique du nom, avait trois jumeaux littéraux ailleurs.
 * Le jour où ce nom change (collision, ajout d'une expiration, v2 du
 * format), les lecteurs serveur suivent et les écrivains client NON : le
 * client tombe en 404 juste après avoir commandé. C'est exactement le
 * scénario que l'en-tête de `buildConfirmationUrl` dit vouloir empêcher.
 */

/** Nom du paramètre de requête qui porte le jeton. */
export const PARAM_JETON = "t";

/** Suffixe `?t=…` prêt à coller, ou chaîne vide si le jeton manque. */
export function suffixeJeton(jeton: string | null | undefined): string {
  return jeton ? `?${PARAM_JETON}=${encodeURIComponent(jeton)}` : "";
}

/**
 * Chemin RELATIF vers le suivi d'une commande, jeton compris.
 * Utilisable côté client comme côté serveur.
 */
export function cheminConfirmation(
  orderNumber: string,
  jeton: string | null | undefined,
): string {
  return `/confirmation/${encodeURIComponent(orderNumber)}${suffixeJeton(jeton)}`;
}
