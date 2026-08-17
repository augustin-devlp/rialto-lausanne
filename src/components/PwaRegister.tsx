"use client";

/**
 * PwaRegister — enregistrement SW + invite d'installation + MISE À JOUR
 * SILENCIEUSE (refonte 17.08.2026, décision Augustin : plus de toast).
 *
 * CYCLE DE MISE À JOUR : chaque déploiement estampille sw.js
 * (scripts/stamp-sw.mjs — échec de build si le motif disparaît) → le
 * navigateur installe le nouveau worker qui reste EN ATTENTE (pas de
 * skipWaiting à l'install : l'activation immédiate faisait tourner le
 * NOUVEAU worker sous l'ANCIENNE page — skew écran/encaissement de
 * R-2026-039). À chaque CHANGEMENT DE PAGE (usePathname), s'il existe un
 * worker en attente : GEL de la page → SKIP_WAITING → reload dès
 * controllerchange.
 *
 * LE GEL EST LA GARDE, et il est IMPÉRATIF (3e contre-passe 17.08) : un
 * voile DOM posé en synchrone (pointeur bloqué par l'overlay, clavier
 * par un listener capture) dans la MÊME tâche que le SKIP_WAITING —
 * `reg.waiting` est lu en synchrone sur la Registration mémorisée
 * (objet live), aucun hop async avant le gel. Fenêtre résiduelle : le
 * délai entre le commit de la page et l'exécution de l'effet React
 * (~une frame) — humainement inutilisable. Le gel couvre AUSSI le fetch
 * network-first du document déclenché par reload(). Bornes :
 *   - activation > ANNULATION_RECHARGE_MS → dégel, renoncement, le
 *     worker est marqué « déjà tenté » : les navigations suivantes ne
 *     re-gèlent plus pour lui (retentative PASSIVE sans gel — s'il
 *     s'active enfin, le rattrapage réalignera) ;
 *   - reload() sans remplacement du document sous GEL_MAX_MS (réseau
 *     qui pend) → dégel filet + rattrapage réarmé ;
 *   - restauration bfcache (retour après un reload avorté) → pageshow
 *     persisted → désarmement complet ;
 *   - au-delà de GEL_INDICATEUR_MS, un badge discret « Mise à jour… »
 *     apparaît (jamais sur le cas nominal ~100-600 ms) + annonce
 *     lecteur d'écran dès le gel (WCAG AA).
 *
 * AUCUN RELOAD, nulle part, si : le pathname d'arrivée est
 * /confirmation/* (purchase tiré ou en file mémoire — vérifié AUSSI au
 * point de reload dans surBascule, car back/forward n'émet aucun
 * événement pointeur/clavier) ; une conversion attend le consentement
 * (hasPendingConversion — la file ne survit pas à un reload) ; une
 * opération critique est en vol (operationCritiqueEnCours — le POST
 * /api/orders est AWAITÉ : un reload le trancherait côté client alors
 * que le serveur crée la commande → panier intact → commande en
 * double ; l'idempotence serveur, proposée en navette, reste le vrai
 * verrou de fond).
 *
 * MULTI-ONGLETS : un controllerchange NON demandé (l'activation vient
 * d'un autre onglet — comptoir /scan et /dashboard côte à côte) arme le
 * rattrapage si un controller existait déjà (avaitController, initialisé
 * en SYNCHRONE avant le listener) : l'onglet passif se réaligne à sa
 * propre navigation suivante.
 *
 * CAS LIMITES ASSUMÉS (nommés) : utilisateur qui ne navigue jamais =
 * ancienne version jusqu'à sa prochaine navigation (décision Augustin
 * 17.08 — le serveur re-valide tout au POST) ; client qui commande sans
 * trancher le bandeau cookies = ancienne version le reste de la session
 * (on préfère perdre la mise à jour que le purchase) ; double
 * page_view/appel upsell possibles au reload d'arrivée, un jour de
 * déploiement.
 *
 * PROTECTIONS ANTI-FRONT-GELÉ CONSERVÉES : CACHE_VERSION estampillée au
 * build, purge des caches à l'activation (sw.js), re-vérification
 * horaire + retour au premier plan (reg.update), course register/load
 * arbitrée par readyState. L'amortisseur « version déclinée » du toast
 * est REMPLACÉ par le marqueur « worker déjà tenté » (même rôle : pas de
 * friction répétée pour un même déploiement).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { hasPendingConversion } from "@/lib/tracking";
import { operationCritiqueEnCours } from "@/lib/operationCritique";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Renoncement (et dégel) si l'activation ne s'est pas signalée dans ce
 * délai — l'activation nominale prend ~100-600 ms. */
const ANNULATION_RECHARGE_MS = 1500;
/** Filet : si reload() n'a pas remplacé le document dans ce délai
 * (réseau qui pend), on dégèle et on rend la main. */
const GEL_MAX_MS = 8000;
/** Au-delà, le gel devient perceptible : on l'annonce visuellement. */
const GEL_INDICATEUR_MS = 600;

export default function PwaRegister() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const pathname = usePathname();

  // Vrai uniquement entre notre SKIP_WAITING et le controllerchange qui
  // le confirme : controllerchange se déclenche AUSSI au tout premier
  // claim() d'un profil vierge — sans ce garde, la première visite
  // rechargerait en boucle.
  const rechargeDemande = useRef(false);
  const annulationRecharge = useRef<number | null>(null);
  // Controller AVANT notre SKIP_WAITING : au timeout, s'il a changé,
  // l'activation a eu lieu sans reload → rattrapage ; sinon rien.
  const controllerAvant = useRef<ServiceWorker | null>(null);
  // Une activation a eu lieu SANS reload : la prochaine navigation
  // recharge pour réaligner page et worker.
  const rattrapageReload = useRef(false);
  // Un controller existait avant l'événement : distingue le claim de
  // première visite d'une activation de mise à jour (multi-onglets).
  const avaitController = useRef(false);
  // Registration mémorisée (objet LIVE : .waiting est relu frais à
  // chaque accès) — permet la lecture SYNCHRONE dans l'effet de
  // navigation, sans hop async avant le gel.
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  // Worker dont l'activation a déjà dépassé le délai : plus jamais de
  // gel pour lui (retentative passive uniquement) — remplace
  // l'amortisseur « version déclinée » de l'ancien toast.
  const workerDejaTente = useRef<ServiceWorker | null>(null);
  // null = premier rendu (pas une navigation).
  const dernierPathname = useRef<string | null>(null);

  // ── Gel impératif (DOM direct : synchrone, pas d'attente de render) ──
  const voileEl = useRef<HTMLDivElement | null>(null);
  const voileTimers = useRef<number[]>([]);
  const bloqueClavier = useRef<((e: KeyboardEvent) => void) | null>(null);

  const degele = () => {
    voileTimers.current.forEach((t) => window.clearTimeout(t));
    voileTimers.current = [];
    if (bloqueClavier.current) {
      window.removeEventListener("keydown", bloqueClavier.current, {
        capture: true,
      });
      bloqueClavier.current = null;
    }
    voileEl.current?.remove();
    voileEl.current = null;
  };

  const gele = () => {
    if (voileEl.current) return;
    const voile = document.createElement("div");
    voile.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:transparent;cursor:wait";
    // Annonce lecteur d'écran immédiate (invisible) — le voile rend la
    // page inerte, il faut le dire (WCAG AA).
    const statut = document.createElement("div");
    statut.setAttribute("role", "status");
    statut.setAttribute("aria-live", "polite");
    statut.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
    statut.textContent = "Mise à jour de l'application en cours…";
    voile.appendChild(statut);
    document.body.appendChild(voile);
    voileEl.current = voile;
    const bloque = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", bloque, { capture: true });
    bloqueClavier.current = bloque;
    // Indicateur visuel DIFFÉRÉ : jamais affiché sur le cas nominal
    // (~100-600 ms) — au-delà, « rien ne répond » sans signal serait lu
    // comme un plantage, surtout sur mobile (cursor-wait y est inerte).
    voileTimers.current.push(
      window.setTimeout(() => {
        if (!voileEl.current) return;
        const badge = document.createElement("div");
        badge.style.cssText =
          "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(26,26,26,.85);color:#fff;padding:6px 14px;border-radius:9999px;font:500 13px system-ui;z-index:10000";
        badge.textContent = "Mise à jour…";
        voileEl.current.appendChild(badge);
      }, GEL_INDICATEUR_MS),
    );
  };

  const desarmeCycle = () => {
    rechargeDemande.current = false;
    if (annulationRecharge.current !== null) {
      window.clearTimeout(annulationRecharge.current);
      annulationRecharge.current = null;
    }
    degele();
  };

  /** reload() PAGE GELÉE, avec filet : si le document n'est pas remplacé
   * (réseau qui pend, reload avorté), dégel et rattrapage réarmé. */
  const rechargeGelee = () => {
    gele();
    voileTimers.current.push(
      window.setTimeout(() => {
        degele();
        rattrapageReload.current = true;
      }, GEL_MAX_MS),
    );
    window.location.reload();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    let annule = false;
    let intervalId: number | null = null;
    let onVisibilite: (() => void) | null = null;

    const surChargement = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (annule) return;
          console.log("[pwa] SW registered", reg.scope);
          regRef.current = reg;
          // Sessions PWA longues : re-vérification horaire + au retour au
          // premier plan. Le worker détecté atterrit en « waiting » et
          // sera activé à la prochaine navigation — aucune écoute
          // updatefound nécessaire.
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
      if (!rechargeDemande.current) {
        // Activation NON demandée par cet onglet : premier claim d'un
        // profil vierge (avaitController false → rien à faire) ou mise à
        // jour activée par un AUTRE onglet → réalignement à sa prochaine
        // navigation.
        if (avaitController.current) rattrapageReload.current = true;
        avaitController.current = true;
        return;
      }
      avaitController.current = true;
      rechargeDemande.current = false;
      if (annulationRecharge.current !== null) {
        window.clearTimeout(annulationRecharge.current);
        annulationRecharge.current = null;
      }
      // Gardes AU POINT DE RELOAD : back/forward peut avoir ramené sur
      // /confirmation sans événement pointeur/clavier, et un POST parti
      // de la page PRÉCÉDENTE peut encore être en vol.
      if (
        window.location.pathname.startsWith("/confirmation/") ||
        operationCritiqueEnCours() ||
        hasPendingConversion()
      ) {
        degele();
        rattrapageReload.current = true;
        return;
      }
      rechargeGelee();
    };

    const surPageShow = (e: PageTransitionEvent) => {
      // Restauration bfcache après un reload avorté : l'état revient tel
      // quel (voile posé, aucun timer vivant) — tout désarmer.
      if (e.persisted) desarmeCycle();
    };

    if ("serviceWorker" in navigator) {
      // Initialisation SYNCHRONE, avant le listener : un controllerchange
      // multi-onglets précoce ne doit pas passer pour un premier claim.
      avaitController.current = navigator.serviceWorker.controller !== null;
      // ⚠️ Sur un shell servi par le SW, la page est instantanée et `load`
      // a souvent DÉJÀ tiré avant que cet effet ne s'attache (constaté en
      // QA prod 31.07.2026). readyState arbitre.
      if (document.readyState === "complete") {
        surChargement();
      } else {
        window.addEventListener("load", surChargement);
      }
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        surBascule,
      );
      window.addEventListener("pageshow", surPageShow);
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
      annule = true;
      window.removeEventListener("beforeinstallprompt", handler);
      if ("serviceWorker" in navigator) {
        window.removeEventListener("load", surChargement);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          surBascule,
        );
        window.removeEventListener("pageshow", surPageShow);
      }
      if (intervalId !== null) window.clearInterval(intervalId);
      if (onVisibilite) {
        document.removeEventListener("visibilitychange", onVisibilite);
      }
      desarmeCycle();
    };
  }, []);

  // MISE À JOUR SILENCIEUSE : à chaque navigation (changement de
  // pathname), activer l'éventuel worker en attente — lecture SYNCHRONE
  // de regRef.current.waiting (objet live), gel posé dans la même tâche.
  useEffect(() => {
    if (dernierPathname.current === null) {
      dernierPathname.current = pathname;
      return; // premier rendu = chargement, pas une navigation
    }
    if (dernierPathname.current === pathname) return;
    dernierPathname.current = pathname;

    if (!("serviceWorker" in navigator)) return;

    // Toute navigation ABANDONNE le cycle précédent (navigation rapide
    // A→B→C : le cycle de B est désarmé — si son activation aboutit
    // quand même, surBascule la verra « non demandée » et armera le
    // rattrapage).
    desarmeCycle();

    // JAMAIS de gel/activation/rattrapage à l'arrivée sur /confirmation.
    // Un rattrapage armé reste armé pour la navigation suivante.
    if (pathname.startsWith("/confirmation/")) return;

    // Jamais de reload tant qu'une conversion attend le consentement ou
    // qu'une opération critique (POST commande) est en vol.
    if (hasPendingConversion() || operationCritiqueEnCours()) return;

    // Rattrapage d'un cycle précédent : le worker est déjà actif sous la
    // vieille page — CETTE navigation est le moment sûr pour réaligner.
    if (rattrapageReload.current) {
      rattrapageReload.current = false;
      rechargeGelee();
      return;
    }

    const w = regRef.current?.waiting ?? null;
    // Sans controller, on n'est pas dans un cycle de MISE À JOUR
    // (première installation) : rien à activer.
    if (!w || !navigator.serviceWorker.controller) return;

    if (w === workerDejaTente.current) {
      // Ce worker a déjà dépassé le délai d'activation : retentative
      // PASSIVE (sans gel, sans reload demandé) — s'il s'active enfin,
      // surBascule (« non demandé ») armera le rattrapage. Pas de
      // friction répétée pour un même déploiement.
      try {
        w.postMessage({ type: "SKIP_WAITING" });
      } catch {
        /* worker devenu redundant : rien */
      }
      return;
    }

    rechargeDemande.current = true;
    controllerAvant.current = navigator.serviceWorker.controller;
    // GEL SYNCHRONE avant le SKIP_WAITING : aucune interaction possible
    // entre l'armement et le remplacement du document (fenêtre
    // résiduelle : ~une frame entre le commit de la page et cet effet).
    gele();
    annulationRecharge.current = window.setTimeout(() => {
      // Activation anormalement lente : dégel, renoncement, et ce worker
      // ne re-gèlera plus (workerDejaTente). Rattrapage UNIQUEMENT si le
      // controller a changé (activation réelle sans reload).
      rechargeDemande.current = false;
      annulationRecharge.current = null;
      degele();
      workerDejaTente.current = w;
      if (navigator.serviceWorker.controller !== controllerAvant.current) {
        rattrapageReload.current = true;
      }
    }, ANNULATION_RECHARGE_MS);
    try {
      w.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // Worker devenu redundant (déploiement chassé par un autre) :
      // rollback complet, la navigation suivante repartira du frais.
      desarmeCycle();
    }
  }, [pathname]);

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
