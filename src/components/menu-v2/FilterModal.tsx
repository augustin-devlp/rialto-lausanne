"use client";

/**
 * Modale de filtres menu — remplace la rangée de chips par un popup
 * structuré en sections (régime / caractéristiques / type cuisine).
 *
 * Logique combinatoire :
 * - OR logique À L'INTÉRIEUR d'une section (ex: végétarien OR vegan)
 * - AND logique ENTRE les sections (ex: [vegan] AND [piquant])
 *
 * Les filtres sont persistés en localStorage (clé RIALTO:FILTERS:V1)
 * pour garder la sélection entre navigations.
 */

import { useEffect, useMemo, useState } from "react";

export type FilterKey =
  | "vegetarian"
  | "vegan"
  | "lactose_free"
  | "gluten_free"
  | "halal"
  | "spicy"
  | "kids_friendly"
  | "seafood"
  | "meat"
  | "anatolian"
  | "pizza"
  | "pasta";

type FilterSection = {
  title: string;
  filters: { key: FilterKey; icon: string; label: string }[];
};

export const FILTER_SECTIONS: FilterSection[] = [
  {
    title: "Régime alimentaire",
    filters: [
      { key: "vegetarian", icon: "🌱", label: "Végétarien" },
      { key: "vegan", icon: "🥬", label: "Vegan" },
      { key: "lactose_free", icon: "🥛", label: "Sans lactose" },
      { key: "gluten_free", icon: "🌾", label: "Sans gluten" },
      { key: "halal", icon: "🕌", label: "Halal" },
    ],
  },
  {
    title: "Caractéristiques",
    filters: [
      { key: "spicy", icon: "🌶", label: "Piquant" },
      { key: "kids_friendly", icon: "👶", label: "Adapté aux enfants" },
    ],
  },
  {
    title: "Type de cuisine",
    filters: [
      { key: "seafood", icon: "🐟", label: "Fruits de mer" },
      { key: "meat", icon: "🥩", label: "Viande" },
      { key: "anatolian", icon: "🇹🇷", label: "Anatolien" },
      { key: "pizza", icon: "🍕", label: "Pizzas" },
      { key: "pasta", icon: "🍝", label: "Pâtes" },
    ],
  },
];

/** Map FilterKey → quel index de section il appartient (pour OR/AND) */
const FILTER_TO_SECTION: Record<FilterKey, number> = (() => {
  const map = {} as Record<FilterKey, number>;
  FILTER_SECTIONS.forEach((section, idx) => {
    section.filters.forEach((f) => {
      map[f.key] = idx;
    });
  });
  return map;
})();

const STORAGE_KEY = "RIALTO:FILTERS:V1";

export function readStoredFilters(): Set<FilterKey> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as FilterKey[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function writeStoredFilters(filters: Set<FilterKey>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Array.from(filters)),
  );
}

/* ─── Matching : OR dans section, AND entre sections ────────────────── */
type MatchableItem = {
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_lactose_free?: boolean;
  is_gluten_free?: boolean;
  is_halal?: boolean;
  is_spicy?: boolean;
  is_kids_friendly?: boolean;
  tags?: string[] | null;
  name?: string;
  category_name?: string | null;
};

function itemMatchesSingle(
  item: MatchableItem,
  key: FilterKey,
  categoryName?: string | null,
): boolean {
  switch (key) {
    case "vegetarian": return !!item.is_vegetarian;
    case "vegan": return !!item.is_vegan;
    case "lactose_free": return !!item.is_lactose_free;
    case "gluten_free": return !!item.is_gluten_free;
    case "halal": return !!item.is_halal;
    case "spicy": return !!item.is_spicy;
    case "kids_friendly": return !!item.is_kids_friendly;
    case "seafood": return !!item.tags?.includes("seafood");
    case "meat": return !!item.tags?.includes("meat");
    case "anatolian": return !!item.tags?.includes("anatolian");
    case "pizza":
      return (
        (categoryName ?? item.category_name ?? "").toLowerCase().includes("pizza") ||
        (item.name ?? "").toLowerCase().includes("pizza")
      );
    case "pasta":
      return (
        (categoryName ?? item.category_name ?? "").toLowerCase().includes("pâte") ||
        (categoryName ?? item.category_name ?? "").toLowerCase().includes("pasta") ||
        /tagliatelle|spaghetti|linguine|tortellini|lasagne/.test(
          (item.name ?? "").toLowerCase(),
        )
      );
  }
}

export function itemMatchesFilters(
  item: MatchableItem,
  active: Set<FilterKey>,
  categoryName?: string | null,
): boolean {
  if (active.size === 0) return true;
  // Regroupe par section : dans une section, un seul filtre actif suffit
  const activeBySection: Record<number, FilterKey[]> = {};
  for (const k of active) {
    const sec = FILTER_TO_SECTION[k];
    (activeBySection[sec] ??= []).push(k);
  }
  // Vérifie chaque section : au moins un match
  for (const filtersInSection of Object.values(activeBySection)) {
    const anyMatch = filtersInSection.some((k) =>
      itemMatchesSingle(item, k, categoryName),
    );
    if (!anyMatch) return false;
  }
  return true;
}

/* ─── UI ────────────────────────────────────────────────────────────── */

type Props = {
  open: boolean;
  onClose: () => void;
  initialFilters: Set<FilterKey>;
  onApply: (filters: Set<FilterKey>) => void;
  // Compteur live de résultats pour l'affichage bouton Appliquer
  countResults: (filters: Set<FilterKey>) => number;
};

export default function FilterModal({
  open,
  onClose,
  initialFilters,
  onApply,
  countResults,
}: Props) {
  const [draft, setDraft] = useState<Set<FilterKey>>(initialFilters);

  // Resync quand l'utilisateur réouvre avec un état parent différent
  useEffect(() => {
    if (open) setDraft(new Set(initialFilters));
  }, [open, initialFilters]);

  const count = useMemo(() => countResults(draft), [draft, countResults]);

  // Empêche le scroll du body pendant que le popup est ouvert
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const toggle = (k: FilterKey) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-pop sm:rounded-3xl animate-fade-up"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-bold">Filtrer le menu</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-cream"
            aria-label="Fermer"
          >
            <svg
              width="16"
              height="16"
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
        </header>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {FILTER_SECTIONS.map((section) => (
            <section key={section.title} className="mb-5 last:mb-0">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-rialto">
                {section.title}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {section.filters.map((f) => {
                  const checked = draft.has(f.key);
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                        checked
                          ? "border-rialto bg-rialto/5"
                          : "border-border bg-white hover:border-ink"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(f.key)}
                        className="accent-rialto"
                      />
                      <span className="text-lg leading-none">{f.icon}</span>
                      <span className="font-medium">{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Footer actions */}
        <footer className="flex items-center gap-2 border-t border-border bg-cream px-4 py-3">
          <button
            type="button"
            onClick={() => setDraft(new Set())}
            className="btn-ghost"
          >
            Effacer tout
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="btn-primary flex-1"
          >
            Appliquer ({count} résultat{count > 1 ? "s" : ""})
          </button>
        </footer>
      </div>
    </div>
  );
}
