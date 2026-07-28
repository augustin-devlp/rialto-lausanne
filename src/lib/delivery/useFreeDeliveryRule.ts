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
        setRule(
          body.ok && body.rule ? body.rule : DEFAULT_FREE_DELIVERY_RULE,
        );
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
