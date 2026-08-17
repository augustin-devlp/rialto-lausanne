/**
 * CONSTANTES DU MOTEUR ETA — modèle PAR RESSOURCE à 6 constantes de
 * calibrage (refonte 18.08.2026, audit + GO Augustin — remplace le
 * modèle additif par commande du 08.08).
 *
 * PHYSIQUE DU MODÈLE : trois ressources, un chevauchement.
 *   - LES MAINS (garnissage) : sérialisées, par PIZZA — le vrai goulot
 *     de production. Paliers observables, pas de minutes inventées.
 *   - LE FOUR : par lots de ~6, cuisson 2-5 min — presque jamais le
 *     goulot, HORS MODÈLE (correction de cadrage Augustin 18.08).
 *   - LE LIVREUR : une course à la fois ; son retour se calcule depuis
 *     la ZONE de sa course (trajet × 2 + remise), jamais un forfait.
 *   - CHEVAUCHEMENT : départ = max(fin cuisine, retour livreur) — JAMAIS
 *     une addition.
 *
 * ⚠️ delivery_zones.estimated_delivery_minutes est un TEMPS TOTAL
 * porte-à-porte historique (cuisine incluse — prouvé par l'audit du
 * 17.08 : l'affichage pré-moteur « Livré en ~X min » montrait la colonne
 * brute, et la zone du propre quartier du restaurant vaut 30). Le moteur
 * en EXTRAIT le trajet via ZONE_TRAJET_OFFSET_MIN — l'ancien
 * TRAVEL_OVERLAP_DEDUCTION_MIN (15) était une rustine partielle qui
 * laissait un double comptage de 15-30 min par calcul.
 *
 * COLONNES restaurants.delivery_prep_time_minutes / pickup_prep_time_minutes :
 * PLUS UTILISÉES par le moteur depuis cette refonte (les paliers pizzas
 * les remplacent). prep_time_minutes (25) reste cantonnée à la validation
 * de créneau pickup héritée.
 */

/**
 * CONSTANTE 1 — Cuisine par PALIERS de pizzas totales en préparation
 * (les miennes + celles des commandes encore en cuisine devant moi) :
 * index 0 = AUCUNE pizza (commande froide/boissons : quasi immédiate),
 * puis 1-3 / 4-6 / 7+.
 * ⚠️ Le palier 7+ PLAFONNE : à 12 pizzas comme à 20, le modèle répond
 * 40 min — au-delà de ~12 pizzas il sous-estimera sciemment (assumé,
 * GO 18.08 : aucun palier supérieur n'est calibrable aujourd'hui).
 * Valeurs à confronter au restaurateur (question posée par Augustin).
 */
export const PREP_PALIERS: ReadonlyArray<readonly [number, number]> = [
  // [pizzas minimum, minutes de cuisine] — UN SEUL tableau de paires :
  // deux tableaux parallèles se désynchronisent à l'édition manuelle
  // (relecture 18.08 : un seuil ajouté sans sa valeur = NaN partout).
  [0, 10],
  [1, 20],
  [4, 30],
  [7, 40],
];

/**
 * CONSTANTE 2 — Part de CUISINE contenue dans le temps TOTAL de zone :
 * trajet réel = max(TRAJET_MIN_MIN, zone_minutes − cet offset).
 * Donne : Chailly 30→5, Lausanne 40→15, Epalinges 45→20, Écublens 55→30.
 */
export const ZONE_TRAJET_OFFSET_MIN = 25;
/** Plancher du trajet extrait (on livre rarement en moins de 5 min). */
export const TRAJET_MIN_MIN = 5;

/**
 * CONSTANTE 3 — Prior de rush : une PRÉDICTION de charge, qui ne sert
 * QUE là où on n'a pas l'information, pondérée par l'ignorance réelle :
 *   ≥ 2 commandes actives  → ×0   (charge VISIBLE : on mesure, on ne
 *                                   devine pas)
 *   1 commande active      → ×0.3
 *   0 active, flux récent  → ×0.6 (une commande < 30 min : le service
 *                                   tourne, des invisibles sont probables)
 *   0 active, rien 30 min  → ×0.3 (creux réel probable — mais les
 *                                   commandes téléphone restent invisibles)
 * Ancrée sur l'HEURE D'ACCEPTATION, jamais recalculée au présent
 * (monotonie du stepper — bloquant relecteur 13.08).
 */
export const RUSH_PRIOR_MIN = 10;
export const PRIOR_POIDS_CHARGE_VISIBLE = 0;
export const PRIOR_POIDS_UNE_ACTIVE = 0.3;
export const PRIOR_POIDS_FLUX_RECENT = 0.6;
export const PRIOR_POIDS_CALME = 0.3;
/** Fenêtre du « flux récent » : une commande créée il y a moins de X min. */
export const FLUX_RECENT_MIN = 30;
/** Heures de pointe Europe/Zurich. */
export const RUSH_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [12, 14],
  [19, 21],
];

/**
 * CONSTANTE 4 — Signal de latence d'acceptation : le SEUL capteur de la
 * charge invisible (téléphone, plateformes, comptoir).
 *   acceptée < 60 s  → la prior d'ignorance est divisée par 2 ;
 *   acceptée > 4 min → +5 min (la cuisine était occupée à autre chose).
 * ⚠️ NON PROUVÉ : les 13 acceptations réelles en base vont de 2,5 à
 * 30 s — le signal « lente » n'a jamais été observé. On le garde comme
 * capteur (coût nul), à invalider avec les données du tap client.
 * AUCUN terme d'« attente d'acceptation » n'existe dans l'ETA : la
 * donnée réelle (acceptation quasi immédiate) le rend inutile (GO 18.08).
 */
export const LATENCE_LENTE_BONUS_MIN = 5;
export const LATENCE_RAPIDE_SEUIL_S = 60;
export const LATENCE_LENTE_SEUIL_S = 240;

/**
 * CONSTANTE 5 — Remise en main propre (paiement espèces au pas de porte)
 * dans le calcul du retour livreur : retour = départ de SA course +
 * trajet de SA zone × 2 + cette remise. Le forfait fixe (25) a été
 * REFUSÉ (GO 18.08) : une course lointaine immobilise le livreur bien
 * plus longtemps, et il assure aussi des livraisons invisibles
 * (téléphone/plateformes) — on sous-estime déjà, jamais deux fois.
 */
export const REMISE_LIVREUR_MIN = 5;
/**
 * BORNE D'INCERTITUDE du retour livreur (contre-passe 18.08) — pas un
 * forfait : au-delà, le modèle ne SAIT plus (commandes jamais clôturées
 * qui fantôment des courses, plusieurs livreurs réels possibles). Sans
 * cette borne, la chaîne séquentielle diverge dès 4 livraisons en 90 min
 * et TOUT le monde reçoit « environ 1h30 » chaque service.
 */
export const MAX_RETOUR_LIVREUR_MIN = 45;
/**
 * Repli de zone en cas d'ERREUR de lecture (≠ absence légitime) :
 * DEFAULT_ZONE_MINUTES (30) est la zone la plus COURTE — l'utiliser en
 * repli d'erreur dégradait vers l'optimiste. En erreur on suppose une
 * zone lointaine : le doute allonge, jamais l'inverse.
 */
export const ZONE_REPLI_ERREUR_MIN = 50;

/**
 * CONSTANTE 6 — Largeur des fourchettes affichées (« 40-50 min »). Une
 * SEULE valeur pour le checkout ET le suivi (GO 18.08 : afficher plus
 * serré au checkout puis plus large au suivi fabrique la déception —
 * le suivi ne fait que RESSERRER la promesse du checkout avec le temps).
 */
export const BANDE_AFFICHAGE_MIN = 10;
/** Arrondi d'affichage : toutes les bornes tombent sur un multiple de 5. */
export const ROUND_TO_MIN = 5;
/** Resserrage : sous cette fenêtre restante, « ~X min ». */
export const NEAR_WINDOW_MIN = 15;

/**
 * Borne des commandes « actives » : au-delà de cet âge, une commande ne
 * pèse plus nulle part — sans cette borne, une commande jamais clôturée
 * (14 zombies constatés) empoisonnerait l'ETA à vie.
 */
export const ACTIVE_WINDOW_MIN = 90;

/** Durée d'affichage de la phase « Confirmée » après l'acceptation. */
export const CONFIRMED_PHASE_MIN = 2;
/** Tick de recalcul de la phase côté client (ms). */
export const PHASE_TICK_MS = 30_000;

/**
 * TAP CLIENT (vérité terrain, GO 18.08) — bornes du geste « commande
 * arrivée ? » : en dessous de MIN, un tap n'est pas plausible (rien ne
 * peut être livré) ; au-delà de MAX, il n'a plus de valeur de
 * calibration (et un vieux lien de suivi ne doit pas écrire des vérités
 * fantaisistes). SOURCE UNIQUE serveur/client : la route refuse ET
 * l'UI masque le bouton sur les mêmes bornes — un CTA affiché que le
 * serveur refuserait est un bouton mort (relecture 18.08).
 */
export const TAP_AGE_MIN_MIN = 5;
export const TAP_AGE_MAX_H = 6;

/** Replis si une donnée manque. */
export const DEFAULT_ZONE_MINUTES = 30;
/** Pizzas supposées au checkout quand le panier n'est pas transmis. */
export const DEFAULT_PIZZAS_COMMANDE = 2;
