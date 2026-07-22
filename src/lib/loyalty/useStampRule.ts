"use client";

/**
 * Hook client du barème public (F4, 22.07.2026).
 *
 * Toutes les surfaces qui DÉCRIVENT la fidélité au client lisent le barème
 * ici, jamais en dur : le sous-titre de la section Fidélité, la page
 * d'inscription, le bloc « créez votre carte » de la confirmation. Sans ça,
 * la copie se refige et redevient fausse au premier changement de réglage
 * du dashboard.
 *
 * Retourne null tant que la lecture n'a pas abouti — les appelants affichent
 * alors une formulation neutre, jamais une règle inventée.
 *
 * ⚠️ TROIS AXES, PAS DEUX : `goal` (combien de tampons, quel lot — invariant),
 * `rule` (comment on gagne un tampon — varie avec le réglage) et `enabled`
 * (le killswitch). Le hook renvoie null quand `enabled` est FAUX : annoncer
 * « 1 tampon par tranche de 50 CHF » alors que la fidélité en ligne est
 * éteinte remplacerait simplement l'ancienne promesse fausse par une neuve.
 * Tant que F5 n'a pas activé le killswitch, les surfaces client restent donc
 * sur leur formulation neutre.
 */

import { useEffect, useState } from "react";

export type PublicStampRule = {
  rule: {
    mode: "per_amount" | "per_order";
    step: number;
    basis: "goods" | "total";
    max_per_order: number;
    enabled: boolean;
    label: string;
    label_long: string;
  };
  goal: {
    stamps_required: number;
    reward_description: string;
    label: string;
  };
};

/**
 * @param actif passer false pour ne pas déclencher la requête du tout
 *   (surfaces où le barème n'est finalement pas affiché).
 */
export function useStampRule(actif = true): PublicStampRule | null {
  const [data, setData] = useState<PublicStampRule | null>(null);

  useEffect(() => {
    if (!actif) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetch("/api/rialto/loyalty/rule");
        if (annule || !res.ok) return;
        const body = (await res.json()) as { ok: boolean } & PublicStampRule;
        if (annule) return;
        // Killswitch fermé => on n'annonce AUCUN barème (cf. docstring).
        if (body.ok && body.rule?.enabled) {
          setData({ rule: body.rule, goal: body.goal });
        }
      } catch {
        /* silencieux : l'appelant retombe sur une formulation neutre */
      }
    })();
    return () => {
      annule = true;
    };
  }, [actif]);

  return data;
}
