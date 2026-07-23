/**
 * Persistance côté client du panier + adresse de livraison qualifiée.
 *
 * Le cart et l'adresse sont partagés entre les pages "/" (qualification),
 * "/menu" (saisie du panier) et "/checkout" (validation). On utilise
 * localStorage avec une clé versionnée pour pouvoir invalider en cas de
 * migration de schéma.
 */
import type { CartItem, CartOptionSelection } from "./types";
import { track } from "./tracking";

const CART_KEY = "RIALTO:CART:V2";
const ADDRESS_KEY = "RIALTO:ADDRESS:V2";

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
  window.localStorage.removeItem(CART_KEY);
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

/* ─── Address ────────────────────────────────────────────────────────── */
export function readAddress(): QualifiedAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADDRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QualifiedAddress;
  } catch {
    return null;
  }
}

export function writeAddress(addr: QualifiedAddress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADDRESS_KEY, JSON.stringify(addr));
  window.dispatchEvent(new CustomEvent("rialto:address-updated"));
}

export function clearAddress(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADDRESS_KEY);
  window.dispatchEvent(new CustomEvent("rialto:address-updated"));
}
