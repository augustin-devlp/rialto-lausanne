"use client";

/**
 * GoogleAnalytics + RGPD Cookie banner — Chantier 4.
 *
 * Charge GA4 uniquement après consentement explicite stocké dans
 * localStorage (`rialto_cookie_consent` = "accepted" | "rejected").
 * Tant qu'aucune valeur n'est posée, on affiche un bandeau bottom
 * (slide-up). Refus = pas de chargement gtag, aucun cookie tiers.
 *
 * GA_ID lu via NEXT_PUBLIC_GA_ID (si absent, le composant ne charge rien
 * mais le bandeau reste pour conformité).
 */

import Script from "next/script";
import { useEffect, useState } from "react";

const STORAGE_KEY = "rialto_cookie_consent";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

type Consent = "accepted" | "rejected" | null;

export default function GoogleAnalytics() {
  const [consent, setConsent] = useState<Consent>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "accepted" || v === "rejected") setConsent(v);
    } catch {
      /* noop */
    }
  }, []);

  function persist(next: Consent) {
    setConsent(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }

  const showBanner = hydrated && consent === null;
  const loadGA = hydrated && consent === "accepted" && Boolean(GA_ID);

  return (
    <>
      {loadGA && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {showBanner && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Consentement cookies"
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-white/98 px-4 py-3 shadow-pop backdrop-blur-md md:px-6 md:py-4 animate-fade-up"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-snug text-ink/85 md:text-sm">
              <strong className="font-display text-rialto-dark">
                🍪 Cookies
              </strong>{" "}
              On utilise des cookies pour mesurer l&apos;audience (Google
              Analytics anonymisé). Ton choix est respecté.{" "}
              <a
                href="/legal"
                className="underline underline-offset-2 hover:text-rialto"
              >
                En savoir plus
              </a>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => persist("rejected")}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream-dark md:text-sm"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={() => persist("accepted")}
                className="rounded-full bg-rialto px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rialto-dark md:text-sm"
              >
                Accepter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
