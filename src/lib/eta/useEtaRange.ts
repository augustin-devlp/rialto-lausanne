"use client";

/**
 * Hook client de la fourchette ETA VIVANTE (chantier statuts, 08.08.2026).
 *
 * Interroge /api/rialto/eta (même moteur que la page de suivi — une seule
 * source de calcul). Retourne null tant que la réponse n'est pas là OU en
 * cas d'échec : l'appelant retombe alors sur l'ETA de zone FIGÉ du
 * localStorage (arbitrage 08.08 : le figé n'est qu'un repli réseau).
 */

import { useEffect, useState } from "react";

export type PublicEtaRange = {
  min_minutes: number;
  max_minutes: number;
  label: string;
};

export function useEtaRange(
  postalCode: string | null | undefined,
): PublicEtaRange | null {
  const [range, setRange] = useState<PublicEtaRange | null>(null);

  useEffect(() => {
    if (!postalCode || !/^\d{4}$/.test(postalCode.trim())) {
      setRange(null);
      return;
    }
    // Reset au changement de CP : sans lui, la fourchette de l'ANCIENNE
    // zone resterait affichée le temps du fetch (relevé relecteur 13.08).
    setRange(null);
    let annule = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/rialto/eta?postal_code=${encodeURIComponent(postalCode.trim())}`,
        );
        if (annule || !res.ok) return;
        const body = (await res.json()) as {
          ok: boolean;
          min_minutes?: number;
          max_minutes?: number;
          label?: string;
        };
        if (!annule && body.ok && body.label) {
          setRange({
            min_minutes: body.min_minutes ?? 0,
            max_minutes: body.max_minutes ?? 0,
            label: body.label,
          });
        }
      } catch {
        /* repli figé chez l'appelant */
      }
    })();
    return () => {
      annule = true;
    };
  }, [postalCode]);

  return range;
}
