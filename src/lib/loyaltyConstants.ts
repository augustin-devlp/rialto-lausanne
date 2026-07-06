/**
 * Constantes du programme de fidélité Rialto Club.
 *
 * Portées depuis loyalty-cards/src/lib/rialtoConstants.ts (Stampify).
 * On ne garde ici que ce qui est utilisé par le cœur fidélité local
 * (carte + inscription + lookup). Les IDs roue/loterie/business restent
 * hors scope (lots ultérieurs).
 */

/** Business Stampify hérité — conservé pour compat. */
export const BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff";

/** Programme "Rialto Club" dans loyalty_cards. */
export const CARD_ID = "f4cb1a3f-fc5c-40eb-87db-8d2c2b0a8b5f";

/**
 * Base URL publique du site Rialto utilisée pour construire le lien
 * /c/… envoyé dans le SMS de bienvenue. Défaut = parité avec Stampify
 * (rialtoConstants.ts). Override possible via NEXT_PUBLIC_RIALTO_BASE_URL.
 */
export const RIALTO_BASE_URL =
  process.env.NEXT_PUBLIC_RIALTO_BASE_URL ??
  "https://rialto-lausanne.vercel.app";
