"use client";

/**
 * OffresCarrousel — « Des offres pour vous » (É5 refonte UI lot 1,
 * 20.08.2026). Le module de suggestions du menu remis en forme carrousel :
 * les articles VEDETTE (is_priority — le concept « Coup de cœur » seedé
 * au dashboard) du menu déjà chargé. Zéro appel réseau.
 *
 * Forme (spec Augustin) : titre et flèches de navigation sur la même
 * ligne ; cartes image CARRÉE + NOM SEUL (pas de description — elle vit
 * sur les lignes du menu et la fiche produit) ; bouton + identique aux
 * cartes du menu : MÊME chemin d'ajout (modale d'options via onAdd —
 * jamais d'ajout aveugle d'un article à options obligatoires, et le
 * tracking add_to_cart passe par le chemin unique existant).
 */

import { useRef } from "react";
import Image from "next/image";
import type { MenuItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { matchDishImage } from "@/lib/rialto-data";

type Props = {
  items: MenuItem[];
  categoryNameById: Record<string, string>;
  onAdd: (item: MenuItem) => void;
};

export default function OffresCarrousel({
  items,
  categoryNameById,
  onAdd,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const defile = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section className="pt-4" aria-label="Des offres pour vous">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink md:text-xl">
          Des offres pour vous
        </h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => defile(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink transition hover:border-ink disabled:opacity-40"
            aria-label="Faire défiler vers la gauche"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => defile(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink transition hover:border-ink"
            aria-label="Faire défiler vers la droite"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-none mt-3 flex gap-3 overflow-x-auto"
      >
        {items.map((it) => {
          const src = it.image_url || matchDishImage(it.name, categoryNameById[it.category_id]);
          return (
            <div key={it.id} className="w-[150px] shrink-0 md:w-[170px]">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-neutral-100">
                <Image
                  src={src}
                  alt={it.name}
                  fill
                  sizes="170px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => onAdd(it)}
                  className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-card transition hover:scale-110"
                  aria-label={`Ajouter ${it.name} au panier`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              <div className="mt-1.5 truncate text-sm font-medium text-ink">
                {it.name}
              </div>
              <div className="tabular text-xs text-mute">
                {formatCHF(Number(it.price))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
