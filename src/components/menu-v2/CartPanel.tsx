"use client";

/**
 * CartPanel — panier unifié.
 *
 * - Desktop (lg+) : sidebar droite persistante (sticky, toujours visible).
 * - Mobile : drawer bottom sheet qui slide up depuis la sticky bar.
 *
 * Actions : +/- quantité, suppression, détail options/notes, progression vers
 * le minimum (livraison uniquement), bouton checkout. Mode "à emporter" : pas
 * de minimum, retrait au restaurant.
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/types";
import {
  cartCount,
  cartSubtotal,
  updateCartQuantity,
  writeCart,
  cartLineKey,
} from "@/lib/clientStore";
import { formatCHF } from "@/lib/format";
import { matchDishImage, RIALTO_INFO } from "@/lib/rialto-data";
import UpsellPanel from "@/components/checkout/UpsellPanel";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type Props = {
  cart: CartItem[];
  setCart: (cart: CartItem[]) => void;
  minOrderAmount: number;
  fulfillmentType?: "pickup" | "delivery";
  className?: string;
};

export default function CartPanel({
  cart,
  setCart,
  minOrderAmount,
  fulfillmentType = "pickup",
  className = "",
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPickup = fulfillmentType === "pickup";
  const count = cartCount(cart);
  const subtotal = cartSubtotal(cart);
  const missing = isPickup ? 0 : Math.max(0, minOrderAmount - subtotal);
  const canCheckout = count > 0 && missing === 0;
  const progressPct =
    minOrderAmount > 0 ? Math.min(100, (subtotal / minOrderAmount) * 100) : 100;

  // Ferme drawer si panier vidé
  useEffect(() => {
    if (count === 0 && mobileOpen) setMobileOpen(false);
  }, [count, mobileOpen]);

  // Lock body scroll sur mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function handleQuantity(key: string, delta: number) {
    const line = cart.find((c) => c.key === key);
    if (!line) return;
    const next = updateCartQuantity(cart, key, line.quantity + delta);
    setCart(next);
    writeCart(next);
  }

  function handleRemove(key: string) {
    const next = updateCartQuantity(cart, key, 0);
    setCart(next);
    writeCart(next);
  }

  // Ajout depuis UpsellPanel : fetch le menu_item, ajoute au cart
  async function handleUpsellAdd(menuItemId: string) {
    try {
      const resp = await fetch(`${STAMPIFY_BASE}/api/rialto/menu-item/${menuItemId}`);
      if (!resp.ok) return;
      const body = await resp.json();
      const item = body.item;
      if (!item) return;
      const key = cartLineKey(item.id, [], "");
      const existing = cart.find((c) => c.key === key);
      const next: CartItem[] = existing
        ? cart.map((c) =>
            c.key === key
              ? { ...c, quantity: c.quantity + 1, subtotal: c.unit_price * (c.quantity + 1) }
              : c,
          )
        : [
            ...cart,
            {
              key,
              menu_item_id: item.id,
              name: item.name,
              base_price: Number(item.price),
              quantity: 1,
              options: [],
              notes: "",
              unit_price: Number(item.price),
              subtotal: Number(item.price),
            },
          ];
      setCart(next);
      writeCart(next);
    } catch {
      /* noop */
    }
  }

  const CartContent = (
    <div className="flex h-full flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-bold">Mon panier</h2>
          {count > 0 && (
            <p className="truncate text-[11px] font-medium text-mute">
              {count} {count > 1 ? "articles" : "article"} ·{" "}
              {isPickup ? "À emporter" : "Livraison"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-full p-2 text-mute transition hover:bg-cream-dark hover:text-ink lg:hidden"
          aria-label="Fermer le panier"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </div>

      {/* Lignes */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-dark text-rialto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                Votre panier est vide
              </p>
              <p className="mt-1 text-sm text-mute">
                Ajoutez vos plats préférés pour commencer.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {cart.map((item) => (
              <li
                key={item.key}
                className="flex gap-3 rounded-2xl border border-border bg-white p-2.5 shadow-card"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={matchDishImage(item.name)}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="line-clamp-2 font-display text-sm font-semibold leading-tight text-ink">
                      {item.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.key)}
                      className="-mr-0.5 -mt-0.5 shrink-0 rounded-full p-1 text-mute transition hover:bg-rialto/10 hover:text-rialto"
                      aria-label={`Retirer ${item.name}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="6" y1="18" x2="18" y2="6" />
                      </svg>
                    </button>
                  </div>
                  {item.options.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-mute">
                      {item.options.map((o, i) => (
                        <li key={i} className="truncate">
                          + {o.name}
                          {o.extra_price > 0 && ` (+${formatCHF(o.extra_price)})`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.notes && (
                    <div className="mt-0.5 truncate text-[11px] italic text-mute">
                      « {item.notes} »
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-full border border-border bg-cream">
                      <button
                        type="button"
                        onClick={() => handleQuantity(item.key, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-base text-ink transition hover:bg-rialto hover:text-white active:scale-90"
                        aria-label="Diminuer la quantité"
                      >
                        −
                      </button>
                      <span className="tabular min-w-[1.75rem] text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuantity(item.key, +1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-base text-ink transition hover:bg-rialto hover:text-white active:scale-90"
                        aria-label="Augmenter la quantité"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="tabular whitespace-nowrap font-display text-sm font-bold text-rialto-dark">
                        {formatCHF(item.subtotal)}
                      </div>
                      {item.quantity > 1 && (
                        <div className="tabular whitespace-nowrap text-[10px] text-mute">
                          {formatCHF(item.unit_price)}/u
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Suggestions d'ajout */}
      {count > 0 && (
        <div className="border-t border-border bg-cream/40 px-3 pb-1 pt-3">
          <UpsellPanel cart={cart} onAdd={handleUpsellAdd} />
        </div>
      )}

      {/* Footer */}
      {count > 0 && (
        <div className="border-t border-border bg-white px-4 py-3.5">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <span className="text-sm text-mute">Sous-total</span>
            <span className="tabular whitespace-nowrap font-display text-lg font-bold text-rialto-dark">
              {formatCHF(subtotal)}
            </span>
          </div>

          {!isPickup && missing > 0 ? (
            <>
              <div className="mb-1.5 text-xs text-ink/75">
                Encore <strong className="text-ink">{formatCHF(missing)}</strong> pour
                le minimum ({formatCHF(minOrderAmount)})
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-cream-dark">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-saffron to-rialto transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <Link
                href="/checkout"
                className="btn-primary-lg group flex w-full items-center justify-between"
                onClick={() => setMobileOpen(false)}
              >
                <span>Passer la commande</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="transition-transform group-hover:translate-x-0.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-mute">
                {isPickup ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#C73E1D" aria-hidden className="shrink-0">
                      <path d="M12 2C7.58 2 4 5.58 4 10c0 7 8 12 8 12s8-5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
                    </svg>
                    À récupérer · {RIALTO_INFO.address.split(",")[0]}
                  </>
                ) : (
                  "Frais de livraison ajoutés à l'étape suivante"
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar (lg+) */}
      <aside
        className={`hidden lg:sticky lg:top-[calc(var(--header-h,4rem)+0.75rem)] lg:flex lg:h-[calc(100vh-var(--header-h,4rem)-1.5rem)] lg:w-[320px] xl:w-[360px] lg:flex-shrink-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-white lg:shadow-card ${className}`}
      >
        {CartContent}
      </aside>

      {/* Mobile sticky bar */}
      {count > 0 && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed inset-x-0 bottom-0 z-40 animate-fade-up border-t border-border bg-white/95 px-4 py-3 backdrop-blur-lg lg:hidden"
        >
          <div
            className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-3 transition-colors ${
              canCheckout
                ? "bg-gradient-to-r from-rialto to-rialto-dark text-white shadow-hover"
                : "bg-cream-dark text-ink"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                  canCheckout ? "bg-white/20" : "bg-white"
                }`}
              >
                {count}
              </span>
              <span className="truncate font-display text-sm font-semibold">
                {canCheckout ? "Voir mon panier" : `Encore ${formatCHF(missing)}`}
              </span>
            </div>
            <span className="tabular whitespace-nowrap font-display font-bold flex-shrink-0">
              {formatCHF(subtotal)}
            </span>
          </div>
        </button>
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileOpen(false);
          }}
        >
          <div className="flex max-h-[88vh] min-h-[45vh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-pop animate-slide-up">
            <div className="flex shrink-0 justify-center pb-1 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <div className="min-h-0 flex-1">{CartContent}</div>
          </div>
        </div>
      )}
    </>
  );
}
