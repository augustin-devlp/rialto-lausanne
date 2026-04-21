"use client";

/**
 * Carrousel d'avis — 3 cards visibles desktop, 1 mobile avec swipe natif.
 * Pas de librairie, simple scroll-snap horizontal.
 */

import { REVIEWS } from "@/lib/rialto-data";

export default function ReviewsCarousel() {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="container-hero">
        <div className="mb-10 md:mb-14">
          <span className="eyebrow">On en parle</span>
          <h2 className="mt-3 font-display text-h1 font-bold">
            Note <em className="italic">8.5 / 10</em> sur LaFourchette,
            <br className="hidden md:inline" />
            <span className="text-rialto">
              4.6 ★
            </span>{" "}
            sur Google.
          </h2>
        </div>

        <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0">
          {REVIEWS.slice(0, 3).map((r) => (
            <figure
              key={r.author}
              className="w-[85%] shrink-0 snap-center rounded-3xl border border-border bg-cream p-6 md:w-auto md:shrink md:snap-none"
            >
              <div className="flex items-center gap-1 text-saffron" aria-label={`${r.rating} étoiles`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={i < r.rating ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ))}
              </div>
              <blockquote className="mt-4 text-base leading-relaxed text-ink">
                « {r.text} »
              </blockquote>
              <figcaption className="mt-5 flex items-center justify-between text-xs">
                <span className="font-semibold text-ink">{r.author}</span>
                <span className="text-mute">{r.relativeTime}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
