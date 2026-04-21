"use client";

/**
 * Modale de personnalisation d'un plat.
 * - Mobile : bottom sheet plein écran
 * - Desktop : modal centrée max-w-lg
 *
 * Reprend la logique de l'OptionsModal existant (groupes options, qty,
 * notes) mais avec la nouvelle identité visuelle + image grand format.
 */

import Image from "next/image";
import { useMemo, useState } from "react";
import type {
  MenuItem,
  MenuItemOption,
  CartOptionSelection,
} from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { matchDishImage } from "@/lib/rialto-data";

type Props = {
  item: MenuItem;
  options: MenuItemOption[];
  categoryName?: string | null;
  onClose: () => void;
  onConfirm: (
    selected: CartOptionSelection[],
    quantity: number,
    notes: string,
  ) => void;
};

export default function DishModal({
  item,
  options,
  categoryName,
  onClose,
  onConfirm,
}: Props) {
  const groups = useMemo(() => {
    const map: Record<string, MenuItemOption[]> = {};
    for (const o of options) {
      (map[o.option_group] ??= []).push(o);
    }
    return Object.entries(map);
  }, [options]);

  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const image = item.image_url || matchDishImage(item.name, categoryName);

  const toggle = (group: string, name: string, max: number) => {
    setSelected((prev) => {
      const curr = prev[group] ?? [];
      if (max === 1) return { ...prev, [group]: [name] };
      if (curr.includes(name))
        return { ...prev, [group]: curr.filter((n) => n !== name) };
      if (curr.length >= max) return prev;
      return { ...prev, [group]: [...curr, name] };
    });
  };

  const flatSelected: CartOptionSelection[] = useMemo(() => {
    const out: CartOptionSelection[] = [];
    for (const [group, names] of Object.entries(selected)) {
      for (const name of names) {
        const opt = options.find(
          (o) => o.option_group === group && o.option_name === name,
        );
        if (opt) {
          out.push({ group, name, extra_price: Number(opt.extra_price) });
        }
      }
    }
    return out;
  }, [selected, options]);

  const missingRequiredGroups = groups.filter(([group, opts]) => {
    const required = opts.some((o) => o.is_required);
    return required && (selected[group]?.length ?? 0) === 0;
  });
  const requiredOk = missingRequiredGroups.length === 0;

  const extras = flatSelected.reduce((s, o) => s + o.extra_price, 0);
  const total = (Number(item.price) + extras) * qty;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-cream shadow-pop sm:rounded-3xl"
      >
        {/* Image top */}
        <div className="relative h-52 w-full shrink-0 sm:h-64">
          <Image
            src={image}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, 512px"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-card transition hover:bg-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          <h3 className="font-display text-2xl font-bold leading-tight">
            {item.name}
          </h3>
          {item.description && (
            <p className="mt-2 text-sm leading-relaxed text-mute">
              {item.description}
            </p>
          )}
          <p className="mt-3 tabular font-display text-2xl font-semibold text-rialto">
            {formatCHF(Number(item.price))}
          </p>

          {groups.length > 0 && (
            <div className="mt-6 space-y-6">
              {groups.map(([group, opts]) => {
                const maxSel = Math.max(
                  1,
                  ...opts.map((o) => o.max_selections || 1),
                );
                const required = opts.some((o) => o.is_required);
                return (
                  <div key={group}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h4 className="font-display text-base font-semibold">
                        {group}
                      </h4>
                      <span className="text-xs text-mute">
                        {required ? "Requis · " : ""}
                        {maxSel === 1 ? "Choix unique" : `Max ${maxSel}`}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {opts.map((o) => {
                        const isSel = (selected[group] ?? []).includes(
                          o.option_name,
                        );
                        return (
                          <label
                            key={o.id}
                            className={`flex cursor-pointer items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm transition ${
                              isSel
                                ? "border-rialto bg-rialto-50"
                                : "border-border hover:border-ink"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <input
                                type={maxSel === 1 ? "radio" : "checkbox"}
                                checked={isSel}
                                onChange={() =>
                                  toggle(group, o.option_name, maxSel)
                                }
                                className="accent-rialto"
                                name={group}
                              />
                              <span className="font-medium">
                                {o.option_name}
                              </span>
                            </span>
                            {o.extra_price > 0 && (
                              <span className="tabular text-xs font-semibold text-mute">
                                +{formatCHF(Number(o.extra_price))}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          <div className="mt-6">
            <h4 className="mb-2 font-display text-base font-semibold">
              Instructions particulières
            </h4>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: bien cuite, sans oignons…"
              className="input resize-none text-sm"
              maxLength={200}
            />
          </div>

          {/* Quantité */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <h4 className="font-display text-base font-semibold">Quantité</h4>
            <div className="inline-flex items-center gap-3 rounded-full border border-border bg-white p-1">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full font-semibold text-ink transition hover:bg-cream disabled:opacity-40"
                disabled={qty <= 1}
                aria-label="Diminuer"
              >
                −
              </button>
              <span className="min-w-[24px] text-center tabular font-display text-lg font-semibold">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full font-semibold text-ink transition hover:bg-cream"
                aria-label="Augmenter"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="shrink-0 border-t border-border bg-white p-4">
          {!requiredOk && (
            <p className="mb-2 text-center text-xs text-rialto">
              Sélectionnez :{" "}
              {missingRequiredGroups.map(([g]) => g).join(", ")}
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              onConfirm(flatSelected, qty, notes.trim())
            }
            disabled={!requiredOk}
            className="btn-primary-lg w-full"
          >
            Ajouter au panier · {formatCHF(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
