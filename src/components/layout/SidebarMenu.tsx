"use client";

/**
 * SidebarMenu — sidebar tab rétractable iPad-first (Phase 13 polish).
 * Phase 11 V2 + V3 : remplace/complète la nav chips horizontale.
 * - Desktop/iPad paysage (≥1024px) : ouverte 240px par défaut
 * - iPad portrait + mobile (<1024px) : auto-collapse 60px
 * - Toggle manuel via flèche
 * - SVG inline pour éviter dépendance lucide-react
 */

import { useEffect, useState } from "react";

type Category = {
  id: string;
  name: string;
  icon?: React.ReactNode | string;
  count?: number;
};

type Props = {
  categories: Category[];
  activeId?: string;
  onSelect: (id: string) => void;
  className?: string;
};

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// Mapping nom catégorie → emoji icône (rapide, pas de dep)
function pickIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("combo")) return "✨";
  if (n.includes("pizza")) return "🍕";
  if (n.includes("pâte") || n.includes("pasta") || n.includes("lasagne") || n.includes("tortelli")) return "🍝";
  if (n.includes("hamburger") || n.includes("burger")) return "🍔";
  if (n.includes("salade") || n.includes("entrée") || n.includes("starter")) return "🥗";
  if (n.includes("viande") || n.includes("brochette")) return "🥩";
  if (n.includes("poisson") || n.includes("crevette") || n.includes("saumon")) return "🐟";
  if (n.includes("dessert") || n.includes("glacé") || n.includes("baklava") || n.includes("tiramisu")) return "🍰";
  if (n.includes("vin") || n.includes("bière") || n.includes("alcoo")) return "🍷";
  if (n.includes("soft") || n.includes("drink") || n.includes("boisson") || n.includes("coca")) return "🥤";
  return "🍴";
}

export default function SidebarMenu({ categories, activeId, onSelect, className = "" }: Props) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth < 1024) setOpen(false);
      else setOpen(true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <aside
      className={`
        sticky top-14 sm:top-16 flex-shrink-0
        h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)]
        bg-white border-r border-cream-dark
        transition-[width] duration-300 ease-out
        ${open ? "w-[200px] md:w-[220px]" : "w-[56px]"}
        flex flex-col z-20
        shadow-sm
        ${className}
      `}
    >
      {/* Header avec logo + toggle */}
      <div className="flex items-center justify-between px-2.5 py-2.5 border-b border-cream-dark">
        {open ? (
          <span className="font-display font-bold text-rialto-dark text-sm tracking-tight ml-1">
            🍕 RIALTO
          </span>
        ) : (
          <span className="text-lg mx-auto">🍕</span>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Fermer menu" : "Ouvrir menu"}
          className="p-1.5 rounded-lg hover:bg-cream text-rialto-dark transition-colors flex-shrink-0"
        >
          {open ? <ChevronLeft /> : <ChevronRight />}
        </button>
      </div>

      {/* Liste catégories */}
      <nav className="flex-1 overflow-y-auto py-1">
        {categories.map((cat) => {
          const isActive = activeId === cat.id;
          const iconNode = cat.icon ?? pickIcon(cat.name);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              title={!open ? cat.name : undefined}
              className={`
                w-full flex items-center gap-2 px-2.5 py-2
                transition-colors text-left
                ${isActive
                  ? "bg-cream border-l-[3px] border-rialto text-rialto-dark font-semibold"
                  : "border-l-[3px] border-transparent text-ink hover:bg-cream/60"}
              `}
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-base">
                {iconNode}
              </span>
              {open && (
                <>
                  <span className="flex-1 text-[13px] truncate">{cat.name}</span>
                  {cat.count !== undefined && cat.count > 0 && (
                    <span className="text-[10px] text-mute flex-shrink-0 tabular-nums">
                      {cat.count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer compact */}
      {open && (
        <div className="px-2.5 py-2 border-t border-cream-dark text-[11px] text-mute leading-tight">
          <div className="font-medium text-rialto-dark">Av. de Béthusy 29</div>
          <div>1012 Lausanne</div>
        </div>
      )}
    </aside>
  );
}
