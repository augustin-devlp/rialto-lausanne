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

/** localStorage : version déclinée via « Plus tard » (amortisseur 04.08). */
const DECLINED_VERSION_KEY = "rialto_sw_version_declinee";

/**
 * Demande sa CACHE_VERSION à un worker (MessageChannel). null si le worker
 * ne répond pas (ancien sw.js sans GET_VERSION) — fail-open : sans
 * version, on affiche le toast (jamais de front gelé par silence).
 */
function demandeVersion(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const canal = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 1500);
    canal.port1.onmessage = (e: MessageEvent) => {
      window.clearTimeout(timer);
      resolve(
        typeof e.data?.version === "string" ? (e.data.version as string) : null,
      );
    };
    try {
      worker.postMessage({ type: "GET_VERSION" }, [canal.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

export default function PwaRegister() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  // Version du worker affiché par le toast — écrite en localStorage au
  // clic « Plus tard » pour ne plus re-prompter CETTE version (les
  // démarrages à froid PWA re-détectaient le même worker à chaque
  // réouverture — observation Augustin 04.08).
  const versionEnAttente = useRef<string | null>(null);
  // Vrai uniquement après le clic « Recharger » : controllerchange se
  // déclenche AUSSI au tout premier claim() d'un profil vierge — sans ce
  // garde, la première visite rechargerait en boucle.
  const rechargeDemande = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Ids/handlers gardés pour le cleanup : le composant vit dans le
    // layout et ne démonte jamais en prod, mais StrictMode double-monte en
    // dev (2 intervalles, 2 controllerchange → double reload au clic) et
    // un futur déplacement du composant ne doit pas créer de fuite.
    let intervalId: number | null = null;
    let onVisibilite: (() => void) | null = null;

    // Entonnoir unique de détection : interroge la version du worker et
    // ne montre PAS le toast si elle a déjà été déclinée (« Plus tard »).
    // Version inconnue (ancien sw.js, timeout) → fail-open : toast montré.
    const signaleWorker = (worker: ServiceWorker) => {
      void demandeVersion(worker).then((version) => {
        try {
          if (
            version &&
            window.localStorage.getItem(DECLINED_VERSION_KEY) === version
          ) {
            return; // cette version précise a été déclinée — silence
          }
        } catch {
          /* localStorage indisponible : on montre */
        }
        versionEnAttente.current = version;
        setWaitingWorker(worker);
      });
    };

    const surGuetteur = (nouveau: ServiceWorker) => {
      nouveau.addEventListener("statechange", () => {
        // « installed » avec un controller = une MISE À JOUR en attente
        // (sans controller, c'est la première installation : rien à
        // annoncer).
        if (
          nouveau.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          signaleWorker(nouveau);
        }
      });
    };

    const surveille = (reg: ServiceWorkerRegistration) => {
      // Un worker déjà en attente (déploiement passé pendant que l'onglet
      // était fermé) : toast immédiat.
      if (reg.waiting && navigator.serviceWorker.controller) {
        signaleWorker(reg.waiting);
      }
      // Un worker déjà EN COURS d'installation (page ouverte pile pendant
      // un déploiement) : updatefound a déjà tiré, il faut s'accrocher
      // directement à son statechange — sinon il atteint « waiting » sans
      // toast jusqu'à la vérification suivante.
      if (reg.installing) {
        surGuetteur(reg.installing);
      }
      reg.addEventListener("updatefound", () => {
        if (reg.installing) surGuetteur(reg.installing);
      });
    };

    const surChargement = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[pwa] SW registered", reg.scope);
          surveille(reg);
          // Sessions PWA longues : re-vérification horaire + au retour au
          // premier plan (l'app installée peut rester ouverte des jours —
          // le check du register() initial ne suffit pas).
          const verifie = () => reg.update().catch(() => {});
          intervalId = window.setInterval(verifie, 60 * 60 * 1000);
          onVisibilite = () => {
            if (document.visibilityState === "visible") verifie();
          };
          document.addEventListener("visibilitychange", onVisibilite);
        })
        .catch((err) => {
          console.warn("[pwa] SW registration failed", err);
        });
    };

    const surBascule = () => {
      if (rechargeDemande.current) {
        window.location.reload();
      }
    };

    if ("serviceWorker" in navigator) {
      // ⚠️ Sur un shell servi par le SW, la page est instantanée et `load`
      // a souvent DÉJÀ tiré avant que cet effet ne s'attache — le listener
      // ne se déclenchait jamais : pas d'enregistrement, pas de détection
      // de mise à jour, pas de toast (constaté en QA prod 31.07.2026 :
      // worker en attente présent, toast absent). readyState arbitre.
      if (document.readyState === "complete") {
        surChargement();
      } else {
        window.addEventListener("load", surChargement);
      }
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        surBascule,
      );
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
      if ("serviceWorker" in navigator) {
        window.removeEventListener("load", surChargement);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          surBascule,
        );
      }
      if (intervalId !== null) window.clearInterval(intervalId);
      if (onVisibilite) {
        document.removeEventListener("visibilitychange", onVisibilite);
      }
    };
  }, []);

  function handleRecharge() {
    // Relire la registration au clic : le worker affiché peut être devenu
    // « redundant » si un déploiement a chassé l'autre pendant la session —
    // un postMessage dans le vide donnerait un bouton mort sans retour.
    navigator.serviceWorker.getRegistration().then((reg) => {
      const w = reg?.waiting;
      if (w) {
        rechargeDemande.current = true;
        w.postMessage({ type: "SKIP_WAITING" });
      } else {
        // Plus de worker en attente (déjà activé ailleurs ?) : on retire
        // le toast plutôt que de laisser un bouton inerte.
        setWaitingWorker(null);
      }
    });
  }

  function handlePlusTard() {
    // Amortisseur (04.08.2026) : mémorise LA version déclinée — plus de
    // re-prompt pour ce déploiement précis aux démarrages à froid PWA.
    // Toute version NOUVELLE prompte toujours : la protection
    // anti-front-gelé tient. Version inconnue (ancien SW) → rien n'est
    // persisté, fermeture de session seulement, comme avant.
    if (versionEnAttente.current) {
      try {
        window.localStorage.setItem(
          DECLINED_VERSION_KEY,
          versionEnAttente.current,
        );
      } catch {
        /* stockage indisponible : fermeture de session seulement */
      }
    }
    setWaitingWorker(null);
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
  // bottom-24 en mobile : la barre CTA du checkout est fixed bottom-0
  // (~80 px, z-40) — un toast à bottom-4 masquerait le bouton « Confirmer »
  // (bloquant relecteur 31.07.2026). Et « Plus tard » garantit qu'aucune
  // saisie en cours n'est JAMAIS prise en otage par un rechargement.
  if (waitingWorker) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-24 left-4 right-4 z-[95] mx-auto max-w-md rounded-2xl border-2 border-rialto bg-white p-4 shadow-pop md:bottom-6 animate-fade-up"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 text-2xl">🔄</div>
          <div className="flex-1">
            <div className="font-display font-bold">
              Nouvelle version disponible
            </div>
            <p className="mt-0.5 text-xs text-mute">
              Rechargez pour utiliser la dernière version de l&apos;app.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePlusTard}
            className="shrink-0 text-mute hover:text-ink"
            aria-label="Plus tard"
          >
            ✕
          </button>
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
            Accès direct depuis votre écran d&apos;accueil, comme une vraie
            app.
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
