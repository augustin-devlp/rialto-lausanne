import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * SESSION CLIENT SIGNÉE — le socle (Augustin, décisions du 22.08.2026).
 *
 * ────────────────────────────────────────────────────────────────────
 * CE QUE ÇA FERME
 * ────────────────────────────────────────────────────────────────────
 * Six routes traitaient le NUMÉRO DE TÉLÉPHONE comme un mot de passe. Ce
 * n'en est pas un : c'est un identifiant. La menace n'est pas
 * l'énumération de masse, c'est le CIBLAGE — un ex, un voisin, quelqu'un
 * qui connaît déjà le numéro, obtenait nom, adresse de livraison, code
 * d'entrée de l'immeuble et consignes au livreur. Une requête suffisait.
 *
 * ────────────────────────────────────────────────────────────────────
 * LES TROIS DÉCISIONS QUI GOUVERNENT CE MODULE
 * ────────────────────────────────────────────────────────────────────
 * 1. **Le canal de preuve est l'E-MAIL** (`lienConnexion.ts`). Gratuit,
 *    aucun canal à surveiller le soir du go-live, aucun piège de
 *    caractères.
 * 2. 🔴 **LA CLÉ D'IDENTITÉ RESTE LE TÉLÉPHONE.** Le lien e-mail
 *    *connecte* à un compte identifié par son numéro ; il ne le remplace
 *    pas. Ce module porte donc un `customer_id`, jamais une adresse.
 *    Conséquence voulue : un client qui change d'e-mail perd ce moyen de
 *    connexion, pas son compte.
 * 3. **Un e-mail partagé par deux comptes → écran de choix**, jamais de
 *    supposition. Le module n'en sait rien : il ne reçoit qu'un
 *    `customer_id` déjà tranché.
 *
 * ────────────────────────────────────────────────────────────────────
 * CE QUE CE COOKIE PROUVE, ET CE QU'IL NE PROUVE PAS
 * ────────────────────────────────────────────────────────────────────
 * Il prouve la CONTINUITÉ : « c'est le même navigateur qu'à la
 * connexion ». La POSSESSION, c'est le lien e-mail qui l'établit, une
 * fois, à l'entrée. Les deux sont nécessaires : une session sans preuve
 * d'entrée n'est qu'un souvenir mieux rangé.
 *
 * ⚠️ **CE COOKIE N'EST PAS RÉVOCABLE.** Il est auto-porteur : sa validité
 * tient à sa signature et à sa date, pas à une ligne en base. Le révoquer
 * exigerait une table de sessions — donc une migration. Ce qui existe à la
 * place : une durée bornée (30 jours), `httpOnly` (illisible en JS, donc
 * hors de portée d'un XSS), et la rotation du secret, qui invalide TOUT
 * d'un coup. C'est un choix assumé, pas un oubli.
 *
 * Patron : `scanAuth.ts`, déjà audité sur ce dépôt. On ne réinvente rien.
 */

export const SESSION_COOKIE_NAME = "rialto_client_session";

/**
 * ⚠️ 30 jours, et pas 7 comme le scan. Les deux portes ne protègent pas la
 * même chose : une session de scan permet de CRÉDITER DES TAMPONS depuis
 * le comptoir, une session client donne accès à SES PROPRES commandes.
 * Et le coût d'une reconnexion n'est pas le même : au comptoir un employé
 * lit le code sur une carte plastifiée, un client doit rouvrir sa boîte
 * mail. Raccourcir ici pousserait à ne plus se connecter du tout.
 */
const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;
const TRENTE_JOURS_SEC = 30 * 24 * 60 * 60;

/** True si le secret requis est présent (sinon les routes 500, jamais de repli). */
export function isSessionClientConfigured(): boolean {
  return Boolean(process.env.CLIENT_SESSION_SECRET);
}

function signe(charge: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(charge).digest("hex");
}

export interface CookieSession {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
}

/**
 * Fabrique le cookie de session pour UN client déjà identifié.
 *
 * ⚠️ Suppose que l'appelant a prouvé la possession de l'adresse ET tranché
 * le choix du compte. Ce module ne vérifie ni l'un ni l'autre : sa seule
 * responsabilité est de signer et de relire.
 */
export function creeCookieSession(customerId: string): CookieSession {
  const secret = process.env.CLIENT_SESSION_SECRET as string;
  const expiresMs = Date.now() + TRENTE_JOURS_MS;
  const charge = `${customerId}:${expiresMs}`;
  return {
    name: SESSION_COOKIE_NAME,
    value: `${customerId}.${expiresMs}.${signe(charge, secret)}`,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TRENTE_JOURS_SEC,
    },
  };
}

/** Le cookie de déconnexion : même nom, vidé, expiré. */
export function cookieDeconnexion(): CookieSession {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    },
  };
}

/**
 * Relit une valeur de cookie → le `customer_id`, ou null.
 *
 * ⚠️ Comparaison TIMING-SAFE, et la garde vit ICI, pas chez l'appelant.
 * ⚠️ On vérifie la SIGNATURE AVANT l'expiration : l'inverse laisserait
 * mesurer, au temps de réponse, si une signature forgée est « juste
 * périmée » ou « fausse ».
 */
export function verifieCookieSession(
  value: string | undefined | null,
): string | null {
  if (!value) return null;
  const secret = process.env.CLIENT_SESSION_SECRET;
  if (!secret) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [customerId, expiresStr, hmacFourni] = parts;
  if (!customerId || !expiresStr || !hmacFourni) return null;

  const expiresMs = Number(expiresStr);
  if (!Number.isFinite(expiresMs) || expiresMs <= 0) return null;

  const attendu = signe(`${customerId}:${expiresMs}`, secret);
  const a = Buffer.from(hmacFourni, "hex");
  const b = Buffer.from(attendu, "hex");
  if (a.length !== b.length || a.length === 0) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  if (Date.now() >= expiresMs) return null;
  return customerId;
}

/** Lit le cookie de la requête et le valide → `customer_id` ou null. */
export function clientConnecte(req: NextRequest): string | null {
  return verifieCookieSession(req.cookies.get(SESSION_COOKIE_NAME)?.value);
}
