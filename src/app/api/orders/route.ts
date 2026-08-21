import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { signOrderToken } from "@/lib/orderAccess";
import {
  deriveOrderPricing,
  stripLotOffert,
} from "@/lib/pricing/deriveOrderPricing";
import { sendEmail } from "@/lib/brevo";
import { buildCustomerOrderEmail } from "@/lib/orderEmail";
import { toZurichDate, toZurichHHMM } from "@/lib/timezone";
import { phoneLookupVariants } from "@/lib/phoneVariants";
import { LOTTERY_ID } from "@/lib/loyaltyConstants";
import { zurichMonthStart } from "@/lib/lotteryDraw";
import { ecartAuMinimum } from "@/lib/delivery/minimum";
import {
  validatePromoCode,
  consumePromoCode,
  releasePromoCode,
  markPromoCodeUsedOnOrder,
} from "@/lib/promoCodes";
import {
  toFreeDeliveryRule,
  effectiveDeliveryFee,
} from "@/lib/delivery/rule";

// Route d'écriture : toujours dynamique (client Supabase créé au runtime, jamais au build).
export const dynamic = "force-dynamic";

type IncomingItem = {
  menu_item_id: string;
  item_name_snapshot: string;
  item_price_snapshot: number;
  quantity: number;
  selected_options: { group: string; name: string; extra_price: number }[];
  subtotal: number;
  notes: string | null;
};

type Payload = {
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  payer_phone?: string | null;
  requested_pickup_time: string | null;
  notes: string | null;
  items: IncomingItem[];
  // Delivery fields
  // ⚠️ `fulfillment_type` a été RETIRÉ du payload le 21.08.2026. Le serveur
  // ne le lit plus : Rialto est en livraison seulement, et le mode est
  // imposé côté serveur. Le déclarer ici laisserait croire qu'il compte.
  delivery_address?: string | null;
  delivery_postal_code?: string | null;
  delivery_city?: string | null;
  delivery_floor_door?: string | null;
  delivery_instructions?: string | null;
  delivery_zone_id?: string | null;
  // Phase 1 checkout refonte
  housing_type?: "house" | "apartment" | null;
  entry_code_1?: string | null;
  entry_code_2?: string | null;
  floor?: string | null;
  apartment_number?: string | null;
  doorbell_name?: string | null;
  payment_method?: "card" | "cash" | "twint" | null;
  payment_card_timing?: "on_delivery" | "remote" | null;
  payment_cash_bills?: number | null;
  // Fix total_amount 23.07.2026 : le code promo entre dans CE handler
  // (l'ancien flux en deux temps — POST /api/orders puis
  // /api/promo-codes/apply côté client — laissait total_amount brut).
  promo_code?: string | null;
  /** Total EXACT affiché au client au moment du clic (articles + frais −
   *  remise). Le serveur refuse de facturer au-dessus (409) — le prix
   *  affiché engage, frais de livraison compris. Optionnel : un client en
   *  cache ancien ne l'envoie pas, la garde ne s'applique alors pas. */
  expected_total?: number | null;
  // Lot F : snapshot d'attribution last-touch (UTM/referrer/landing),
  // capté côté client — re-filtré en liste blanche avant écriture.
  attribution?: Record<string, unknown> | null;
};

function parsePickupISO(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Payload | null;
  if (
    !body ||
    !body.restaurant_id ||
    !body.customer_name ||
    !body.customer_phone ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  // ⚠️ L'E-MAIL EST OBLIGATOIRE, ET LA GARDE VIT ICI — pas seulement dans
  // le formulaire (règle gravée : « une garde qui protège une règle métier
  // vit DANS la fonction, jamais chez celui qui l'appelle »). Le 21.08 j'ai
  // d'abord rendu le champ obligatoire dans `CheckoutPageClient.tsx`
  // (const `emailValid`, repris dans `contactValid`)
  // SEULEMENT, ce qui laissait la garantie fausse : n'importe quel POST
  // direct créait encore un client sans adresse — exactement le trou par
  // lequel les 5 clients déjà en base sont passés (le checkout ENVOYAIT
  // l'e-mail, la route ne l'ÉCRIVAIT pas).
  // Le format n'est pas validé plus finement qu'ici : un `@` et un point
  // suffisent, comme au checkout. Le but n'est pas de prouver que l'adresse
  // existe — c'est de refuser une commande sans moyen de recontact.
  // ⚠️ CONSÉQUENCE ASSUMÉE : un client dont le navigateur garde en cache
  // l'ANCIEN bundle du checkout (celui d'avant le 21.08, qui n'exigeait
  // rien) verrait sa commande refusée. Fenêtre de quelques minutes après
  // déploiement, et nulle aujourd'hui puisqu'il n'y a aucun client réel ;
  // à re-vérifier si un correctif du checkout part le soir du go-live.
  // `typeof` et pas `?.trim()` : `body` est un cast brut de `req.json()`,
  // sans validation runtime. Un POST portant `"customer_email": 42` faisait
  // jeter `.trim()` → 500 au lieu du 400 prévu. Même parade que le
  // `String(body.notes)` du bloc de neutralisation des notes.
  const emailRecu =
    typeof body.customer_email === "string" ? body.customer_email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRecu)) {
    return NextResponse.json(
      { error: "Un email valide est requis pour suivre votre commande." },
      { status: 400 },
    );
  }

  // ⚠️ MÊME INVARIANT QUE `fulfillment_type` (voir plus bas) : le serveur
  // n'accepte du client que ce qu'il ne peut pas savoir lui-même — et le
  // restaurant, il le sait. Sans cette ligne, un POST portant un autre
  // `restaurant_id` lisait les ZONES de l'autre restaurant (frais et
  // minimums différents) tout en achetant le catalogue Rialto, s'insérait
  // sous l'autre identifiant — donc invisible au dashboard — et recevait un
  // jeton signé Rialto que la route de suivi refuserait : 404 permanent sur
  // une commande pourtant bien réelle. Inoffensif tant que la base est
  // mono-restaurant ; c'est justement pour ça qu'il faut le fermer avant.
  if (body.restaurant_id !== RESTAURANT_ID) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const sb = supabaseService();

  const { data: restaurant, error: rErr } = await sb
    .from("restaurants")
    .select(
      "id, name, order_min_amount, accepting_orders, phone, address, order_open_time, order_close_time, prep_time_minutes, offers_pickup, offers_delivery, free_delivery_threshold, free_delivery_enabled",
    )
    .eq("id", body.restaurant_id)
    .single();
  if (rErr || !restaurant) {
    return NextResponse.json({ error: "Restaurant introuvable" }, { status: 404 });
  }
  if (!restaurant.accepting_orders) {
    return NextResponse.json(
      { error: "Le restaurant ne prend plus de commandes pour le moment." },
      { status: 409 },
    );
  }

  // ═══ RE-DÉRIVATION DES PRIX SERVEUR (lot bloquant go-live, GO Augustin
  // 20.08.2026 — invariant restauré : le POST recalcule TOUT). Le serveur
  // ne croit du client que les ARTICLES et les QUANTITÉS : prix, extras
  // et subtotals sont relus du CATALOGUE, frais (jamais le cache upsell
  // 30 s), scopé sur LE restaurant (pinning constante, comme reorder —
  // un menu_item_id étranger ne se résout pas). Les montants du payload
  // ne servent qu'à mesurer l'écart (journal pricing_adjustments).
  if (body.items.length > 50) {
    // Cap AVANT les SELECT catalogue (relecture 20.08) : la garde de la
    // fonction pure arrivait après deux requêtes .in() géantes.
    return NextResponse.json(
      { error: "Panier trop volumineux (50 lignes maximum)." },
      { status: 400 },
    );
  }
  const idsItems = [
    ...new Set(
      body.items
        .map((it) => it.menu_item_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const [catRes, optRes] = await Promise.all([
    sb
      .from("menu_items")
      .select(
        "id, name, price, is_available, is_out_of_stock, is_seasonal, season_start, season_end",
      )
      .eq("restaurant_id", RESTAURANT_ID)
      .in("id", idsItems.length > 0 ? idsItems : ["00000000-0000-0000-0000-000000000000"]),
    sb
      .from("menu_item_options")
      .select("item_id, option_group, option_name, extra_price")
      .in("item_id", idsItems.length > 0 ? idsItems : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  if (catRes.error || optRes.error) {
    // Panne DB ≠ panier invalide (même règle que la zone) : jamais un
    // refus mensonger sur une erreur transitoire.
    return NextResponse.json(
      {
        error:
          "Vérification du menu momentanément indisponible — réessayez dans un instant.",
      },
      { status: 503 },
    );
  }
  const derivation = deriveOrderPricing(
    body.items,
    catRes.data ?? [],
    optRes.data ?? [],
    toZurichDate(new Date()),
  );
  if (!derivation.ok) {
    return NextResponse.json(
      { error: derivation.message },
      { status: derivation.status },
    );
  }
  // Le total AFFICHÉ engage, frais compris (relecture 20.08 : la
  // re-dérivation ne couvrait que les articles — un frais de zone monté
  // au dashboard pendant la session, ou une gratuité perdue, se facturait
  // en silence au-dessus de l'affiché). `expected_total` est le total que
  // le client a EU SOUS LES YEUX ; absent (client en cache ancien) → la
  // garde ne s'applique pas, jamais de refus sur son absence.
  const totalAttendu =
    typeof body.expected_total === "number" &&
    Number.isFinite(body.expected_total)
      ? Math.round(body.expected_total * 100)
      : null;
  /** Lignes re-dérivées telles que renvoyées au client pour qu'il
   *  resynchronise son panier (ordre du payload = ordre du panier). */
  const lignesPourClient = () =>
    derivation.ok
      ? derivation.lignes.map((l) => ({
          menu_item_id: l.menu_item_id,
          item_name_snapshot: l.item_name_snapshot,
          item_price_snapshot: l.item_price_snapshot,
          unit_price:
            Math.round(
              (l.item_price_snapshot +
                l.selected_options.reduce((x, o) => x + o.extra_price, 0)) *
                100,
            ) / 100,
          quantity: l.quantity,
          // selected_options RE-DÉRIVÉES : sans elles le panier client
          // gardait des extra_price périmés (relecture 20.08).
          selected_options: l.selected_options,
          subtotal: l.subtotal,
        }))
      : [];

  if (derivation.hausse) {
    // Décision Augustin 20.08 : TOUTE hausse au-delà de ±0.01 déclenche
    // la re-confirmation — le prix affiché engage, JAMAIS de facturation
    // silencieuse au-dessus de l'affiché (une bande de tolérance en
    // francs n'achète presque rien et nous expose). Les lignes re-
    // dérivées partent DANS L'ORDRE du payload : le checkout resynchronise
    // son panier et ré-affiche le vrai total avant re-confirmation.
    // AUCUNE commande créée. (Le POST forgé à la baisse — fraude —
    // atterrit ici aussi : refusé, pas corrigé.)
    console.warn(
      "[orders] 409 prix_changes (articles)",
      JSON.stringify(derivation.ajustements),
    );
    return NextResponse.json(
      {
        error:
          "Les prix de la carte ont été mis à jour — vérifiez votre panier puis confirmez à nouveau.",
        code: "prix_changes",
        lignes: lignesPourClient(),
      },
      { status: 409 },
    );
  }
  // À partir d'ici : lignes et assiette 100 % SERVEUR (baisse éventuelle
  // silencieuse, journalisée via pricing_adjustments après l'INSERT).
  const lignesDerivees = derivation.lignes;
  const subtotal = derivation.subtotal;
  // Strip anti-forge (décision 20.08) : toute mention « LOT OFFERT »
  // d'origine CLIENT est neutralisée — la seule qui compte est générée
  // plus bas, après validation RÉELLE d'un code free_item (la cuisine
  // lit la note de commande comme seule surface du lot). Cap 200.
  if (body.notes != null) {
    // String() : un payload forgé avec notes non-string levait un
    // TypeError → 500 brut (relecture 20.08).
    body.notes = stripLotOffert(String(body.notes)).slice(0, 200) || null;
  }
  // ⚠️ RIALTO EST EN LIVRAISON SEULEMENT (décision Mehmet, actée 21.08.2026).
  // Le retrait en magasin n'existe pas, et il ne doit pas pouvoir renaître.
  //
  // Ce qu'il y avait ici : `body.fulfillment_type ?? "pickup"`. Deux défauts
  // alignés dans le MAUVAIS sens — le repli du code disait « pickup », et la
  // colonne en base a `DEFAULT 'pickup'`. Un client qui omettait le champ
  // (panier d'une vieille version, appel forgé) créait une commande de
  // RETRAIT : la caisse imprimait alors un ticket SANS ADRESSE, et le
  // livreur partait sans savoir où aller. Pas d'erreur, pas d'alerte — la
  // caisse ne plante pas, elle ment.
  //
  // Le serveur ne croit plus le client sur ce point : il l'impose. Même
  // principe que la re-dérivation des prix — on n'accepte du client que ce
  // qu'on ne peut pas savoir soi-même, et le mode de remise, on le sait.
  const fulfillmentType = "delivery" as const;

  // --- Validation delivery ---
  let deliveryFee = 0;
  let deliveryZoneId: string | null = null;
  let deliveryCity: string | null = null;
  // LS1 : vrai quand le seuil de livraison offerte a mangé des frais de
  // zone non nuls — porte la ligne « Livraison offerte » du reçu email.
  let freeDeliveryApplied = false;

  if (fulfillmentType === "delivery") {
    if (restaurant.offers_delivery === false) {
      return NextResponse.json(
        { error: "La livraison n'est pas disponible pour ce restaurant." },
        { status: 409 },
      );
    }
    if (!body.delivery_address?.trim() || !body.delivery_postal_code?.trim()) {
      return NextResponse.json(
        { error: "Adresse et code postal requis pour la livraison." },
        { status: 400 },
      );
    }
    const { data: zone, error: zoneErr } = await sb
      .from("delivery_zones")
      .select(
        "id, postal_code, city, delivery_fee, min_order_amount, is_active",
      )
      .eq("restaurant_id", body.restaurant_id)
      .eq("postal_code", body.delivery_postal_code.trim())
      .eq("is_active", true)
      .maybeSingle();
    // Panne DB ≠ zone non desservie (relecture 20.08, même correctif que
    // /api/delivery-zones/check) : sans cette distinction, un pépin
    // PostgREST au « Confirmer » affichait « Nous ne livrons pas au
    // XXXX » — faux — à un client d'une zone couverte.
    if (zoneErr) {
      return NextResponse.json(
        {
          error:
            "Vérification de la zone momentanément indisponible — réessayez dans un instant.",
        },
        { status: 503 },
      );
    }
    if (!zone) {
      return NextResponse.json(
        {
          // ⚠️ Ce message envoyait le client vers « le retrait en magasin »,
          // un service qui n'existe pas chez Rialto (livraison seulement).
          // Une promesse écrite qu'on ne tient pas est un problème
          // contractuel, pas un détail de formulation.
          // Mots simples et une action possible : le téléphone du resto.
          error: `Nous ne livrons pas au ${body.delivery_postal_code.trim()}. Appelez-nous au ${restaurant.phone} si vous pensez que c'est une erreur.`,
        },
        { status: 400 },
      );
    }
    // Tripwire de cohérence (bug 20.08, R-2026-044) : le checkout envoie
    // le zone_id de l'adresse qu'il a AFFICHÉE au client (frais, minimum,
    // seuil de gratuité). S'il ne correspond pas à la zone re-dérivée du
    // NPA posté, l'état client est désynchronisé : refuser BRUYAMMENT
    // plutôt que facturer des frais jamais affichés. Payload sans zone_id
    // → la re-dérivation NPA reste seule barrière (prix, minimum).
    if (body.delivery_zone_id && body.delivery_zone_id !== zone.id) {
      return NextResponse.json(
        {
          error:
            "Votre adresse a changé — re-vérifiez-la (bouton Modifier) puis revalidez votre commande.",
        },
        { status: 409 },
      );
    }
    // ⚠️ MÊME DÉRIVATION QUE LES ÉCRANS (`src/lib/delivery/minimum.ts`,
    // fonction `ecartAuMinimum`). C'était `subtotal < Number(...)`, une
    // comparaison SANS TOLÉRANCE : un panier exactement au minimum dont la
    // somme laisse un résidu flottant était refusé ici alors que l'écran
    // affichait « il ne manque rien ». Le seuil de gratuité, lui, avait sa
    // tolérance depuis toujours (`rule.ts`, le `- 0.005`).
    // ⚠️ CE N'EST PAS UN ASSOUPLISSEMENT DE LA RÈGLE : la tolérance vaut un
    // DEMI-CENTIME. Aucun panier réel ne tombe entre 44.995 et 45.00 —
    // seuls les résidus d'addition flottante y tombent.
    // ⚠️ L'ASSIETTE, ELLE, RESTE CELLE DU SERVEUR : `subtotal` est
    // re-dérivé des prix du jour, jamais repris du client.
    if (!ecartAuMinimum(subtotal, zone).atteint) {
      return NextResponse.json(
        {
          error: `Commande minimum pour la livraison : ${Number(
            zone.min_order_amount,
          ).toFixed(2)} CHF.`,
          // Le minimum est évalué sur l'assiette RE-DÉRIVÉE : si un prix
          // a baissé, le client voit un montant qu'il n'a pas à l'écran.
          // On renvoie les lignes pour qu'il resynchronise (relecture
          // 20.08) — la garde reste bloquante (condition de service).
          code: "prix_changes",
          lignes: lignesPourClient(),
        },
        { status: 400 },
      );
    }
    // LS1 : livraison offerte à partir d'un seuil (réglage dashboard,
    // désactivé par défaut). Assiette = `subtotal` — le sous-total
    // marchandise que CE handler tient déjà en main (Σ items, AVANT la
    // remise promo calculée plus bas) : le calcul se fait avant l'INSERT,
    // jamais en relecture (point 1 review navette LS0). delivery_fee
    // stocké = le facturé réel (0 si offerte) → CA, exports, rendu
    // espèces, assiette fidélité et purchase suivent mécaniquement.
    const zoneFee = Number(zone.delivery_fee);
    // Refonte zones 18.08 : seuil de gratuité PAR ZONE = min de la zone
    // (relu frais lignes plus haut, jamais le payload client) + offset.
    deliveryFee = effectiveDeliveryFee(
      subtotal,
      zoneFee,
      Number(zone.min_order_amount),
      toFreeDeliveryRule(restaurant as Record<string, unknown>),
    );
    freeDeliveryApplied = zoneFee > 0 && deliveryFee === 0;
    deliveryZoneId = zone.id as string;
    // La ville SAISIE par le client prime : zone.city peut être un libellé
    // multi-communes (« Bottens / Poliez-Pittet / … », grille ZL1) qui n'a
    // rien à faire sur l'étiquette livreur ni dans le mail de confirmation.
    const villeSaisie =
      typeof body.delivery_city === "string" ? body.delivery_city.trim() : "";
    deliveryCity = villeSaisie || (zone.city as string | null) || null;
  }
  // ⚠️ BRANCHE RETIRÉE LE 21.08 — « Pickup : validation du panier min
  // restaurant ». `fulfillmentType` vaut désormais toujours « delivery » :
  // elle était inatteignable.
  // Ce qu'elle vérifiait n'est PAS perdu : le minimum de ZONE est contrôlé
  // plus haut, et il est plus élevé (25 à 55 CHF selon la zone, contre
  // `restaurants.order_min_amount`). On le note pour qu'une future session
  // ne « restaure » pas la garde en croyant colmater un trou.
  // Conséquence : `restaurants.order_min_amount` n'est plus lu nulle part
  // dans ce handler — il reste sélectionné dans le SELECT ci-dessus,
  // c'est du transport
  // inutile mais inoffensif.

  // --- Code promo : VALIDATION ici, CONSOMMATION juste avant l'INSERT ---
  // Deux temps volontaires : toutes les validations 400 qui suivent (heure,
  // horaires…) doivent pouvoir refuser la commande SANS avoir brûlé un code
  // à usage unique. total_amount naît remisé = le montant réellement payé
  // (fix 23.07.2026 — CA, exports et reçu email étaient surestimés avant).
  let promoDiscount = 0;
  let promoCodeId: string | null = null;
  let promoCodeLabel: string | null = null;
  if (body.promo_code?.trim()) {
    const validation = await validatePromoCode({
      code: body.promo_code,
      subtotal,
    });
    if (!validation.ok) {
      // Refus net plutôt qu'une commande au prix plein que le client n'a
      // pas vue à l'écran : il retire ou corrige le code et resoumet.
      return NextResponse.json(
        { error: `Code promo : ${validation.error}` },
        { status: 400 },
      );
    }
    promoDiscount = validation.discount_amount;
    promoCodeId = validation.code.id;
    promoCodeLabel = validation.code.code;
    // Un free_item ne remise RIEN (discount 0) : sans trace explicite,
    // la cuisine ne sait pas qu'un lot est dû — le code serait brûlé et
    // le lot jamais préparé (relecture 19.08 : reçu, fiche dashboard et
    // caisse ne lisent ni promo_code_id ni free_item_label). La note de
    // commande est la seule surface lue PARTOUT.
    if (
      validation.code.discount_type === "free_item" &&
      validation.code.free_item_label
    ) {
      const mention = `LOT OFFERT (code ${validation.code.code}) : ${validation.code.free_item_label}`;
      body.notes = [body.notes?.trim(), mention]
        .filter(Boolean)
        .join(" · ");
    }
  }

  const total = Math.max(0, subtotal + deliveryFee - promoDiscount);

  // GARDE DU TOTAL AFFICHÉ (relecture 20.08) : la re-dérivation ne
  // couvrait que les ARTICLES — un frais de zone monté au dashboard, une
  // gratuité perdue de justesse ou une remise recalculée pouvaient encore
  // facturer au-dessus de ce que le client a vu. Ici la comparaison porte
  // sur le TOTAL FINAL, en centimes entiers. Jamais bloquant à la baisse.
  if (totalAttendu !== null && Math.round(total * 100) > totalAttendu + 1) {
    console.warn(
      "[orders] 409 total_change",
      JSON.stringify({
        attendu: totalAttendu / 100,
        serveur: total,
        subtotal,
        deliveryFee,
        promoDiscount,
      }),
    );
    return NextResponse.json(
      {
        error:
          "Le montant de votre commande a changé (prix ou frais de livraison) — vérifiez le récapitulatif puis confirmez à nouveau.",
        code: "prix_changes",
        lignes: lignesPourClient(),
        total_serveur: total,
        delivery_fee_serveur: deliveryFee,
      },
      { status: 409 },
    );
  }

  // --- Heure de retrait / livraison ---
  // Pickup : obligatoire. Delivery : optionnelle (asap possible).
  let pickupISO: string | null = null;
  if (body.requested_pickup_time) {
    pickupISO = parsePickupISO(body.requested_pickup_time);
    if (!pickupISO) {
      return NextResponse.json(
        { error: "Heure invalide" },
        { status: 400 },
      );
    }
  }

  // ⚠️ BLOC RETIRÉ LE 21.08.2026 — validation des horaires « pour PICKUP
  // uniquement ». Rialto est en livraison seulement : cette branche ne
  // pouvait plus jamais s'exécuter.
  //
  // 🔴 CE QUE SA SUPPRESSION REND VISIBLE, et qui n'est PAS corrigé ici :
  // il validait l'heure demandée contre l'heure d'ouverture, l'heure de
  // fermeture et le temps de préparation — mais SEULEMENT pour le retrait.
  // Or le site n'envoie que « delivery » (CheckoutPageClient), donc ce
  // contrôle n'a JAMAIS tourné en production : une livraison PLANIFIÉE
  // n'est aujourd'hui bornée par aucun horaire côté serveur.
  // L'étendre à la livraison changerait une règle métier — des commandes
  // aujourd'hui acceptées seraient refusées. Ce n'est pas à moi de le
  // décider : la question est posée à Augustin, la garde n'est pas posée.
  const { data: nbData, error: nbErr } = await sb.rpc("generate_order_number", {
    p_restaurant: body.restaurant_id,
  });
  const orderNumber = nbErr || !nbData ? `X-${Date.now()}` : (nbData as string);

  // Consommation atomique du code (garde anti-race) — dernier point de
  // sortie 400 possible : après, tout échec doit rendre le code (release).
  if (promoCodeId) {
    const consumed = await consumePromoCode({ promo_code_id: promoCodeId });
    if (!consumed.ok) {
      return NextResponse.json(
        { error: `Code promo : ${consumed.error}` },
        { status: 400 },
      );
    }
  }

  const { data: order, error: oErr } = await sb
    .from("orders")
    .insert({
      restaurant_id: body.restaurant_id,
      order_number: orderNumber,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      customer_email: body.customer_email?.trim() || null,
      payer_phone: body.payer_phone ?? null,
      requested_pickup_time: pickupISO,
      status: "new",
      total_amount: total,
      promo_code_id: promoCodeId,
      promo_discount_amount: promoDiscount,
      notes: body.notes,
      fulfillment_type: fulfillmentType,
      delivery_address: body.delivery_address ?? null,
      delivery_postal_code: body.delivery_postal_code ?? null,
      delivery_city: deliveryCity,
      delivery_floor_door: body.delivery_floor_door ?? null,
      delivery_instructions: body.delivery_instructions ?? null,
      delivery_fee: deliveryFee,
      delivery_zone_id: deliveryZoneId,
      // Phase 1 checkout refonte
      housing_type: body.housing_type ?? null,
      entry_code_1: body.entry_code_1 ?? null,
      entry_code_2: body.entry_code_2 ?? null,
      floor: body.floor ?? null,
      apartment_number: body.apartment_number ?? null,
      doorbell_name: body.doorbell_name ?? null,
      payment_method: body.payment_method ?? null,
      payment_card_timing: body.payment_card_timing ?? null,
      // Clampé, jamais bloquant (décision 20.08) : une valeur forgée ou
      // hors bornes numeric(6,2) devient null au lieu de casser l'INSERT
      // ou de polluer la caisse.
      payment_cash_bills:
        typeof body.payment_cash_bills === "number" &&
        Number.isFinite(body.payment_cash_bills) &&
        body.payment_cash_bills >= 0 &&
        body.payment_cash_bills <= 9999.99
          ? body.payment_cash_bills
          : null,
    })
    // total_amount renvoyé pour le tracking purchase (Lot E) : la valeur
    // trackée doit être le montant AUTORITAIRE en base, pas le total
    // recalculé côté client (qui peut diverger : promo % figée à
    // l'application, CP édité vers une autre zone de livraison).
    .select("id, order_number, total_amount")
    .single();

  if (oErr || !order) {
    console.error("[orders] insert failed", oErr);
    if (promoCodeId) await releasePromoCode(promoCodeId);
    return NextResponse.json(
      { error: "Impossible de créer la commande" },
      { status: 500 },
    );
  }

  if (promoCodeId) {
    // Trace informative (best-effort) : quel ordre a consommé le code.
    void markPromoCodeUsedOnOrder(promoCodeId, order.id as string);
  }

  // Lignes RE-DÉRIVÉES uniquement (jamais body.items) : nom, prix,
  // extras et subtotal viennent du catalogue — l'étiquette cuisine ne
  // vient jamais du client.
  const rows = lignesDerivees.map((l) => ({
    order_id: order.id,
    menu_item_id: l.menu_item_id,
    item_name_snapshot: l.item_name_snapshot,
    item_price_snapshot: l.item_price_snapshot,
    quantity: l.quantity,
    selected_options: l.selected_options,
    subtotal: l.subtotal,
    notes: l.notes,
  }));

  const { error: iErr } = await sb.from("order_items").insert(rows);
  if (iErr) {
    console.error("[orders] items insert failed", iErr);
    // ⚠️ LA SEULE exception assumée au « jamais de DELETE sur orders »
    // (actée 19.08) : compensation IMMÉDIATE d'une commande dont les
    // items n'ont pas pu être écrits — la ligne n'a jamais existé pour
    // personne (ni caisse, ni client). Tout autre DELETE reste interdit
    // (service_role uniquement depuis HY1b, et encore).
    await sb.from("orders").delete().eq("id", order.id);
    if (promoCodeId) await releasePromoCode(promoCodeId);
    return NextResponse.json(
      { error: "Impossible d'enregistrer les articles" },
      { status: 500 },
    );
  }

  // Lot F : attribution marketing (colonne orders.attribution, migration
  // TR1). Écriture SÉPARÉE de l'INSERT et best-effort : tant que TR1 (en
  // navette) n'est pas exécutée, l'erreur « colonne inconnue » est avalée
  // — pattern lottery month — et la création de commande ne peut JAMAIS
  // en souffrir. Liste blanche + troncature (sanitizeAttribution) : on ne
  // stocke pas un blob client arbitraire. Placée APRÈS l'insert des items
  // (dont l'échec SUPPRIME la commande) et attendue : pas de course avec
  // le DELETE ni avec la fin du lambda.
  const attribution = sanitizeAttribution(body.attribution);
  if (attribution) {
    const { error: attrErr } = await sb
      .from("orders")
      .update({ attribution })
      .eq("id", order.id);
    if (attrErr && attrErr.code !== "PGRST204" && attrErr.code !== "42703") {
      console.error("[orders] attribution non écrite", attrErr.code);
    }
  }

  // Journal des écarts prix client/serveur (navette PR1) : UPDATE
  // best-effort SÉPARÉ, pattern attribution — tant que la colonne
  // pricing_adjustments n'existe pas, l'erreur « colonne inconnue » est
  // avalée et le journal est simplement muet ; la création de commande
  // ne peut JAMAIS en souffrir. N'arrive ici que pour les BAISSES et les
  // options inconnues (une hausse a répondu 409 avant l'INSERT).
  if (derivation.ajustements) {
    const { error: adjErr } = await sb
      .from("orders")
      .update({ pricing_adjustments: derivation.ajustements })
      .eq("id", order.id);
    if (adjErr && adjErr.code !== "PGRST204" && adjErr.code !== "42703") {
      console.error("[orders] pricing_adjustments non écrit", adjErr.code);
    }
  }

  await sb.from("order_status_history").insert({
    order_id: order.id,
    old_status: null,
    new_status: "new",
    changed_by: "customer",
  });

  // Lie la commande à un customer Stampify natif (customers +
  // customer_cards pour le programme Rialto). Si aucun compte n'existe
  // encore, on en crée un vide pour garder le lien — la carte fidélité
  // pourra être "activée" plus tard par le client sur /order/[id] ou
  // l'onglet Fidélité.
  const RIALTO_CARD_ID = "f4cb1a3f-fc5c-40eb-87db-8d2c2b0a8b5f";
  const [firstName, ...rest] = body.customer_name.split(" ");
  const lastName = rest.join(" ") || "";

  // Phase 9 FIX 2 : lookup tolérant aux formats mixtes en DB
  // (+41..., 41..., 0..., etc.) pour retrouver un customer existant
  // avant de tenter un INSERT qui violerait customers_phone_unique.
  const { variants: phoneVariants, digitsOnly: phoneDigits } =
    phoneLookupVariants(body.customer_phone);

  const { data: matchedCustomers } = await sb
    .from("customers")
    .select("id, phone")
    .in("phone", phoneVariants)
    .limit(10);

  let candidates: Array<{ id: string; phone: string | null }> =
    (matchedCustomers as Array<{ id: string; phone: string | null }> | null) ??
    [];

  if (candidates.length === 0 && phoneDigits.length >= 8) {
    const { data: all } = await sb.from("customers").select("id, phone");
    const suffix = phoneDigits.slice(-8);
    candidates = ((all as Array<{ id: string; phone: string | null }> | null) ??
      []).filter((c) => {
      const d = (c.phone ?? "").replace(/[^\d]/g, "");
      return d.length >= 8 && d.endsWith(suffix);
    });
  }

  const existingCustomerId: string | null =
    candidates.length > 0 ? candidates[0].id : null;

  const { data: existingCards } = existingCustomerId
    ? await sb
        .from("customer_cards")
        .select("id, customer_id")
        .eq("card_id", RIALTO_CARD_ID)
        .eq("customer_id", existingCustomerId)
        .limit(1)
    : { data: [] as Array<{ id: string; customer_id: string }> };

  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const makeShortCode = () => {
    let s = "";
    for (let i = 0; i < 8; i++) {
      s += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return s;
  };

  let customerId: string | null = null;
  if (existingCards && existingCards.length > 0) {
    customerId = existingCards[0].customer_id as string;
  } else if (existingCustomerId) {
    // Customer existe déjà (autre format tél), mais pas de carte Rialto
    // → on réutilise son id (évite duplicate key sur phone_unique)
    customerId = existingCustomerId;
    await sb.from("customer_cards").insert({
      customer_id: customerId,
      card_id: RIALTO_CARD_ID,
      current_stamps: 0,
      qr_code_value: crypto.randomUUID(),
      rewards_claimed: 0,
      short_code: makeShortCode(),
    });
  } else {
    // Nouveau customer + nouvelle carte
    // ⚠️ L'E-MAIL ÉTAIT PERDU ICI (corrigé 21.08). Le client le saisit au
    // checkout, il partait dans `orders.customer_email`… et le dossier
    // CLIENT se créait sans. La base clients — celle qu'on vend au
    // restaurateur — restait donc vide d'adresses, même après avoir rendu
    // le champ obligatoire. Constaté : 5 clients en base, 5 sans e-mail.
    //
    // 🔴 ET C'EST CE MÊME AJOUT QUI A ARMÉ UN PIÈGE (trouvé et fermé le
    // 21.08, index vérifié en base) : `customers_email_unique` existe —
    // `UNIQUE (email) WHERE email IS NOT NULL`. Un FOYER qui commande à
    // deux numéros depuis la MÊME adresse faisait donc échouer ce second
    // insert. Et comme `error` n'était pas récupéré, l'échec était MUET :
    // `customerId` restait null, `orders.customer_id` n'était jamais posé
    // (le `update({ customer_id })` qui suit ce bloc), la commande
    // n'apparaissait plus dans « Mes commandes »,
    // aucun tampon n'était crédité, et rien n'était journalisé.
    // Avant ce soir l'e-mail n'était jamais écrit : l'index ne pouvait pas
    // être touché. Il l'est maintenant à CHAQUE commande.
    //
    // Choix : la clé d'identité est le TÉLÉPHONE, pas l'e-mail. En cas de
    // collision on recrée le client SANS e-mail plutôt que de le perdre —
    // une fiche sans adresse vaut mieux qu'une commande orpheline. Le REÇU
    // n'est pas concerné : il part à `body.customer_email` (const
    // `customerEmail`, plus bas), pas à
    // la fiche.
    let { data: newCustomer, error: erreurClient } = await sb
      .from("customers")
      .insert({
        first_name: firstName || "Client",
        last_name: lastName,
        phone: body.customer_phone, // déjà normalisé E.164 avec "+" côté client
        email: emailRecu,
      })
      .select("id")
      .single();

    if (erreurClient) {
      console.error("[orders] création client en échec", {
        code: erreurClient.code,
        message: erreurClient.message,
      });
      // 23505 = violation d'unicité. On retente sans l'e-mail : si c'est
      // lui qui collisionne, le client est sauvé ; si c'est le TÉLÉPHONE,
      // ce second essai échoue aussi et on le journalise — mais alors le
      // client existe déjà et c'est la recherche par variantes, en amont,
      // qui l'a manqué.
      if (erreurClient.code === "23505") {
        const secondEssai = await sb
          .from("customers")
          .insert({
            first_name: firstName || "Client",
            last_name: lastName,
            phone: body.customer_phone,
            email: null,
          })
          .select("id")
          .single();
        newCustomer = secondEssai.data;
        if (secondEssai.error) {
          console.error("[orders] création client SANS e-mail en échec aussi", {
            code: secondEssai.error.code,
            message: secondEssai.error.message,
          });
        } else {
          console.warn(
            "[orders] e-mail déjà pris par une autre fiche — client créé sans adresse",
          );
        }
      }
    }

    if (newCustomer) {
      customerId = newCustomer.id;
      await sb.from("customer_cards").insert({
        customer_id: newCustomer.id,
        card_id: RIALTO_CARD_ID,
        current_stamps: 0,
        qr_code_value: crypto.randomUUID(),
        rewards_claimed: 0,
        short_code: makeShortCode(),
      });
    }
  }

  if (customerId) {
    await sb.from("orders").update({ customer_id: customerId }).eq("id", order.id);
  }

  // Participation loterie mensuelle (design 3, décision 21.07.2026) :
  // « 1 commande dans le mois = 1 participation au tirage du mois »
  // (Europe/Zurich). Idempotent : UNIQUE (lottery_id, phone, month) →
  // 23505 silencieux dès la 2e commande du mois. Ne bloque JAMAIS la
  // commande. Tant que la migration L1 (navette) n'est pas exécutée, la
  // colonne month n'existe pas → PGRST204, loggé et ignoré.
  try {
    const { data: lottery } = await sb
      .from("lotteries")
      .select("id, is_active")
      .eq("id", LOTTERY_ID)
      .maybeSingle();
    if (lottery?.is_active) {
      const lpBase = {
        lottery_id: LOTTERY_ID,
        phone: body.customer_phone,
        first_name: firstName || "Client",
      };
      const { error: lpErr } = await sb
        .from("lottery_participants")
        .insert({ ...lpBase, month: zurichMonthStart() });
      if (lpErr && lpErr.code !== "23505") {
        if (lpErr.code === "PGRST204" || lpErr.code === "42703") {
          // Colonne month absente (migration L1 en navette) → insert
          // historique : la promesse « 1 commande = participation » tient
          // aussi pendant la fenêtre pré-migration (le backfill DEFAULT
          // posera le mois à l'exécution).
          const { error: legacyErr } = await sb
            .from("lottery_participants")
            .insert(lpBase);
          if (legacyErr && legacyErr.code !== "23505") {
            console.error("[lottery] participation échouée", legacyErr.code);
          }
        } else {
          console.error("[lottery] participation échouée", lpErr.code);
        }
      }
    }
  } catch (err) {
    console.error("[lottery] participation à la commande échouée", err);
  }

  // PAS de SMS de confirmation — décision produit 21.07.2026 : les
  // reçus/confirmations partent par EMAIL uniquement (bloc D6 plus bas),
  // le canal SMS est réservé au marketing (campagnes, réactivation).
  // L'ancien bloc SMS templaté (order_confirmation) a été retiré ici.

  // Push dashboard (non-blocking, best-effort). Le secret + l'URL sont
  // configurés côté Vercel. Si indisponibles en dev, on skip.
  const pickupTimeLabel = pickupISO
    ? toZurichHHMM(new Date(pickupISO))
    : "dès que possible";
  void notifyDashboard({
    restaurant_id: body.restaurant_id,
    order_number: order.order_number,
    customer_name: body.customer_name,
    total: total,
    pickup_time_hhmm: pickupTimeLabel,
    fulfillment_type: fulfillmentType,
  });

  // Email de confirmation au CLIENT (lot E1, 21.07.2026) — reçu digital
  // envoyé à l'adresse saisie au checkout. ⚠️ CE COMMENTAIRE DISAIT
  // « optionnelle → pas d'email = pas d'envoi » : plus vrai depuis le
  // 21.08, l'adresse est exigée à l'entrée de cette fonction (const
  // `emailRecu` et le 400 qui suit, en tête du POST) et
  // une commande sans e-mail n'atteint jamais cette ligne.
  // Fire-and-forget : un échec Brevo ne bloque JAMAIS la commande.
  // Remplace l'ancien email « nouvelle commande » au restaurateur, devenu
  // obsolète (la caisse sonne + affiche + imprime automatiquement).
  // ⚠️ ON COMPLÈTE UN E-MAIL MANQUANT, ON N'ÉCRASE JAMAIS UN E-MAIL EXISTANT.
  // Les 5 clients déjà en base n'ont pas d'adresse : sans ce rattrapage,
  // ils resteraient sans, même en commandant à nouveau avec le champ
  // désormais obligatoire.
  // Le `.is("email", null)` porte la garde EN BASE : deux commandes
  // simultanées ne peuvent pas se marcher dessus, et un client qui a déjà
  // une adresse ne se la fait pas remplacer par une faute de frappe d'un
  // soir. (`signup` écrase, lui — c'est un défaut connu, pas un modèle.)
  // ⚠️ MÊME PIÈGE D'UNICITÉ QUE L'INSERT `customers` plus haut : ce
  // rattrapage peut
  // échouer sur `customers_email_unique` si l'adresse appartient déjà à une
  // autre fiche. C'est SANS GRAVITÉ — la commande est déjà créée et le reçu
  // part quand même — mais l'échec ne doit pas être muet, sinon on croira la
  // base clients complète alors qu'elle ne l'est pas.
  if (customerId && emailRecu) {
    const { error: erreurRattrapage } = await sb
      .from("customers")
      .update({ email: emailRecu })
      .eq("id", customerId)
      .is("email", null);
    if (erreurRattrapage) {
      console.warn("[orders] rattrapage e-mail client sans effet", {
        code: erreurRattrapage.code,
        message: erreurRattrapage.message,
      });
    }
  }

  const customerEmail = body.customer_email?.trim();
  // Garde de format légère : une saisie manifestement invalide n'appelle
  // pas Brevo pour rien (fire-and-forget → l'erreur serait muette).
  if (customerEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
    void (async () => {
      try {
        const { subject, html, text } = buildCustomerOrderEmail({
          order: {
            order_number: order.order_number,
            requested_pickup_time: pickupISO,
            fulfillment_type: fulfillmentType,
            delivery_address: body.delivery_address ?? null,
            delivery_postal_code: body.delivery_postal_code ?? null,
            delivery_city: deliveryCity,
            delivery_fee: deliveryFee,
            free_delivery: freeDeliveryApplied,
            payment_method: body.payment_method ?? null,
            payment_card_timing: body.payment_card_timing ?? null,
            total_amount: total,
            promo_discount_amount: promoDiscount,
            promo_code: promoCodeLabel,
            notes: body.notes,
          },
          // Lignes RE-DÉRIVÉES : le reçu somme exactement au total
          // facturé (body.items pouvait diverger — relecture 20.08).
          items: lignesDerivees.map((l) => ({
            item_name_snapshot: l.item_name_snapshot,
            quantity: l.quantity,
            selected_options: l.selected_options,
            subtotal: l.subtotal,
            notes: l.notes,
          })),
          restaurant: {
            name: restaurant.name,
            address: restaurant.address,
            phone: restaurant.phone,
          },
          siteUrl:
            process.env.NEXT_PUBLIC_SITE_URL ??
            process.env.NEXT_PUBLIC_RIALTO_BASE_URL ??
            "https://rialto-lausanne.vercel.app",
        });
        await sendEmail({ to: customerEmail, subject, html, text });
      } catch (err) {
        console.error("[email] confirmation client failed", err);
      }
    })();
  }

  // Jeton d'accès à la commande (21.08) : le client en a besoin pour être
  // redirigé vers son suivi. Il est DÉRIVÉ, donc recalculable à volonté —
  // on le renvoie plutôt que de laisser le checkout fabriquer une URL nue
  // qui serait refusée à l'ouverture, juste après le paiement.
  const accessToken = signOrderToken(RESTAURANT_ID, order.order_number as string);
  if (!accessToken) {
    // Fail-fast VISIBLE : la commande est créée (ne jamais la perdre pour
    // un secret manquant), mais l'exploitation doit le savoir tout de suite.
    console.error(
      "[orders] ORDER_LINK_SECRET absent — le client ne pourra pas ouvrir son suivi",
    );
  }
  return NextResponse.json({ order, access_token: accessToken });
}

/**
 * Clés admises dans orders.attribution — tout le reste est jeté.
 * ⚠️ MIROIR de UTM_KEYS + CLICK_ID_KEYS de src/lib/attribution.ts
 * (duplication à dessein : pas d'import d'un module "use client" ici).
 * Toute clé ajoutée là-bas doit l'être ici ET dans le COMMENT de TR1 —
 * sinon la capture marche et l'écriture jette en silence.
 */
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "referrer",
  "landing",
  "captured_at",
] as const;

function sanitizeAttribution(
  input: unknown,
): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v !== "string" || !v.trim()) continue;
    if (k === "captured_at") {
      // Endpoint public : ne JAMAIS stocker une date non parsée. L'ancien
      // test de préfixe laissait passer « 2026-99-99Tpotato » — une seule
      // chaîne empoisonnée ferait échouer tout futur cast ::timestamptz
      // sur la requête ENTIÈRE de reporting (correctif demandé par la
      // review navette TR1b, 31.07.2026). Parse réel, stockage normalisé.
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) continue;
      out[k] = d.toISOString();
      continue;
    }
    out[k] = v.trim().slice(0, 200);
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function notifyDashboard(input: {
  restaurant_id: string;
  order_number: string;
  customer_name: string;
  total: number;
  pickup_time_hhmm: string;
  fulfillment_type?: "pickup" | "delivery";
}): Promise<void> {
  const url = process.env.LOYALTY_CARDS_WEBHOOK_URL;
  const secret = process.env.ORDER_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.log("[webhook] skipped (LOYALTY_CARDS_WEBHOOK_URL or ORDER_WEBHOOK_SECRET missing)");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({
        restaurant_id: input.restaurant_id,
        title: `Nouvelle commande ${input.order_number}`,
        body: `${input.customer_name} · ${input.total.toFixed(2)} CHF · ${
          input.fulfillment_type === "delivery" ? "🚴 Livraison" : "🏪 Retrait"
        } ${input.pickup_time_hhmm}`,
        url: "/dashboard/commandes",
        tag: `order-${input.order_number}`,
      }),
    });
  } catch (err) {
    console.error("[webhook] dashboard push failed", err);
  }
}
