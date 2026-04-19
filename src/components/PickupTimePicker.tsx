"use client";

import { useEffect, useMemo, useState } from "react";
import Picker from "react-mobile-picker";
import { hhmmToMinutes, toZurichHHMM } from "@/lib/timezone";

type Props = {
  openTime: string;
  closeTime: string;
  prepMinutes: number;
  value: string; // "HH:MM"
  onChange: (hhmm: string) => void;
};

const MINUTE_STEP = 5;

/**
 * Sélecteur d'heure de retrait à 2 roues style iOS.
 * Construit la liste des heures et minutes valides en tenant compte
 * de l'ouverture, la fermeture et du temps de préparation.
 */
export default function PickupTimePicker({
  openTime,
  closeTime,
  prepMinutes,
  value,
  onChange,
}: Props) {
  // Earliest = max(open, now + prep) arrondi au MINUTE_STEP supérieur
  const earliestMin = useMemo(() => {
    const now = new Date();
    const earliestHHMM = toZurichHHMM(
      new Date(now.getTime() + prepMinutes * 60_000),
    );
    const openMin = hhmmToMinutes(openTime);
    const e = Math.max(openMin, hhmmToMinutes(earliestHHMM));
    return Math.ceil(e / MINUTE_STEP) * MINUTE_STEP;
  }, [openTime, prepMinutes]);

  const closeMin = useMemo(() => hhmmToMinutes(closeTime), [closeTime]);

  // Construit la liste des heures disponibles
  const availableHours = useMemo(() => {
    const earliestHour = Math.floor(earliestMin / 60);
    const latestHour = Math.floor(closeMin / 60);
    const out: string[] = [];
    for (let h = earliestHour; h <= latestHour; h++) {
      out.push(String(h).padStart(2, "0"));
    }
    return out;
  }, [earliestMin, closeMin]);

  // Parse valeur courante
  const [curHour, curMinute] = value.split(":") as [string, string];

  // Pour chaque heure sélectionnée, on calcule les minutes valides
  const availableMinutes = useMemo(() => {
    const h = Number(curHour);
    const out: string[] = [];
    for (let m = 0; m < 60; m += MINUTE_STEP) {
      const total = h * 60 + m;
      if (total < earliestMin) continue;
      if (total > closeMin) continue;
      out.push(String(m).padStart(2, "0"));
    }
    return out;
  }, [curHour, earliestMin, closeMin]);

  const [inner, setInner] = useState({
    hour: curHour || availableHours[0] || "12",
    minute: curMinute || availableMinutes[0] || "00",
  });

  // Ajuste si la minute courante n'est plus valide quand on change d'heure
  useEffect(() => {
    if (!availableMinutes.includes(inner.minute)) {
      const nextMinute = availableMinutes[0] ?? "00";
      setInner((s) => ({ ...s, minute: nextMinute }));
      onChange(`${inner.hour}:${nextMinute}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableMinutes, inner.hour]);

  const handlePickerChange = (v: { hour: string; minute: string }) => {
    setInner(v);
    onChange(`${v.hour}:${v.minute}`);
  };

  if (availableHours.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Aucun créneau disponible pour le moment (hors des horaires
        d&apos;ouverture ou temps de préparation insuffisant).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2">
      <style jsx global>{`
        .picker-wheel-container {
          position: relative;
        }
        .picker-wheel-highlight {
          border-top: 1px solid #fecaca;
          border-bottom: 1px solid #fecaca;
          background: rgba(227, 6, 19, 0.05);
        }
        .picker-wheel-item {
          color: #9ca3af;
          font-size: 18px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .picker-wheel-item--selected {
          color: #E30613 !important;
          font-weight: 700 !important;
          font-size: 22px !important;
        }
      `}</style>
      <div className="mb-1 flex justify-around text-[11px] font-semibold uppercase tracking-wider text-mute">
        <span>Heures</span>
        <span>Minutes</span>
      </div>
      <Picker
        value={inner}
        onChange={handlePickerChange}
        height={180}
        itemHeight={38}
        wheelMode="natural"
      >
        <Picker.Column name="hour">
          {availableHours.map((h) => (
            <Picker.Item value={h} key={h}>
              {({ selected }) => (
                <span
                  className={`picker-wheel-item ${
                    selected ? "picker-wheel-item--selected" : ""
                  }`}
                >
                  {h}
                </span>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
        <Picker.Column name="minute">
          {availableMinutes.map((m) => (
            <Picker.Item value={m} key={m}>
              {({ selected }) => (
                <span
                  className={`picker-wheel-item ${
                    selected ? "picker-wheel-item--selected" : ""
                  }`}
                >
                  {m}
                </span>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
      </Picker>
    </div>
  );
}
