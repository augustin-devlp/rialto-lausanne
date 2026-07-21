"use client";

/**
 * Écran « Mes données » — dashboard patron (D7, engagement contractuel).
 * Deux exports en un clic : clients et commandes, chacun en CSV (Excel)
 * et JSON.
 *
 * Téléchargement par fetch + blob DANS le contexte authentifié — pas de
 * navigation <a href> : en PWA iOS (écran d'accueil), la jarre de cookies
 * est isolée de Safari et une réponse « attachment » y est éjectée vers
 * un contexte SANS cookie → 401/écran PIN (bug session de test 21.07).
 * En standalone, la feuille de partage (« Enregistrer dans Fichiers »)
 * remplace le gestionnaire de téléchargements absent.
 */

import { useEffect, useState } from "react";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS se présente comme MacIntel mais est tactile
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

type DownloadOutcome = "ok" | "auth" | "error" | "partage";

async function downloadExport(
  href: string,
  fallbackName: string,
  mime: string,
): Promise<DownloadOutcome> {
  let res: Response;
  try {
    res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
  } catch {
    return "error";
  }
  if (res.status === 401) return "auth";
  if (!res.ok) return "error";

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;

  // PWA installée (jarre de cookies isolée, pas de gestionnaire de
  // téléchargements sur iOS) : feuille de partage en premier choix.
  if (isStandalone()) {
    if (typeof navigator.share === "function") {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return "ok";
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return "ok";
          // NotAllowedError (activation utilisateur expirée après les
          // await) ou autre échec : sur iOS, NE PAS retomber sur
          // <a download> — la webview standalone l'ignore et ouvre le
          // blob en plein écran par-dessus l'app.
          if (isIos()) return "partage";
        }
      } else if (isIos()) {
        return "partage";
      }
    } else if (isIos()) {
      return "partage";
    }
    /* PWA Android/desktop : le repli blob ci-dessous fonctionne */
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "ok";
}

export default function DonneesClient() {
  const [counts, setCounts] = useState<{
    clients: number | null;
    commandes: number | null;
  }>({ clients: null, commandes: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Réutilise les exports JSON pour compter (petits volumes pré-lancement).
        const [c1, c2] = await Promise.all([
          fetch("/api/dashboard/export/clients?format=json", {
            cache: "no-store",
          }),
          fetch("/api/dashboard/export/commandes?format=json", {
            cache: "no-store",
          }),
        ]);
        if (cancelled) return;
        const clients = c1.ok ? ((await c1.json()) as unknown[]).length : null;
        const commandes = c2.ok
          ? ((await c2.json()) as unknown[]).length
          : null;
        setCounts({ clients, commandes });
      } catch {
        /* les compteurs restent — */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">Mes données</h1>
      <p className="text-sm text-mute">
        Vos données vous appartiennent. Exportez-les à tout moment — elles
        sont remises immédiatement, sans demande ni délai.
      </p>

      <ExportCard
        title="Mes clients"
        subtitle={
          counts.clients !== null
            ? `${counts.clients} client${counts.clients > 1 ? "s" : ""} · prénom, nom, téléphone, email, tampons, inscription`
            : "prénom, nom, téléphone, email, tampons, inscription"
        }
        csvHref="/api/dashboard/export/clients?format=csv"
        jsonHref="/api/dashboard/export/clients?format=json"
        baseName="rialto-clients"
      />

      <ExportCard
        title="Mes commandes"
        subtitle={
          counts.commandes !== null
            ? `${counts.commandes} commande${counts.commandes > 1 ? "s" : ""} · numéro, date, client, montant, statut, mode, adresse`
            : "numéro, date, client, montant, statut, mode, adresse"
        }
        csvHref="/api/dashboard/export/commandes?format=csv"
        jsonHref="/api/dashboard/export/commandes?format=json"
        baseName="rialto-commandes"
      />

      <p className="text-xs text-mute">
        CSV : compatible Excel (accents et « ; » suisses). JSON : pour un
        transfert vers un autre outil. Les fichiers sont datés du jour.
      </p>
    </div>
  );
}

function ExportCard({
  title,
  subtitle,
  csvHref,
  jsonHref,
  baseName,
}: {
  title: string;
  subtitle: string;
  csvHref: string;
  jsonHref: string;
  baseName: string;
}) {
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "csv" | "json") {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const outcome =
        kind === "csv"
          ? await downloadExport(csvHref, `${baseName}.csv`, "text/csv")
          : await downloadExport(
              jsonHref,
              `${baseName}.json`,
              "application/json",
            );
      if (outcome === "auth") {
        setError("Session expirée — rechargez la page et saisissez le code.");
      } else if (outcome === "partage") {
        setError(
          "Le partage n'a pas abouti. Réessayez, ou ouvrez le dashboard dans Safari pour télécharger.",
        );
      } else if (outcome === "error") {
        setError(
          "Téléchargement impossible. Rechargez la page puis réessayez.",
        );
      }
    } catch {
      setError("Téléchargement impossible. Rechargez la page puis réessayez.");
    } finally {
      // toujours relâcher les boutons, même si blob()/File/createObjectURL
      // throw en dehors du try du fetch
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
      <h2 className="font-display font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-mute">{subtitle}</p>
      {error && (
        <p className="mt-2 rounded-xl bg-rialto/10 p-2.5 text-xs font-medium text-rialto">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          aria-busy={busy === "csv"}
          onClick={() => run("csv")}
          className="flex-1 rounded-full bg-rialto py-3 text-center text-sm font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
        >
          {busy === "csv" ? "…" : "Télécharger CSV"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          aria-busy={busy === "json"}
          onClick={() => run("json")}
          className="flex-1 rounded-full border border-border bg-white py-3 text-center text-sm font-semibold text-ink/80 transition hover:bg-ink/5 disabled:opacity-50"
        >
          {busy === "json" ? "…" : "JSON"}
        </button>
      </div>
    </div>
  );
}
