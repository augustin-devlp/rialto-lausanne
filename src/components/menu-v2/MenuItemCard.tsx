"use client";

/**
 * Card plat dans la grille du menu.
 *
 * Layout : photo à droite, contenu à gauche.
 * La photo + le nom + la description sont un LIEN vers /menu/[slug]
 * (page produit dédiée). Le bouton "Ajouter" reste un bouton d'action
 * indépendant. Un second lien subtil "Voir en détail" renforce la
 * découvrabilité de la page produit.
 */

import Image from "next/image";
import Link from "next/link";
import type { MenuItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { matchDishImage } from "@/lib/rialto-data";
import { menuItemSlug } from "@/lib/slug";

type Props = {
  item: MenuItem;
  categoryName?: string | null;
  onAdd: (item: MenuItem) => void;
};

export default function MenuItemCard({ item, categoryName, onAdd }: Props) {
  const src = item.image_url || matchDishImage(item.name, categoryName);
  const unavailable = !item.is_available;
  const href = `/menu/${menuItemSlug({ id: item.id, name: item.name })}`;

  return (
    <article
      className={`dish-card group relative flex items-stretch overflow-hidden border border-border ${
        unavailable ? "opacity-50" : ""
      }`}
    >
      {/* Lien principal enveloppant le contenu éditorial + la photo */}
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-stretch"
        aria-label={`Voir le détail de ${item.name}`}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-base font-semibold leading-tight text-ink md:text-lg">
                {item.name}
              </h3>
              {(item.is_vegetarian || item.is_spicy) && (
                <div className="flex shrink-0 items-center gap-1">
                  {item.is_vegetarian && (
                    <span
                      title="Végétarien"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-[10px]"
                    >
                      🌱
                    </span>
                  )}
                  {item.is_spicy && (
                    <span
                      title="Piquant"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rialto-50 text-[10px]"
                    >
                      🌶
                    </span>
                  )}
                </div>
              )}
            </div>
            {item.description && (
              <p className="mt-1.5 line-clamp-2 text-sm text-mute">
                {item.description}
              </p>
            )}
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="tabular font-display text-base font-semibold text-ink md:text-lg">
              {formatCHF(Number(item.price))}
            </span>
            <span className="text-[11px] font-medium text-mute underline underline-offset-2 group-hover:text-rialto">
              Voir en détail
            </span>
          </div>
        </div>
        <div className="relative w-[34%] shrink-0 sm:w-[40%] md:w-[38%]">
          <Image
            src={src}
            alt={item.name}
            fill
            sizes="(max-width: 768px) 40vw, 200px"
            className="dish-card-image object-cover"
          />
          {unavailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold uppercase tracking-wider text-white">
              Épuisé
            </div>
          )}
        </div>
      </Link>

      {/* Bouton Ajouter — absolute overlay sur la photo, échappe au Link */}
      {!unavailable && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAdd(item);
          }}
          className="absolute bottom-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-rialto text-white shadow-card transition hover:scale-110 hover:bg-rialto-dark md:h-11 md:w-11"
          aria-label={`Ajouter ${item.name} au panier`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    </article>
  );
}
