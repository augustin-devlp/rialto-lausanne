"use client";

/**
 * SidebarMenu — colonne catégories de la page menu (refonte UI lot 1,
 * É5, 20.08.2026, ordre Uber Eats).
 *
 * SANS boîte : pas de bordure, pas d'ombre, pas d'en-tête logo ni de
 * pied adresse — une liste de noms sur blanc, catégorie ACTIVE en
 * grisé. SANS emojis (spec explicite). Desktop uniquement (lg+) : en
 * dessous, les chips horizontales du menu font le travail (lot 2
 * mobile). Largeur pilotée par le parent (≈ 1/5 de la largeur utile).
 *
 * L'ancienne version (tab rétractable iPad, emojis pickIcon, compteurs)
 * a été remplacée le 20.08 — props conservées pour compatibilité
 * (icon/count désormais ignorés au rendu).
 */

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

export default function SidebarMenu({
  categories,
  activeId,
  onSelect,
  className = "",
}: Props) {
  return (
    <nav
      className={`sticky top-[72px] hidden max-h-[calc(100vh-88px)] overflow-y-auto py-1 lg:block ${className}`}
      aria-label="Catégories du menu"
    >
      <ul className="space-y-0.5 pr-3">
        {categories.map((cat) => {
          const isActive = activeId === cat.id;
          return (
            <li key={cat.id}>
              <button
                type="button"
                onClick={() => onSelect(cat.id)}
                aria-current={isActive ? "true" : undefined}
                className={`w-full rounded-btn px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-neutral-100 font-semibold text-ink"
                    : "text-ink hover:bg-neutral-50"
                }`}
              >
                {cat.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
