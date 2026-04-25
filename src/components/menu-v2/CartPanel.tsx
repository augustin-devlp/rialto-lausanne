"use client";

/**
 * CartPanel — Phase 11 C4.
 *
 * Panier unifié :
 * - Desktop (lg+) : sidebar droite persistante 380px (toujours visible).
 * - Mobile : drawer bottom sheet qui slide up au click sur la sticky bar.
 *
 * Actions : +/- quantité, suppression, vue détaillée options,
 * progression minimum commande, bouton checkout.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/types";
import { cartCount, cartSubtotal, updateCartQuantity, writeCart, cartLineKey } from "@/lib/clientStore";
import { formatCHF } from "@/lib/format";
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
  const count = cartCount(cart);
  const subtotal = cartSubtotal(cart);
  const missing = Math.max(0, minOrderAmount - subtotal);
  const canCheckout = count > 0 && missing === 0;
  const progressPct = Math.min(100, (subtotal / minOrderAmount) * 100);

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

  // Phase 12 V3 — ajout depuis UpsellPanel : fetch le menu_item, ajoute au cart
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold truncate">Mon panier</h2>
          <p className="text-[11px] text-mute truncate">
            {count} {count > 1 ? "articles" : "article"} ·{" "}
            {fulfillmentType === "delivery" ? "Livraison" : "Retrait"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-full p-2 text-mute hover:bg-cream-dark lg:hidden"
          aria-label="Fermer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-5xl">🛒</div>
            <p className="text-sm text-mute">
              Ton panier est vide. Ajoute des plats pour commencer.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {cart.map((item) => (
              <li
                key={item.key}
                className="rounded-2xl border border-border bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-sm font-semibold leading-tight truncate">
                      {item.name}
                    </div>
                    {item.options.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-mute">
                        {item.options.map((o, i) => (
                          <li key={i} className="truncate">
                            + {o.name}
                            {o.extra_price > 0 && ` (+${formatCHF(o.extra_price)})`}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.notes && (
                      <div className="mt-1 text-[11px] italic text-mute truncate">
                        « {item.notes} »
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.key)}
                    className="flex-shrink-0 rounded-full p-1 text-mute hover:bg-rialto/10 hover:text-rialto"
                    aria-label="Supprimer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  {/* Quantity control */}
                  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-cream flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuantity(item.key, -1)}
                      className="h-7 w-7 rounded-full text-ink hover:bg-rialto/10"
                      aria-label="Retirer"
                    >
                      −
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantity(item.key, +1)}
                      className="h-7 w-7 rounded-full text-ink hover:bg-rialto/10"
                      aria-label="Ajouter"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right flex-shrink-0 min-w-0">
                    <div className="text-[10px] text-mute whitespace-nowrap">
                      {formatCHF(item.unit_price)}/u
                    </div>
                    <div className="font-display font-bold text-sm whitespace-nowrap text-rialto-dark">
                      {formatCHF(item.subtotal)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Phase 12 V3 — Upsell suggestions */}
      {count > 0 && (
        <div className="border-t border-border bg-cream/40 px-3 pt-3 pb-1">
          <UpsellPanel cart={cart} onAdd={handleUpsellAdd} />
        </div>
      )}

      {/* Footer */}
      {count > 0 && (
        <div className="border-t border-border bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-mute flex-shrink-0">Sous-total</span>
            <span className="font-display text-base font-bold whitespace-nowrap text-rialto-dark">
              {formatCHF(subtotal)}
            </span>
          </div>

          {missing > 0 ? (
            <>
              <div className="mb-1.5 text-xs text-ink/80">
                Encore <strong>{formatCHF(missing)}</strong> pour atteindre le
                minimum ({formatCHF(minOrderAmount)}).
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-cream-dark">
                <div
                  className="h-full rounded-full bg-rialto transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <Link
              href="/checkout"
              className="btn-primary-lg group flex w-full items-center justify-between"
              onClick={() => setMobileOpen(false)}
            >
              <span>Passer la commande</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="transition-transform group-hover:translate-x-0.5"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar (lg+) — width adaptée iPad : 320 sur lg, 380 sur xl */}
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
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-3 backdrop-blur-lg animate-fade-up lg:hidden"
        >
          <div className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-3 ${canCheckout ? "bg-gradient-to-r from-rialto to-rialto-dark text-white" : "bg-cream-dark text-ink"}`}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold flex-shrink-0">
                {count}
              </span>
              <span className="font-display text-sm font-semibold truncate">
                {canCheckout ? "Voir mon panier" : `${formatCHF(missing)} restants`}
              </span>
            </div>
            <span className="font-display font-bold tabular-nums whitespace-nowrap flex-shrink-0">
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
          <div className="flex h-[85vh] w-full flex-col rounded-t-3xl bg-cream shadow-pop animate-slide-up">
            {CartContent}
          </div>
        </div>
      )}
    </>
  );
}
