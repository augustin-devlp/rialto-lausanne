"use client";

/**
 * Bandeau de consentement cookies (Lot B tracking, 23.07.2026).
 *
 * Extrait de GoogleAnalytics.tsx — l'UI vit ici, l'état dans lib/consent.ts,
 * le chargement des tags chez ses consommateurs. Le bandeau s'affiche tant
 * qu'aucun choix n'est stocké, et se rouvre au RETRAIT du consentement
 * (lien « Gérer les cookies » de /privacy et du menu).
 *
 * Le texte couvre le périmètre RÉEL à venir (mesure d'audience + publicité :
 * Google, Meta) — pas seulement GA — pour que le consentement recueilli
 * couvre ce que le Lot C chargera. Vouvoiement (règle projet).
 * « En savoir plus » pointe /privacy (l'ancien lien /legal était un 404).
 */

import { useEffect, useState } from "react";
import { getConsent, onConsentChange, setConsent } from "@/lib/consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
    return onConsentChange((value) => setVisible(value === null));
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Consentement cookies"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-white/98 px-4 py-3 shadow-pop backdrop-blur-md md:px-6 md:py-4 animate-fade-up"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs leading-snug text-ink/85 md:text-sm">
          <strong className="font-display text-rialto-dark">🍪 Cookies</strong>{" "}
          Avec votre accord, nous utilisons des cookies pour mesurer
          l&apos;audience et améliorer nos publicités (Google, Meta). Rien
          n&apos;est déposé sans lui, et vous pouvez changer d&apos;avis à
          tout moment.{" "}
          <a
            href="/privacy"
            className="underline underline-offset-2 hover:text-rialto"
          >
            En savoir plus
          </a>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConsent("rejected")}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream-dark md:text-sm"
          >
            Refuser
          </button>
          <button
            type="button"
            onClick={() => setConsent("accepted")}
            className="rounded-full bg-rialto px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rialto-dark md:text-sm"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
