/**
 * deriveOrderPricing — LA re-dérivation des prix serveur (lot bloquant
 * go-live, GO Augustin 20.08.2026).
 *
 * Décision de principe : le serveur re-dérive TOUS les montants depuis le
 * catalogue (prix articles + extra_price des options) et n'accepte du
 * client que LES ARTICLES ET LEURS QUANTITÉS. Les montants du payload
 * (item_price_snapshot, extra_price, subtotal) sont IGNORÉS — ils ne
 * servent qu'à mesurer l'écart, jamais à facturer ni à insérer.
 *
 * Règles actées (réponses Augustin 20.08) :
 *  - écart à la HAUSSE au-delà de ±0.01 → re-confirmation (409), JAMAIS
 *    de facturation silencieuse au-dessus du prix affiché (le prix
 *    affiché engage) ; à la BAISSE → silencieux, journalisé ;
 *  - article introuvable / indisponible / épuisé / hors saison → refus
 *    NET qui NOMME l'article ;
 *  - option introuvable (renommée au dashboard, ou fantôme d'une
 *    re-commande) → conservée AU LIBELLÉ (info cuisine), extra facturé
 *    0, journalisée — la re-commande légitime n'est pas punie ;
 *  - item_name_snapshot = TOUJOURS le nom CATALOGUE (l'étiquette qui
 *    part en cuisine ne vient jamais du client) ;
 *  - bornes anti-abus : quantités entières 1–30, 50 lignes max.
 *
 * Fonction PURE : aucune I/O — le catalogue est fourni par l'appelant
 * (relu FRAIS en base, jamais le cache upsell 30 s). Testée par
 * src/lib/pricing/deriveOrderPricing.test.ts.
 */

export const TOLERANCE_CHF = 0.01;
export const MAX_LIGNES = 50;
export const MAX_QUANTITE = 30;

/** Ligne telle que postée par le client (montants NON fiables). */
export type LigneClient = {
  menu_item_id?: string | null;
  item_name_snapshot?: string | null;
  item_price_snapshot?: number;
  quantity?: number;
  selected_options?:
    | { group?: string | null; name?: string | null; extra_price?: number }[]
    | null;
  subtotal?: number;
  notes?: string | null;
};

/** Article du catalogue, relu frais en base (scopé RESTAURANT_ID). */
export type ArticleCatalogue = {
  id: string;
  name: string;
  price: number | string;
  is_available: boolean | null;
  is_out_of_stock: boolean | null;
  is_seasonal: boolean | null;
  season_start: string | null;
  season_end: string | null;
};

/** Option du catalogue (modèle plat menu_item_options). */
export type OptionCatalogue = {
  item_id: string;
  option_group: string;
  option_name: string;
  extra_price: number | string;
};

/** Ligne re-dérivée, prête pour l'INSERT order_items et le reçu. */
export type LigneDerivee = {
  menu_item_id: string;
  item_name_snapshot: string;
  item_price_snapshot: number;
  quantity: number;
  selected_options: { group: string; name: string; extra_price: number }[];
  subtotal: number;
  notes: string | null;
};

export type AjustementLigne = {
  menu_item_id: string;
  nom: string;
  quantity: number;
  subtotal_client: number;
  subtotal_serveur: number;
  motif: "prix" | "option_inconnue";
};

export type Derivation =
  | {
      ok: true;
      lignes: LigneDerivee[];
      /** Σ subtotals re-dérivés — LA nouvelle assiette (minimums, promo,
       *  seuil de gratuité, total). */
      subtotal: number;
      /** null quand tout colle à ±0.01 près et sans option inconnue. */
      ajustements: {
        total_client: number;
        total_serveur: number;
        lignes: AjustementLigne[];
      } | null;
      /** true = le re-dérivé dépasse le déclaré de plus de ±0.01 → la
       *  route répond 409 re-confirmation, AUCUNE commande créée. */
      hausse: boolean;
    }
  | { ok: false; status: number; message: string };

const arrondi = (x: number) => Math.round(x * 100) / 100;

/** Nom affichable dans un message d'erreur pour un id inconnu : le
 *  libellé CLIENT, tronqué — jamais inséré nulle part. */
function nomClient(l: LigneClient): string {
  const n = (l.item_name_snapshot ?? "").trim().slice(0, 60);
  return n || "Un article de votre panier";
}

export function deriveOrderPricing(
  items: LigneClient[],
  catalogue: ArticleCatalogue[],
  options: OptionCatalogue[],
  /** Clé jour Europe/Zurich « YYYY-MM-DD » (fenêtre saisonnière). */
  jourCle: string,
): Derivation {
  if (items.length > MAX_LIGNES) {
    return {
      ok: false,
      status: 400,
      message: `Panier trop volumineux (${MAX_LIGNES} lignes maximum).`,
    };
  }

  const parId = new Map(catalogue.map((a) => [a.id, a]));
  // Options par item, indexées « groupe␀nom » (triplet unique en base —
  // vérifié 20.08, mais l'unicité n'est que factuelle : en cas de doublon
  // futur, la DERNIÈRE ligne gagne, déterministe).
  const optionsParItem = new Map<string, Map<string, number>>();
  for (const o of options) {
    let m = optionsParItem.get(o.item_id);
    if (!m) {
      m = new Map();
      optionsParItem.set(o.item_id, m);
    }
    m.set(`${o.option_group}\u0000${o.option_name}`, Number(o.extra_price));
  }

  const lignes: LigneDerivee[] = [];
  const ajustements: AjustementLigne[] = [];
  let totalClient = 0;
  let totalServeur = 0;

  for (const it of items) {
    const qty = it.quantity ?? 0;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITE) {
      return {
        ok: false,
        status: 400,
        message: `Quantité invalide pour « ${nomClient(it)} » (1 à ${MAX_QUANTITE}).`,
      };
    }
    const article = it.menu_item_id ? parId.get(it.menu_item_id) : undefined;
    if (!article) {
      return {
        ok: false,
        status: 400,
        message: `${nomClient(it)} n'existe plus dans notre menu — actualisez la page et refaites votre panier.`,
      };
    }
    const horsSaison =
      article.is_seasonal === true &&
      ((article.season_start !== null &&
        jourCle < String(article.season_start).slice(0, 10)) ||
        (article.season_end !== null &&
          jourCle > String(article.season_end).slice(0, 10)));
    if (
      article.is_available === false ||
      article.is_out_of_stock === true ||
      horsSaison
    ) {
      // Le message NOMME l'article (amendement Augustin 20.08) — nom
      // CATALOGUE, pas client.
      return {
        ok: false,
        status: 400,
        message: `« ${article.name} » n'est plus disponible aujourd'hui — retirez-le de votre panier.`,
      };
    }

    const optionsItem = optionsParItem.get(article.id);
    const optionsDerivees: LigneDerivee["selected_options"] = [];
    let optionInconnue = false;
    let extras = 0;
    for (const o of it.selected_options ?? []) {
      const groupe = (o.group ?? "").trim();
      const nom = (o.name ?? "").trim();
      if (!groupe && !nom) continue;
      const extra = optionsItem?.get(`${groupe}\u0000${nom}`);
      if (extra === undefined) {
        // Option introuvable (renommée, fantôme de re-commande, forgée) :
        // le LIBELLÉ reste (la cuisine doit le lire), l'extra est 0 —
        // jamais le montant client — et l'écart est journalisé.
        optionInconnue = true;
        optionsDerivees.push({ group: groupe, name: nom, extra_price: 0 });
      } else {
        extras += extra;
        optionsDerivees.push({ group: groupe, name: nom, extra_price: extra });
      }
    }

    const unitaire = arrondi(Number(article.price) + extras);
    const subtotalServeur = arrondi(unitaire * qty);
    const subtotalClient = arrondi(Number(it.subtotal ?? 0));
    totalClient += subtotalClient;
    totalServeur += subtotalServeur;

    if (
      Math.abs(subtotalServeur - subtotalClient) > TOLERANCE_CHF ||
      optionInconnue
    ) {
      ajustements.push({
        menu_item_id: article.id,
        nom: article.name,
        quantity: qty,
        subtotal_client: subtotalClient,
        subtotal_serveur: subtotalServeur,
        motif: optionInconnue ? "option_inconnue" : "prix",
      });
    }

    lignes.push({
      menu_item_id: article.id,
      // Nom CATALOGUE — l'étiquette cuisine ne vient jamais du client.
      item_name_snapshot: article.name,
      item_price_snapshot: arrondi(Number(article.price)),
      quantity: qty,
      selected_options: optionsDerivees,
      subtotal: subtotalServeur,
      notes: (it.notes ?? "").trim().slice(0, 200) || null,
    });
  }

  totalClient = arrondi(totalClient);
  totalServeur = arrondi(totalServeur);

  return {
    ok: true,
    lignes,
    subtotal: totalServeur,
    ajustements:
      ajustements.length > 0
        ? {
            total_client: totalClient,
            total_serveur: totalServeur,
            lignes: ajustements,
          }
        : null,
    hausse: totalServeur > totalClient + TOLERANCE_CHF,
  };
}
