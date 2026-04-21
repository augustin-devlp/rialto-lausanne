"use client";

/**
 * Section hero plein écran mobile-first : photo dominante (pizza rustique),
 * titre éditorial en Fraunces, zone de qualification d'adresse proéminente.
 * Le hero atteint ~85vh sur mobile, 90vh sur desktop.
 */

import Image from "next/image";
import AddressGate from "./AddressGate";
import { IMAGES, RIALTO_INFO } from "@/lib/rialto-data";

type Props = {
  restaurantId: string;
  minOrderFallback: number;
};

export default function HeroSection({ restaurantId, minOrderFallback }: Props) {
  return (
    <section className="relative isolate flex min-h-[85vh] flex-col justify-end overflow-hidden bg-ink md:min-h-[90vh]">
      {/* Photo de fond — pizza sortie du four */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={IMAGES.heroHero}
          alt="Pizza Rialto sortie du four à bois"
          fill
          priority
          quality={85}
          sizes="100vw"
          className="object-cover"
        />
        {/* Gradient d'assombrissement pour la lisibilité du texte */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/80" />
      </div>

      {/* Contenu — aligné en bas sur mobile, centré-bas sur desktop */}
      <div className="container-hero relative z-10 flex flex-col gap-6 pt-24 pb-10 text-white md:pt-32 md:pb-16">
        <div className="max-w-2xl animate-fade-up">
          <span className="eyebrow !text-saffron">
            {RIALTO_INFO.tagline}
          </span>
          <h1 className="mt-4 font-display text-display font-bold">
            Commandez Rialto.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/85 md:text-xl">
            Livré chez vous en 30 min à Lausanne, Pully, Épalinges…
            Pâtes fraîches, pizzas à 22 CHF, spécialités anatoliennes.
          </p>
        </div>

        <div className="max-w-2xl" style={{ animationDelay: "120ms" }}>
          <AddressGate
            restaurantId={restaurantId}
            minOrderFallback={minOrderFallback}
            variant="overlay"
          />
        </div>

        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
          <li className="flex items-center gap-1.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E6A12C"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Livraison en 30 min
          </li>
          <li className="flex items-center gap-1.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E6A12C"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Dès 25 CHF
          </li>
          <li className="flex items-center gap-1.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#E6A12C"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Paiement au livreur
          </li>
        </ul>
      </div>
    </section>
  );
}
