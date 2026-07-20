"use client";

/**
 * Scanner de commande — dashboard patron.
 * Réutilise QrScanner (html5-qrcode). Le QR client (page /confirmation)
 * encode l'order_number (ex. R-2026-042). Repli : saisie manuelle.
 * Résolution via /api/dashboard/orders/lookup → redirection fiche.
 */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const QrScanner = dynamic(() => import("@/app/scan/QrScanner"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-square items-center justify-center rounded-2xl border-2 border-rialto/20 bg-ink text-sm text-white/60">
      Ouverture de la caméra…
    </div>
  ),
});

export default function ScanCommandeClient() {
  const router = useRouter();
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<"idle" | "looking" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const busy = useRef(false);

  async function resolve(q: string) {
    if (busy.current) return;
    busy.current = true;
    setStatus("looking");
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/dashboard/orders/lookup?q=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        order?: { id: string };
        error?: string;
      };
      if (body.ok && body.order) {
        router.push(`/dashboard/commandes/${body.order.id}`);
        return;
      }
      setStatus("error");
      setErrorMsg(
        res.status === 404
          ? "Commande introuvable. Vérifiez le numéro."
          : "Recherche impossible. Réessayez.",
      );
    } catch {
      setStatus("error");
      setErrorMsg("Problème de connexion. Réessayez.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">
        Scanner une commande
      </h1>
      <p className="text-sm text-mute">
        Visez le QR code affiché sur la page de confirmation du client.
      </p>

      <QrScanner onScan={(text) => resolve(text)} />

      {status === "looking" && (
        <div className="rounded-xl bg-ink/5 p-3 text-center text-sm text-ink/70">
          Recherche…
        </div>
      )}
      {status === "error" && (
        <div className="rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-center text-sm font-medium text-rialto">
          {errorMsg}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <label className="mb-1.5 block text-sm font-semibold text-ink">
          Ou saisir le numéro de commande
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) resolve(manual.trim());
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="R-2026-042"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border-2 border-border px-3 py-2.5 text-sm uppercase focus:border-rialto focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manual.trim() || status === "looking"}
            className="flex-shrink-0 rounded-full bg-rialto px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-40"
          >
            Chercher
          </button>
        </form>
      </div>
    </div>
  );
}
