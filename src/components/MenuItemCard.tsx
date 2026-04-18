"use client";

import type { MenuItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";

type Props = {
  item: MenuItem;
  onAdd: () => void;
};

export default function MenuItemCard({ item, onAdd }: Props) {
  return (
    <article className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card transition hover:border-gray-200">
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold leading-tight text-ink">
            {item.name}
          </h3>
          {item.is_vegetarian && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              🌱 Vég
            </span>
          )}
          {item.is_spicy && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              🌶️ Épicé
            </span>
          )}
        </div>
        {item.description && (
          <p className="mb-3 line-clamp-3 text-sm text-mute">
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-ink">
            {formatCHF(item.price)}
          </span>
          {item.has_options && (
            <span className="text-xs text-mute">options disponibles</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rialto text-xl font-semibold text-white shadow-sm transition hover:bg-rialto-dark"
        aria-label={`Ajouter ${item.name}`}
      >
        +
      </button>
    </article>
  );
}
