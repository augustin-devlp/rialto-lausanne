/**
 * Moteur ETA — LA formule, à un seul endroit (refonte PAR RESSOURCE,
 * 18.08.2026 — remplace le modèle additif par commande du 08.08).
 *
 * Calcul PUR, zéro I/O : mêmes valeurs partout où un délai s'affiche
 * (checkout, page de suivi, menu). Le serveur fournit les INTRANTS
 * (pizzas, retour livreur, poids de prior, minutes de zone, heure
 * d'acceptation), ce module fait tout le calcul — côté client comme côté
 * serveur, sans divergence possible.
 *
 * LA FORMULE :
 *   cuisine = palier(pizzas de la commande + pizzas en cuisine devant)
 *           + prior de rush pondérée (si l'ancre est en heure de pointe)
 *           + signal de latence d'acceptation
 *   départ  = max(cuisine, retour livreur)        ← chevauchement, jamais +
 *   trajet  = max(5, minutes de zone − 25)        ← la zone est un TOTAL,
 *                                                    on en extrait le trajet
 *   total   = départ + trajet   (retrait : total = cuisine, « prête dans X »)
 *
 * Toutes les valeurs de calibrage vivent dans ./constants.ts.
 */

import {
  PREP_PALIERS,
  ZONE_TRAJET_OFFSET_MIN,
  TRAJET_MIN_MIN,
  RUSH_PRIOR_MIN,
  RUSH_WINDOWS,
  LATENCE_LENTE_BONUS_MIN,
  BANDE_AFFICHAGE_MIN,
  ROUND_TO_MIN,
  NEAR_WINDOW_MIN,
  DEFAULT_ZONE_MINUTES,
} from "./constants";

export type EtaInput = {
  fulfillmentType: "pickup" | "delivery";
  /** Pizzas de CETTE commande (checkout : celles du panier ; les combos
   * comptent chacun pour UNE pizza — défaut prudent, GO 18.08). */
  pizzasCommande: number;
  /** Pizzas des commandes actives encore EN CUISINE devant celle-ci. */
  pizzasEnCuisineDevant: number;
  /** delivery_zones.estimated_delivery_minutes — TOTAL porte-à-porte
   * historique, le trajet en est EXTRAIT ici. Null/absent en pickup. */
  zoneMinutes?: number | null;
  /** Minutes avant le retour du livreur (0 = disponible), calculées par
   * le serveur depuis la ZONE de sa course en cours. */
  retourLivreurMinutes: number;
  /** Poids d'ignorance de la prior rush (0 / 0.3 / 0.6), mesuré par le
   * serveur sur l'état des compteurs À L'ANCRAGE. */
  poidsPrior: number;
  /** Signal de latence d'acceptation (suivi uniquement ; null au checkout). */
  latence?: "rapide" | "lente" | null;
  /** Ancre temporelle : l'ACCEPTATION au suivi (monotonie), le présent au
   * checkout. Ne sert qu'à évaluer la fenêtre de rush. */
  now: Date;
};

export type EtaRange = {
  /** Total estimé BRUT, en minutes (le point du modèle, non arrondi). */
  totalMinutes: number;
  /** Borne basse affichable (arrondie). */
  minMinutes: number;
  /**
   * ÉCHÉANCE de la promesse : la borne HAUTE du libellé checkout, dérivée
   * de la MÊME table que libelleEta — c'est la cible du compte à rebours
   * ET de la bascule « Livrée ». Relecture 18.08 : décompter vers
   * arrondi(total)+bande puis RE-passer par la table ajoutait la bande
   * une seconde fois — la promesse empirait de 10 min à l'acceptation.
   */
  maxMinutes: number;
  /** Départ estimé (max(cuisine, retour livreur)) — frontière
   * « En préparation » → « En livraison » du suivi. = cuisine en pickup. */
  departMinutes: number;
  /** Part cuisine seule (cible du pickup, découpage des phases). */
  kitchenMinutes: number;
};

/** Palier de cuisine pour un nombre de pizzas donné. Au-delà du dernier
 * seuil (7+), la valeur PLAFONNE (12 pizzas = 20 pizzas = 40 min —
 * sous-estimation assumée, cf. constants.ts). Entrée non finie → premier
 * palier PRUDENT n'existe pas : on prend le palier 1-3 (jamais 0 sur une
 * donnée corrompue). */
export function palierCuisine(pizzas: number): number {
  if (!Number.isFinite(pizzas) || pizzas < 0) return PREP_PALIERS[1][1];
  let palier: number = PREP_PALIERS[0][1];
  for (const [seuil, minutes] of PREP_PALIERS) {
    if (pizzas >= seuil) palier = minutes;
  }
  return palier;
}

/**
 * Échéance (borne haute de promesse) pour un total donné — la MÊME table
 * que libelleEta : « ~20-25 min » promet 25 ; « 40-50 min » promet 50 ;
 * « environ une heure » promet 65 ; « un peu plus d'une heure » 80 ;
 * « environ 1h30 » 90.
 */
export function echeanceMinutes(totalMinutes: number): number {
  if (totalMinutes <= 25) return 25;
  const bas = arrondi(totalMinutes);
  if (bas <= 50) return bas + BANDE_AFFICHAGE_MIN;
  if (totalMinutes <= 65) return 65;
  if (totalMinutes <= 80) return 80;
  return 90;
}

function estRush(now: Date): boolean {
  // hourCycle h23 : hour12:false peut rendre « 24 » à minuit selon la
  // version d'ICU — sans effet sur les fenêtres actuelles, mais toute
  // fenêtre future touchant minuit casserait (relevé relecteur 13.08).
  const h = parseInt(
    now.toLocaleString("en-US", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      hourCycle: "h23",
    }),
    10,
  );
  return RUSH_WINDOWS.some(([debut, fin]) => h >= debut && h < fin);
}

function arrondi(minutes: number): number {
  return Math.max(
    ROUND_TO_MIN,
    Math.round(minutes / ROUND_TO_MIN) * ROUND_TO_MIN,
  );
}

export function computeEtaRange(input: EtaInput): EtaRange {
  // Prior de rush : une prédiction, pondérée par l'ignorance — et encore
  // divisée par 2 si l'acceptation éclair a montré une cuisine réactive.
  const prior = estRush(input.now)
    ? RUSH_PRIOR_MIN *
      input.poidsPrior *
      (input.latence === "rapide" ? 0.5 : 1)
    : 0;
  const latenceLente =
    input.latence === "lente" ? LATENCE_LENTE_BONUS_MIN : 0;

  const cuisine =
    palierCuisine(input.pizzasCommande + input.pizzasEnCuisineDevant) +
    prior +
    latenceLente;

  if (input.fulfillmentType === "pickup") {
    return {
      totalMinutes: cuisine,
      minMinutes: arrondi(cuisine),
      maxMinutes: cuisine,
      departMinutes: cuisine,
      kitchenMinutes: cuisine,
    };
  }

  // CHEVAUCHEMENT livreur : max(), jamais une addition — s'il rentre
  // avant la sortie du four, il ne coûte rien.
  const depart = Math.max(cuisine, input.retourLivreurMinutes);
  const trajet = Math.max(
    TRAJET_MIN_MIN,
    (input.zoneMinutes ?? DEFAULT_ZONE_MINUTES) - ZONE_TRAJET_OFFSET_MIN,
  );
  const total = depart + trajet;
  return {
    totalMinutes: total,
    minMinutes: arrondi(total),
    maxMinutes: echeanceMinutes(total),
    departMinutes: depart,
    kitchenMinutes: cuisine,
  };
}

/**
 * Libellés TRANCHÉS (GO Augustin 18.08) — LA table unique, checkout ET
 * suivi (le flip « plus d'1h » → « moins d'1h » venait de deux tables
 * différentes) :
 *   ≤ 25 → « ~20–25 min » · 25-55 → bande de 10 (« 40–50 min ») ·
 *   55-65 → « environ une heure » · 65-80 → « un peu plus d'une heure » ·
 *   > 80 → « environ 1h30 ».
 *
 * ⚖️ RÈGLE DE CHOIX DU PALIER (question Augustin 18.08) : c'est LE POINT
 * ESTIMÉ (totalMinutes) qui choisit le palier — il n'existe AUCUN spread
 * séparé qui s'ajouterait par-dessus. La bande de 10 EST la promesse :
 * borne basse = arrondi5(point), borne haute = +10 = l'échéance
 * (echeanceMinutes), cible du compte à rebours et de la bascule
 * « Livrée ». Exemple : point 53 → arrondi5 = 55 > 50 → « environ une
 * heure » (jamais « 53-68 » : le spread +15 discuté au cadrage a été
 * ABSORBÉ par les bandes de 10 des libellés tranchés — écart signalé et
 * assumé, une seule largeur de promesse partout). La frontière bande →
 * « environ une heure » est arrondi5(point) > 50, soit point > 52,5.
 *
 * ⚠️ IDENTITÉ VÉRIFIÉE PAR CALCUL (contre-passe 18.08) : pour tout
 * total, formatEtaRemaining(echeanceMinutes(total)) === libelleEta(total)
 * — la promesse du suivi à l'acceptation est EXACTEMENT celle du
 * checkout. Toute retouche de l'une des trois fonctions doit re-vérifier
 * cette identité sur la plage 5..120. L'identité porte sur la TABLE, pas
 * sur les intrants : un panier sans catégories connues (compte client
 * null → défaut 2) peut donner un autre total que le comptage serveur
 * réel — divergence assumée, résiduelle après l'enrichissement category.
 */
export function libelleEta(totalMinutes: number): string {
  if (totalMinutes <= 25) return "~20–25 min";
  const bas = arrondi(totalMinutes);
  if (bas <= 50) return `${bas}–${bas + BANDE_AFFICHAGE_MIN} min`;
  if (totalMinutes <= 65) return "environ une heure";
  if (totalMinutes <= 80) return "un peu plus d'une heure";
  return "environ 1h30";
}

/** Libellé au checkout / avant acceptation. */
export function formatEtaRange(range: EtaRange): string {
  return libelleEta(range.totalMinutes);
}

/**
 * Libellé du RESTANT sur la page de suivi. Le restant est mesuré vers
 * l'ÉCHÉANCE (maxMinutes = borne haute de la promesse checkout) : à
 * l'acceptation, ce libellé est EXACTEMENT celui du checkout — puis il
 * ne fait que resserrer (invariant « le suivi ne fait que RESSERRER »,
 * GO 18.08). Il ne repasse PAS par libelleEta (qui ré-ajouterait la
 * bande — le bug de la promesse qui empirait à la confirmation) ; les
 * branches hautes restent couvertes (le flip « plus d'1h » → « moins
 * d'1h » venait de leur absence ici).
 */
export function formatEtaRemaining(remainingMinutes: number): string {
  if (remainingMinutes <= ROUND_TO_MIN) return "d'une minute à l'autre";
  if (remainingMinutes <= NEAR_WINDOW_MIN) {
    return `~${arrondi(remainingMinutes)} min`;
  }
  // 15-25 : le libellé bas de la table (« ~20–25 min ») — une bande
  // chiffrée ici ÉLARGIRAIT la promesse checkout au lieu de la resserrer.
  if (remainingMinutes <= 25) return "~20–25 min";
  if (remainingMinutes <= 60) {
    // Borne haute au PLAFOND (jamais promettre moins que le restant réel)
    // — l'arrondi au plus proche rognait jusqu'à 2,5 min d'échéance.
    const haut = Math.ceil(remainingMinutes / ROUND_TO_MIN) * ROUND_TO_MIN;
    const bas = Math.max(ROUND_TO_MIN, haut - BANDE_AFFICHAGE_MIN);
    return `${bas}–${haut} min`;
  }
  if (remainingMinutes <= 65) return "environ une heure";
  if (remainingMinutes <= 80) return "un peu plus d'une heure";
  return "environ 1h30";
}
