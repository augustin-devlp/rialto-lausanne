"use client";

/**
 * TrackingProvider (Lot C, 23.07.2026) — remplace GoogleAnalytics.tsx.
 *
 * Trois responsabilités, rien d'autre :
 *  1. Écouter le consentement (socle Lot B) et piloter la machine à états
 *     de lib/tracking.ts : accepted → grant (injection des tags + rejeu de
 *     la file), rejected → deny (file vidée, zéro réseau), retrait (null)
 *     → suspend (re-bufferisation, le bandeau est rouvert).
 *  2. Émettre les pageviews SPA : l'App Router ne recharge pas la page,
 *     donc sans ce hook GA et Meta ne voient QUE le chargement initial —
 *     toutes les navigations internes étaient invisibles.
 *  3. Rien rendre : le provider est invisible.
 *
 * ⚠️ useSearchParams exige une frontière <Suspense> en App Router — sans
 * elle, toute la route bascule en rendu client (bailout CSR). D'où le
 * découpage PageViewTracker / provider.
 */

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getConsent, onConsentChange, type Consent } from "@/lib/consent";
import {
  denyTracking,
  grantTracking,
  suspendTracking,
  track,
} from "@/lib/tracking";

function applyConsent(value: Consent): void {
  if (value === "accepted") grantTracking();
  else if (value === "rejected") denyTracking();
  else suspendTracking();
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const first = useRef(true);

  useEffect(() => {
    // La PV initiale est envoyée par le config gtag / snippet fbq au moment
    // de l'acceptation — la doubler ici gonflerait la page d'atterrissage.
    if (first.current) {
      first.current = false;
      return;
    }
    track.pageView();
  }, [pathname, searchParams]);

  return null;
}

export default function TrackingProvider() {
  useEffect(() => {
    applyConsent(getConsent());
    return onConsentChange(applyConsent);
  }, []);

  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
