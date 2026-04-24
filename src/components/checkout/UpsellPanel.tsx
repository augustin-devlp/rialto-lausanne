"use client";

/**
 * UpsellPanel V2 — Phase 12 Upsell Monstre.
 *
 * Suggestions personnalisées via /api/rialto/upsell (scoring + Gemini).
 * Debounce 800ms après stabilité panier. Skeleton pendant la requête.
 * Tracking shown/accepted/dismissed via /api/rialto/upsell/track.
 */

import { useEffect, useRef, useState } from "react";
import type { CartItem } from "@/lib/types";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { formatCHF } from "@/lib/format";
import { readCustomerSession } from "@/lib/customerSession";

const DEBOUNCE_MS = 800;

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

type Props = {
  cart: CartItem[];
  onAdd: (menu_item_id: string) => void;
};

export default function UpsellPanel({ cart, onAdd }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stable key pour éviter fetch inutile
  const cartKey = cart
    .map((c) => `${c.menu_item_id}x${c.quantity}`)
    .sort()
    .join("|");

  // Résoudre customer_id depuis la session locale → lookup stampify
  useEffect(() => {
    const session = readCustomerSession();
    if (!session?.phone) return;
    (async () => {
      try {
        const r = await fetch(
          `${STAMPIFY_BASE}/api/rialto/loyalty/lookup?phone=${encodeURIComponent(session.phone)}`,
        );
        if (r.ok) {
          const b = (await r.json()) as { customer?: { id: string } | null };
          if (b.customer) setCustomerId(b.customer.id);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
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
        const resp = await fetch(`${STAMPIFY_BASE}/api/rialto/upsell`, {
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
        const list = (data.suggestions ?? []).filter(
          (s) => !dismissed.has(s.menu_item_id),
        );
        setSuggestions(list);

        // Track shown
        for (const s of list) {
          fetch(`${STAMPIFY_BASE}/api/rialto/upsell/track`, {
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
  }, [cartKey, customerId]);

  const handleAdd = (s: Suggestion) => {
    onAdd(s.menu_item_id);
    fetch(`${STAMPIFY_BASE}/api/rialto/upsell/track`, {
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
  };

  const handleDismiss = (s: Suggestion) => {
    setDismissed((prev) => new Set(prev).add(s.menu_item_id));
    setSuggestions((prev) =>
      (prev || []).filter((x) => x.menu_item_id !== s.menu_item_id),
    );
    fetch(`${STAMPIFY_BASE}/api/rialto/upsell/track`, {
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
  };

  if (cart.length === 0) return null;

  if (loading && (!suggestions || suggestions.length === 0)) {
    return (
      <div className="mt-6 space-y-2">
        <UpsellSkeleton />
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <section className="mt-6 space-y-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-mute">
          ✨ On te conseille aussi
        </span>
      </div>
      {suggestions.map((s) => (
        <div
          key={s.menu_item_id}
          className="animate-fade-up relative flex items-center gap-3 rounded-2xl border-l-4 border-saffron bg-[#F9F1E4] p-4 pr-8 shadow-card"
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
