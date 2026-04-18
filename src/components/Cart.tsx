"use client";

import type { CartItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";

type Props = {
  items: CartItem[];
  subtotal: number;
  minAmount: number;
  missingMin: number;
  canCheckout: boolean;
  /** Raison lisible si !canCheckout (panier vide, horaires, etc.). */
  blockReason?: string | null;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onCheckout: () => void;
  compact?: boolean;
};

export default function Cart({
  items,
  subtotal,
  minAmount,
  missingMin,
  canCheckout,
  blockReason,
  onIncrement,
  onDecrement,
  onCheckout,
  compact,
}: Props) {
  const handleClick = () => {
    // Ne JAMAIS laisser le bouton silencieusement désactivé : toujours
    // cliquable, on explique simplement la raison si besoin.
    if (!canCheckout) {
      alert(blockReason ?? "Impossible de commander pour le moment.");
      return;
    }
    onCheckout();
  };
  return (
    <div
      className={`rounded-2xl bg-white ${
        compact ? "" : "border border-gray-100 shadow-card"
      } p-5`}
    >
      {!compact && (
        <h3 className="mb-4 text-lg font-bold">Votre commande</h3>
      )}

      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-mute">
          Votre panier est vide.
        </div>
      ) : (
        <ul className="mb-4 space-y-3">
          {items.map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium leading-tight">{it.name}</div>
                {it.options.length > 0 && (
                  <div className="mt-0.5 text-xs text-mute">
                    {it.options.map((o) => o.name).join(", ")}
                  </div>
                )}
                {it.notes && (
                  <div className="mt-0.5 text-xs italic text-mute">
                    « {it.notes} »
                  </div>
                )}
                <div className="mt-1 text-xs text-mute">
                  {formatCHF(it.unit_price)} · unité
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-sm font-semibold">
                  {formatCHF(it.subtotal)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDecrement(it.key)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-sm"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">
                    {it.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onIncrement(it.key)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-4 flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-sm font-semibold">Sous-total</span>
        <span className="text-base font-bold">{formatCHF(subtotal)}</span>
      </div>

      {minAmount > 0 && missingMin > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Ajoutez <strong>{formatCHF(missingMin)}</strong> pour atteindre le
          minimum de {formatCHF(minAmount)}.
        </div>
      )}

      {!canCheckout && blockReason && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-900">
          ⚠️ {blockReason}
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        style={{ WebkitTapHighlightColor: "transparent" }}
        className={`w-full rounded-full px-5 py-4 text-sm font-semibold text-white shadow-sm transition ${
          canCheckout
            ? "bg-rialto hover:bg-rialto-dark active:scale-[0.98]"
            : "bg-gray-400 cursor-not-allowed"
        }`}
      >
        Passer la commande
        {items.length > 0 && ` · ${formatCHF(subtotal)}`}
      </button>

      <p className="mt-3 text-center text-xs text-mute">
        Paiement en magasin · Espèces ou TWINT
      </p>
    </div>
  );
}
