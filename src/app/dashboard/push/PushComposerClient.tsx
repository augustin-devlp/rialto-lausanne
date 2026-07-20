"use client";

/**
 * Composer de notification push — dashboard patron (D5).
 * Titre + message + aperçu + compteur de destinataires + DOUBLE
 * confirmation avant envoi + résultat + journal des envois.
 * Rappel vouvoiement affiché (le texte part chez les clients).
 */

import { useCallback, useEffect, useState } from "react";

type PushStatus = {
  push_configured: boolean;
  recipients: number;
  logs: Array<{
    id: string;
    title: string;
    body: string;
    recipients_total: number;
    sent_count: number;
    failed_count: number;
    deactivated_count: number;
    created_at: string;
  }>;
  logs_migration_pending: boolean;
};

const TITLE_MAX = 60;
const BODY_MAX = 180;

export default function PushComposerClient() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/push/status", {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { ok: boolean } & PushStatus;
      if (body.ok) {
        setStatus(body);
        setError(false);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/dashboard/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, message }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        sent?: number;
        deactivated?: number;
        recipients_total?: number;
        logged?: boolean;
      };
      if (body.ok) {
        setResult(
          `Envoyé à ${body.sent}/${body.recipients_total} client${(body.recipients_total ?? 0) > 1 ? "s" : ""}` +
            ((body.deactivated ?? 0) > 0
              ? ` · ${body.deactivated} abonnement${(body.deactivated ?? 0) > 1 ? "s" : ""} expiré${(body.deactivated ?? 0) > 1 ? "s" : ""} nettoyé${(body.deactivated ?? 0) > 1 ? "s" : ""}`
              : "") +
            (body.logged === false ? " · journal indisponible" : ""),
        );
        setTitle("");
        setMessage("");
      } else {
        setResult(
          body.error === "aucun_destinataire"
            ? "Aucun client abonné aux notifications pour l'instant."
            : body.error === "push_not_configured"
              ? "Notifications non configurées (clés VAPID manquantes côté serveur)."
              : "Envoi impossible. Réessayez.",
        );
      }
      setConfirming(false);
      await load();
    } catch {
      setResult("Problème de connexion. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
        Impossible de charger l&apos;écran notifications. Rechargez la page.
      </div>
    );
  }
  if (!status) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  const canCompose = status.push_configured;
  const canSend =
    canCompose && title.trim().length > 0 && message.trim().length > 0;

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">
        Notification clients
      </h1>

      {!status.push_configured && (
        <div className="rounded-2xl border border-saffron/50 bg-saffron/10 p-4 text-sm text-ink">
          ⚙️ Clés VAPID manquantes côté serveur (VAPID_PRIVATE_KEY /
          VAPID_SUBJECT). L&apos;envoi sera possible dès qu&apos;elles seront
          configurées.
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-mute">
            Destinataires
          </span>
          <span className="font-display text-2xl font-bold text-ink">
            {status.recipients}
          </span>
        </div>
        <p className="mt-1 text-xs text-mute">
          Clients ayant activé les notifications sur leur carte de fidélité.
        </p>
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <label className="mb-1 block text-sm font-semibold text-ink">
          Titre{" "}
          <span className="text-xs font-normal text-mute">
            ({title.length}/{TITLE_MAX})
          </span>
        </label>
        <input
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex : Mardi pizza chez Rialto 🍕"
          className="w-full rounded-xl border-2 border-border px-3 py-2.5 text-sm focus:border-rialto focus:outline-none"
          disabled={!canCompose}
        />
        <label className="mb-1 mt-3 block text-sm font-semibold text-ink">
          Message{" "}
          <span className="text-xs font-normal text-mute">
            ({message.length}/{BODY_MAX})
          </span>
        </label>
        <textarea
          value={message}
          maxLength={BODY_MAX}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Ex : Toutes nos pizzas à 15 CHF ce soir. Commandez sur rialto-lausanne.ch"
          className="w-full resize-none rounded-xl border-2 border-border px-3 py-2.5 text-sm focus:border-rialto focus:outline-none"
          disabled={!canCompose}
        />
        <p className="mt-2 text-xs text-mute">
          ⚠️ Ce texte part chez vos clients : vouvoiement et orthographe
          soignés. Le clic ouvre le menu de commande.
        </p>

        {/* Aperçu */}
        {(title || message) && (
          <div className="mt-3 rounded-xl bg-ink/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-mute">
              Aperçu
            </div>
            <div className="mt-1 flex items-start gap-2 rounded-lg border border-border bg-white p-2.5">
              <span className="text-lg" aria-hidden>
                🍕
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">
                  {title || "…"}
                </div>
                <div className="text-xs leading-snug text-ink/70">
                  {message || "…"}
                </div>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-3 rounded-xl border border-border bg-cream p-3 text-sm font-medium text-ink">
            {result}
          </div>
        )}

        {!confirming ? (
          <button
            type="button"
            disabled={!canSend || sending}
            onClick={() => setConfirming(true)}
            className="mt-4 w-full rounded-full bg-rialto py-3.5 font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-40"
          >
            Envoyer la notification
          </button>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-center text-sm font-medium text-ink">
              Envoyer à {status.recipients} client
              {status.recipients > 1 ? "s" : ""} maintenant ?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-full border border-border py-3 text-sm font-semibold text-ink/70"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={send}
                className="flex-1 rounded-full bg-rialto py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Envoi…" : "Oui, envoyer"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Journal */}
      {status.logs_migration_pending && (
        <div className="rounded-xl border border-saffron/50 bg-saffron/10 p-3 text-xs text-ink">
          ⏳ Journal des envois indisponible : migration <code>push_logs</code>{" "}
          (D5b) en navette. L&apos;envoi fonctionne quand même.
        </div>
      )}
      {status.logs.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Derniers envois
          </h2>
          <ul className="divide-y divide-border">
            {status.logs.map((l) => (
              <li key={l.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {l.title}
                  </span>
                  <span className="flex-shrink-0 text-xs text-mute">
                    {new Date(l.created_at).toLocaleDateString("fr-CH", {
                      timeZone: "Europe/Zurich",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-mute">{l.body}</div>
                <div className="mt-0.5 text-xs text-mute">
                  {l.sent_count}/{l.recipients_total} envoyé
                  {l.sent_count > 1 ? "s" : ""}
                  {l.deactivated_count > 0 &&
                    ` · ${l.deactivated_count} nettoyé${l.deactivated_count > 1 ? "s" : ""}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
