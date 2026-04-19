"use client";

import { useEffect, useState } from "react";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type Segment = {
  label: string;
  color?: string;
};

type Props = {
  phone: string;
  firstName: string;
  segments: Segment[];
  canSpin: boolean;
  lastReward?: string | null;
  onClose: () => void;
};

type SpinResult = {
  segment_index: number;
  reward: string;
  color: string | null;
  total_segments: number;
  code: string;
};

/**
 * Roue de la chance. Rotation CSS calculée pour pointer sur le segment
 * gagnant retourné par le serveur.
 */
export default function SpinWheel({
  phone,
  firstName,
  segments,
  canSpin,
  lastReward,
  onClose,
}: Props) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = segments.length || 1;
  const segAngle = 360 / total;

  async function spin() {
    if (spinning || !canSpin) return;
    setSpinning(true);
    setError(null);
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, first_name: firstName }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? `Erreur ${res.status}`);
        setSpinning(false);
        return;
      }
      const body = (await res.json()) as SpinResult;
      // Rotation finale : on fait 5 tours complets + l'angle du segment gagnant
      // Le pointer est en haut (0°), le segment 0 va de 0° à segAngle.
      // On veut que le CENTRE du segment gagnant soit sous le pointer.
      const targetCenter = body.segment_index * segAngle + segAngle / 2;
      const final = 360 * 5 + (360 - targetCenter);
      setRotation(final);
      // Réveler le résultat après l'animation
      setTimeout(() => {
        setResult(body);
        setSpinning(false);
      }, 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      setSpinning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:bg-gray-50"
        >
          ✕
        </button>

        <h3 className="mb-1 text-center text-lg font-black tracking-tight">
          🎰 Roue de la chance
        </h3>
        <p className="mb-4 text-center text-xs text-mute">
          Tentez votre chance — un tour par client.
        </p>

        {/* La roue */}
        <div className="relative mx-auto aspect-square w-64">
          {/* Pointer */}
          <div
            className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderTop: "18px solid #E30613",
            }}
          />
          <div
            className="relative h-full w-full overflow-hidden rounded-full border-4 border-rialto shadow-lg"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning
                ? "transform 4s cubic-bezier(0.17, 0.67, 0.2, 1)"
                : "none",
            }}
          >
            {segments.map((seg, i) => {
              const start = i * segAngle;
              const color = seg.color ?? (i % 2 === 0 ? "#E30613" : "#1a1a1a");
              return (
                <div
                  key={i}
                  className="absolute inset-0"
                  style={{
                    clipPath: `polygon(50% 50%, ${50 + 50 * Math.cos(((start - 90) * Math.PI) / 180)}% ${50 + 50 * Math.sin(((start - 90) * Math.PI) / 180)}%, ${50 + 50 * Math.cos(((start + segAngle - 90) * Math.PI) / 180)}% ${50 + 50 * Math.sin(((start + segAngle - 90) * Math.PI) / 180)}%)`,
                    background: color,
                  }}
                />
              );
            })}
            {segments.map((seg, i) => {
              const angle = i * segAngle + segAngle / 2;
              return (
                <div
                  key={`label-${i}`}
                  className="absolute left-1/2 top-1/2 origin-[0_0] text-center text-[10px] font-bold text-white"
                  style={{
                    transform: `rotate(${angle}deg) translate(0, -90px) rotate(-${angle}deg)`,
                    width: 100,
                    marginLeft: -50,
                  }}
                >
                  {seg.label.slice(0, 14)}
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        {result ? (
          <div className="mt-6 text-center">
            <div className="text-3xl">🎉</div>
            <div className="mt-2 text-lg font-black">{result.reward}</div>
            <div className="mt-3 rounded-lg bg-gray-100 p-3 font-mono text-sm">
              Code : <strong>{result.code}</strong>
            </div>
            <p className="mt-3 text-xs text-mute">
              Présentez ce code en caisse pour récupérer votre récompense.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white hover:bg-rialto-dark"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {error}
              </div>
            )}
            {!canSpin && !error && (
              <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-600">
                {lastReward
                  ? `Vous avez déjà tenté la roue et gagné « ${lastReward} ».`
                  : "Vous avez déjà utilisé votre spin."}
              </div>
            )}
            <button
              type="button"
              onClick={spin}
              disabled={spinning || !canSpin}
              className="mt-4 w-full rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
            >
              {spinning ? "La roue tourne…" : "Lancer la roue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
