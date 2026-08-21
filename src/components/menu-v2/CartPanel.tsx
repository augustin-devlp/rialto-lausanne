"use client";

/**
 * CartPanel — refonte UI lot 1 (É4, 20.08.2026).
 *
 * Panier unifié :
 * - Desktop (lg+) : TIROIR qui glisse depuis la droite, ouvert par le
 *   caddie badgé de l'AppHeader (event `rialto:cart-toggle`) ou par
 *   /menu?panier=1 — le panneau permanent a disparu.
 *   ⚠️ POINT CRITIQUE assumé : le bandeau « livraison offerte » vivait
 *   dans le panneau permanent — il vit désormais dans le tiroir ET en
 *   RAPPEL discret fixe en bas de page desktop tant que le palier n'est
 *   pas atteint (cliquer le rappel ouvre le tiroir). Le levier d'upsell
 *   de la grille par zone ne disparaît jamais de l'écran.
 * - Mobile : sticky bar + bottom sheet inchangés (lot 2).
 *
 * Actions : +/- quantité, suppression, vue détaillée options,
 * progression minimum commande, bouton checkout.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/types";
import { addLinesToCart, cartCount, cartSubtotal, updateCartQuantity, writeCart, cartLineKey } from "@/lib/clientStore";
import { formatCHF } from "@/lib/format";
import UpsellPanel from "@/components/checkout/UpsellPanel";
import { useFreeDeliveryRule } from "@/lib/delivery/useFreeDeliveryRule";
import { getFreeDeliveryMilestone } from "@/lib/delivery/milestones";

type Props = {
  cart: CartItem[];
  setCart: (cart: CartItem[]) => void;
  minOrderAmount: number;
  /** Zone de l'adresse qualifiée — requise pour le palier « livraison
   * offerte » depuis la refonte par zone (18.08 : seuil = min + offset).
   * Absente = bandeau masqué (décision 9 : un seuil générique serait
   * faux une fois sur deux). */
  zone?: { min_order_amount: number; delivery_fee: number } | null;
  className?: string;
};

export default function CartPanel({
  cart,
  setCart,
  minOrderAmount,
  zone = null,
  className = "",
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const count = cartCount(cart);
  const subtotal = cartSubtotal(cart);
  const missing = Math.max(0, minOrderAmount - subtotal);
  const canCheckout = count > 0 && missing === 0;
  // LS2 : moteur « distance au palier » — n'affiche rien tant que la règle
  // n'est pas chargée, que le seuil est désactivé, que l'adresse n'est pas
  // qualifiée, ou que la zone est à frais nul (Chailly : rien à offrir).
  // Pas de requête tant que le panier est vide (rien ne s'afficherait).
  const fdRule = useFreeDeliveryRule(count > 0 && zone != null);
  const fdMilestone = getFreeDeliveryMilestone(subtotal, zone, fdRule);
  const progressPct = Math.min(100, (subtotal / minOrderAmount) * 100);

  // Ouverture par le caddie de l'AppHeader (event) et par /menu?panier=1.
  useEffect(() => {
    const onToggle = () => {
      if (window.innerWidth >= 1024) setDesktopOpen((o) => !o);
      else setMobileOpen((o) => !o);
    };
    window.addEventListener("rialto:cart-toggle", onToggle);
    const params = new URLSearchParams(window.location.search);
    if (params.get("panier") === "1") {
      onToggle();
      // Nettoie ?panier=1 : sans ça, fermer le tiroir puis F5/retour
      // arrière le rouvrait tout seul (relecture 20.08).
      params.delete("panier");
      const reste = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (reste ? `?${reste}` : ""),
      );
    }
    // Rotation iPad / redimensionnement à cheval sur lg (1024px) : l'état
    // du côté quitté doit se fermer, sinon le body reste verrouillé sur
    // un tiroir passé en display:none (relecture 20.08 — gel dur).
    const mq = window.matchMedia("(min-width: 1024px)");
    const onBreakpoint = () => {
      if (mq.matches) setMobileOpen(false);
      else setDesktopOpen(false);
    };
    mq.addEventListener("change", onBreakpoint);
    return () => {
      window.removeEventListener("rialto:cart-toggle", onToggle);
      mq.removeEventListener("change", onBreakpoint);
    };
  }, []);

  // Ferme drawer si panier vidé
  useEffect(() => {
    if (count === 0 && mobileOpen) setMobileOpen(false);
  }, [count, mobileOpen]);

  // Lock body scroll quand un tiroir est ouvert
  useEffect(() => {
    if (!mobileOpen && !desktopOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, desktopOpen]);

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
      const resp = await fetch(`/api/rialto/menu-item/${menuItemId}`);
      if (!resp.ok) return;
      const body = await resp.json();
      const item = body.item;
      if (!item) return;
      // Helper unique Lot D : merge + écriture + add_to_cart tracké.
      const next = addLinesToCart([
        {
          key: cartLineKey(item.id, [], ""),
          menu_item_id: item.id,
          name: item.name,
          base_price: Number(item.price),
          quantity: 1,
          options: [],
          notes: "",
          unit_price: Number(item.price),
          subtotal: Number(item.price),
          // Catégorie renvoyée par l'API menu-item depuis la refonte
          // 18.08 (compte de pizzas ETA + item_category tracking).
          category: (item.category as string | null) ?? null,
        },
      ]);
      setCart(next);
    } catch {
      /* noop */
    }
  }

  // Contrainte invisible : CartContent est l'enfant unique d'un aside flex-row.
  // w-full + min-w-0 sont OBLIGATOIRES ici — sans min-w-0, la règle CSS
  // min-width:auto laisse le contenu s'élargir au min-content d'une ligne, puis
  // se faire couper à droite par le lg:overflow-hidden de l'aside (prix,
  // « + Ajouter » et sous-total tronqués). w-full remplit aussi l'aside quand
  // le panier est quasi vide (corrige le bug jumeau de sous-remplissage).
  const CartContent = (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold truncate">Mon panier</h2>
          <p className="text-[11px] text-mute truncate">
            {/* Rialto est en LIVRAISON SEULEMENT (21.08). Ce badge affichait
                « Retrait » tant que l'adresse n'était pas hydratée depuis le
                localStorage — un mot que le client voyait au chargement pour
                un service qui n'existe pas. */}
            {count} {count > 1 ? "articles" : "article"} · Livraison
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            setDesktopOpen(false);
          }}
          className="rounded-full p-2 text-mute hover:bg-neutral-200"
          aria-label="Fermer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-5xl">🛒</div>
            <p className="text-sm text-mute">
              Votre panier est vide. Ajoutez des plats pour commencer.
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
                  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-white flex-shrink-0">
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
        <div className="border-t border-border bg-neutral-50 px-3 pt-3 pb-1">
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

          {/* LS2 : encouragement au palier « livraison offerte ». Le
              minimum de commande garde la priorité visuelle quand il n'est
              pas atteint (il gate le checkout, le palier non). */}
          {fdMilestone && (
            <div
              className={`mb-1.5 text-xs font-medium ${
                fdMilestone.reached ? "text-emerald-700" : "text-ink/80"
              }`}
              aria-live="polite"
            >
              {fdMilestone.reached
                ? fdMilestone.labelReached
                : fdMilestone.labelPending}
            </div>
          )}

          {missing > 0 ? (
            <>
              <div className="mb-1.5 text-xs text-ink/80">
                Encore <strong>{formatCHF(missing)}</strong> pour atteindre le
                minimum ({formatCHF(minOrderAmount)}).
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
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
              onClick={() => {
                setMobileOpen(false);
                setDesktopOpen(false);
              }}
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
      {/* Desktop (lg+) : TIROIR droit — overlay + panneau glissant.
          Toujours monté (transition), inerte quand fermé. */}
      <div
        className={`fixed inset-0 z-50 hidden bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:block ${
          desktopOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDesktopOpen(false)}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[55] hidden w-[400px] flex-col overflow-hidden border-l border-border bg-white shadow-pop transition-[transform,visibility] duration-300 ease-out lg:flex ${
          desktopOpen ? "translate-x-0" : "invisible translate-x-full"
        } ${className}`}
        aria-hidden={!desktopOpen}
        aria-label="Panier"
      >
        {CartContent}
      </aside>

      {/* Rappel « livraison offerte » HORS tiroir (desktop) : le levier
          d'upsell reste visible panier fermé — cliquer ouvre le tiroir. */}
      {!desktopOpen && count > 0 && fdMilestone && !fdMilestone.reached && (
        <button
          type="button"
          onClick={() => setDesktopOpen(true)}
          className="fixed bottom-4 right-4 z-40 hidden items-center gap-2 rounded-btn border border-border bg-white px-4 py-2.5 text-xs font-medium text-ink shadow-pop transition hover:border-ink lg:inline-flex"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          {fdMilestone.labelPending}
        </button>
      )}

      {/* Mobile sticky bar */}
      {count > 0 && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-3 backdrop-blur-lg animate-fade-up lg:hidden"
        >
          <div className={`flex items-center justify-between gap-2 rounded-2xl px-4 py-3 ${canCheckout ? "bg-gradient-to-r from-rialto to-rialto-dark text-white" : "bg-neutral-100 text-ink"}`}>
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
          <div className="flex h-[85vh] w-full flex-col rounded-t-3xl bg-white shadow-pop animate-slide-up">
            {CartContent}
          </div>
        </div>
      )}
    </>
  );
}
