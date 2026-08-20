"use client";

/**
 * WheelTimePicker — sélecteur d'heure à ROUES DÉFILANTES style iOS
 * (finitions refonte UI, décision Augustin 20.08.2026).
 *
 * Deux colonnes (heures | minutes au pas de 15) avec accrochage
 * scroll-snap sur les valeurs, fenêtre de sélection centrale, dégradés
 * haut/bas. Utilisable à la molette/au clic sur ordinateur, au doigt
 * sur mobile (scroll natif), et au clic/Enter sur chaque valeur.
 *
 * BORNES : horaires d'ouverture (open/close) + délai minimum
 * (minLeadMinutes) — le premier créneau proposé est
 * max(ouverture, maintenant + délai) arrondi au quart d'heure
 * supérieur ; le dernier est l'heure de fermeture. Une combinaison
 * heure/minute hors bornes est ramenée par accrochage à la plus proche
 * valide (comportement iOS).
 *
 * PRÉSENTATION PURE : remonte « HH:MM » par onChange exactement comme
 * l'ancien <input type="time"> — la composition de
 * requested_pickup_time au submit est INCHANGÉE. Rappel : « Planifié »
 * produit toujours une commande normale (point bloquant GO_LIVE.md).
 */

import { useEffect, useMemo, useRef } from "react";

const ITEM_H = 36; // hauteur d'une valeur (px) — 5 visibles dans h-[180px]
const PAS_MINUTES = 15;

type Props = {
  /** "HH:MM" ou "" (le composant s'initialise alors au premier créneau). */
  value: string;
  onChange: (hhmm: string) => void;
  /** Ouverture / fermeture "HH:MM" (RIALTO_INFO : 11:30 / 23:30). */
  openTime?: string;
  closeTime?: string;
  /** Délai minimum avant le premier créneau proposable (minutes). */
  minLeadMinutes?: number;
};

function versMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function versHHMM(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function WheelTimePicker({
  value,
  onChange,
  openTime = "11:30",
  closeTime = "23:30",
  minLeadMinutes = 45,
}: Props) {
  // Bornes recalculées au montage (l'écran checkout vit quelques minutes :
  // suffisant — le serveur ne valide pas l'heure de livraison aujourd'hui,
  // ces bornes sont une aide de saisie, pas une règle).
  const { creneaux, heures, minutesParHeure } = useMemo(() => {
    const ouverture = versMinutes(openTime);
    const fermeture = versMinutes(closeTime);
    const maintenant = new Date();
    const minNow =
      maintenant.getHours() * 60 + maintenant.getMinutes() + minLeadMinutes;
    const debut = Math.max(
      ouverture,
      Math.ceil(minNow / PAS_MINUTES) * PAS_MINUTES,
    );
    const liste: number[] = [];
    for (let t = debut; t <= fermeture; t += PAS_MINUTES) liste.push(t);
    const parHeure = new Map<number, number[]>();
    for (const t of liste) {
      const h = Math.floor(t / 60);
      (parHeure.get(h) ?? parHeure.set(h, []).get(h)!).push(t % 60);
    }
    return {
      creneaux: liste,
      heures: [...parHeure.keys()],
      minutesParHeure: parHeure,
    };
  }, [openTime, closeTime, minLeadMinutes]);

  const heureRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Miroir de value pour les handlers de scroll (pas de re-abonnement).
  const valueRef = useRef(value);
  valueRef.current = value;

  const sel = value && creneaux.includes(versMinutes(value)) ? versMinutes(value) : creneaux[0];
  const selH = sel != null ? Math.floor(sel / 60) : undefined;
  const selM = sel != null ? sel % 60 : undefined;

  // Initialisation : si value est vide ou hors créneaux, pose le premier
  // créneau — l'ancien <input required> partait vide, ici la valeur est
  // toujours valide dès l'affichage.
  useEffect(() => {
    if (creneaux.length === 0) return;
    if (!value || !creneaux.includes(versMinutes(value))) {
      onChange(versHHMM(creneaux[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creneaux]);

  // Aligne les roues sur la sélection (montage + accrochage correctif).
  useEffect(() => {
    if (selH == null || selM == null) return;
    const hIdx = heures.indexOf(selH);
    const mins = minutesParHeure.get(selH) ?? [];
    const mIdx = mins.indexOf(selM);
    if (heureRef.current && hIdx >= 0) {
      heureRef.current.scrollTo({ top: hIdx * ITEM_H, behavior: "smooth" });
    }
    if (minuteRef.current && mIdx >= 0) {
      minuteRef.current.scrollTo({ top: mIdx * ITEM_H, behavior: "smooth" });
    }
  }, [selH, selM, heures, minutesParHeure]);

  // Lecture de la roue après stabilisation du scroll (débounce court) :
  // l'index central devient la sélection ; combinaison invalide → snap
  // à la minute valide la plus proche de l'heure choisie.
  const lireRoues = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const hEl = heureRef.current;
      const mEl = minuteRef.current;
      if (!hEl || !mEl || heures.length === 0) return;
      const hIdx = Math.min(
        heures.length - 1,
        Math.max(0, Math.round(hEl.scrollTop / ITEM_H)),
      );
      const h = heures[hIdx];
      const mins = minutesParHeure.get(h) ?? [];
      const mIdx = Math.min(
        mins.length - 1,
        Math.max(0, Math.round(mEl.scrollTop / ITEM_H)),
      );
      const nouveau = versHHMM(h * 60 + (mins[mIdx] ?? 0));
      if (nouveau !== valueRef.current) onChange(nouveau);
    }, 140);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (creneaux.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-mute">
        Plus de créneau disponible aujourd&apos;hui — choisissez
        « Standard », la commande partira dès que possible.
      </p>
    );
  }

  const minutesAffichees = selH != null ? minutesParHeure.get(selH) ?? [] : [];

  const Roue = ({
    refEl,
    valeurs,
    formate,
    actif,
    label,
  }: {
    refEl: React.RefObject<HTMLDivElement>;
    valeurs: number[];
    formate: (v: number) => string;
    actif: (v: number) => boolean;
    label: string;
  }) => (
    <div className="relative h-[180px] flex-1">
      {/* Fenêtre de sélection centrale */}
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-btn bg-neutral-100"
        aria-hidden
      />
      <div
        ref={refEl}
        onScroll={lireRoues}
        role="listbox"
        aria-label={label}
        className="scrollbar-none relative z-20 h-full snap-y snap-mandatory overflow-y-auto py-[72px]"
      >
        {valeurs.map((v) => (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={actif(v)}
            onClick={(e) => {
              const conteneur = refEl.current;
              if (!conteneur) return;
              const idx = valeurs.indexOf(v);
              conteneur.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
              e.currentTarget.blur();
            }}
            className={`flex h-9 w-full snap-center items-center justify-center text-base tabular-nums transition-colors ${
              actif(v) ? "font-semibold text-ink" : "text-mute"
            }`}
          >
            {formate(v)}
          </button>
        ))}
      </div>
      {/* Dégradés haut/bas (fondu des valeurs éloignées) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-12 bg-gradient-to-b from-white to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-12 bg-gradient-to-t from-white to-transparent" aria-hidden />
    </div>
  );

  return (
    <div className="mt-3 rounded-2xl border border-border bg-white p-3">
      <div className="mb-1 flex justify-around text-[11px] font-semibold uppercase tracking-wider text-mute">
        <span>Heure</span>
        <span>Minutes</span>
      </div>
      <div className="flex items-stretch gap-2">
        <Roue
          refEl={heureRef}
          valeurs={heures}
          formate={(h) => String(h).padStart(2, "0")}
          actif={(h) => h === selH}
          label="Heure de livraison"
        />
        <div className="flex items-center font-display text-lg font-bold text-ink" aria-hidden>
          :
        </div>
        <Roue
          refEl={minuteRef}
          valeurs={minutesAffichees}
          formate={(m) => String(m).padStart(2, "0")}
          actif={(m) => m === selM}
          label="Minutes de livraison"
        />
      </div>
      <p className="mt-1 text-center text-xs text-mute">
        Livraison souhaitée : <strong className="tabular-nums">{sel != null ? versHHMM(sel) : "—"}</strong>
        {" "}· ouvert {openTime.replace(":", "h")} – {closeTime.replace(":", "h")}
      </p>
    </div>
  );
}
