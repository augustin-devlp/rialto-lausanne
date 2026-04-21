"use client";

/**
 * 2 colonnes : infos restaurant à gauche, carte Google Maps embed à droite.
 * Sur mobile : stack vertical, carte en dessous.
 */

import { RIALTO_INFO } from "@/lib/rialto-data";

export default function LocationHours() {
  return (
    <section className="bg-cream py-16 md:py-24">
      <div className="container-hero grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
        <div className="flex flex-col justify-center">
          <span className="eyebrow">Venez nous voir</span>
          <h2 className="mt-3 font-display text-h1 font-bold">
            Av. de Béthusy 29, <br />
            <em className="italic text-rialto">Lausanne.</em>
          </h2>
          <p className="mt-4 text-base text-mute">
            {RIALTO_INFO.quartier}. Terrasse en retrait de la route, belle en
            été. Parking dans les rues adjacentes.
          </p>

          <dl className="mt-8 space-y-4">
            <Info
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#C73E1D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              label="Ouvert tous les jours"
              value={RIALTO_INFO.openingHoursShort}
            />
            <Info
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#C73E1D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              }
              label="Téléphone"
              value={
                <a
                  href={`tel:${RIALTO_INFO.phoneTel}`}
                  className="hover:text-rialto"
                >
                  {RIALTO_INFO.phoneDisplay}
                </a>
              }
            />
            <Info
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#C73E1D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              }
              label="Adresse"
              value={RIALTO_INFO.address}
            />
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`tel:${RIALTO_INFO.phoneTel}`}
              className="btn-primary"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Appeler
            </a>
            <a
              href="https://www.google.com/maps/place/Rialto+Lausanne/@46.523,6.646"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              Itinéraire
            </a>
          </div>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-white shadow-card md:aspect-square">
          <iframe
            src="https://www.openstreetmap.org/export/embed.html?bbox=6.642%2C46.521%2C6.650%2C46.525&amp;layer=mapnik&amp;marker=46.523%2C6.646"
            className="h-full w-full"
            title="Carte Rialto"
            loading="lazy"
            style={{ border: 0 }}
          />
          {/* Overlay marker couleur terracotta pour identification */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            <svg width="40" height="48" viewBox="0 0 40 48" aria-hidden>
              <path
                d="M20 0C9 0 0 9 0 20c0 15 20 28 20 28s20-13 20-28c0-11-9-20-20-20z"
                fill="#C73E1D"
              />
              <circle cx="20" cy="20" r="8" fill="#F9F1E4" />
              <text
                x="20"
                y="26"
                textAnchor="middle"
                fontFamily="Georgia, serif"
                fontSize="14"
                fontWeight="700"
                fill="#C73E1D"
              >
                R
              </text>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 pt-0.5">{icon}</div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wider text-mute">
          {label}
        </dt>
        <dd className="mt-0.5 text-base font-medium text-ink">{value}</dd>
      </div>
    </div>
  );
}
