"use client";

/**
 * Écran « Mes données » — dashboard patron (D7, engagement contractuel).
 * Deux exports en un clic : clients et commandes, chacun en CSV (Excel)
 * et JSON. Les téléchargements passent par les routes authentifiées
 * (cookie de session envoyé automatiquement, même origine).
 */

import { useEffect, useState } from "react";

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
}: {
  title: string;
  subtitle: string;
  csvHref: string;
  jsonHref: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
      <h2 className="font-display font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-mute">{subtitle}</p>
      <div className="mt-3 flex gap-2">
        <a
          href={csvHref}
          className="flex-1 rounded-full bg-rialto py-3 text-center text-sm font-semibold text-white transition hover:bg-rialto-dark"
        >
          Télécharger CSV
        </a>
        <a
          href={jsonHref}
          className="flex-1 rounded-full border border-border bg-white py-3 text-center text-sm font-semibold text-ink/80 transition hover:bg-ink/5"
        >
          JSON
        </a>
      </div>
    </div>
  );
}
