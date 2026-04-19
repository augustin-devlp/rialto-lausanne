"use client";

import { useMemo, useState } from "react";
import type {
  MenuItem,
  MenuItemOption,
  CartOptionSelection,
} from "@/lib/types";
import { formatCHF } from "@/lib/format";

type Props = {
  item: MenuItem;
  options: MenuItemOption[];
  onClose: () => void;
  onConfirm: (
    selected: CartOptionSelection[],
    quantity: number,
    notes: string,
  ) => void;
};

export default function OptionsModal({
  item,
  options,
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

  const missingRequiredGroups = groups
    .filter(([group, opts]) => {
      const required = opts.some((o) => o.is_required);
      return required && (selected[group]?.length ?? 0) === 0;
    })
    .map(([group]) => group);
  const requiredOk = missingRequiredGroups.length === 0;

  const extras = flatSelected.reduce((s, o) => s + o.extra_price, 0);
  const total = (Number(item.price) + extras) * qty;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
      >
        <header className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <h3 className="text-xl font-bold">{item.name}</h3>
            {item.description && (
              <p className="mt-1 text-sm text-mute">{item.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 rounded-full p-2 text-mute transition hover:bg-surface"
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {groups.map(([group, opts]) => {
            const max = opts[0]?.max_selections ?? 1;
            const required = opts.some((o) => o.is_required);
            return (
              <div key={group} className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold">{group}</h4>
                  <span className="text-xs text-mute">
                    {required ? "Obligatoire" : "Optionnel"}
                    {max > 1 && ` · max ${max}`}
                  </span>
                </div>
                <div className="space-y-2">
                  {opts.map((opt) => {
                    const isSel = (selected[group] ?? []).includes(
                      opt.option_name,
                    );
                    return (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                          isSel
                            ? "border-rialto bg-red-50/40"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type={max === 1 ? "radio" : "checkbox"}
                            name={group}
                            checked={isSel}
                            onChange={() =>
                              toggle(group, opt.option_name, max)
                            }
                            className="h-4 w-4 accent-rialto"
                          />
                          <span className="text-sm">{opt.option_name}</span>
                        </div>
                        {Number(opt.extra_price) > 0 && (
                          <span className="text-xs font-semibold text-mute">
                            +{formatCHF(Number(opt.extra_price))}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold">
              Notes (allergies, précisions)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-rialto"
              placeholder="Ex. sans oignon, bien cuite…"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Quantité</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200"
              >
                −
              </button>
              <span className="w-6 text-center font-semibold">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <footer className="border-t border-gray-100 p-4">
          {!requiredOk && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">
              ⚠️ Veuillez choisir :{" "}
              <strong>{missingRequiredGroups.join(", ")}</strong>
            </div>
          )}
          <button
            type="button"
            disabled={!requiredOk}
            onClick={() => onConfirm(flatSelected, qty, notes)}
            className={`w-full rounded-full px-5 py-4 text-sm font-semibold text-white shadow-sm transition ${
              requiredOk
                ? "bg-rialto hover:bg-rialto-dark active:scale-[0.98]"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            {requiredOk
              ? `Ajouter — ${formatCHF(total)}`
              : "Choisissez les options requises"}
          </button>
        </footer>
      </div>
    </div>
  );
}
