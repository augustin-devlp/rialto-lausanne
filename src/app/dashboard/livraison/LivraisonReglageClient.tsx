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
  freeDeliveryThresholdForZone,
  type FreeDeliveryRule,
} from "@/lib/delivery/rule";
import { groupeParAnneaux, type ZoneRow } from "@/lib/delivery/anneaux";

type Payload = {
  ok: boolean;
  rule: FreeDeliveryRule;
  grille_apercu: Array<{ min_order_amount: number }>;
  zones?: ZoneRow[] | null;
};

/** Pastilles des anneaux (habillage — les valeurs viennent de la base).
 * Tokens de la charte uniquement (relecture 19.08) : emerald = registre
 * positif déjà établi au dashboard, saffron et rialto = charte — pas de
 * teintes Tailwind brutes, et pas de rouge vif qui se lirait comme une
 * erreur. */
const COULEUR_ANNEAU: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-saffron",
  C: "bg-rialto/50",
  D: "bg-rialto",
};

export default function LivraisonReglageClient() {
  const [rule, setRule] = useState<FreeDeliveryRule>(DEFAULT_FREE_DELIVERY_RULE);
  // La règle ENREGISTRÉE (chargement + PATCH réussi) — la vue de
  // consultation reflète la réalité en base, jamais la saisie en cours
  // (contrairement à l'aperçu des réglages, qui est un simulateur).
  const [savedRule, setSavedRule] = useState<FreeDeliveryRule | null>(null);
  // Saisie gardée en CHAÎNE : vider le champ ne doit pas devenir 0 (même
  // piège que la tranche fidélité).
  const [offsetInput, setOffsetInput] = useState<string>(
    String(DEFAULT_FREE_DELIVERY_RULE.offsetAboveZoneMin),
  );
  const [grille, setGrille] = useState<Array<{ min_order_amount: number }>>([]);
  // null = lecture des zones échouée (≠ [] : grille réellement vide) —
  // on le dit, on n'affiche pas « 0 communes desservies ».
  const [zones, setZones] = useState<ZoneRow[] | null>(null);
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
          setSavedRule(body.rule);
          setOffsetInput(String(body.rule.offsetAboveZoneMin));
          setGrille(body.grille_apercu ?? []);
          setZones(body.zones ?? null);
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
  // Plafond 30 aligné sur le PATCH serveur (caisse 19.08, abaissé de 100) :
  // la valeur legacy 50 (ancien seuil global) ne doit jamais repasser.
  const offsetOk =
    Number.isFinite(parsedOffset) && parsedOffset >= 1 && parsedOffset <= 30;
  // Garde-fou valeur héritée (relecture 18.08) : l'ancien système stockait
  // un SEUIL GLOBAL (50) dans la même colonne que l'offset actuel. Si la
  // base a été restaurée sans ZL1, le GET charge 50 — hors bornes désormais
  // (bouton mort), mais l'encart doit EXPLIQUER d'où vient ce chiffre :
  // indépendant d'offsetOk.
  const offsetSuspect = Number.isFinite(parsedOffset) && parsedOffset > 30;

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
        zones?: ZoneRow[] | null;
      };
      if (body.ok && body.rule) {
        setRule(body.rule);
        setSavedRule(body.rule);
        setOffsetInput(String(body.rule.offsetAboveZoneMin));
        // Merge PROTÉGÉ (relecture 19.08) : si la relecture des zones a
        // transitoirement échoué côté route (zones:null, grille:[]), on
        // GARDE l'état valide affiché — les zones n'ont pas pu changer
        // (aucune route d'écriture hors navette), et l'enregistrement de
        // la règle, lui, a réussi.
        if (body.zones != null) {
          setZones(body.zones);
          setGrille(body.grille_apercu ?? []);
        }
        setSucces(true);
      } else if (body.error === "offset_invalide") {
        setErreur("Le montant doit être compris entre 1 et 30 CHF.");
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
            disabled={savedRule === null}
            className="h-5 w-5 accent-rialto disabled:opacity-50"
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
            max={30}
            value={offsetInput}
            onChange={(e) => setOffsetInput(e.target.value)}
            disabled={savedRule === null}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink disabled:opacity-50"
          />
        </label>

        {!offsetOk && (
          <p className="text-sm font-medium text-rialto">
            Le montant doit être compris entre 1 et 30 CHF.
          </p>
        )}

        {offsetSuspect && (
          <div className="rounded-2xl border border-saffron/40 bg-saffron/10 p-3 text-sm text-ink">
            <strong>Montant élevé.</strong> Ce chiffre s&apos;ajoute au
            minimum de chaque zone : avec {fmtCHF(parsedOffset)} CHF, la
            livraison offerte démarre à{" "}
            {grille.length > 0
              ? `${fmtCHF(freeDeliveryThresholdForZone(grille[0].min_order_amount, { enabled: true, offsetAboveZoneMin: parsedOffset }))} CHF minimum`
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
                      offerte dès{" "}
                      {/* SIMULATEUR : suit la saisie, mais par la
                          dérivation CANONIQUE (jamais min+offset à la
                          main — relecture 19.08). */}
                      {fmtCHF(
                        freeDeliveryThresholdForZone(g.min_order_amount, {
                          enabled: true,
                          offsetAboveZoneMin: parsedOffset,
                        }),
                      )}{" "}
                      CHF
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          ) : rule.enabled ? (
            zones === null ? (
              <>Aperçu indisponible : la grille des zones n&apos;a pas pu
              être lue. Rechargez la page.</>
            ) : (
              <>La grille s&apos;affichera dès que le montant est valide.</>
            )
          ) : (
            <>
              Désactivé : les frais de livraison de la zone s&apos;appliquent
              à toutes les commandes.
            </>
          )}
        </div>

        <button
          onClick={enregistrer}
          // savedRule === null : le GET initial n'a jamais abouti — le
          // formulaire porte les valeurs PAR DÉFAUT (enabled:false), un
          // Enregistrer écraserait la vraie règle en base (couperait la
          // gratuité active, silencieusement). Relecture 19.08.
          disabled={envoi || !offsetOk || savedRule === null}
          className="w-full rounded-xl bg-rialto px-4 py-3 font-display font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
        >
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* ─── Vue de CONSULTATION de la grille (lot vue zones 19.08) ─────
          Lecture seule par principe : la grille se modifie par navette
          ZLn, jamais depuis un écran (invariant CLAUDE.md). Les seuils
          affichés = freeDeliveryThresholdForZone sur la règle ENREGISTRÉE
          (savedRule) — LA dérivation canonique, jamais la saisie en cours.
          « Communes desservies » : approximation ASSUMÉE (libellé commandé
          par Augustin 19.08) — le compte est celui des NPA (64), Lausanne
          y figure plusieurs fois. */}
      <section className="space-y-3 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">
            Zones desservies
          </h2>
          {zones !== null && (
            <span className="shrink-0 text-sm font-medium text-mute">
              {zones.length} commune{zones.length > 1 ? "s" : ""} desservie
              {zones.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {savedRule !== null && !savedRule.enabled && zones !== null && (
          <div className="rounded-2xl bg-surface p-3 text-sm text-mute">
            Livraison offerte désactivée : les frais de zone s&apos;appliquent
            à toutes les commandes, aucun seuil de gratuité n&apos;est actif.
          </div>
        )}

        {zones === null ? (
          <div className="rounded-2xl border border-border bg-white p-4 text-sm text-mute shadow-card">
            Impossible de charger la grille des zones. Rechargez la page.
          </div>
        ) : (
          groupeParAnneaux(zones, savedRule).map((a) => (
            <details
              key={`${a.lettre}-${a.minOrderAmount}`}
              className="group rounded-2xl border border-border bg-white shadow-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    COULEUR_ANNEAU[a.lettre] ?? "bg-mute"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="font-display font-semibold text-ink">
                    Anneau {a.lettre}
                    {a.plageKm ? ` · ${a.plageKm}` : ""}
                  </span>
                  <span className="block text-xs text-mute">
                    {a.zones.length} commune{a.zones.length > 1 ? "s" : ""} ·
                    minimum {fmtCHF(a.minOrderAmount)} CHF
                    {a.seuilGratuite != null
                      ? ` · offerte dès ${fmtCHF(a.seuilGratuite)} CHF`
                      : ""}
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-mute transition-transform group-open:rotate-180"
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <ul className="border-t border-border px-4 py-1.5">
                {a.zones.map((z) => (
                  <li
                    key={z.postal_code}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0 text-sm text-ink">
                      <span className="font-semibold">{z.postal_code}</span>{" "}
                      {z.city}
                    </span>
                    {z.offerteDOffice ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        toujours offerte
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm text-mute">
                        {fmtCHF(z.delivery_fee)} CHF
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
