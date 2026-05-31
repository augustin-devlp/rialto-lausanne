"use client";

/**
 * Segmented control Livraison / À emporter.
 *
 * Purement présentationnel : reçoit `value` + `onChange`. Chaque écran décide
 * de ce que fait le changement (la page menu redirige vers la qualification
 * d'adresse si on passe en livraison sans adresse, etc.).
 *
 * Pastille active glissante en terracotta — micro-interaction, identité Rialto.
 */

import type { FulfillmentMode } from "@/lib/clientStore";

type Props = {
  value: FulfillmentMode;
  onChange: (mode: FulfillmentMode) => void;
  /** "lg" = page menu (confort tactile), "sm" = header / checkout (compact). */
  size?: "lg" | "sm";
  className?: string;
};

const ScooterIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18" cy="17.5" r="3.5" />
    <path d="M9 17.5h5.5l3-6.5H20" />
    <path d="M14.5 17.5 12 7H8.5" />
    <path d="M5.5 14V8h2" />
  </svg>
);

const BagIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export default function FulfillmentToggle({
  value,
  onChange,
  size = "lg",
  className = "",
}: Props) {
  const isPickup = value === "pickup";
  const pad = size === "lg" ? "py-3 text-sm" : "py-2.5 text-[13px]";

  return (
    <div
      role="tablist"
      aria-label="Mode de commande"
      className={`relative grid grid-cols-2 rounded-full border border-border bg-white p-1 shadow-card ${className}`}
    >
      {/* Pastille active — glisse de gauche (livraison) à droite (emporter) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-rialto shadow-card transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ transform: isPickup ? "translateX(100%)" : "translateX(0)" }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={!isPickup}
        onClick={() => onChange("delivery")}
        className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 font-semibold transition-colors ${pad} ${
          !isPickup ? "text-white" : "text-ink hover:text-rialto"
        }`}
      >
        {ScooterIcon}
        Livraison
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isPickup}
        onClick={() => onChange("pickup")}
        className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-3 font-semibold transition-colors ${pad} ${
          isPickup ? "text-white" : "text-ink hover:text-rialto"
        }`}
      >
        {BagIcon}
        À emporter
      </button>
    </div>
  );
}
