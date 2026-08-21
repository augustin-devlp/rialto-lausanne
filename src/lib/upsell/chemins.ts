import type {
  CartAnalysis,
  EcartMinimum,
  MenuItemFull,
  PalierLivraison,
} from "./types";

/**
 * LES CHEMINS D'UPSELL — moteur à priorité (spec Augustin, 21.08.2026).
 *
 * Le moteur historique est un SCOREUR : il note tous les candidats et garde
 * le meilleur. La spec décrit autre chose — des CHEMINS ordonnés, où le
 * premier qui correspond gagne, sans jamais cumuler. Ce module apporte cette
 * couche ; le scoreur reste en repli quand aucun chemin ne s'applique.
 *
 * ⚠️ FAIT QUI COMMANDE TOUT : la carte est presque PLATE en prix. On ne peut
 * donc pas faire monter en gamme À L'INTÉRIEUR d'une catégorie — on ne peut
 * qu'AJOUTER UNE CATÉGORIE ABSENTE du panier.
 *
 * ⚠️ CE MODULE FILTRE LUI-MÊME LA DISPONIBILITÉ ET L'ALCOOL, à l'entrée.
 * Il l'a d'abord délégué à l'appelant — c'était l'inversion littérale de la
 * règle d'office du 21.08, donc la 5e occurrence programmée de la même
 * classe de bug : `choisitChemin` est EXPORTÉ, et un second appelant
 * hériterait d'un contrat qui dit « je ne filtre pas ».
 * Double filtrage assumé : `passesHardFilters` reste en aval pour tout le
 * reste (déjà au panier, allergène, régime, article refusé). C'est
 * exactement ce que la règle demande de ne PAS « remonter en amont pour
 * éviter un double filtrage ».
 *
 * ── CHEMINS IMPLÉMENTÉS ICI ─────────────────────────────────────────────
 *   P2 — la distance au palier, avec le prix NET (`cheminP2`)
 *   P3 — plat sans boisson (`cheminP3`)
 *   P4 — plat sans accompagnement, le vrai levier de marge (`cheminP4`)
 *   P5 — le dessert, repas complet sans dessert (`cheminP5`)
 *   P6 — le MODE TABLÉE : pas un chemin, il change les formats de P3/P4/P5
 *         (`panierEstUneTablee`)
 *   P7 — panier sous le minimum de zone : déblocage, pas upsell (`cheminP7`)
 *   P8 — le silence : ne rien dire est une réponse valable (`cheminP8`)
 *
 * ── NON IMPLÉMENTÉ, ET POURQUOI ─────────────────────────────────────────
 *   P1 (combo) → BLOQUÉ, trois raisons, voir `docs/UPSELL_MOTEUR.md`
 *
 * ORDRE RÉEL D'ÉVALUATION (le premier qui matche gagne, jamais de cumul) :
 *   P8 → P7 → P2 → P3 → P4 → P5. Voir `choisitChemin` en bas de fichier.
 */

/** Catégories, par id. Les noms ne sont PAS un discriminant fiable :
 *  « Entrées » mélange 3 accompagnements et 11 entrées, et « Plats viandes »
 *  contient un plat végétarien. On passe donc par les ids, avec une garde. */
export const CAT = {
  PIZZA: "244cfb35-dc56-47e5-b251-862cb623e482",
  PATES: "d30e7b56-3df5-4a6a-95e3-abeeb85b3ebb",
  LASAGNE: "d59b5816-2f22-43d9-bc54-643c228ea87b",
  TORTELLINIS: "6576bf45-6c06-476e-a2f4-f8a491f80430",
  VIANDES: "ceabb32d-190c-4c28-ad1f-f0ebbc79a283",
  POISSONS: "d8117593-23be-4b25-8de6-5dfe80996f38",
  HAMBURGERS: "68f2821b-b2ae-47a4-8166-92d9a2d61dac",
} as const;

/** Articles cités par la spec, par id (jamais par nom : les noms en base
 *  sont accentués et longs — « Mini Rösti », « Salade mêlée » — un lookup
 *  par la graphie de la spec renvoie zéro ligne). */
export const ART = {
  COCA_05: "63889d31-a920-4a73-b5a4-12bfcb6e1575", // Coca-Cola 0.5l · 3.50
  COCA_ZERO_05: "fe329962-741f-4e93-aadb-677a07db2cbd", // Zéro 0.5l · 3.50
  COCA_15: "1fad6b68-90c8-48ae-9aac-b648db8829f2", // Coca-Cola 1.5l · 8.50
  COCA_ZERO_15: "a0184db6-659a-4eba-a9ba-227e3dfcbae0", // Zéro 1.5l · 8.50
  FRITES: "70b16d92-7e04-40a9-9984-429313029fc3", // 8.00
  POTATOES: "f198ecfe-b29b-4be3-9910-b3bb991471bc", // 9.00
  ROSTI: "201c2cd7-d201-4c55-b1bc-f6d3e2942083", // 10.00
  SALADE: "3e311046-cda7-4851-90ba-1ac5690e0361", // 13.00
  TOMATE_MOZZA: "c714276f-c8b0-450c-bf13-d0394e8cbbdc", // 13.00
  VIGNE_5: "7982d1e7-4186-4aa9-80d3-b33863434d0a", // 13.00
  FALAFELS_4: "eb211daa-b84c-4656-b89f-cae7ed196a30", // 13.00
  VIGNE_11: "37464a33-eada-4f3b-8060-768181c29f48", // 21.00
  FALAFELS_11: "7da2f3e2-eb1a-4a11-8553-a3cb2e09d083", // 21.00
  CALAMARS_11: "df18a882-c0f9-44cc-85de-cd15fc76f2af", // 21.00
  BAKLAVA: "9a40203f-8005-4914-8f1e-47076ebdab50", // 10.00 · anatolien
  TIRAMISU: "6d2dd901-99d2-4a76-bb03-a6c77c2d99af", // 9.00 · italien
  GLACE_NOIX: "a254fea6-e24e-46b3-871f-2c0121f49ba7", // 17.00 · 3 pers.
  GLACE_COOKIE: "3598fbf8-f1f9-4431-bf79-24dca6f56e0f", // 17.00 · 3 pers.
} as const;

export type Chemin = "P2" | "P3" | "P4" | "P5" | "P7" | "P8";

export interface ResultatChemin {
  chemin: Chemin;
  /** Candidats DANS L'ORDRE DE PRÉFÉRENCE. Vide si le chemin dit « rien ». */
  candidats: MenuItemFull[];
  /** Renseigné par P2 seulement : de quoi afficher le coût net et sa
   *  décomposition. Voir `cheminP2`. */
  palier?: PalierLivraison;
  /** Renseigné par P7 quand AUCUN article seul ne comble l'écart : le
   *  montant qui manque, à dire SANS proposer d'article. Voir `cheminP7`. */
  manqueSeul?: number;
}

/** Au-delà de cet écart, on ne propose plus de combler : on demanderait
 *  trop d'un coup, et la suggestion devient une injonction. */
export const ECART_MAX_PALIER = 12;

/** Seuil de la tablée (P6). Au-delà, on passe aux grands formats. */
export const SEUIL_TABLEE = 3;

/**
 * Garde d'intégrité : les articles et catégories cités ici qui n'existent
 * PAS au catalogue. Un id périmé rendrait un chemin silencieusement mort —
 * pas d'erreur, pas de log, juste zéro suggestion. Même raison d'être que
 * `idsOrphelins` pour les rails.
 */
export function idsInconnus(catalogue: MenuItemFull[]): {
  articles: string[];
  categories: string[];
} {
  const articles = new Set(catalogue.map((i) => i.id));
  const categories = new Set(catalogue.map((i) => i.category_id));
  return {
    articles: Object.values(ART).filter((id) => !articles.has(id)),
    categories: Object.values(CAT).filter((id) => !categories.has(id)),
  };
}

function parId(catalogue: MenuItemFull[]) {
  const m = new Map(catalogue.map((i) => [i.id, i]));
  return (...ids: string[]): MenuItemFull[] =>
    ids.map((id) => m.get(id)).filter((i): i is MenuItemFull => i !== undefined);
}

/** Les plats principaux du panier (jamais les combos : un combo porte déjà
 *  sa boisson, et compter un combo comme un plat fausserait la tablée). */
function platsDuPanier(panier: MenuItemFull[]): MenuItemFull[] {
  return panier.filter((i) => i.dish_role === "main");
}

/**
 * Le panier est-il anatolien ? Mesuré sur les PLATS seuls (voir P4) :
 * strictement plus de la moitié des plats principaux, quantités comprises.
 */
function majoriteAnatolienne(plats: MenuItemFull[]): boolean {
  const total = plats.reduce((n, i) => n + (i.quantity ?? 1), 0);
  if (total === 0) return false;
  const anat = plats
    .filter((i) => i.cuisine_style === "anatolian")
    .reduce((n, i) => n + (i.quantity ?? 1), 0);
  return anat * 2 > total;
}

/**
 * Le panier est-il une TABLÉE ? Au moins `SEUIL_TABLEE` plats principaux,
 * quantités comprises.
 *
 * Exporté parce que le seuil de SILENCE du moteur (80 CHF) doit l'ignorer :
 * ce plafond vise une grosse commande individuelle, pas un groupe — et
 * trois plats, c'est justement là que les grands formats paient.
 */
export function panierEstUneTablee(panier: MenuItemFull[]): boolean {
  return nbPlats(panier) >= SEUIL_TABLEE;
}

/** Nombre de plats principaux, quantités comprises. */
function nbPlats(panier: MenuItemFull[]): number {
  return platsDuPanier(panier).reduce((n, i) => n + (i.quantity ?? 1), 0);
}

/**
 * P3 — PLAT SANS BOISSON.
 *
 * Déclencheur : au moins un plat principal, aucune boisson.
 * Article : le Coca 0.5l — celui des combos, donc cohérent avec le reste.
 * En mode TABLÉE (P6) : le 1.5l, cinq francs de plus pour le même geste.
 *
 * ⚠️ ZÉRO OU NORMAL : la spec ne tranche pas. On ne devine pas au hasard —
 * on propose les DEUX, normal d'abord, et la garde « déjà au panier » plus
 * le départage font le reste. Si Augustin veut un défaut ferme, c'est une
 * ligne à changer ici, à un seul endroit.
 */
function cheminP3(
  panier: MenuItemFull[],
  analysis: CartAnalysis,
  get: ReturnType<typeof parId>,
): ResultatChemin | null {
  if (!analysis.hasMain) return null;
  if (analysis.hasAnyDrink) return null;

  const tablee = nbPlats(panier) >= SEUIL_TABLEE;
  const candidats = tablee
    ? get(ART.COCA_15, ART.COCA_ZERO_15)
    : get(ART.COCA_05, ART.COCA_ZERO_05);

  return candidats.length > 0 ? { chemin: "P3", candidats } : null;
}

/**
 * P4 — PLAT SANS ACCOMPAGNEMENT. Le vrai levier de marge.
 *
 * Table d'association de la spec, traduite en CATÉGORIES et non en noms.
 *
 * ⚠️ PIZZA → SURTOUT PAS DE FRITES. Personne ne mange des frites avec une
 * pizza. C'est la seule ligne de la table qui est une INTERDICTION — et une
 * interdiction ne peut PAS être portée par ce chemin : elle serait perdue
 * dès que le moteur retombe sur le scoreur.
 * ELLE EST IMPLÉMENTÉE PAR `interditAvecLePanier()` (bas de ce fichier),
 * appelée par `passesHardFilters()` dans `src/lib/upsell/scoring.ts`.
 * Ne pas se fier à l'absence de `ART.FRITES` dans la branche ci-dessous :
 * ce n'est pas une garde, c'est un choix de candidats.
 *
 * ⚠️ ON NE PROPOSE JAMAIS UN ACCOMPAGNEMENT *À CAUSE* D'UN HAMBURGER
 * (Augustin 21.08, après correction de sa propre table). Ils portent
 * `fries_included` en base : ils sont SERVIS avec des frites. Leur en
 * proposer reviendrait à en vendre à quelqu'un qui en a déjà dans son
 * assiette.
 * IMPLÉMENTÉ par la garde `analysis.hasFriesIncluded` en tête de
 * `cheminP4` (ci-dessous), et par l'absence de branche HAMBURGERS.
 * ⚠️ CE PARAGRAPHE DISAIT, JUSQU'AU 21.08 : « sur un panier burger +
 * pâtes, la branche PÂTES répond avant et propose une salade ». C'EST
 * FAUX, et c'est l'inverse de ce que fait le fichier : `hasFriesIncluded`
 * est calculé sur TOUT le panier (`cartAnalysis.ts`, affectation de
 * `a.hasFriesIncluded` dans `analyzeCart`) et la garde est en
 * TÊTE de `cheminP4` (première instruction de la fonction, ci-dessous),
 * donc AVANT le dispatch par
 * catégorie. Un burger (qui vient avec ses frites) fait donc taire P4
 * pour le panier ENTIER, pâtes comprises : la branche PÂTES n'est jamais
 * atteinte, le client tombe sur P3 (boisson) ou P5 (dessert).
 * ⚠️ ARBITRAGE OUVERT, pas corrigé ici : c'est peut-être le comportement
 * voulu (on ne propose pas une salade à côté d'un burger-frites), mais
 * c'est une RÈGLE MÉTIER — déplacer la garde après le dispatch changerait
 * ce que le client voit. Ne pas le faire sans décision d'Augustin.
 */
function cheminP4(
  panier: MenuItemFull[],
  analysis: CartAnalysis,
  get: ReturnType<typeof parId>,
): ResultatChemin | null {
  if (!analysis.hasMain) return null;
  // Un accompagnement OU une entrée déjà présent ferme le chemin : la spec
  // parle de « 0 article de la catégorie Entrées », qui contient les deux.
  if (analysis.roleCount.side > 0 || analysis.roleCount.starter > 0) return null;
  // Le plat contient déjà ses frites (hamburgers) → rien à ajouter.
  if (analysis.hasFriesIncluded) return null;

  const tablee = nbPlats(panier) >= SEUIL_TABLEE;
  // ⚠️ LE DISPATCH INCLUT LES COMBOS, le compte de la tablée NON.
  // `platsDuPanier` exclut les combos — juste pour compter une tablée (un
  // combo porte déjà sa boisson). Mais s'en servir AUSSI pour le dispatch
  // rendait P4 muet sur TOUS les paniers combo : `cats` était vide, aucune
  // branche ne matchait. Or les combos ont leur propre rail, et P4 est
  // « le vrai levier de marge ». Deux usages, deux listes.
  const plats = panier.filter(
    (i) => i.dish_role === "main" || i.dish_role === "combo",
  );
  const cats = new Set(plats.map((p) => p.category_id));

  // Panier anatolien : le signal de cuisine prime sur la catégorie, parce
  // qu'une pizza à la turca est une pizza ET un plat anatolien.
  //
  // ⚠️ ON NE SE SERT PAS DE `analysis.dominantCuisine` ICI, et c'est délibéré.
  // Il compte TOUS les articles, boissons comprises, et exige 66 %. Un Coca
  // (cuisine « universal ») fait donc tomber un tajine seul à 50 % — le
  // panier cesse d'être « anatolien » au moment précis où P4 devient
  // atteignable, puisque P3 passe avant et ne se déclenche que sans boisson.
  // On classe donc sur les PLATS, jamais sur le panier entier.
  if (majoriteAnatolienne(plats)) {
    return fait("P4", tablee ? get(ART.VIGNE_11, ART.FALAFELS_11) : get(ART.VIGNE_5, ART.FALAFELS_4));
  }

  // Pizza — jamais de frites.
  if (cats.has(CAT.PIZZA)) {
    return fait("P4", tablee ? get(ART.VIGNE_11, ART.FALAFELS_11) : get(ART.SALADE, ART.TOMATE_MOZZA));
  }

  // Pâtes, lasagne, tortellinis → la salade allège.
  if (cats.has(CAT.PATES) || cats.has(CAT.LASAGNE) || cats.has(CAT.TORTELLINIS)) {
    return fait("P4", tablee ? get(ART.FALAFELS_11, ART.VIGNE_11) : get(ART.SALADE));
  }

  // Viandes grillées → féculent.
  if (cats.has(CAT.VIANDES)) {
    return fait("P4", tablee ? get(ART.FALAFELS_11, ART.VIGNE_11) : get(ART.POTATOES, ART.ROSTI));
  }

  // Poissons.
  if (cats.has(CAT.POISSONS)) {
    return fait("P4", tablee ? get(ART.CALAMARS_11) : get(ART.ROSTI, ART.SALADE));
  }

  // Hamburgers : voir l'avertissement ci-dessus — on ne propose rien.
  if (cats.has(CAT.HAMBURGERS)) return null;

  return null;
}

function fait(chemin: Chemin, candidats: MenuItemFull[]): ResultatChemin | null {
  return candidats.length > 0 ? { chemin, candidats } : null;
}

/**
 * P2 — LA DISTANCE AU PALIER, AVEC LE PRIX NET.
 *
 * Déclencheur : il reste entre 0 (exclu) et ~12 CHF pour franchir le seuil
 * de livraison offerte.
 *
 * 🌟 CE QU'ON AFFICHE N'EST PAS L'ÉCART À COMBLER, C'EST LE COÛT NET :
 *      coût_net = prix_article − frais_de_livraison_économisés
 * Un dessert à 9 CHF qui supprime 12 CHF de frais fait BAISSER la facture
 * de 3 francs. Dire « ajoutez 8 CHF » serait vrai et stupide ; dire
 * « ajoutez un dessert et payez 3 CHF de MOINS » est vrai et vendeur.
 *
 * 🔴 CONDITION DE VÉRACITÉ ① (Augustin) : ON NE PROPOSE QUE DES ARTICLES
 * DONT LE PRIX ≥ L'ÉCART. En dessous, le seuil n'est PAS franchi et la
 * promesse est fausse — en Suisse le prix affiché engage. C'est le filtre
 * ci-dessous, et c'est la raison d'être de ce chemin.
 * Les conditions ② (décomposition toujours affichée) et ③ (recalcul si le
 * client retire un article) vivent dans l'affichage : `UpsellPanel`.
 * La condition ④ (palier fidélité, aucune math de prix) n'est pas encore
 * implémentée — ce chemin ne traite QUE la livraison offerte.
 *
 * ⚠️ Le palier est résolu CÔTÉ SERVEUR (route upsell → code postal →
 * `getFreeDeliveryMilestone`, la dérivation unique). On ne croit RIEN du
 * client sur un montant qui s'affiche.
 *
 * Départage : le MOINS CHER qui satisfait la contrainte. On ne pousse
 * jamais au maximum — ça se voit, et ça décrédibilise le reste.
 */
function cheminP2(
  analysis: CartAnalysis,
  catalogue: MenuItemFull[],
  palier: PalierLivraison | null | undefined,
): ResultatChemin | null {
  if (!analysis.hasMain) return null;
  if (!palier) return null;
  const ecart = palier.remaining;
  if (!(ecart > 0) || ecart > ECART_MAX_PALIER) return null;

  const candidats = catalogue
    // ① le prix DOIT couvrir l'écart, sinon le seuil n'est pas franchi
    .filter((i) => i.price >= ecart)
    // jamais un plat principal : on comble, on ne redouble pas le repas
    .filter((i) => i.dish_role !== "main" && i.dish_role !== "combo")
    .filter((i) => !analysis.itemIds.has(i.id))
    // le moins cher d'abord
    .sort((a, b) => a.price - b.price)
    .slice(0, 4);

  if (candidats.length === 0) return null;
  return { chemin: "P2", candidats, palier };
}

/**
 * P5 — REPAS COMPLET SANS DESSERT.
 *
 * Déclencheur : un plat ET une boisson au panier, aucun dessert.
 *
 * ⚠️ LE TIRAMISU EST MARQUÉ `contains_alcohol = true` EN BASE. Le filtre
 * d'entrée de ce module l'écarte donc, et le panier italien retombe
 * automatiquement sur le Baklava — sans erreur, sans trou. C'est voulu :
 * la spec dit « Tiramisu SI disponible, sinon Baklava », et « disponible »
 * inclut « pas écarté par une garde ». Augustin demande à Mehmet si son
 * tiramisu contient réellement de l'alcool ; d'ici là, Baklava par défaut.
 * On le cite quand même en PREMIER pour le panier italien : le jour où le
 * drapeau tombe, le chemin se corrige tout seul.
 *
 * ⚠️ LES DEUX GLACES 500 ml sont au même prix, même format, même
 * `serves_pax`. La spec ne tranche pas : on cite les deux, noix d'abord.
 */
function cheminP5(
  panier: MenuItemFull[],
  analysis: CartAnalysis,
  get: ReturnType<typeof parId>,
): ResultatChemin | null {
  if (!analysis.hasMain) return null;
  if (!analysis.hasAnyDrink) return null;
  if (analysis.hasDessert) return null;

  const plats = panier.filter(
    (i) => i.dish_role === "main" || i.dish_role === "combo",
  );

  // Tablée : le format partage plutôt qu'une part individuelle.
  if (panierEstUneTablee(panier)) {
    return fait("P5", get(ART.GLACE_NOIX, ART.GLACE_COOKIE));
  }
  if (majoriteAnatolienne(plats)) {
    return fait("P5", get(ART.BAKLAVA));
  }
  if (plats.some((p) => p.cuisine_style === "italian")) {
    return fait("P5", get(ART.TIRAMISU, ART.BAKLAVA));
  }
  return fait("P5", get(ART.BAKLAVA));
}

/**
 * P7 — LE PANIER EST SOUS LE MINIMUM DE LA ZONE.
 *
 * ⚠️ CE N'EST PAS DE L'UPSELL, C'EST DU DÉBLOCAGE. Le client ne peut pas
 * commander : sans ce complément, sa commande est REFUSÉE. La différence
 * n'est pas cosmétique, elle commande deux choix :
 *
 *   · ON COMBLE VERS LE MINIMUM, PAS VERS LA GRATUITÉ. Proposer d'un coup
 *     de quoi franchir le seuil de livraison offerte, à quelqu'un qui est
 *     déjà bloqué, c'est lui demander beaucoup trop.
 *   · LE MESSAGE DIT CE QUI DÉBLOQUE, PAS CE QU'ON GAGNE. « Ajoutez X pour
 *     pouvoir commander », jamais « profitez de ». Le client n'est pas en
 *     train de se faire plaisir, il est arrêté.
 *
 * Comme P2, on ne propose QUE des articles dont le prix couvre l'écart :
 * en dessous, le panier reste bloqué et la suggestion n'a rien débloqué.
 * Le moins cher d'abord, pour la même raison.
 *
 * ⚠️ P7 PASSE AVANT TOUT LE RESTE (sauf le silence) : tant que le panier
 * est bloqué, aucune autre suggestion n'a de sens.
 */
function cheminP7(
  analysis: CartAnalysis,
  catalogue: MenuItemFull[],
  ecart: EcartMinimum | null | undefined,
): ResultatChemin | null {
  if (!ecart) return null;
  const manque = ecart.remaining;
  if (!(manque > 0)) return null;

  const candidats = catalogue
    .filter((i) => i.price >= manque)
    .filter((i) => !analysis.itemIds.has(i.id))
    .sort((a, b) => a.price - b.price)
    .slice(0, 4);

  // ⚠️ ON NE RESTE PAS MUET QUAND AUCUN ARTICLE NE SUFFIT (Augustin 21.08).
  // L'écart peut dépasser le prix du plat le plus cher (minimum de zone à
  // 55 CHF, panier à 3.50). Rendre `null` faisait retomber le client sur
  // une suggestion quelconque du scoreur, alors qu'il est BLOQUÉ et qu'il
  // ne le sait pas. On dit alors le MONTANT, sans proposer d'article :
  // c'est du déblocage, pas de la vente.
  if (candidats.length === 0) {
    return { chemin: "P7", candidats: [], manqueSeul: manque };
  }
  return { chemin: "P7", candidats };
}

/**
 * P8 — LE SILENCE. Plat + boisson + accompagnement + dessert déjà là :
 * on ne dit rien. Ne rien dire est une réponse valable, et c'est même la
 * bonne quand le repas est complet — insister décrédibilise tout le reste.
 */
function cheminP8(analysis: CartAnalysis): ResultatChemin | null {
  const complet =
    analysis.hasMain &&
    analysis.hasAnyDrink &&
    analysis.hasDessert &&
    (analysis.roleCount.side > 0 || analysis.roleCount.starter > 0);
  return complet ? { chemin: "P8", candidats: [] } : null;
}

/**
 * Le moteur à priorité. Le PREMIER chemin qui correspond gagne, jamais de
 * cumul. Renvoie `null` quand aucun chemin ne s'applique — l'appelant
 * retombe alors sur le scoreur historique.
 *
 * ORDRE RÉEL : P8 → P7 → P2 → P3 → P4 → P5.
 *   · P8 (silence) d'abord — un repas complet ferme la porte avant que
 *     quoi que ce soit ne cherche un trou à combler.
 *   · P7 ensuite — tant que le panier est SOUS LE MINIMUM, il est refusé
 *     au checkout : aucune autre suggestion n'a de sens.
 *   · P2 avant P3/P4/P5 — franchir un palier fait BAISSER la facture,
 *     ça vaut mieux que combler un trou de composition.
 *   · puis P3 → P4 → P5, l'ordre de priorité de la spec.
 */
export function choisitChemin(
  panier: MenuItemFull[],
  analysis: CartAnalysis,
  catalogue: MenuItemFull[],
  palier?: PalierLivraison | null,
  ecartMinimum?: EcartMinimum | null,
): ResultatChemin | null {
  // Filtre d'entrée : jamais un épuisé, jamais un alcool. Même geste que
  // `resoudCollections` pour les rails — la garde vit dans la fonction.
  const sains = catalogue.filter(
    (i) =>
      i.is_available !== false &&
      i.is_out_of_stock !== true &&
      !i.contains_alcohol &&
      (i.dish_role as string) !== "drink_alcohol",
  );
  const get = parId(sains);
  return (
    // ⚠️ P7 EST ÉVALUÉ EN PREMIER, ET C'EST VOLONTAIRE.
    // Cette ligne était SOUS `cheminP8` jusqu'au 21.08, avec déjà le
    // commentaire « P7 avant tout le reste » écrit au-dessus — la phrase
    // était donc fausse au moment même où elle était écrite. Conséquence
    // réelle : un panier composé (entrée + plat + boisson + dessert) mais
    // SOUS LE MINIMUM de sa zone déclenchait P8, c'est-à-dire le SILENCE,
    // et le client était refusé au checkout sans jamais savoir de combien
    // il manquait. Tant que le panier est bloqué, se taire n'est pas une
    // réponse valable.
    cheminP7(analysis, sains, ecartMinimum) ??
    cheminP8(analysis) ??
    // P2 passe devant P3/P4/P5 : franchir un palier vaut mieux que combler
    // un trou de composition, parce qu'il fait BAISSER la facture.
    cheminP2(analysis, sains, palier) ??
    cheminP3(panier, analysis, get) ??
    cheminP4(panier, analysis, get) ??
    cheminP5(panier, analysis, get) ??
    null
  );
}

/**
 * ⚠️ INTERDICTION DURE — PIZZA ET FRITES NE VONT PAS ENSEMBLE.
 *
 * Elle était écrite en commentaire dans P4, et implémentée comme une simple
 * ABSENCE de candidat. Ça ne tient pas : le repli sur le scoreur est un
 * chemin NOMINAL, pas un cas d'erreur — il se déclenche dès qu'une rupture,
 * un allergène, un régime ou un refus antérieur vide les candidats du
 * chemin. Le scoreur reprend alors le menu entier, et « Frites Classique »
 * y remonte sans rien pour l'arrêter. Le client lisait « des frites avec
 * ça ? » sous une pizza.
 *
 * Une interdiction métier vit donc ICI, dans une fonction appelée par la
 * garde dure — jamais dans le choix des candidats. Règle d'office du 21.08.
 */
export function interditAvecLePanier(
  item: { id: string },
  analysis: CartAnalysis,
): boolean {
  if (item.id !== ART.FRITES) return false;
  return analysis.categoryIds.has(CAT.PIZZA);
}
