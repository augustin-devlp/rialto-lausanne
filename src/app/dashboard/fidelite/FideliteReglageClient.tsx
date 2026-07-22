"use client";

/**
 * Écran « Fidélité » du dashboard restaurateur (F1) — réglage du barème.
 * Le restaurateur choisit comment un tampon se gagne, et peut changer d'avis
 * si ça ne marche pas. Prévisualisation live via la MÊME fonction pure que
 * le calcul réel (rule.ts) : l'aperçu ne peut pas mentir.
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_STAMP_RULE,
  stampsForOrder,
  type StampRule,
} from "@/lib/loyalty/rule";
import { formatStampRuleLong } from "@/lib/loyalty/copy";

type Payload = {
  ok: boolean;
  rule: StampRule;
  stamps_required: number;
  reward_description: string;
};

/** Paniers d'illustration pour l'aperçu (montants hors livraison). */
const EXEMPLES = [25, 45, 56, 84, 150];

export default function FideliteReglageClient() {
  const [rule, setRule] = useState<StampRule>(DEFAULT_STAMP_RULE);
  // Saisie de la tranche gardée en CHAÎNE : sinon vider le champ donne
  // Number("") = 0, et l'aperçu afficherait « tranche de 0 CHF », 0 tampon
  // partout, avant un rejet du PATCH. La valeur numérique n'est reprise que
  // si la saisie est exploitable.
  const [stepInput, setStepInput] = useState<string>(
    String(DEFAULT_STAMP_RULE.step),
  );
  const [meta, setMeta] = useState<{ required: number; reward: string }>({
    required: 10,
    reward: "",
  });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/loyalty/rule", {
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
          setStepInput(String(body.rule.step));
          setMeta({
            required: body.stamps_required,
            reward: body.reward_description,
          });
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

  async function enregistrer() {
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(false);
    try {
      const res = await fetch("/api/dashboard/loyalty/rule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: rule.mode,
          step: rule.step,
          basis: rule.basis,
          maxPerOrder: rule.maxPerOrder,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        rule?: StampRule;
      };
      if (body.ok && body.rule) {
        setRule(body.rule);
        setStepInput(String(body.rule.step));
        setSucces(true);
      } else if (body.error === "commandes_en_attente") {
        setErreur(
          body.message ??
            "Des commandes attendent d'être validées. Réessayez dans quelques minutes.",
        );
      } else if (body.error === "tranche_invalide") {
        setErreur("Le montant d'une tranche doit être compris entre 1 et 1000 CHF.");
      } else if (body.error === "plafond_invalide") {
        setErreur("Le maximum par commande doit être compris entre 1 et 10.");
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
      <h1 className="font-display text-2xl font-bold text-ink">Fidélité</h1>
      <p className="text-sm text-mute">
        Choisissez comment vos clients gagnent un tampon sur leurs commandes
        en ligne. Vous pouvez changer ce réglage à tout moment.
      </p>

      {!rule.enabled && (
        <div className="rounded-2xl border border-saffron/50 bg-saffron/10 p-3 text-sm text-ink">
          La fidélité sur les commandes en ligne n&apos;est pas encore
          activée. Ce réglage est enregistré et s&apos;appliquera dès
          l&apos;activation.
        </div>
      )}

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

      {/* Mode */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
          Comment gagne-t-on un tampon ?
        </h2>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => setRule({ ...rule, mode: "per_amount" })}
            className={`rounded-xl border-2 p-3 text-left transition ${
              rule.mode === "per_amount"
                ? "border-rialto bg-cream"
                : "border-border bg-white"
            }`}
          >
            <div className="font-display font-semibold text-ink">
              Par tranche de montant
            </div>
            <div className="text-xs text-mute">
              Plus le panier est grand, plus le client gagne de tampons
            </div>
          </button>
          <button
            type="button"
            onClick={() => setRule({ ...rule, mode: "per_order" })}
            className={`rounded-xl border-2 p-3 text-left transition ${
              rule.mode === "per_order"
                ? "border-rialto bg-cream"
                : "border-border bg-white"
            }`}
          >
            <div className="font-display font-semibold text-ink">
              1 commande = 1 tampon
            </div>
            <div className="text-xs text-mute">
              Quel que soit le montant de la commande
            </div>
          </button>
        </div>
      </div>

      {/* Réglages du mode montant */}
      {rule.mode === "per_amount" && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mute">
            Détail du barème
          </h2>

          <label
            htmlFor="tranche"
            className="block text-sm font-semibold text-ink"
          >
            Montant d&apos;une tranche
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="tranche"
              type="number"
              inputMode="decimal"
              min={1}
              max={1000}
              step={5}
              value={stepInput}
              onChange={(e) => {
                const v = e.target.value;
                setStepInput(v);
                const n = Number(v);
                if (v.trim() !== "" && Number.isFinite(n) && n >= 1) {
                  setRule((r) => ({ ...r, step: n }));
                }
              }}
              onBlur={() => setStepInput(String(rule.step))}
              className="w-32 rounded-xl border-2 border-border px-3 py-2.5 text-base focus:border-rialto focus:outline-none"
            />
            <span className="text-sm text-mute">CHF pour 1 tampon</span>
          </div>

          <div className="mt-4 text-sm font-semibold text-ink">
            Calculé sur
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRule({ ...rule, basis: "goods" })}
              className={`rounded-xl border-2 p-2.5 text-sm transition ${
                rule.basis === "goods"
                  ? "border-rialto bg-cream font-semibold"
                  : "border-border bg-white"
              }`}
            >
              Hors livraison
            </button>
            <button
              type="button"
              onClick={() => setRule({ ...rule, basis: "total" })}
              className={`rounded-xl border-2 p-2.5 text-sm transition ${
                rule.basis === "total"
                  ? "border-rialto bg-cream font-semibold"
                  : "border-border bg-white"
              }`}
            >
              Livraison comprise
            </button>
          </div>

          <label
            htmlFor="plafond"
            className="mt-4 block text-sm font-semibold text-ink"
          >
            Maximum par commande
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="plafond"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              step={1}
              value={rule.maxPerOrder}
              onChange={(e) =>
                setRule({ ...rule, maxPerOrder: Number(e.target.value) })
              }
              className="w-24 rounded-xl border-2 border-border px-3 py-2.5 text-base focus:border-rialto focus:outline-none"
            />
            <span className="text-sm text-mute">
              tampon{rule.maxPerOrder > 1 ? "s" : ""} au maximum
            </span>
          </div>
        </div>
      )}

      {/* Aperçu — même fonction pure que le calcul réel */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">
          Aperçu
        </h2>
        <p className="text-sm text-ink">{formatStampRuleLong(rule)}</p>
        <p className="mt-1 text-xs text-mute">
          Carte : {meta.required} tampons
          {meta.reward ? ` = ${meta.reward}` : ""}
        </p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {EXEMPLES.map((montant) => {
            const n = stampsForOrder(
              { total_amount: montant, delivery_fee: 0 },
              rule,
            );
            return (
              <li key={montant} className="flex justify-between py-1.5">
                <span className="text-mute">
                  Commande de {montant} CHF
                  {rule.mode === "per_amount" && rule.basis === "goods"
                    ? " (hors livraison)"
                    : ""}
                </span>
                <span
                  className={`font-semibold ${n === 0 ? "text-ink/40" : "text-ink"}`}
                >
                  {n} tampon{n > 1 ? "s" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        disabled={envoi}
        onClick={enregistrer}
        className="w-full rounded-full bg-rialto py-3.5 font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
      >
        {envoi ? "…" : "Enregistrer le barème"}
      </button>
    </div>
  );
}
