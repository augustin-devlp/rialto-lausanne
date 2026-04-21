"use client";

/**
 * Header sticky — logo Rialto à gauche, adresse qualifiée (si existante) au
 * centre, lien fidélité à droite. Hauteur ~64px desktop, 56px mobile.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { readAddress, type QualifiedAddress } from "@/lib/clientStore";
import { RIALTO_INFO } from "@/lib/rialto-data";

type Props = {
  /** `true` pour un header transparent qui s'assombrit au scroll (homepage) */
  transparentOnTop?: boolean;
};

export default function SiteHeader({ transparentOnTop = false }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);

  useEffect(() => {
    if (!transparentOnTop) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparentOnTop]);

  useEffect(() => {
    const update = () => setAddress(readAddress());
    update();
    window.addEventListener("rialto:address-updated", update);
    return () => window.removeEventListener("rialto:address-updated", update);
  }, []);

  const bg = scrolled
    ? "bg-cream/90 backdrop-blur-lg border-b border-border/50"
    : "bg-transparent";
  const textColor = scrolled ? "text-ink" : "text-white";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${bg}`}
    >
      <div className="container-hero flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link
          href="/"
          className={`flex items-center gap-2 ${textColor} transition`}
        >
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
          <span className="font-display text-xl font-bold leading-none tracking-tight">
            Rialto
          </span>
        </Link>

        {/* Adresse qualifiée (affichée que sur md+ pour ne pas encombrer mobile) */}
        {address && scrolled && (
          <Link
            href="/"
            className="group hidden items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-ink md:inline-flex"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#C73E1D"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" fill="#C73E1D" />
            </svg>
            <span className="truncate max-w-[240px]">
              {address.address}, {address.postal_code} {address.city}
            </span>
            <span className="text-mute group-hover:text-ink">✎</span>
          </Link>
        )}

        <nav className={`flex items-center gap-2 ${textColor}`}>
          <a
            href={`tel:${RIALTO_INFO.phoneTel}`}
            className={`hidden items-center gap-1.5 text-sm font-medium sm:inline-flex ${
              scrolled ? "text-ink hover:text-rialto" : "text-white"
            }`}
            aria-label="Appeler Rialto"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            {RIALTO_INFO.phoneDisplay}
          </a>
        </nav>
      </div>
    </header>
  );
}
