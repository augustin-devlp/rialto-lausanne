"use client";

/**
 * PwaRegister — Phase 11 C5, + toast « nouvelle version » (29.07.2026).
 *
 * Enregistre le service worker côté client + écoute l'événement
 * beforeinstallprompt pour proposer le bouton "Installer Rialto" quand
 * le navigateur le permet (Android Chrome, desktop Chrome). iOS Safari
 * ne déclenche pas cet événement — on gère ça via le hint "Ajouter à
 * l'écran d'accueil" existant sur /c/[shortCode].
 *
 * TOAST « NOUVELLE VERSION » : chaque déploiement estampille sw.js
 * (scripts/stamp-sw.mjs) → le navigateur installe le nouveau worker qui
 * reste EN ATTENTE (le skipWaiting automatique a été retiré — il faisait
 * tourner le nouveau worker sous l'ancienne page : skew écran/encaissement
 * de R-2026-039). La page affiche alors le toast ; au clic, on envoie
 * SKIP_WAITING au worker en attente, `controllerchange` confirme la
 * bascule, et on recharge. Une session PWA longue re-vérifie les mises à
 * jour toutes les heures ET à chaque retour au premier plan.
 */

import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  // Vrai uniquement après le clic « Recharger » : controllerchange se
  // déclenche AUSSI au tout premier claim() d'un profil vierge — sans ce
  // garde, la première visite rechargerait en boucle.
  const rechargeDemande = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register SW + détection de mise à jour
    if ("serviceWorker" in navigator) {
      const surveille = (reg: ServiceWorkerRegistration) => {
        // Un worker déjà en attente (déploiement passé pendant que
        // l'onglet était fermé) : toast immédiat.
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener("statechange", () => {
            // « installed » avec un controller = une MISE À JOUR en
            // attente (sans controller, c'est la première installation :
            // rien à annoncer).
            if (
              nouveau.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(nouveau);
            }
          });
        });
      };

      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            console.log("[pwa] SW registered", reg.scope);
            surveille(reg);
            // Sessions PWA longues : re-vérification horaire + au retour
            // au premier plan (l'app installée peut rester ouverte des
            // jours — le check du register() initial ne suffit pas).
            const verifie = () => reg.update().catch(() => {});
            window.setInterval(verifie, 60 * 60 * 1000);
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState === "visible") verifie();
            });
          })
          .catch((err) => {
            console.warn("[pwa] SW registration failed", err);
          });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (rechargeDemande.current) {
          window.location.reload();
        }
      });
    }

    // Install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      const dismissed = window.localStorage.getItem("RIALTO:PWA:dismissed");
      if (dismissed) return;
      setInstallEvt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  function handleRecharge() {
    if (!waitingWorker) return;
    rechargeDemande.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  async function handleInstall() {
    if (!installEvt) return;
    await installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === "accepted") {
      console.log("[pwa] install accepted");
    }
    setInstallEvt(null);
    setHidden(true);
  }

  function handleDismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem("RIALTO:PWA:dismissed", "1");
    } catch {}
  }

  // Le toast de mise à jour PRIME sur l'invite d'installation : c'est lui
  // qui protège la cohérence écran/encaissement.
  if (waitingWorker) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[95] mx-auto max-w-md rounded-2xl border-2 border-rialto bg-white p-4 shadow-pop md:bottom-6 animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="shrink-0 text-2xl">🔄</div>
          <div className="flex-1">
            <div className="font-display font-bold">
              Nouvelle version disponible
            </div>
            <p className="mt-0.5 text-xs text-mute">
              Rechargez pour utiliser la dernière version de l&apos;app.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRecharge}
          className="btn-primary mt-3 w-full justify-center"
        >
          Recharger
        </button>
      </div>
    );
  }

  if (hidden || !installEvt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[90] mx-auto max-w-md rounded-2xl border-2 border-rialto bg-white p-4 shadow-pop md:bottom-6 animate-fade-up">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-2xl">📲</div>
        <div className="flex-1">
          <div className="font-display font-bold">Installer l&apos;app Rialto</div>
          <p className="mt-0.5 text-xs text-mute">
            Accès direct depuis ton écran d&apos;accueil, comme une vraie app.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-mute hover:text-ink"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={handleInstall}
        className="btn-primary mt-3 w-full justify-center"
      >
        Installer Rialto
      </button>
    </div>
  );
}
