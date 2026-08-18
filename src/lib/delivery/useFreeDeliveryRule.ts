"use client";

/**
 * Hook client de la règle publique « livraison offerte » (LS2, pattern
 * useStampRule). Toutes les surfaces client qui affichent des frais de
 * livraison EFFECTIFS lisent la règle ici, jamais en dur.
 *
 * Retourne null tant que la lecture n'a pas abouti — les appelants
 * retombent alors sur le fee de zone (jamais une gratuité inventée).
 * Après chargement, retourne TOUJOURS une règle : celle du serveur, ou la
 * règle par défaut (désactivée) sur erreur réseau — les consommateurs qui
 * attendent « la règle est connue » (begin_checkout) ne restent jamais
 * bloqués.
 *
 * Différence assumée avec useStampRule : pas de retour null quand la règle
 * est désactivée — ici « désactivé » est une information de calcul (fee =
 * fee de zone), pas une promesse à taire.
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_FREE_DELIVERY_RULE,
  type FreeDeliveryRule,
} from "./rule";

/**
 * Le JSON de la route publique change de FORME dans la refonte zones
 * ({enabled, threshold} → {enabled, offsetAboveZoneMin}) et la réponse est
 * cachée 60 s au CDN : pendant la bascule, un bundle neuf peut recevoir
 * l'ancienne forme. Sans cette normalisation, offsetAboveZoneMin vaut
 * undefined et le bandeau panier affiche « Plus que NaN CHF » (relecture
 * 18.08). Toute forme suspecte retombe sur la règle désactivée : fee de
 * zone affiché, jamais de gratuité inventée, jamais de NaN.
 */
function normaliseRule(rule: FreeDeliveryRule | undefined): FreeDeliveryRule {
  if (
    !rule ||
    typeof rule.enabled !== "boolean" ||
    !Number.isFinite(rule.offsetAboveZoneMin) ||
    rule.offsetAboveZoneMin <= 0
  ) {
    return DEFAULT_FREE_DELIVERY_RULE;
  }
  return rule;
}

/**
 * @param actif passer false pour ne pas déclencher la requête du tout
 *   (parité de pattern avec useStampRule — ex. panier vide, rien à
 *   afficher). La requête part dès que `actif` devient vrai.
 */
export function useFreeDeliveryRule(actif = true): FreeDeliveryRule | null {
  const [rule, setRule] = useState<FreeDeliveryRule | null>(null);

  useEffect(() => {
    if (!actif) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetch("/api/rialto/delivery/rule");
        if (annule) return;
        if (!res.ok) {
          setRule(DEFAULT_FREE_DELIVERY_RULE);
          return;
        }
        const body = (await res.json()) as {
          ok: boolean;
          rule?: FreeDeliveryRule;
        };
        if (annule) return;
        setRule(normaliseRule(body.ok ? body.rule : undefined));
      } catch {
        if (!annule) setRule(DEFAULT_FREE_DELIVERY_RULE);
      }
    })();
    return () => {
      annule = true;
    };
  }, [actif]);

  return rule;
}
