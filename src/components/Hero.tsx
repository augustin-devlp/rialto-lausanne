"use client";

import type { Restaurant } from "@/lib/types";
import { isOpenNow } from "@/lib/format";

type Props = { restaurant: Restaurant };

export default function Hero({ restaurant }: Props) {
  const open = isOpenNow(
    restaurant.order_open_time,
    restaurant.order_close_time,
  );
  const openTime = restaurant.order_open_time.slice(0, 5);
  const closeTime = restaurant.order_close_time.slice(0, 5);

  const scrollToMenu = () => {
    const el = document.getElementById("menu-start");
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <section
      className="relative isolate overflow-hidden"
      style={{
        minHeight: "clamp(320px, 55vh, 520px)",
        backgroundImage:
          "url(https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600&q=90)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center gap-5 px-4 py-16 text-center text-white">
        <h1
          className="font-serif text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          style={{
            fontFamily:
              "'Fraunces', 'Playfair Display', Georgia, serif",
            letterSpacing: "-0.02em",
          }}
        >
          {restaurant.name}
        </h1>
        <p className="text-base font-medium text-white/90 sm:text-lg">
          Pizzeria & brasserie · Lausanne
        </p>

        <div className="mt-1 flex flex-col items-center gap-1 text-sm text-white/90">
          <div>
            {open ? "🟢 Ouvert aujourd'hui" : "🔴 Fermé pour le moment"} ·{" "}
            {openTime} – {closeTime}
          </div>
          {restaurant.address && <div>{restaurant.address}</div>}
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone.replace(/\s/g, "")}`}
              className="font-semibold hover:underline"
            >
              ☎ {restaurant.phone}
            </a>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-white/80">
          <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            🕐 Prêt en ~{restaurant.prep_time_minutes} min
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            📍 Retrait en magasin
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
            💰 Espèces ou TWINT
          </span>
        </div>

        <button
          type="button"
          onClick={scrollToMenu}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-rialto px-8 py-4 text-sm font-semibold text-white shadow-lg transition hover:bg-rialto-dark active:scale-[0.98]"
        >
          Commander
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </section>
  );
}
