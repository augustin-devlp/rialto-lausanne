"use client";

/**
 * Placeholder propre pour les pages Rialto Club pas encore finies
 * (/rialto-club/roue et /rialto-club/loterie). L'UX complète vit encore
 * sur /confirmation/[orderNumber] après une commande — ces pages-ci
 * servent juste à ne pas avoir de 404 depuis le hamburger menu.
 */

import Link from "next/link";
import SiteFooter from "@/components/home/SiteFooter";

type Props = {
  eyebrow: string;
  title: string;
  emoji: string;
  description: string;
  cta: { label: string; href: string };
};

export default function ClubPlaceholder({
  eyebrow,
  title,
  emoji,
  description,
  cta,
}: Props) {
  return (
    <>
      <main className="flex min-h-screen flex-col bg-cream pt-20 md:pt-24">
        <div className="container-hero flex flex-1 items-center justify-center pb-16">
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rialto/10 text-4xl">
              {emoji}
            </div>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="mt-3 font-display text-h2 font-bold">{title}</h1>
            <p className="mt-3 text-base text-mute">{description}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href={cta.href} className="btn-primary">
                {cta.label}
              </Link>
              <Link href="/" className="btn-ghost">
                Retour accueil
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
