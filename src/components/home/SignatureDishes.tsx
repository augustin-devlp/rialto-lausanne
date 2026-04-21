"use client";

/**
 * Grid des 4 plats signatures — 2x2 sur mobile, 4x1 sur desktop.
 * Photos dominent, typo éditoriale en surimpression.
 */

import Image from "next/image";
import Link from "next/link";
import { SIGNATURE_DISHES } from "@/lib/rialto-data";

export default function SignatureDishes() {
  return (
    <section className="bg-cream py-16 md:py-24">
      <div className="container-hero">
        <div className="mb-10 flex flex-col gap-3 md:mb-14 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow">Les signatures</span>
            <h2 className="mt-3 font-display text-h1 font-bold">
              Ce qui fait venir <br className="hidden md:inline" />
              <em className="italic text-rialto">le quartier.</em>
            </h2>
          </div>
          <p className="max-w-md text-base text-mute">
            Quatre plats que les habitués commandent sans même regarder le
            menu. Pizzas Ø33&nbsp;cm, pâtes fraîches, viandes d'Anatolie.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {SIGNATURE_DISHES.map((dish, i) => (
            <Link
              key={dish.name}
              href="/menu"
              className="dish-card group block"
              style={{
                animationDelay: `${i * 60}ms`,
              }}
            >
              <div className="relative aspect-[4/5] md:aspect-square">
                <Image
                  src={dish.image}
                  alt={dish.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="dish-card-image"
                />
                {dish.tag && (
                  <span className="absolute left-3 top-3 rounded-full bg-saffron px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink">
                    {dish.tag}
                  </span>
                )}
                {/* Gradient du bas pour lisibilité du texte */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white md:p-4">
                  <h3 className="font-display text-lg font-semibold leading-tight md:text-xl">
                    {dish.name}
                  </h3>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs text-white/80 md:text-sm">
                      {dish.subtitle}
                    </span>
                    <span className="tabular shrink-0 font-display text-base font-semibold md:text-lg">
                      {dish.price}&nbsp;CHF
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/menu" className="btn-primary-lg">
            Voir tout le menu
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
