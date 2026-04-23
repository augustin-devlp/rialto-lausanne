"use client";

/**
 * UpsellPanel — Phase 11 C12.
 * Affiche 2-3 suggestions IA au-dessus du bouton "Valider la commande"
 * sur /checkout. Chaque clic ajoute l'item au panier et re-fetch les
 * suggestions.
 */

import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/types";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { formatCHF } from "@/lib/format";

type Suggestion = {
  menu_item_id: string;
  name: string;
  price: number;
  category: string;
  argument: string;
};

type Props = {
  cart: CartItem[];
  onAdd: (menu_item_id: string) => void;
};

export default function UpsellPanel({ cart, onAdd }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (cart.length === 0) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    const payload = {
      cart: cart.map((c) => ({
        menu_item_id: c.menu_item_id,
        name: c.name,
        quantity: c.quantity,
      })),
      subtotal: cart.reduce((s, c) => s + c.subtotal, 0),
    };
    fetch(`${STAMPIFY_BASE}/api/rialto/checkout/upsell`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((b) => {
        if (b.ok) {
          setSuggestions(
            (b.suggestions as Suggestion[]).filter(
              (s) => !dismissed.has(s.menu_item_id),
            ),
          );
          setSource(b.source ?? "");
        }
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, cart.map((c) => c.menu_item_id).join(",")]);

  const visible = suggestions.filter((s) => !dismissed.has(s.menu_item_id));
  if (visible.length === 0 && !loading) return null;

  return (
    <section className="mt-6 rounded-3xl border-2 border-saffron bg-gradient-to-br from-[#FFF7E4] to-[#FFF2D1] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">✨</span>
        <h3 className="font-display text-base font-bold text-ink">
          On te conseille aussi
        </h3>
        {source === "gemini" && (
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink">
            AI
          </span>
        )}
      </div>

      {loading && visible.length === 0 ? (
        <div className="h-20 animate-pulse rounded-2xl bg-white/50" />
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => (
            <li
              key={s.menu_item_id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card"
            >
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-display font-semibold text-ink">
                    {s.name}
                  </div>
                  <div className="tabular font-display font-bold text-rialto">
                    {formatCHF(s.price)}
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-mute">{s.argument}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setDismissed((prev) => new Set([...prev, s.menu_item_id]))
                  }
                  className="rounded-full p-1.5 text-mute hover:bg-cream-dark"
                  aria-label="Ignorer"
                  title="Ignorer"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(s.menu_item_id);
                    setDismissed((prev) => new Set([...prev, s.menu_item_id]));
                  }}
                  className="rounded-full bg-rialto px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rialto-dark"
                >
                  + Ajouter
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
