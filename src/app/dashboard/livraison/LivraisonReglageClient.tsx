"use client";

/**
 * Écran « Livraison » du dashboard restaurateur (LS1, refonte PAR ZONE
 * 18.08.2026 — chantier zones décision 2).
 *
 * Le restaurateur règle UN interrupteur et UN chiffre : l'OFFSET
 * au-dessus du minimum de commande de chaque zone. Le seuil de gratuité
 * de chaque zone = son minimum + l'offset — la grille suit les minimums
 * automatiquement (A dès 40, B dès 50, C dès 60, D dès 70 avec l'offset
 * 15). L'aperçu affiche la grille dérivée réelle (profils distincts des
 * zones actives). L'ancien avertissement « seuil très bas » n'a plus
 * d'objet : le seuil ne peut plus passer sous un minimum de zone par
 * construction.
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_FREE_DELIVERY_RULE,
  type FreeDeliveryRule,
} from "@/lib/delivery/rule";

type Payload = {
  ok: boolean;
  rule: FreeDeliveryRule;
  grille_apercu: Array<{ min_order_amount: number }>;
};

export default function LivraisonReglageClient() {
  const [rule, setRule] = useState<FreeDeliveryRule>(DEFAULT_FREE_DELIVERY_RULE);
  // Saisie gardée en CHAÎNE : vider le champ ne doit pas devenir 0 (même
  // piège que la tranche fidélité).
  const [offsetInput, setOffsetInput] = useState<string>(
    String(DEFAULT_FREE_DELIVERY_RULE.offsetAboveZoneMin),
  );
  const [grille, setGrille] = useState<Array<{ min_order_amount: number }>>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/livraison/rule", {
          cache: "no-store",
        });
        if (annule) return;
        if (!res.ok) {
          setErreur("Impossible de charger le réglage. Rechargez la page.");
          return;
        }
        const body = (await res.json()) as Payload;
        if (body.ok) {
          setRule(body.rule);
          setOffsetInput(String(body.rule.offsetAboveZoneMin));
          setGrille(body.grille_apercu ?? []);
        }
      } catch {
        if (!annule) setErreur("Impossible de charger le réglage.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  const parsedOffset = Number(offsetInput);
  const offsetOk =
    Number.isFinite(parsedOffset) && parsedOffset >= 1 && parsedOffset <= 100;
  // Garde-fou valeur héritée (relecture 18.08) : l'ancien système stockait
  // un SEUIL GLOBAL (50) dans la même colonne que l'offset actuel. Si la
  // migration ZL1 n'a pas encore posé 15, le champ affiche 50 — un montant
  // parfaitement valide pour le PATCH mais qui rend la livraison offerte
  // inatteignable (minimum 25 + 50 = 75 CHF).
  const offsetSuspect = offsetOk && parsedOffset > 30;

  // L'aperçu tarifaire ne doit jamais mentir de 50 centimes : décimales
  // affichées telles quelles, entiers sans zéros inutiles.
  const fmtCHF = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);

  async function enregistrer() {
    if (envoi || !offsetOk) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(false);
    try {
      const res = await fetch("/api/dashboard/livraison/rule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offset: parsedOffset,
          enabled: rule.enabled,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        rule?: FreeDeliveryRule;
        grille_apercu?: Array<{ min_order_amount: number }>;
      };
      if (body.ok && body.rule) {
        setRule(body.rule);
        setOffsetInput(String(body.rule.offsetAboveZoneMin));
        if (body.grille_apercu) setGrille(body.grille_apercu);
        setSucces(true);
      } else if (body.error === "offset_invalide") {
        setErreur("Le montant doit être compris entre 1 et 100 CHF.");
      } else {
        setErreur("Enregistrement impossible. Réessayez.");
      }
    } catch {
      setErreur("Problème de connexion. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  if (chargement) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">Livraison</h1>
      <p className="text-sm text-mute">
        Offrez les frais de livraison quand la commande dépasse le minimum
        de sa zone d&apos;un certain montant. Chaque zone a son propre
        seuil : minimum de la zone + le montant ci-dessous. Le calcul se
        fait sur les articles commandés, hors frais et avant remise. Ce
        réglage ne s&apos;applique qu&apos;aux commandes suivantes.
      </p>

      {erreur && (
        <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-3 text-sm font-medium text-rialto">
          {erreur}
        </div>
      )}
      {succes && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
          Réglage enregistré.
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border bg-white p-4 shadow-card">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink">
            Livraison offerte activée
          </span>
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
            className="h-5 w-5 accent-rialto"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">
            Montant au-dessus du minimum de zone (CHF)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={100}
            value={offsetInput}
            onChange={(e) => setOffsetInput(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
          />
        </label>

        {!offsetOk && (
          <p className="text-sm font-medium text-rialto">
            Le montant doit être compris entre 1 et 100 CHF.
          </p>
        )}

        {offsetSuspect && (
          <div className="rounded-2xl border border-saffron/40 bg-saffron/10 p-3 text-sm text-ink">
            <strong>Montant élevé.</strong> Ce chiffre s&apos;ajoute au
            minimum de chaque zone : avec {fmtCHF(parsedOffset)} CHF, la
            livraison offerte démarre à{" "}
            {grille.length > 0
              ? `${fmtCHF(grille[0].min_order_amount + parsedOffset)} CHF minimum`
              : "un montant très élevé"}
            . Si ce chiffre vient de l&apos;ancien réglage (seuil global),
            la valeur prévue est 15.
          </div>
        )}

        <div className="rounded-2xl bg-surface p-3 text-sm text-mute">
          {rule.enabled && offsetOk && grille.length > 0 ? (
            <>
              <p className="mb-1 font-medium text-ink">
                Aperçu par zone (minimum → livraison offerte dès) :
              </p>
              <ul className="space-y-0.5">
                {grille.map((g) => (
                  <li key={g.min_order_amount}>
                    minimum {fmtCHF(g.min_order_amount)} CHF →{" "}
                    <strong className="text-ink">
                      offerte dès {fmtCHF(g.min_order_amount + parsedOffset)}{" "}
                      CHF
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          ) : rule.enabled ? (
            <>La grille s&apos;affichera dès que le montant est valide.</>
          ) : (
            <>
              Désactivé : les frais de livraison de la zone s&apos;appliquent
              à toutes les commandes.
            </>
          )}
        </div>

        <button
          onClick={enregistrer}
          disabled={envoi || !offsetOk}
          className="w-full rounded-xl bg-rialto px-4 py-3 font-display font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
        >
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
