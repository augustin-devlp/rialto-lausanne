"use client";

/**
 * UpsellPanel V2 — Phase 12 Upsell Monstre.
 *
 * Suggestions personnalisées via /api/rialto/upsell (scoring + Gemini).
 * Debounce 800ms après stabilité panier. Skeleton pendant la requête.
 * Tracking shown/accepted/dismissed via /api/rialto/upsell/track.
 *
 * v2 (D3) — garde de session : dès qu'un client accepte OU ignore une
 * suggestion, le panneau reste silencieux pour toute la session (aucun fetch,
 * aucun rendu). Le cooldown serveur 3×/30j reste inchangé.
 * v2 (fidélité) — bandeau discret « Plus que X tampons » au-dessus des
 * suggestions, alimenté par la carte déjà résolue au lookup (zéro appel réseau
 * en plus). Lecture seule stricte.
 */

import { useEffect, useRef, useState } from "react";
import type { CartItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { readCustomerSession } from "@/lib/customerSession";

const DEBOUNCE_MS = 800;

// D3 — clé de garde de session (accepté OU ignoré → panneau clos pour la session).
const SESSION_KEY = "rialto:upsell-session-done";

function readSessionDone(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Safari en navigation privée peut faire throw sessionStorage.
    return false;
  }
}

function markSessionDone(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* Safari privé : ignore silencieusement. */
  }
}

type Suggestion = {
  menu_item_id: string;
  name: string;
  price: number;
  image_url?: string;
  message: string;
  category: string;
  score: number;
  reasons: string[];
};

// Carte fidélité minimale, capturée au passage du lookup existant (aucun
// appel réseau supplémentaire). Uniquement les champs utiles au bandeau.
type LoyaltyCard = {
  current_stamps: number;
  stamps_required: number;
};

type Props = {
  cart: CartItem[];
  onAdd: (menu_item_id: string) => void;
};

export default function UpsellPanel({ cart, onAdd }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable key pour éviter fetch inutile
  const cartKey = cart
    .map((c) => `${c.menu_item_id}x${c.quantity}`)
    .sort()
    .join("|");

  // Au mount : si le panneau a déjà été fermé cette session (D3) → silence
  // total, on ne résout même pas le client. Sinon on résout customer_id ET la
  // carte fidélité depuis la session locale via le lookup existant.
  useEffect(() => {
    if (readSessionDone()) {
      setSessionDone(true);
      return;
    }
    const session = readCustomerSession();
    if (!session?.phone) return;
    (async () => {
      try {
        const r = await fetch(
          `/api/rialto/loyalty/lookup?phone=${encodeURIComponent(session.phone)}`,
        );
        if (r.ok) {
          const b = (await r.json()) as {
            customer?: { id: string } | null;
            card?: {
              current_stamps?: number;
              stamps_required?: number;
            } | null;
          };
          if (b.customer) setCustomerId(b.customer.id);
          if (
            b.card &&
            typeof b.card.current_stamps === "number" &&
            typeof b.card.stamps_required === "number"
          ) {
            setCard({
              current_stamps: b.card.current_stamps,
              stamps_required: b.card.stamps_required,
            });
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    // D3 : panneau clos pour la session → aucun fetch, on nettoie tout.
    if (sessionDone) {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (cart.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const resp = await fetch(`/api/rialto/upsell`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cart_items: cart.map((c) => ({
              menu_item_id: c.menu_item_id,
              quantity: c.quantity,
            })),
            customer_id: customerId,
          }),
          signal: ac.signal,
        });
        if (!resp.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await resp.json()) as {
          ok?: boolean;
          suggestions?: Suggestion[];
        };
        const list = data.suggestions ?? [];
        setSuggestions(list);

        // Track shown
        for (const s of list) {
          fetch(`/api/rialto/upsell/track`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              customer_id: customerId,
              suggested_item_id: s.menu_item_id,
              suggested_category: s.category,
              action: "shown",
              cart_item_ids: cart.map((c) => c.menu_item_id),
              score: s.score,
              reasons: s.reasons,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.name : String(err);
        if (msg !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, customerId, sessionDone]);

  const handleAdd = (s: Suggestion) => {
    onAdd(s.menu_item_id);
    // Tracking accepted TOUJOURS avant fermeture (ne casse pas les stats).
    fetch(`/api/rialto/upsell/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        suggested_item_id: s.menu_item_id,
        suggested_category: s.category,
        action: "accepted",
        cart_item_ids: cart.map((c) => c.menu_item_id),
      }),
    }).catch(() => {});
    // D3 : accepter ferme le panneau pour toute la session (panier déjà augmenté).
    markSessionDone();
    setSessionDone(true);
  };

  const handleDismiss = (s: Suggestion) => {
    // Tracking dismissed TOUJOURS avant fermeture.
    fetch(`/api/rialto/upsell/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        suggested_item_id: s.menu_item_id,
        suggested_category: s.category,
        action: "dismissed",
        cart_item_ids: cart.map((c) => c.menu_item_id),
      }),
    }).catch(() => {});
    // D3 : ignorer ferme aussi le panneau pour toute la session.
    markSessionDone();
    setSessionDone(true);
  };

  // D3 : panneau clos pour la session → rien du tout.
  if (sessionDone) return null;
  if (cart.length === 0) return null;

  if (loading && (!suggestions || suggestions.length === 0)) {
    return (
      <div className="mt-6 space-y-2">
        <UpsellSkeleton />
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  // Bandeau fidélité : uniquement si carte résolue ET le panneau affiche des
  // suggestions. Panneau silencieux (retours null ci-dessus) → pas de bandeau.
  const stampsLeft = card ? card.stamps_required - card.current_stamps : 0;
  const showLoyaltyBanner = card !== null && stampsLeft >= 1;

  return (
    <section className="mt-6 space-y-2">
      {showLoyaltyBanner && (
        <div className="flex items-center gap-2 rounded-xl bg-[#F9F1E4] px-3.5 py-2.5 text-xs font-medium text-ink ring-1 ring-saffron/40">
          <span>
            Plus que {stampsLeft} tampon{stampsLeft > 1 ? "s" : ""} avant votre
            récompense 🎁
          </span>
        </div>
      )}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-mute">
          ✨ On vous conseille aussi
        </span>
      </div>
      {suggestions.map((s) => (
        <div
          key={s.menu_item_id}
          className="animate-fade-up relative flex items-center gap-3 overflow-hidden rounded-2xl border-l-4 border-saffron bg-[#F9F1E4] p-4 pr-8 shadow-card"
        >
          <button
            type="button"
            onClick={() => handleDismiss(s)}
            aria-label="Ignorer"
            className="absolute right-2 top-2 text-mute hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
          {s.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.image_url}
              alt={s.name}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-xs italic text-mute">{s.message}</p>
            <p className="truncate text-sm font-display font-bold text-rialto-dark">
              {s.name}
              <span className="ml-2 font-normal text-mute">
                · {formatCHF(s.price)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAdd(s)}
            className="shrink-0 rounded-full bg-rialto px-3 py-2 text-xs font-bold text-white transition hover:bg-rialto-dark"
          >
            + Ajouter
          </button>
        </div>
      ))}
    </section>
  );
}

function UpsellSkeleton() {
  return (
    <div className="rounded-2xl border-l-4 border-saffron bg-[#F9F1E4] p-4">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-border" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-border" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-border" />
        </div>
      </div>
    </div>
  );
}
