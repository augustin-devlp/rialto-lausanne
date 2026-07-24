"use client";

/**
 * Écran « Livraison » du dashboard restaurateur (LS1) — seuil de livraison
 * offerte. Le restaurateur choisit le montant et active/désactive ; tant
 * que c'est désactivé, les frais de zone s'appliquent tels quels.
 *
 * Avertissement NON bloquant (point 2 review navette LS0) : si le seuil
 * est au niveau ou sous le plus petit minimum de commande des zones
 * actives, TOUTE commande livrée devient gratuite en frais — on prévient,
 * le restaurateur tranche.
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_FREE_DELIVERY_RULE,
  type FreeDeliveryRule,
} from "@/lib/delivery/rule";

type Payload = {
  ok: boolean;
  rule: FreeDeliveryRule;
  floor_reference: number | null;
};

export default function LivraisonReglageClient() {
  const [rule, setRule] = useState<FreeDeliveryRule>(DEFAULT_FREE_DELIVERY_RULE);
  // Saisie gardée en CHAÎNE : vider le champ ne doit pas devenir 0 (même
  // piège que la tranche fidélité).
  const [thresholdInput, setThresholdInput] = useState<string>(
    String(DEFAULT_FREE_DELIVERY_RULE.threshold),
  );
  const [floorRef, setFloorRef] = useState<number | null>(null);
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
          setThresholdInput(String(body.rule.threshold));
          setFloorRef(body.floor_reference);
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

  const parsedThreshold = Number(thresholdInput);
  const thresholdOk =
    Number.isFinite(parsedThreshold) &&
    parsedThreshold >= 1 &&
    parsedThreshold <= 1000;
  // Avertissement : seuil ≤ plancher naturel (plus petit minimum de
  // commande des zones actives) ET toggle actif → gratuit pour toutes.
  const seuilTresBas =
    rule.enabled &&
    thresholdOk &&
    floorRef !== null &&
    parsedThreshold <= floorRef;

  async function enregistrer() {
    if (envoi || !thresholdOk) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(false);
    try {
      const res = await fetch("/api/dashboard/livraison/rule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threshold: parsedThreshold,
          enabled: rule.enabled,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        rule?: FreeDeliveryRule;
        floor_reference?: number | null;
      };
      if (body.ok && body.rule) {
        setRule(body.rule);
        setThresholdInput(String(body.rule.threshold));
        if (body.floor_reference !== undefined) setFloorRef(body.floor_reference);
        setSucces(true);
      } else if (body.error === "seuil_invalide") {
        setErreur("Le seuil doit être compris entre 1 et 1000 CHF.");
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
        Offrez les frais de livraison à partir d&apos;un montant de commande.
        Le seuil se calcule sur les articles commandés, hors frais de
        livraison et avant remise éventuelle. Vous pouvez changer ce réglage
        à tout moment — il ne s&apos;applique qu&apos;aux commandes
        suivantes.
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
            Seuil (CHF d&apos;articles commandés)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
          />
        </label>

        {!thresholdOk && (
          <p className="text-sm font-medium text-rialto">
            Le seuil doit être compris entre 1 et 1000 CHF.
          </p>
        )}

        {seuilTresBas && (
          <div className="rounded-2xl border border-saffron/50 bg-saffron/10 p-3 text-sm text-ink">
            ⚠️ Ce seuil est au niveau ou en dessous du minimum de commande en
            livraison ({floorRef?.toFixed(2)} CHF) : la livraison sera
            offerte sur <strong>toutes</strong> les commandes livrées.
            Vérifiez que c&apos;est bien voulu avant d&apos;enregistrer.
          </div>
        )}

        <div className="rounded-2xl bg-surface p-3 text-sm text-mute">
          {rule.enabled && thresholdOk ? (
            <>
              Aperçu : dès{" "}
              <strong className="text-ink">
                {parsedThreshold.toFixed(2)} CHF
              </strong>{" "}
              d&apos;articles, la livraison est offerte. En dessous, les
              frais de la zone s&apos;appliquent.
            </>
          ) : (
            <>Désactivé : les frais de livraison de la zone s&apos;appliquent à toutes les commandes.</>
          )}
        </div>

        <button
          onClick={enregistrer}
          disabled={envoi || !thresholdOk}
          className="w-full rounded-xl bg-rialto px-4 py-3 font-display font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
        >
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
