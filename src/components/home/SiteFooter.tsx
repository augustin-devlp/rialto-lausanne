"use client";

/**
 * Footer éditorial — 3 colonnes sur desktop, stack sur mobile.
 * Signature Stampify en bas.
 */

import Link from "next/link";
import { RIALTO_INFO, DELIVERY_CITIES } from "@/lib/rialto-data";

export default function SiteFooter() {
  return (
    <footer className="bg-ink pt-16 pb-10 text-white/80">
      <div className="container-hero">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-16">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-white">
              <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
                <circle cx="16" cy="16" r="15" fill="#C73E1D" />
                <text
                  x="50%"
                  y="54%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="var(--font-fraunces), Georgia, serif"
                  fontSize="17"
                  fontWeight="700"
                  fill="#F9F1E4"
                >
                  R
                </text>
              </svg>
              <span className="font-display text-2xl font-bold">Rialto</span>
            </Link>
            <p className="mt-4 text-sm text-white/70">
              {RIALTO_INFO.tagline}.
              <br />
              Restaurant familial à Lausanne depuis plusieurs décennies.
            </p>
            <address className="mt-4 not-italic text-sm text-white/70">
              {RIALTO_INFO.address}
              <br />
              <a
                href={`tel:${RIALTO_INFO.phoneTel}`}
                className="hover:text-white"
              >
                {RIALTO_INFO.phoneDisplay}
              </a>
            </address>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron">
              Horaires
            </h4>
            <p className="mt-3 text-base text-white/90">
              Tous les jours
              <br />
              {RIALTO_INFO.openingHoursShort}
            </p>
            <h4 className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-saffron">
              Zones de livraison
            </h4>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {DELIVERY_CITIES.map((c) => (
                <li
                  key={c}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-saffron">
              Naviguer
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-white">
                  Accueil
                </Link>
              </li>
              <li>
                <Link href="/menu" className="hover:text-white">
                  Menu
                </Link>
              </li>
              <li>
                <a
                  href={`tel:${RIALTO_INFO.phoneTel}`}
                  className="hover:text-white"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Rialto · Tous droits réservés.</p>
          <p>
            Propulsé par{" "}
            <a
              href="https://stampify.ch"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-saffron hover:text-white"
            >
              Stampify
            </a>
            {" "}
            <span aria-hidden>·</span> solution clé-en-main pour restaurants
          </p>
        </div>
      </div>
    </footer>
  );
}
