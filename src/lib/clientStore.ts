/**
 * Persistance côté client du panier + adresse de livraison qualifiée.
 *
 * Le cart et l'adresse sont partagés entre les pages "/" (qualification),
 * "/menu" (saisie du panier) et "/checkout" (validation). On utilise
 * localStorage avec une clé versionnée pour pouvoir invalider en cas de
 * migration de schéma.
 */
import type { CartItem, CartOptionSelection, HousingType } from "./types";
import { track } from "./tracking";

const CART_KEY = "RIALTO:CART:V2";
// V3 (18.08.2026, chantier zones) : bump volontaire — les adresses
// qualifiées sous l'ancienne grille tarifaire (fee/min/ETA périmés)
// sont invalidées d'un coup, tout le monde re-qualifie silencieusement.
const ADDRESS_KEY = "RIALTO:ADDRESS:V3";

export type QualifiedAddress = {
  address: string;
  postal_code: string;
  city: string | null;
  zone_id: string;
  delivery_fee: number;
  min_order_amount: number;
  estimated_delivery_minutes: number;
};

/* ─── Cart ───────────────────────────────────────────────────────────── */
export function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function writeCart(cart: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("rialto:cart-updated"));
  } catch {
    /* ignore */
  }
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CART_KEY);
  } catch {
    /* appelé APRÈS l'INSERT de la commande : un throw ici remonterait en
       « erreur de commande » sur une commande déjà créée (relecture
       20.08) — jamais de throw vers l'UI */
  }
  window.dispatchEvent(new CustomEvent("rialto:cart-updated"));
}

export function cartSubtotal(cart: CartItem[]): number {
  return cart.reduce((s, it) => s + Number(it.subtotal), 0);
}

export function cartCount(cart: CartItem[]): number {
  return cart.reduce((s, it) => s + Number(it.quantity), 0);
}

/**
 * Phase 11 C4 : met à jour la quantité d'une ligne (ou supprime si 0).
 * Retourne le nouveau cart — à passer à writeCart + setCart.
 */
export function updateCartQuantity(
  cart: CartItem[],
  key: string,
  quantity: number,
): CartItem[] {
  if (quantity <= 0) {
    return cart.filter((c) => c.key !== key);
  }
  return cart.map((c) => {
    if (c.key !== key) return c;
    return {
      ...c,
      quantity,
      subtotal: c.unit_price * quantity,
    };
  });
}

/**
 * Point d'entrée UNIQUE pour AJOUTER des lignes au panier (Lot D tracking,
 * 23.07.2026). Lit le panier courant (source de vérité : localStorage),
 * merge par `key`, écrit, ET émet un add_to_cart par ligne ajoutée.
 *
 * ⚠️ Tout nouvel ajout au panier DOIT passer par ici : un chemin d'ajout
 * qui appelle writeCart directement fait un trou silencieux dans le funnel
 * publicitaire (GA4/Meta). Les 5 chemins historiques (modale menu, bouton
 * direct, upsell panier, upsell checkout, re-commande, page produit) sont
 * tous branchés dessus.
 *
 * `lines[].quantity` = la quantité AJOUTÉE (c'est elle qui part dans
 * l'événement), pas le total de la ligne après merge.
 * Retourne le nouveau panier — à passer à setCart par les composants qui
 * tiennent un état local.
 */
export function addLinesToCart(lines: CartItem[]): CartItem[] {
  let next = readCart();
  for (const line of lines) {
    const existing = next.find((c) => c.key === line.key);
    if (existing) {
      next = next.map((c) =>
        c.key === line.key
          ? {
              ...c,
              quantity: c.quantity + line.quantity,
              subtotal: c.unit_price * (c.quantity + line.quantity),
            }
          : c,
      );
    } else {
      next = [...next, line];
    }
    track.addToCart({
      id: line.menu_item_id,
      name: line.name,
      price: line.unit_price,
      quantity: line.quantity,
      category: line.category ?? undefined,
    });
  }
  writeCart(next);
  return next;
}

/* Clé canonique pour fusionner 2 lignes identiques (même item + options) */
export function cartLineKey(
  itemId: string,
  options: CartOptionSelection[],
  notes: string,
): string {
  const opt = options
    .map((o) => `${o.group}:${o.name}`)
    .sort()
    .join("|");
  return `${itemId}::${opt}::${notes}`;
}

/* ─── Prefill checkout (déplacé de CheckoutPageClient, pop-up partagé
   20.08 : l'en-tête doit pouvoir lire/fusionner les détails de logement
   sans passer par la page checkout) ─────────────────────────────────── */

const PREFILL_KEY = "RIALTO:CHECKOUT_PREFILL:V1";

export type Prefill = {
  housingType?: HousingType;
  street?: string;
  postalCode?: string;
  city?: string;
  entryCode1?: string;
  entryCode2?: string;
  floor?: string;
  apartmentNumber?: string;
  doorbellName?: string;
  instructions?: string;
  remiseMode?: "main_propre" | "laisser_porte";
  remiseOption?: string;
  firstName?: string;
  phone?: string;
  email?: string;
};

export function readPrefill(): Prefill {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFILL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Prefill;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writePrefill(p: Prefill): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFILL_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Fusionne les champs D'ADRESSE dans le prefill existant (prénom,
 *  téléphone, email, remise… préservés). Utilisé par le pop-up partagé :
 *  une adresse enregistrée depuis l'EN-TÊTE doit être retrouvée intacte
 *  au checkout — codes d'entrée compris —, sinon le garde du mount
 *  (prefill au NPA divergent = intrus) jetterait la moitié des champs. */
export function mergePrefillAdresse(champs: {
  housingType: HousingType;
  street: string;
  postalCode: string;
  city: string;
  entryCode1: string;
  entryCode2: string;
  floor: string;
  apartmentNumber: string;
  doorbellName: string;
}): void {
  writePrefill({
    ...readPrefill(),
    housingType: champs.housingType,
    street: champs.street,
    postalCode: champs.postalCode,
    city: champs.city,
    entryCode1: champs.entryCode1 || undefined,
    entryCode2: champs.entryCode2 || undefined,
    floor: champs.floor || undefined,
    apartmentNumber: champs.apartmentNumber || undefined,
    doorbellName: champs.doorbellName || undefined,
  });
}

/** Libellé de zone utilisable comme « ville » d'une adresse client :
 *  les libellés multi-communes « A / B / C » de la grille ZL1 ne sont
 *  PAS des villes saisies — recopiés dans l'adresse, ils partaient sur
 *  l'étiquette livreur, le CSV et le mail (relecture 20.08). null =
 *  laisser le champ ville vide, le client saisit sa commune. */
export function villeSeedable(label: string | null | undefined): string | null {
  if (!label || label.includes("/")) return null;
  return label;
}

/* ─── Address ────────────────────────────────────────────────────────── */
export function readAddress(): QualifiedAddress | null {
  if (typeof window === "undefined") return null;
  try {
    // Purge de la clé V2 orpheline : sans elle, l'ancienne adresse (grille
    // tarifaire périmée) resterait indéfiniment dans le localStorage des
    // clients ayant connu l'ancien site (relecture 18.08).
    window.localStorage.removeItem("RIALTO:ADDRESS:V2");
    const raw = window.localStorage.getItem(ADDRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QualifiedAddress;
  } catch {
    return null;
  }
}

/**
 * Cookie-drapeau « adresse qualifiée » (finitions 20.08, anti-flash) :
 * la home est rendue SERVEUR — sans indice côté serveur, un client
 * qualifié voyait ~1 s de page d'adresse avant la redirection client
 * vers /menu. Le cookie ne porte AUCUNE donnée (valeur « 1 ») : il dit
 * seulement « ce navigateur a une adresse en localStorage », et la home
 * serveur redirige alors vers /menu avant tout rendu. La vérité reste
 * le localStorage ; la re-qualification silencieuse vit sur /menu.
 */
const ADDRESS_COOKIE = "rialto_adresse";

export function writeAddress(addr: QualifiedAddress): void {
  if (typeof window === "undefined") return;
  try {
    // Même politique que writeCart : setItem peut lever (quota, Safari
    // navigation privée) — un throw au milieu du commit du checkout
    // scindait states/address (relecture 20.08). Dégradé assumé : l'état
    // mémoire vit, la persistance attendra la prochaine écriture.
    window.localStorage.setItem(ADDRESS_KEY, JSON.stringify(addr));
    document.cookie = `${ADDRESS_COOKIE}=1; path=/; max-age=15552000; SameSite=Lax`;
  } catch {
    /* stockage indisponible : on continue — jamais de throw vers l'UI */
  }
  window.dispatchEvent(new CustomEvent("rialto:address-updated"));
}

export function clearAddress(): void {
  if (typeof window === "undefined") return;
  // Cookie d'abord (document.cookie ne lève pas) : le drapeau anti-flash
  // ne doit JAMAIS survivre à un removeItem en échec, sinon boucle
  // / → /menu → /?need_address=1 (relecture 20.08).
  document.cookie = `${ADDRESS_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  try {
    window.localStorage.removeItem(ADDRESS_KEY);
  } catch {
    /* idem writeAddress */
  }
  window.dispatchEvent(new CustomEvent("rialto:address-updated"));
}
