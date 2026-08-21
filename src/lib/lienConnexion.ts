import crypto from "node:crypto";

/**
 * LIEN DE CONNEXION PAR E-MAIL — la preuve de possession.
 *
 * Patron : `orderAccess.ts`, prouvé en production le 21.08. Jeton DÉRIVÉ
 * en HMAC, donc **aucune table, aucune migration**.
 *
 * ────────────────────────────────────────────────────────────────────
 * LE COMPROMIS, DIT FRANCHEMENT (accepté par Augustin le 22.08)
 * ────────────────────────────────────────────────────────────────────
 * ⚠️ **UN LIEN HMAC EST REJOUABLE JUSQU'À SON EXPIRATION.** Il n'est pas
 * à usage unique : le rendre unique exigerait de stocker les jetons
 * consommés, donc une table. On borne à **15 minutes** et on accepte le
 * rejeu dans cette fenêtre — quelqu'un qui lit la boîte mail peut de toute
 * façon en redemander un.
 *
 * ⚠️ Corollaire à connaître : le lien voyage dans un e-mail, et un e-mail
 * transite par des serveurs. Quinze minutes, c'est la durée pendant
 * laquelle quiconque voit ce lien peut s'en servir.
 *
 * ────────────────────────────────────────────────────────────────────
 * CE QUE LE JETON PORTE, ET POURQUOI
 * ────────────────────────────────────────────────────────────────────
 * Il est signé sur **l'ADRESSE E-MAIL NORMALISÉE + l'ÉCHÉANCE**, jamais
 * sur un `customer_id`. Deux raisons :
 *   1. une adresse peut porter PLUSIEURS comptes (le foyer) — le jeton
 *      prouve l'adresse, l'écran de choix tranche ensuite ;
 *   2. la vérification se fait donc AVANT toute lecture en base : un jeton
 *      invalide ne déclenche aucune requête.
 *
 * 🔴 **CHOISIR PARMI LES COMPTES D'UNE ADRESSE N'EST PAS UNE FRONTIÈRE DE
 * SÉCURITÉ**, et il faut le savoir : qui contrôle la boîte peut ouvrir les
 * deux comptes du foyer. Ce n'est pas un défaut du mécanisme, c'est
 * l'arrangement du foyer lui-même — mais ça doit être un choix conscient.
 *
 * ────────────────────────────────────────────────────────────────────
 * ROTATION
 * ────────────────────────────────────────────────────────────────────
 * Deux secrets, comme `orderAccess` : `LOGIN_LINK_SECRET` et
 * `LOGIN_LINK_SECRET_PREVIOUS`. On signe toujours avec le courant, on
 * accepte les deux à la vérification — une rotation ne coupe personne en
 * plein vol. ⚠️ La vérification n'écourte JAMAIS : les deux secrets sont
 * testés à chaque fois, sinon le temps de réponse dirait lequel a marché.
 */

/** Nom du paramètre d'URL. Court, comme `t` pour les commandes. */
export const PARAM_LIEN = "c";

/** Quinze minutes. Voir le compromis en tête de fichier. */
export const DUREE_LIEN_MS = 15 * 60 * 1000;

/**
 * Normalisation de l'adresse AVANT signature.
 *
 * ⚠️ ELLE DOIT ÊTRE IDENTIQUE À LA SIGNATURE ET À LA VÉRIFICATION, sinon
 * un lien signé sur « Jean@Exemple.CH » ne se vérifie pas sur
 * « jean@exemple.ch » et le client clique dans le vide sans comprendre.
 * On se limite au `trim` + minuscules : PAS de suppression des points ni
 * de ce qui suit un `+`. Ces règles sont propres à Gmail, et les
 * appliquer à tout le monde ferait tomber des adresses légitimes.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function estConfigureLienConnexion(): boolean {
  return Boolean(process.env.LOGIN_LINK_SECRET);
}

function signe(charge: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(charge)
    .digest("base64url")
    .slice(0, 32);
}

/** Fabrique le jeton : `<echeanceMs>.<hmac>`. */
export function signeLienConnexion(email: string): string | null {
  const secret = process.env.LOGIN_LINK_SECRET;
  if (!secret) return null;
  const echeance = Date.now() + DUREE_LIEN_MS;
  const charge = `${normaliseEmail(email)}:${echeance}`;
  return `${echeance}.${signe(charge, secret)}`;
}

export type VerdictLien =
  | { ok: true; email: string }
  | { ok: false; motif: "invalide" | "perime" | "non_configure" };

/**
 * Vérifie un jeton POUR une adresse donnée.
 *
 * ⚠️ On distingue `perime` de `invalide` — et c'est VOULU, contrairement à
 * l'habitude. Un jeton périmé n'apprend rien à un attaquant : il faut déjà
 * détenir une signature valide pour l'obtenir. En échange, le client qui
 * clique sur un vieux lien lit une phrase qui lui dit quoi faire au lieu
 * d'un « lien invalide » qui lui laisse croire qu'il a fait une bêtise.
 */
export function verifieLienConnexion(
  email: string,
  jeton: string | null | undefined,
): VerdictLien {
  const courant = process.env.LOGIN_LINK_SECRET;
  const precedent = process.env.LOGIN_LINK_SECRET_PREVIOUS;
  if (!courant) return { ok: false, motif: "non_configure" };
  if (!jeton) return { ok: false, motif: "invalide" };

  const point = jeton.indexOf(".");
  if (point <= 0) return { ok: false, motif: "invalide" };

  const echeanceStr = jeton.slice(0, point);
  const fourni = jeton.slice(point + 1);
  const echeance = Number(echeanceStr);
  if (!Number.isFinite(echeance) || echeance <= 0) {
    return { ok: false, motif: "invalide" };
  }

  const charge = `${normaliseEmail(email)}:${echeance}`;
  const a = Buffer.from(fourni, "utf8");

  // Les DEUX secrets sont toujours testés : pas de court-circuit, sinon le
  // temps de réponse dirait lequel a servi.
  let valide = false;
  for (const secret of [courant, precedent]) {
    if (!secret) continue;
    const b = Buffer.from(signe(charge, secret), "utf8");
    if (a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)) {
      valide = true;
    }
  }
  if (!valide) return { ok: false, motif: "invalide" };
  if (Date.now() >= echeance) return { ok: false, motif: "perime" };
  return { ok: true, email: normaliseEmail(email) };
}

/**
 * L'URL du lien.
 *
 * ⚠️ L'ADRESSE VOYAGE DANS L'URL, à côté du jeton — c'est nécessaire :
 * le jeton est signé SUR elle, il faut donc la relire pour vérifier.
 * Conséquence assumée : l'adresse apparaît dans l'historique du navigateur
 * du destinataire. C'est SA propre adresse, dans SA boîte, sur SON
 * navigateur — le seul endroit où elle n'apprend rien à personne.
 * ⚠️ Elle ne doit PAS se retrouver dans les référents ni les logs
 * analytiques : la page d'arrivée nettoie l'URL après lecture (voir
 * `ConnexionLienClient`).
 */
export function construitUrlConnexion(email: string, jeton: string): string {
  const base = (
    process.env.NEXT_PUBLIC_RIALTO_BASE_URL ??
    "https://rialto-lausanne.vercel.app"
  ).replace(/\/+$/, "");
  const e = encodeURIComponent(normaliseEmail(email));
  return `${base}/rialto-club/connexion/lien?e=${e}&${PARAM_LIEN}=${encodeURIComponent(jeton)}`;
}
