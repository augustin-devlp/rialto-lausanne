/**
 * Collecte des INTRANTS du moteur ETA (côté serveur uniquement).
 *
 * Le calcul lui-même vit dans ./eta.ts (pur, partagé client/serveur) —
 * ici on ne fait QUE lire la base et convertir la réalité en intrants :
 * pizzas par commande active, séparation cuisine/course, retour livreur
 * chaîné depuis les ZONES des courses, poids de la prior, latence
 * d'acceptation.
 *
 * ⚓ TOUT EST ÉVALUÉ À L'ANCRE (relecture 18.08 — le point central) :
 * page de suivi = l'heure d'ACCEPTATION, checkout = maintenant. Une
 * commande créée APRÈS l'ancre n'existe pas ; les temps écoulés, l'état
 * cuisine/course et le retour livreur sont ceux DE L'ANCRE. Conséquence :
 * les intrants du suivi sont DÉTERMINISTES — chaque poll et chaque
 * rechargement reproduisent les mêmes valeurs, la monotonie du stepper
 * est structurelle (l'ancien mélange « collecté au présent, consommé
 * depuis l'ancre » faisait reculer la phase à chaque F5). Le poll 15 s
 * recollecte des intrants identiques : coût assumé à l'échelle Rialto,
 * documenté ici pour le recalibrage.
 *
 * SÉPARATION DES FILES PAR CONSTRUCTION (fix V4) : à l'ancre, une
 * commande active est EN CUISINE tant que son temps écoulé est inférieur
 * à SA cuisine estimée (palier de SES pizzas), puis EN COURSE jusqu'au
 * retour du livreur, puis ne pèse plus. Une seule définition, une seule
 * ressource à la fois. LE LIVREUR EST SÉQUENTIEL : les courses sont
 * CHAÎNÉES (départ après retour précédent), jamais parallèles.
 *
 * APPROXIMATION ASSUMÉE : l'acceptation des AUTRES commandes est
 * approximée par leur created_at — justifié par la donnée réelle (les 13
 * acceptations mesurées : 2,5 à 30 s après création). Fenêtre
 * ACTIVE_WINDOW_MIN contre les zombies jamais clôturés.
 *
 * COMPTAGE DES PIZZAS (GO 18.08) : catégorie « Pizza Ø33cm » = pizza ;
 * tout COMBO (dish_role='combo') = UNE pizza par quantité — défaut
 * prudent. TOUTE défaillance de collecte dégrade vers le PRUDENT
 * (relecture 18.08 : les erreurs silencieuses dégradaient vers l'ETA le
 * plus court — l'inverse de la doctrine).
 */

import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  ACTIVE_WINDOW_MIN,
  ZONE_TRAJET_OFFSET_MIN,
  TRAJET_MIN_MIN,
  REMISE_LIVREUR_MIN,
  MAX_RETOUR_LIVREUR_MIN,
  ZONE_REPLI_ERREUR_MIN,
  PRIOR_POIDS_CHARGE_VISIBLE,
  PRIOR_POIDS_UNE_ACTIVE,
  PRIOR_POIDS_FLUX_RECENT,
  PRIOR_POIDS_CALME,
  FLUX_RECENT_MIN,
  LATENCE_RAPIDE_SEUIL_S,
  LATENCE_LENTE_SEUIL_S,
  DEFAULT_ZONE_MINUTES,
  DEFAULT_PIZZAS_COMMANDE,
} from "./constants";
import { palierCuisine } from "./eta";
import { estCategoriePizza, estCategorieCombo } from "./pizzas";

export type EtaIntrants = {
  /** ISO — DERNIÈRE transition vers accepted (tout old_status : le
   * détour new→cancelled→accepted de R-2026-043 échappait au filtre
   * strict — bug V2) ; null si jamais acceptée. */
  accepted_at: string | null;
  pizzas_commande: number;
  pizzas_en_cuisine_devant: number;
  retour_livreur_minutes: number;
  poids_prior: number;
  latence: "rapide" | "lente" | null;
  zone_minutes: number | null;
  fulfillment_type: "pickup" | "delivery";
};

type Sb = ReturnType<typeof supabaseService>;

/** PostgREST rend une relation to-one en OBJET, mais un embed mal résolu
 * peut revenir en tableau — on normalise au lieu de caster à l'aveugle. */
function toOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

type LigneItemBrute = {
  order_id: string;
  quantity: number | null;
  menu_items?: unknown;
};

/** Pizzas par commande d'un lot de lignes order_items. */
function comptePizzasLignes(lignes: LigneItemBrute[]): Map<string, number> {
  const parCommande = new Map<string, number>();
  for (const l of lignes) {
    const qtyBrute = Number(l.quantity ?? 1);
    const qty = Number.isFinite(qtyBrute) && qtyBrute > 0 ? qtyBrute : 1;
    const item = toOne(
      l.menu_items as
        | { dish_role?: string | null; menu_categories?: unknown }
        | { dish_role?: string | null; menu_categories?: unknown }[]
        | null,
    );
    const categorie =
      toOne(item?.menu_categories as { name?: string | null } | null)?.name ??
      null;
    const role = item?.dish_role ?? null;
    // Matchers PARTAGÉS avec le client (pizzas.ts) — motif, pas égalité
    // stricte : un renommage de catégorie ne fait plus tomber le comptage
    // à 0 confiant. dish_role='combo' reste le filet serveur.
    const estPizza =
      estCategoriePizza(categorie) ||
      estCategorieCombo(categorie) ||
      role === "combo";
    if (!estPizza) continue;
    parCommande.set(l.order_id, (parCommande.get(l.order_id) ?? 0) + qty);
  }
  return parCommande;
}

type CommandeActive = {
  id: string;
  created_at: string;
  fulfillment_type: string;
  delivery_zone_id: string | null;
};

type Charge = {
  pizzas_en_cuisine_devant: number;
  retour_livreur_minutes: number;
  nb_actives: number;
  /** Vrai si une requête a échoué — les valeurs sont alors PARTIELLES. */
  degradee: boolean;
};

/**
 * Photographie de la charge À L'ANCRE. Les commandes créées après
 * l'ancre sont exclues par la requête ; les temps écoulés et le retour
 * livreur sont évalués à l'ancre → intrants déterministes au suivi.
 */
async function chargeALAncre(
  sb: Sb,
  ancreMs: number,
  opts: { exclureOrderId?: string },
): Promise<Charge> {
  const borneFenetre = new Date(
    ancreMs - ACTIVE_WINDOW_MIN * 60_000,
  ).toISOString();
  const ancreIso = new Date(ancreMs).toISOString();

  // APPARTENANCE IMMUABLE À L'ANCRE (contre-passe 18.08) : AUCUN filtre
  // de statut vivant — `.eq(status, accepted)` était évalué au PRÉSENT :
  // une commande acceptée (ou annulée) APRÈS mon ancre entrait/sortait
  // rétroactivement de ma file, cassant le déterminisme. Ici : toutes
  // les commandes de la fenêtre créées avant l'ancre, moins celles dont
  // le DERNIER état CONNU À L'ANCRE (order_status_history, immuable)
  // était cancelled. Created_at ≈ acceptation reste l'approximation
  // assumée (2,5-30 s mesurées) — et le jour où la caisse écrira
  // preparing/ready, ce set ne bougera pas.
  let q = sb
    .from("orders")
    .select("id, created_at, fulfillment_type, delivery_zone_id")
    .eq("restaurant_id", RESTAURANT_ID)
    .gte("created_at", borneFenetre)
    .lt("created_at", ancreIso)
    .order("created_at", { ascending: true });
  if (opts.exclureOrderId) q = q.neq("id", opts.exclureOrderId);
  const { data: actives, error: erreurActives } = await q;
  if (erreurActives) {
    console.warn("[eta] lecture des actives en échec", erreurActives);
    return {
      pizzas_en_cuisine_devant: 0,
      retour_livreur_minutes: 0,
      nb_actives: 0,
      degradee: true,
    };
  }
  let commandes = (actives ?? []) as CommandeActive[];
  if (commandes.length > 0) {
    const { data: transitions, error: erreurHisto } = await sb
      .from("order_status_history")
      .select("order_id, new_status, changed_at")
      .in(
        "order_id",
        commandes.map((c) => c.id),
      )
      .in("new_status", ["accepted", "cancelled"])
      .lt("changed_at", ancreIso)
      .order("changed_at", { ascending: true });
    if (erreurHisto) {
      console.warn("[eta] lecture history en échec", erreurHisto);
      // Prudent : sans l'historique, on garde tout le monde (surestime).
    } else {
      const dernierEtat = new Map<string, string>();
      for (const t of (transitions ?? []) as {
        order_id: string;
        new_status: string;
      }[]) {
        dernierEtat.set(t.order_id, t.new_status);
      }
      commandes = commandes.filter(
        (c) => dernierEtat.get(c.id) !== "cancelled",
      );
    }
  }
  if (commandes.length === 0) {
    return {
      pizzas_en_cuisine_devant: 0,
      retour_livreur_minutes: 0,
      nb_actives: 0,
      degradee: false,
    };
  }

  const ids = commandes.map((c) => c.id);
  const zoneIds = [
    ...new Set(
      commandes
        .map((c) => c.delivery_zone_id)
        .filter((z): z is string => z != null),
    ),
  ];
  const [lignesRes, zonesRes] = await Promise.all([
    sb
      .from("order_items")
      .select(
        "order_id, quantity, menu_items ( dish_role, menu_categories ( name ) )",
      )
      .in("order_id", ids),
    zoneIds.length > 0
      ? sb
          .from("delivery_zones")
          .select("id, estimated_delivery_minutes")
          .in("id", zoneIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  let degradee = false;
  if (lignesRes.error) {
    // Sans les items, on ne connaît pas les pizzas : prudent = chaque
    // commande active pèse comme DEFAULT_PIZZAS_COMMANDE.
    console.warn("[eta] lecture des items en échec", lignesRes.error);
    degradee = true;
  }
  if (zonesRes.error) {
    console.warn("[eta] lecture des zones en échec", zonesRes.error);
    degradee = true;
  }
  const pizzasPar = comptePizzasLignes(
    (lignesRes.data ?? []) as LigneItemBrute[],
  );
  const zoneMin = new Map<string, number>(
    (
      (zonesRes.data ?? []) as {
        id: string;
        estimated_delivery_minutes: number | null;
      }[]
    ).map((z) => [
      z.id,
      Number(z.estimated_delivery_minutes ?? DEFAULT_ZONE_MINUTES),
    ]),
  );

  let pizzasEnCuisineDevant = 0;
  let nbActives = 0;
  // Courses candidates au chaînage livreur : [départ estimé ms, trajet].
  const courses: Array<{ departMs: number; trajetMin: number }> = [];

  for (const c of commandes) {
    const createdMs = new Date(c.created_at).getTime();
    const elapsedMin = (ancreMs - createdMs) / 60_000;
    if (!Number.isFinite(elapsedMin) || elapsedMin < 0) continue;
    const pizzas = lignesRes.error
      ? DEFAULT_PIZZAS_COMMANDE
      : (pizzasPar.get(c.id) ?? 0);
    // Cuisine estimée de CETTE commande : palier de SES pizzas seules —
    // approximation locale assumée (pas de récursion de file).
    const cuisineMin = palierCuisine(pizzas);

    if (elapsedMin < cuisineMin) {
      // EN CUISINE à l'ancre — pèse sur les mains (toutes ces commandes
      // sont créées avant l'ancre, donc devant moi par construction).
      nbActives += 1;
      pizzasEnCuisineDevant += pizzas;
      continue;
    }

    if (c.fulfillment_type !== "delivery") continue;

    const zoneRepli = zonesRes.error
      ? ZONE_REPLI_ERREUR_MIN // erreur de lecture : le doute ALLONGE
      : DEFAULT_ZONE_MINUTES;
    const zone = c.delivery_zone_id
      ? (zoneMin.get(c.delivery_zone_id) ?? zoneRepli)
      : DEFAULT_ZONE_MINUTES;
    const trajetMin = Math.max(TRAJET_MIN_MIN, zone - ZONE_TRAJET_OFFSET_MIN);
    const departMs = createdMs + cuisineMin * 60_000;
    // PURGE (contre-passe 18.08) : une course dont le retour PROPRE
    // (départ + trajet×2 + remise, sans chaînage) est antérieur à
    // l'ancre est RENTRÉE — sans cette purge, les commandes jamais
    // clôturées fantômaient des courses chaînées à l'infini.
    const retourPropreMs =
      departMs + (trajetMin * 2 + REMISE_LIVREUR_MIN) * 60_000;
    if (retourPropreMs <= ancreMs) continue;
    courses.push({ departMs, trajetMin });
  }

  // LE LIVREUR EST SÉQUENTIEL (relecture 18.08) : les courses sont
  // chaînées dans l'ordre des départs — le max parallèle sous-estimait
  // de ~25 min en plein rush. Retour = départ effectif + trajet × 2 +
  // remise espèces (forfait fixe REFUSÉ : une course lointaine
  // immobilise 60 min, pas 25). La chaîne est BORNÉE par
  // MAX_RETOUR_LIVREUR_MIN : au-delà, le modèle ne sait plus (courses
  // fantômes possibles, plusieurs livreurs réels possibles) — sans
  // borne, elle divergeait dès 4 livraisons en 90 min.
  courses.sort((a, b) => a.departMs - b.departMs);
  let retourMs = 0;
  for (const course of courses) {
    const departEffectifMs = Math.max(course.departMs, retourMs);
    retourMs =
      departEffectifMs +
      (course.trajetMin * 2 + REMISE_LIVREUR_MIN) * 60_000;
  }
  const retourLivreurMin = Math.min(
    retourMs > ancreMs ? (retourMs - ancreMs) / 60_000 : 0,
    MAX_RETOUR_LIVREUR_MIN,
  );
  if (retourLivreurMin > 0) {
    // Le livreur encore dehors à l'ancre compte comme une activité.
    nbActives += 1;
  }

  return {
    pizzas_en_cuisine_devant: pizzasEnCuisineDevant,
    retour_livreur_minutes: retourLivreurMin,
    nb_actives: nbActives,
    degradee,
  };
}

/** Poids d'ignorance de la prior rush, évalué À L'ANCRE (cf. constants). */
async function poidsPrior(
  sb: Sb,
  ancreMs: number,
  nbActives: number,
  exclureOrderId?: string,
): Promise<number> {
  if (nbActives >= 2) return PRIOR_POIDS_CHARGE_VISIBLE;
  if (nbActives === 1) return PRIOR_POIDS_UNE_ACTIVE;
  // 0 active : le flux récent départage — dernière commande NON refusée
  // créée avant l'ancre (une commande annulée n'est pas un service qui
  // tourne, relecture 18.08).
  let q = sb
    .from("orders")
    .select("created_at")
    .eq("restaurant_id", RESTAURANT_ID)
    .neq("status", "cancelled")
    .lt("created_at", new Date(ancreMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (exclureOrderId) q = q.neq("id", exclureOrderId);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn("[eta] lecture flux récent en échec", error);
    return PRIOR_POIDS_FLUX_RECENT; // prudent : on suppose du flux
  }
  const derniere = (data as { created_at: string } | null)?.created_at;
  if (
    derniere &&
    ancreMs - new Date(derniere).getTime() < FLUX_RECENT_MIN * 60_000
  ) {
    return PRIOR_POIDS_FLUX_RECENT;
  }
  return PRIOR_POIDS_CALME;
}

/** Pizzas de la commande elle-même (page de suivi). */
async function pizzasDeCommande(sb: Sb, orderId: string): Promise<number> {
  const { data, error } = await sb
    .from("order_items")
    .select(
      "order_id, quantity, menu_items ( dish_role, menu_categories ( name ) )",
    )
    .eq("order_id", orderId);
  if (error) {
    // Prudent : sans les items, on suppose le défaut (jamais 0/10 min).
    console.warn("[eta] lecture items de la commande en échec", error);
    return DEFAULT_PIZZAS_COMMANDE;
  }
  const parCommande = comptePizzasLignes((data ?? []) as LigneItemBrute[]);
  return parCommande.get(orderId) ?? 0;
}

/** Intrants pour UNE commande (page de suivi) — tout évalué à l'ancre. */
export async function intrantsPourCommande(
  sb: Sb,
  order: {
    id: string;
    created_at: string;
    status: string;
    fulfillment_type: "pickup" | "delivery";
    delivery_zone_id?: string | null;
  },
): Promise<EtaIntrants> {
  // L'ancre d'abord : la charge et la prior en dépendent.
  // Fix V2 (GO 18.08) : DERNIÈRE transition vers accepted, quel que soit
  // old_status — le détour new→cancelled→accepted de la caisse faisait
  // retomber l'ancre sur created_at (2 min 32 s trop tôt).
  const { data: acceptation, error: erreurAcceptation } = await sb
    .from("order_status_history")
    .select("changed_at")
    .eq("order_id", order.id)
    .eq("new_status", "accepted")
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurAcceptation) {
    // Le repli created_at prendra le relais — trace pour le diagnostic
    // (une ancre qui oscille entre polls = ce warn dans les logs).
    console.warn("[eta] lecture acceptation en échec", erreurAcceptation);
  }

  // Repli d'assurance : si le trigger order_status_history venait à être
  // désactivé (aucune ligne →accepted alors que le statut est avancé),
  // created_at fait ancre — le suivi DÉGRADE au lieu de geler.
  const acceptedAt =
    (acceptation as { changed_at: string } | null)?.changed_at ?? null;
  const statutAvance = order.status !== "new" && order.status !== "cancelled";
  const ancre = acceptedAt ?? (statutAvance ? order.created_at : null);
  const ancreMs = ancre ? new Date(ancre).getTime() : Date.now();

  const [charge, pizzas] = await Promise.all([
    chargeALAncre(sb, ancreMs, { exclureOrderId: order.id }),
    pizzasDeCommande(sb, order.id),
  ]);

  let zoneMinutes: number | null = null;
  if (order.fulfillment_type === "delivery" && order.delivery_zone_id) {
    const { data: zone, error: erreurZone } = await sb
      .from("delivery_zones")
      .select("estimated_delivery_minutes")
      .eq("id", order.delivery_zone_id)
      .maybeSingle();
    if (erreurZone) {
      // Erreur ≠ absence : le repli DEFAULT (30, la zone la plus courte)
      // dégraderait vers l'optimiste — en erreur, le doute allonge.
      console.warn("[eta] lecture zone de la commande en échec", erreurZone);
      zoneMinutes = ZONE_REPLI_ERREUR_MIN;
    } else {
      zoneMinutes =
        zone?.estimated_delivery_minutes != null
          ? Number(zone.estimated_delivery_minutes)
          : null;
    }
  }

  // Signal de latence : création → acceptation réelle. Sans acceptation
  // réelle mesurée (repli created_at), pas de signal.
  let latence: "rapide" | "lente" | null = null;
  if (acceptedAt) {
    const deltaS =
      (new Date(acceptedAt).getTime() - new Date(order.created_at).getTime()) /
      1000;
    if (Number.isFinite(deltaS) && deltaS >= 0) {
      if (deltaS < LATENCE_RAPIDE_SEUIL_S) latence = "rapide";
      else if (deltaS > LATENCE_LENTE_SEUIL_S) latence = "lente";
    }
  }

  // Collecte partielle = ignorance maximale : la prior repasse au poids
  // le plus prudent (le champ degradee n'était qu'un témoin mort sinon).
  const poids = charge.degradee
    ? PRIOR_POIDS_FLUX_RECENT
    : await poidsPrior(sb, ancreMs, charge.nb_actives, order.id);

  return {
    accepted_at: ancre,
    pizzas_commande: pizzas,
    pizzas_en_cuisine_devant: charge.pizzas_en_cuisine_devant,
    retour_livreur_minutes: charge.retour_livreur_minutes,
    poids_prior: poids,
    latence,
    zone_minutes: zoneMinutes,
    fulfillment_type: order.fulfillment_type,
  };
}

/** Intrants pour une ZONE (checkout/menu, avant toute commande) — ancre
 * = maintenant (le checkout vit au présent).
 * `pizzasPanier` : le compte du panier client ; null/absent = inconnu →
 * défaut prudent (un panier sans catégories connues ne doit JAMAIS
 * passer pour « zéro pizza », relecture 18.08). */
export async function intrantsPourZone(
  sb: Sb,
  postalCode: string,
  pizzasPanier?: number | null,
): Promise<EtaIntrants | null> {
  const { data: zone } = await sb
    .from("delivery_zones")
    .select("estimated_delivery_minutes")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("postal_code", postalCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!zone) return null;

  const ancreMs = Date.now();
  const charge = await chargeALAncre(sb, ancreMs, {});
  const poids = charge.degradee
    ? PRIOR_POIDS_FLUX_RECENT
    : await poidsPrior(sb, ancreMs, charge.nb_actives);

  return {
    accepted_at: null,
    // 0 est LÉGITIME (panier boissons seules, compté fiable) — le client
    // envoie null quand il ne SAIT pas (panier vide, catégorie absente).
    pizzas_commande:
      pizzasPanier != null && pizzasPanier >= 0
        ? pizzasPanier
        : DEFAULT_PIZZAS_COMMANDE,
    pizzas_en_cuisine_devant: charge.pizzas_en_cuisine_devant,
    retour_livreur_minutes: charge.retour_livreur_minutes,
    poids_prior: poids,
    latence: null,
    zone_minutes: Number(zone.estimated_delivery_minutes ?? DEFAULT_ZONE_MINUTES),
    fulfillment_type: "delivery",
  };
}
