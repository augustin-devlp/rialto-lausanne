"use client";

/**
 * PwaRegister — Phase 11 C5.
 *
 * Enregistre le service worker côté client + écoute l'événement
 * beforeinstallprompt pour proposer le bouton "Installer Rialto" quand
 * le navigateur le permet (Android Chrome, desktop Chrome). iOS Safari
 * ne déclenche pas cet événement — on gère ça via le hint "Ajouter à
 * l'écran d'accueil" existant sur /c/[shortCode].
 */

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register SW
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            console.log("[pwa] SW registered", reg.scope);
          })
          .catch((err) => {
            console.warn("[pwa] SW registration failed", err);
          });
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
