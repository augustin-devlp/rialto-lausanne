/**
 * CONSTANTES DU MOTEUR ETA/STATUTS — toutes les valeurs de calibrage au
 * même endroit (exigence Augustin 08.08.2026) : on les recalibrera sur
 * les données réelles de septembre SANS chasse au code.
 *
 * RÉCONCILIATION DES COLONNES DE PREP (arbitrage 08.08.2026) :
 *   - restaurants.delivery_prep_time_minutes (30) = LA base cuisine du
 *     moteur pour la livraison.
 *   - restaurants.pickup_prep_time_minutes (15) = la base cuisine du
 *     moteur pour le retrait (variante Confirmée → En préparation →
 *     Prête) — la colonne trouve ici son premier usage vivant.
 *   - restaurants.prep_time_minutes (25) = CANTONNÉE à la validation de
 *     créneau pickup existante (POST /api/orders) — héritage, ne pas
 *     l'utiliser dans le moteur ; candidate à réconciliation ultérieure.
 */

/** File d'attente : minutes ajoutées par commande active devant celle-ci. */
export const QUEUE_MIN_PER_ORDER = 4;
/** Plafond du bonus de file (≈ 5 commandes comptées, arbitrage 08.08). */
export const QUEUE_BONUS_CAP_MIN = 20;

/**
 * Occupation livreur : aller simple MOYEN depuis la pizzeria (minutes).
 * L'aller-retour = 2 × cette valeur. Estimation volontairement grossière
 * (cadrage : « estimation TRÈS simple ») — à recalibrer en septembre.
 */
export const COURIER_AVG_ONE_WAY_MIN = 12;
/** Facteur aller-retour appliqué à l'aller simple moyen. */
export const COURIER_ROUND_TRIP_FACTOR = 2;
/** Plafond du bonus livreur (le plafond global « moins d'1h » juge après). */
export const COURIER_BONUS_CAP_MIN = 25;

/** Heures de pointe Europe/Zurich (portées de prepTime.ts, réconcilié). */
export const RUSH_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [12, 14],
  [19, 21],
];
export const RUSH_BONUS_DELIVERY_MIN = 10;
export const RUSH_BONUS_PICKUP_MIN = 5;

/**
 * Trajet de CETTE commande : minutes de zone − ce recouvrement (la fin de
 * cuisson chevauche le départ du livreur — héritage prepTime.ts).
 */
export const TRAVEL_OVERLAP_DEDUCTION_MIN = 15;

/** Largeur de la fourchette affichée (min → min + spread), avant arrondi. */
export const RANGE_SPREAD_MIN = 10;
/** Arrondi d'affichage : toutes les bornes tombent sur un multiple de 5. */
export const ROUND_TO_MIN = 5;
/**
 * Plafond d'affichage : au-delà, on annonce « moins d'1h » — jamais de
 * promesse à la minute quand l'estimation est incertaine (arbitrage 08.08).
 */
export const DISPLAY_CAP_MIN = 60;
/**
 * Resserrage : quand il reste moins que cette fenêtre avant l'ETA, on
 * affiche « ~X min » (l'estimation s'affine à l'approche).
 */
export const NEAR_WINDOW_MIN = 15;

/**
 * Borne des commandes « actives » : au-delà de cet âge d'acceptation, une
 * commande ne compte plus dans la file NI dans l'occupation livreur —
 * sans cette borne, une commande jamais clôturée (constaté : 14 accepted
 * zombies en base de test) empoisonnerait l'ETA à vie.
 */
export const ACTIVE_WINDOW_MIN = 90;
/**
 * Proxy serveur « livraison en course » : une commande acceptée depuis
 * plus longtemps que la base cuisine livraison est réputée partie en
 * livraison (approximation une-requête, volontairement simple).
 */
export const IN_COURSE_AFTER_MIN = 30;

/** Durée d'affichage de la phase « Confirmée » après l'acceptation. */
export const CONFIRMED_PHASE_MIN = 2;
/** Tick de recalcul de la phase côté client (ms). */
export const PHASE_TICK_MS = 30_000;

/** Défauts de repli si une colonne restaurant/zone manque (relecture 13.08 :
 * ils étaient écrits en dur à 3 endroits — le recalibrage les aurait ratés). */
export const DEFAULT_DELIVERY_PREP_MIN = 30;
export const DEFAULT_PICKUP_PREP_MIN = 15;
export const DEFAULT_ZONE_MINUTES = 30;

/**
 * Au-delà de ce maximum calculé, « moins d'1h » MENTIRAIT (le moteur peut
 * sortir 100+ min en rush chargé) : on bascule sur « plus d'1h ». Décision
 * d'affichage à valider avec Augustin — l'esprit du plafond est la
 * prudence, pas le mensonge (relevé relecteur 13.08).
 */
export const DISPLAY_OVER_CAP_THRESHOLD_MIN = 75;
