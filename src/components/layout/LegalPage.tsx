"use client";

/**
 * Layout partagé pour les pages légales simples (mentions, CGV, privacy).
 * Contenu éditorial en Fraunces, corps Inter, largeur limitée lisible.
 */

import Link from "next/link";
import SiteFooter from "@/components/home/SiteFooter";

type Props = {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  children: React.ReactNode;
};

export default function LegalPage({ title, subtitle, updatedAt, children }: Props) {
  return (
    <>
      <main className="min-h-screen bg-cream pb-16 pt-20 md:pt-24">
        <div className="container-hero">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Retour à l&apos;accueil
          </Link>

          <header className="mb-10 max-w-prose-wide">
            <span className="eyebrow">Informations légales</span>
            <h1 className="mt-3 font-display text-h1 font-bold">{title}</h1>
            {subtitle && (
              <p className="mt-3 text-base text-mute">{subtitle}</p>
            )}
            {updatedAt && (
              <p className="mt-2 text-xs text-mute">
                Dernière mise à jour : {updatedAt}
              </p>
            )}
          </header>

          <article className="prose-legal max-w-prose-wide space-y-6 text-base leading-relaxed text-ink">
            {children}
          </article>
        </div>
      </main>
      <SiteFooter />
      <style jsx global>{`
        .prose-legal h2 {
          font-family: var(--font-fraunces), Georgia, serif;
          font-weight: 700;
          font-size: 1.5rem;
          line-height: 1.2;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          color: #1a1a1a;
        }
        .prose-legal h3 {
          font-family: var(--font-fraunces), Georgia, serif;
          font-weight: 600;
          font-size: 1.2rem;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-legal p,
        .prose-legal li {
          color: #3a3a3a;
        }
        .prose-legal ul {
          list-style: disc;
          padding-left: 1.5rem;
        }
        .prose-legal ul li {
          margin-bottom: 0.5rem;
        }
        .prose-legal a {
          color: #c73e1d;
          text-decoration: underline;
        }
        .prose-legal a:hover {
          color: #a02e14;
        }
        .prose-legal strong {
          color: #1a1a1a;
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
