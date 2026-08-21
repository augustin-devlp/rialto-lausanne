import crypto from "node:crypto";

/**
 * JETON D'ACCÈS À UNE COMMANDE — HMAC dérivé, sans stockage (21.08.2026).
 *
 * ⚠️ POURQUOI CE MODULE EXISTE. La page `/confirmation/<numéro>` et trois
 * routes voisines étaient PUBLIQUES, et les numéros de commande sont
 * SÉQUENTIELS (`R-2026-050`, `051`, `052`…). Vérifié en production le
 * 21.08 : huit requêtes suffisaient à récupérer des mobiles de clients en
 * clair, avec nom, adresse, panier et montant. C'est une fuite de données
 * personnelles au sens nLPD/RGPD.
 *
 * PRINCIPE. Le jeton n'est pas stocké : il est RECALCULÉ à la demande.
 *   jeton = base64url( HMAC-SHA256(secret, "<restaurantId>:<numéro>")[0..16] )
 * Soit 22 caractères et 128 bits. Aucune colonne, donc aucune migration —
 * ce qui compte à quatre jours du gel du code.
 *
 * POURQUOI SIGNER LE NUMÉRO ET NON L'UUID. La solidité d'un HMAC vient de
 * la CLÉ, jamais du secret du message : signer une valeur devinable ne
 * l'affaiblit pas. En revanche, signer le numéro permet de vérifier le
 * jeton AVANT la moindre requête base — un jeton faux ne coûte pas un
 * SELECT.
 *
 * DEUX SECRETS, DÈS LA v1. On signe toujours avec `ORDER_LINK_SECRET`, mais
 * on ACCEPTE aussi `ORDER_LINK_SECRET_PREVIOUS`. C'est le seul remède au
 * défaut de cette approche — un jeton dérivé ne se révoque pas un par un :
 * sans ce second secret, le jour où il faut faire tourner la clé, TOUS les
 * liens déjà envoyés meurent à la même seconde.
 *
 * PAS D'EXPIRATION en v1 : c'est un reçu, le client doit pouvoir le rouvrir.
 * Le format laisse la place d'en ajouter une plus tard sans tout refaire.
 *
 * ⚠️ NE JAMAIS transformer l'absence de secret en laissez-passer. Un
 * `if (!secret) return true` inverserait le sens sûr de la garde — c'est
 * exactement ce que la règle maison interdit. Ici, pas de secret = pas
 * d'accès (voir `isOrderAccessConfigured`).
 */

const LONGUEUR_OCTETS = 16; // 128 bits

/** True si le secret de signature est présent. Sinon, tout est refusé. */
export function isOrderAccessConfigured(): boolean {
  return Boolean(process.env.ORDER_LINK_SECRET);
}

function signe(restaurantId: string, orderNumber: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${restaurantId}:${orderNumber}`)
    .digest()
    .subarray(0, LONGUEUR_OCTETS)
    .toString("base64url");
}

/**
 * Fabrique le jeton d'une commande. Renvoie `null` si le secret manque :
 * l'appelant doit alors considérer que le lien ne peut pas être construit,
 * jamais fabriquer une URL sans jeton.
 */
export function signOrderToken(
  restaurantId: string,
  orderNumber: string,
): string | null {
  const secret = process.env.ORDER_LINK_SECRET;
  if (!secret) return null;
  return signe(restaurantId, orderNumber, secret);
}

/**
 * Vérifie un jeton. Essaie le secret courant, puis le précédent (rotation).
 * Comparaison timing-safe : une comparaison naïve laisse fuir, par le temps
 * de réponse, le nombre de caractères devinés.
 */
export function verifyOrderToken(
  restaurantId: string,
  orderNumber: string,
  jeton: string | null | undefined,
): boolean {
  if (!jeton) return false;
  const secrets = [
    process.env.ORDER_LINK_SECRET,
    process.env.ORDER_LINK_SECRET_PREVIOUS,
  ].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) return false;

  const fourni = Buffer.from(jeton, "base64url");
  if (fourni.length !== LONGUEUR_OCTETS) return false;

  let valide = false;
  for (const secret of secrets) {
    const attendu = Buffer.from(signe(restaurantId, orderNumber, secret), "base64url");
    // Pas de court-circuit : on teste TOUS les secrets pour que le temps de
    // réponse ne dise pas lequel a répondu.
    if (crypto.timingSafeEqual(fourni, attendu)) valide = true;
  }
  return valide;
}

/** Nom du paramètre de requête qui porte le jeton. */
export const PARAM_JETON = "t";

/**
 * ⚠️ L'UNIQUE FABRIQUE D'URL DE CONFIRMATION DU DÉPÔT.
 *
 * Quatre endroits construisaient cette URL à la main (email HTML, email
 * texte, redirection après paiement, « Suivre ma commande »). Quatre
 * endroits, c'est quatre occasions d'en oublier un — et un oubli côté
 * checkout livrerait un lien mort au client juste après sa commande.
 * Toute nouvelle surface qui a besoin de ce lien passe PAR ICI.
 */
export function buildConfirmationUrl(params: {
  siteUrl: string;
  restaurantId: string;
  orderNumber: string;
}): string {
  const base = params.siteUrl.replace(/\/$/, "");
  const chemin = `${base}/confirmation/${encodeURIComponent(params.orderNumber)}`;
  const jeton = signOrderToken(params.restaurantId, params.orderNumber);
  // Sans secret, on rend l'URL nue plutôt qu'une URL au jeton vide : elle
  // sera refusée à l'ouverture, ce qui est le comportement voulu, et le
  // fail-fast se voit dans les logs du point d'appel.
  return jeton ? `${chemin}?${PARAM_JETON}=${jeton}` : chemin;
}
