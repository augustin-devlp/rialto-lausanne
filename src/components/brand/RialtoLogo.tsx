"use client";

/**
 * Logo Rialto réutilisable — typographie Fraunces terracotta sur fond
 * pastille crème. Utilisé en haut-gauche fixed sur toutes les pages
 * (GlobalLogo) et en variante grande dans le Hero.
 *
 * Un halo blanc subtil derrière permet de rester lisible sur fond
 * sombre (hero photo) comme sur fond clair (menu, checkout).
 */

import Link from "next/link";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { box: number; text: number; gap: string; textClass: string }> = {
  sm: { box: 28, text: 16, gap: "gap-1.5", textClass: "text-base" },
  md: { box: 36, text: 18, gap: "gap-2", textClass: "text-xl" },
  lg: { box: 48, text: 24, gap: "gap-2.5", textClass: "text-2xl" },
};

type Props = {
  size?: Size;
  /** Si true, rendu sans Link (utile dans un header déjà cliquable) */
  asStatic?: boolean;
  /** Classes additionnelles sur le conteneur */
  className?: string;
  /** Variant "fixed" = logo cliquable top-left position:fixed global */
  variant?: "inline" | "fixed";
};

export default function RialtoLogo({
  size = "md",
  asStatic = false,
  className = "",
  variant = "inline",
}: Props) {
  const s = SIZES[size];

  const content = (
    <span
      className={`inline-flex items-center ${s.gap} ${className}`}
      aria-label="Rialto — Retour à l'accueil"
    >
      {/* Pastille R */}
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-rialto text-cream shadow-[0_2px_6px_-2px_rgba(0,0,0,0.25)]"
        style={{ width: s.box, height: s.box }}
      >
        <svg
          width={s.box}
          height={s.box}
          viewBox="0 0 32 32"
          aria-hidden
        >
          <text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--font-fraunces), Georgia, serif"
            fontSize={s.text}
            fontWeight="700"
            fill="#F9F1E4"
          >
            R
          </text>
        </svg>
      </span>
      {/* Wordmark Fraunces */}
      <span
        className={`font-display font-bold leading-none tracking-tight ${s.textClass} text-ink`}
      >
        Rialto
      </span>
    </span>
  );

  if (asStatic) {
    return content;
  }

  // Variante FIXED = position: fixed top-left global, toujours cliquable.
  // Conteneur arrondi blanc semi-transparent pour lisibilité sur fond
  // sombre (hero) ET fond clair (menu).
  if (variant === "fixed") {
    return (
      <Link
        href="/"
        className="fixed left-4 top-4 z-[99] inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-card backdrop-blur-lg transition hover:scale-105 hover:bg-white md:left-5 md:top-5"
      >
        {content}
      </Link>
    );
  }

  return <Link href="/">{content}</Link>;
}
