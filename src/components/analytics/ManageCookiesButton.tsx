"use client";

/**
 * « Gérer les cookies » — le RETRAIT du consentement (Lot B, 23.07.2026).
 * Efface le choix stocké et rouvre le bandeau. Exigence de base nLPD/PFPDT :
 * un consentement qu'on ne peut pas retirer n'en est pas un.
 *
 * ⚠️ Depuis une surface en OVERLAY (menu hamburger, z-[90]) : le bandeau
 * rouvert vit à z-[60], DERRIÈRE l'overlay — l'appelant DOIT se refermer
 * via `onDone`, sinon le retrait s'exécute mais paraît cassé (aucun
 * feedback visible, et le scroll est bloqué par body overflow:hidden).
 */

import { resetConsent } from "@/lib/consent";

export default function ManageCookiesButton({
  className,
  onDone,
}: {
  className?: string;
  /** Appelé après le retrait — refermer ici toute surface qui masquerait le bandeau. */
  onDone?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        resetConsent();
        onDone?.();
      }}
      className={
        className ??
        "cursor-pointer underline underline-offset-2 hover:text-rialto"
      }
    >
      Gérer les cookies
    </button>
  );
}
