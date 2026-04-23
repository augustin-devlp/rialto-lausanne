"use client";

/**
 * PushToggle — Phase 11 C6.
 *
 * Bouton d'activation / désactivation des notifications push.
 * - Affiche "Activer les notifications" si pas souscrit
 * - Affiche "Notifications activées ✓" + un bouton désactiver si souscrit
 *
 * Requiert VAPID_PUBLIC_KEY exposé via NEXT_PUBLIC_VAPID_PUBLIC_KEY
 * côté Stampify — on fetch le manifest public une fois pour l'avoir.
 *
 * Le subscribe est envoyé à stampify.ch/api/push/subscribe avec `phone`
 * pour permettre la cascade push→SMS côté transactional.
 */

import { useEffect, useState } from "react";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type Props = {
  phone?: string;
  customerId?: string | null;
  className?: string;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(b64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export default function PushToggle({ phone, customerId, className = "" }: Props) {
  const [state, setState] = useState<"unknown" | "denied" | "disabled" | "enabled" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      // Récupère VAPID public key depuis stampify
      try {
        const r = await fetch(`${STAMPIFY_BASE}/api/push/vapid-key`);
        if (r.ok) {
          const b = (await r.json()) as { key?: string };
          if (b.key) setVapidKey(b.key);
        }
      } catch {
        /* ignore */
      }
      // Check subscription existante
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setEndpoint(sub.endpoint);
          setState("enabled");
        } else {
          setState("disabled");
        }
      } catch {
        setState("disabled");
      }
    })();
  }, []);

  async function enable() {
    if (!vapidKey) {
      alert("Notifications temporairement indisponibles (clé VAPID manquante).");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "disabled");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(vapidKey) as unknown as BufferSource;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      // POST to Stampify
      const res = await fetch(`${STAMPIFY_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          customer_id: customerId ?? null,
          subscription: sub.toJSON(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEndpoint(sub.endpoint);
      setState("enabled");
    } catch (err) {
      console.error("[push] enable failed", err);
      alert("Activation des notifications impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (endpoint) {
          await fetch(
            `${STAMPIFY_BASE}/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`,
            { method: "DELETE" },
          );
        }
      }
      setEndpoint(null);
      setState("disabled");
    } catch (err) {
      console.error("[push] disable failed", err);
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported" || state === "unknown") return null;

  if (state === "denied") {
    return (
      <div className={`rounded-2xl border border-border bg-cream-dark p-3 text-xs text-mute ${className}`}>
        🔕 Notifications bloquées dans ton navigateur. Va dans les
        paramètres du site pour les ré-autoriser.
      </div>
    );
  }

  if (state === "enabled") {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl border-2 border-saffron bg-[#FFF7E4] p-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-ink">
          <span className="text-base">🔔</span>
          <span className="font-semibold">Notifications activées</span>
        </div>
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="text-xs text-mute underline hover:text-ink disabled:opacity-50"
        >
          {busy ? "…" : "Désactiver"}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 border-rialto bg-white p-3 text-left transition hover:shadow-pop ${className}`}
    >
      <span className="text-2xl">🔔</span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink">
          {busy ? "Activation…" : "Activer les notifications"}
        </div>
        <div className="text-[11px] text-mute">
          Reçois un ping quand ta commande est prête, sans SMS (gratuit).
        </div>
      </div>
      <svg
        className="shrink-0 text-rialto"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
