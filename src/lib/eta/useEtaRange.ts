"use client";

/**
 * Hook client de la fourchette ETA VIVANTE (refonte par ressource,
 * 18.08.2026).
 *
 * Interroge /api/rialto/eta (même moteur que la page de suivi — une seule
 * source de calcul) avec le compte de pizzas du panier. Retourne null tant
 * que la réponse n'est pas là OU en cas d'échec : l'appelant retombe alors
 * sur l'ETA de zone FIGÉ du localStorage (repli réseau uniquement).
 *
 * Le reset à null n'a lieu QU'AU CHANGEMENT DE CODE POSTAL — un
 * changement du compte de pizzas garde la fourchette précédente pendant
 * le refetch (sinon : clignotement vers le repli figé à chaque ajout au
 * panier). Les mutations de panier sont débouncées.
 */

import { useEffect, useRef, useState } from "react";

export type PublicEtaRange = {
  min_minutes: number;
  max_minutes: number;
  label: string;
};

const DEBOUNCE_MS = 400;

export function useEtaRange(
  postalCode: string | null | undefined,
  /** Pizzas du panier (combos = 1 chacun) ; null = compte non fiable →
   * le serveur applique son défaut prudent. */
  pizzas?: number | null,
): PublicEtaRange | null {
  const [range, setRange] = useState<PublicEtaRange | null>(null);
  const dernierCp = useRef<string | null>(null);

  useEffect(() => {
    const cp = postalCode?.trim() ?? null;
    if (!cp || !/^\d{4}$/.test(cp)) {
      dernierCp.current = null;
      setRange(null);
      return;
    }
    if (dernierCp.current !== cp) {
      // La fourchette de l'ANCIENNE zone ne doit pas rester affichée le
      // temps du fetch (relevé relecteur 13.08).
      dernierCp.current = cp;
      setRange(null);
    }
    let annule = false;
    // Débounce des MUTATIONS de panier seulement : au premier affichage
    // (rien de vivant à l'écran), chaque ms de délai prolonge le repli
    // figé — fetch immédiat (contre-passe 18.08).
    const delai = range === null ? 0 : DEBOUNCE_MS;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const paramPizzas =
            pizzas != null && pizzas >= 0
              ? `&pizzas=${Math.min(30, Math.floor(pizzas))}`
              : "";
          const res = await fetch(
            `/api/rialto/eta?postal_code=${encodeURIComponent(cp)}${paramPizzas}`,
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
    }, DEBOUNCE_MS);
    return () => {
      annule = true;
      window.clearTimeout(timer);
    };
    // `range` sert UNIQUEMENT à choisir le délai (0 au premier fetch) —
    // le mettre en dépendance re-déclencherait un fetch après chaque
    // réponse (boucle). Dépendances volontairement limitées.
  }, [postalCode, pizzas]);

  return range;
}
