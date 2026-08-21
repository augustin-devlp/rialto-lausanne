import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/timezone";

/**
 * LA ROTATION QUOTIDIENNE DES CARROUSELS (Augustin, 21.08.2026).
 *
 * Les 12 rails restent définis tels quels dans `collections.ts`, composés à
 * la main, contenu FIXE. Ce qui tourne, c'est le rail AFFICHÉ : la page n'en
 * montre que DEUX par jour, et la paire change chaque jour.
 *
 * ⚠️ NE PAS CONFONDRE avec « un rail dont le contenu tourne » — Augustin a
 * refusé ça explicitement. Le contenu de chaque rail est manuel et ne bouge
 * jamais tout seul.
 *
 * DEUX ET PAS UN : un seul rail au-dessus de 121 plats fait maigre.
 *
 * CYCLE DE SIX JOURS, PAS SEPT. Six contre une semaine de sept, ça décale :
 * l'habitué du samedi voit une paire différente chaque semaine. Un cycle de
 * sept l'aurait figé sur la même paire à vie.
 *
 * ⚠️ AUCUN CRON, AUCUNE TABLE, AUCUN ÉTAT. La paire est DÉRIVÉE de la date.
 * Un cron mort figerait le rail sans que personne le voie — c'est exactement
 * le motif des 13 jours de 401 silencieux. Un calcul dérivé ne peut pas
 * tomber en panne : s'il donne un résultat, il donne le bon.
 */

/** Les 6 paires, dans l'ordre du cycle. Le PREMIER slug s'affiche au-dessus. */
export const PAIRES: readonly (readonly [string, string])[] = [
  ["incontournables", "gout-de-la-mer"], // J1
  ["pizzas-genereuses", "viandes-grillees"], // J2
  ["combos", "leger-et-frais"], // J3
  ["classiques-italiens", "anatoliennes"], // J4
  ["a-partager", "fondant"], // J5
  ["sans-viande", "pates-plats-chauds"], // J6
] as const;

export const LONGUEUR_CYCLE = PAIRES.length; // 6

/**
 * LE JOUR DE SERVICE — frontière à 05:00 Europe/Zurich, PAS à minuit.
 *
 * ⚠️ MÊME FRONTIÈRE QUE LA CLÔTURE CL1 (`db/orders/CL1_cloture_service.sql`).
 * Une seule notion de « jour » dans tout le système : un client qui commande
 * à 00h30 est encore dans le service de la veille, et ne doit pas voir les
 * carrousels basculer sous ses yeux en plein service.
 *
 * 05:00 est aussi la frontière SÛRE vis-à-vis des changements d'heure : le
 * basculement se fait à 02:00 ou 03:00, jamais à 05:00.
 */
export function jourDeService(maintenant: Date = new Date()): string {
  const jour = formatInTimeZone(maintenant, TIMEZONE, "yyyy-MM-dd");
  const heure = Number(formatInTimeZone(maintenant, TIMEZONE, "HH"));
  if (heure >= 5) return jour;
  // Avant 05:00 : on appartient encore au service de la veille.
  // Midi UTC comme point d'ancrage pour reculer d'un jour — à minuit, un
  // décalage d'heure d'été pourrait faire sauter deux jours ou zéro.
  const ancre = new Date(`${jour}T12:00:00Z`);
  ancre.setUTCDate(ancre.getUTCDate() - 1);
  return ancre.toISOString().slice(0, 10);
}

/** Position dans le cycle de 6, dérivée du jour de service. */
export function indexDuCycle(jour: string): number {
  const jours = Math.floor(Date.parse(`${jour}T00:00:00Z`) / 86_400_000);
  // Le double modulo protège des dates antérieures à 1970 (Date.parse < 0).
  return ((jours % LONGUEUR_CYCLE) + LONGUEUR_CYCLE) % LONGUEUR_CYCLE;
}

/**
 * Les deux slugs à afficher pour un jour de service donné.
 * Le premier s'affiche au-dessus du second.
 */
export function paireDuJour(jour: string): readonly [string, string] {
  return PAIRES[indexDuCycle(jour)];
}

/**
 * Filtre une liste de rails déjà résolus pour ne garder que la paire du jour,
 * DANS L'ORDRE DE LA PAIRE (et non dans l'ordre de `collections.ts`).
 *
 * ⚠️ LA SÉLECTION VIT ICI, PAS CHEZ L'APPELANT — règle d'office du 21.08.
 * Un composant qui filtrerait lui-même finirait par oublier l'ordre, ou par
 * réafficher les douze le jour où quelqu'un ajoute une seconde surface.
 *
 * Un rail vidé par les filtres client (régime, allergène, épuisés) disparaît
 * naturellement : `resoudCollections` ne le renvoie déjà plus.
 */
export function railsDuJour<T extends { slug: string }>(
  rails: T[],
  jour: string,
): T[] {
  const [premier, second] = paireDuJour(jour);
  const parSlug = new Map(rails.map((r) => [r.slug, r]));
  return [premier, second]
    .map((slug) => parSlug.get(slug))
    .filter((r): r is T => r !== undefined);
}

/**
 * Garde d'intégrité de la rotation : les slugs cités par `PAIRES` qui
 * n'existent PAS dans `collections.ts`.
 *
 * Sans elle, une faute de frappe dans un slug ferait disparaître un rail un
 * jour sur six, en silence — et personne ne s'en apercevrait avant qu'un
 * client le signale. Même raison d'être que `idsOrphelins` pour les plats :
 * on journalise au lieu d'avaler.
 *
 * Vérifie aussi que le cycle couvre bien les 12 rails, sans doublon : une
 * paire dupliquée ferait passer un rail deux fois et en priverait un autre.
 */
export function slugsFantomes(slugsConnus: string[]): {
  fantomes: string[];
  jamaisAffiches: string[];
  doublons: string[];
} {
  const connus = new Set(slugsConnus);
  const cites = PAIRES.flat();
  const vus = new Set<string>();
  const doublons: string[] = [];
  for (const s of cites) {
    if (vus.has(s)) doublons.push(s);
    vus.add(s);
  }
  return {
    fantomes: [...new Set(cites.filter((s) => !connus.has(s)))],
    jamaisAffiches: slugsConnus.filter((s) => !vus.has(s)),
    doublons: [...new Set(doublons)],
  };
}
