"use client";

/**
 * Rangée de tampons — COMPOSANT PARTAGÉ (F6, 22.07.2026).
 *
 * Consommé par TOUTES les surfaces qui affichent une carte de fidélité :
 * la section Fidélité de l'accueil et le bloc carte de /confirmation.
 *
 * POURQUOI IL EXISTE : en F2, l'affichage du tampon « en attente » n'avait
 * été câblé que sur la section Fidélité. La page de confirmation — là où le
 * client arrive juste après avoir payé, donc là où vit TOUTE la promesse de
 * gratification immédiate — ne l'a jamais reçu, et la divergence n'a été
 * découverte qu'au test manuel. Ce composant rend ce type d'écart
 * structurellement impossible : une correction ici profite aux deux.
 *
 * DEUX INVARIANTS QU'IL PORTE, et qu'aucun appelant ne peut contourner :
 *
 *  1. LE CLAMP. `pendingVisibles` est borné aux cases restantes. Le RPC écrit
 *     least(acquis + n, seuil) : une carte à 9/10 qui reçoit une commande à
 *     2 tampons n'en encaisse qu'UN, et la ligne d'idempotence scelle la
 *     perte. On n'annonce donc JAMAIS plus que ce qui sera délivré — c'est le
 *     donné-repris attrapé en relecture F3.
 *
 *  2. LE TEXTE. Les pastilles sont décoratives (aria-hidden) : l'état « en
 *     attente » DOIT exister en toutes lettres, jamais seulement en couleur
 *     et en animation (WCAG 1.4.1). L'animation est sous motion-safe.
 */

export type StampRowProps = {
  /** Tampons ACQUIS (solidifiés). Jamais additionnés au pending. */
  currentStamps: number;
  stampsRequired: number;
  /** Tampons en attente, valeur BRUTE : le clamp est fait ici. */
  pendingStamps?: number;
  /** « light » = carte claire (accueil) · « dark » = carte sombre (confirmation). */
  tone?: "light" | "dark";
};

export default function StampRow({
  currentStamps,
  stampsRequired,
  pendingStamps = 0,
  tone = "light",
}: StampRowProps) {
  const acquis = Math.max(0, currentStamps);
  const total = Math.max(1, stampsRequired);

  // INVARIANT 1 — le clamp, à un seul endroit au monde.
  const pendingVisibles = Math.min(
    Math.max(0, pendingStamps),
    Math.max(0, total - acquis),
  );

  const sombre = tone === "dark";
  const rempli = sombre ? "bg-saffron" : "bg-emerald-600";
  const vide = sombre
    ? "bg-white/15 border border-white/25"
    : "bg-white border border-emerald-200";
  // Sur fond sombre, l'attente est nettement plus opaque : composité sur le
  // dégradé terracotta, bg-saffron/20 ne se distinguait du vide (bg-white/15)
  // qu'à ~1,08:1 — l'état ne tenait alors que sur la bordure et l'animation,
  // qui disparaît en prefers-reduced-motion.
  const attente = sombre
    ? "border-2 border-dashed border-saffron bg-saffron/50 motion-safe:animate-pulse"
    : "border-2 border-dashed border-saffron bg-saffron/10 motion-safe:animate-pulse";
  // ⚠️ CONTRASTE : c'est CE texte qui porte l'accessibilité de l'état.
  // bg-white/15 + text-white sur from-rialto (#C73E1D) tombe à ~4,01:1, sous
  // le 4,5:1 exigé en AA pour du 12 px. bg-white + text-rialto-700 (#8F2D16)
  // donne ~8,2:1, avec des tokens déjà en charte.
  const puce = sombre
    ? "bg-white text-rialto-700"
    : "bg-saffron/10 text-ink";

  return (
    <div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }).map((_, i) => {
          const estAcquis = i < acquis;
          const estEnAttente = !estAcquis && i < acquis + pendingVisibles;
          return (
            <div
              key={i}
              className={`h-10 flex-1 rounded-md transition-colors ${
                estAcquis ? rempli : estEnAttente ? attente : vide
              }`}
            />
          );
        })}
      </div>

      {/* INVARIANT 2 — l'état « en attente » en toutes lettres.
          La région live est montée EN PERMANENCE (contenu vide quand il n'y a
          rien) : la plupart des lecteurs d'écran n'annoncent pas une région
          qui apparaît déjà remplie, seulement ses mutations ultérieures. */}
      <p
        aria-live="polite"
        className={
          pendingVisibles > 0
            ? `mt-2 inline-block rounded-lg px-2 py-1 text-xs font-medium ${puce}`
            : "sr-only"
        }
      >
        {pendingVisibles > 0
          ? `${acquis} tampon${acquis > 1 ? "s" : ""} acquis — ${pendingVisibles} en attente de validation par le restaurant.`
          : ""}
      </p>
    </div>
  );
}
