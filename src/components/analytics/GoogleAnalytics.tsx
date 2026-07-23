"use client";

/**
 * Chargement GA4 conditionné au consentement (Lot B tracking, 23.07.2026).
 *
 * Refactor : le bandeau vit désormais dans CookieBanner.tsx et l'état dans
 * lib/consent.ts (clé versionnée _v2, retrait possible). Ce composant ne
 * fait plus QUE charger les tags — et sera REMPLACÉ au Lot C par le
 * TrackingProvider (Consent Mode v2, fbq Meta, pageviews SPA, funnel).
 *
 * Comportement : GA4 chargé uniquement si consentement "accepted" ET
 * NEXT_PUBLIC_GA_ID posée. Un RETRAIT du consentement coupe les tirs
 * suivants au prochain chargement de page (le script déjà chargé dans
 * l'onglet courant ne peut pas être déchargé — limite classique, documentée).
 */

import Script from "next/script";
import { useEffect, useState } from "react";
import { getConsent, onConsentChange, type Consent } from "@/lib/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function GoogleAnalytics() {
  const [consent, setConsentState] = useState<Consent>(null);

  useEffect(() => {
    setConsentState(getConsent());
    return onConsentChange(setConsentState);
  }, []);

  if (consent !== "accepted" || !GA_ID) return null;

  return (
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
          gtag('config', '${GA_ID}', { cookie_expires: 33696000 });
        `}
      </Script>
      {/* cookie_expires 33 696 000 s = 390 jours : TIENT la promesse « durée
          de vie maximale de 13 mois » écrite dans /privacy — le défaut GA
          (_ga) serait de 2 ans. À CONSERVER dans le TrackingProvider du
          Lot C. (anonymize_ip retiré : paramètre Universal Analytics, no-op
          sous GA4, qui ne journalise pas l'IP.) */}
    </>
  );
}
