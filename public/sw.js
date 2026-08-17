/**
 * Service Worker — Rialto Lausanne (Phase 11 C5).
 *
 * - Cache static assets (offline shell)
 * - Network-first pour les pages dynamiques (menu, checkout)
 * - Cache-first pour les icônes et images
 * - Background sync stub pour C6 (push notifications)
 */

// ⚠️ Estampillée par scripts/stamp-sw.mjs à CHAQUE build Vercel (SHA du
// commit) — la valeur committée n'est qu'un placeholder local. C'est ce
// qui fait exister le cycle de mise à jour : contenu changé → nouveau
// worker installé → état « waiting » → activation SILENCIEUSE à la
// prochaine navigation (PwaRegister, refonte 17.08.2026 — plus de toast).
const CACHE_VERSION = "rialto-dev";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
  "/",
  "/menu",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-maskable.svg",
];

// Page hors-ligne minimale, inline (aucune dépendance au cache) — le
// dernier filet des navigations : jamais un écran blanc muet en PWA
// standalone, jamais l'accueil déguisé sous une autre URL.
function reponseHorsLigne() {
  return new Response(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne — Rialto</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;background:#F9F1E4;color:#1A1A1A"><h1 style="font-size:1.3rem">Vous êtes hors ligne</h1><p>Vérifiez votre connexion, puis réessayez.</p><p><a href="/" style="color:#C73E1D">Retour à l&rsquo;accueil</a></p></body></html>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("install", (event) => {
  // ⚠️ PAS de skipWaiting() ici (retiré 29.07.2026) : l'activation
  // immédiate faisait tourner le NOUVEAU worker sous l'ANCIENNE page —
  // le skew écran/encaissement constaté sur R-2026-039. Le nouveau worker
  // reste en « waiting » jusqu'au message SKIP_WAITING que PwaRegister
  // envoie À LA PROCHAINE NAVIGATION (reload immédiat derrière dans le
  // cas nominal ; deux exceptions BORNÉES où le nouveau worker tourne
  // temporairement sous l'ancienne page — activation > 1,5 s, présence
  // sur /confirmation — réalignées par rattrapage à la navigation
  // suivante).
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
});

// PwaRegister envoie SKIP_WAITING à la première navigation qui suit la
// détection d'un worker en attente (mise à jour silencieuse 17.08.2026)
// et recharge dès controllerchange — alignement nominal ; les fenêtres
// de skew résiduelles sont bornées et rattrapées (cf. PwaRegister).
// GET_VERSION : conservé pour le diagnostic (identifier la version d'un
// worker depuis la console) — plus aucun appelant applicatif depuis la
// suppression du toast.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION") {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ version: CACHE_VERSION });
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin et API calls — on ne cache pas /api/*
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  // Cache-first pour icons / manifest / images
  if (
    url.pathname.startsWith("/icon-") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Network-first pour pages HTML (fallback cache si offline).
  // ⚠️ Relecture 17.08 : (1) ignoreVary — App Router varie les documents
  // sur les headers RSC, le précache de «/» et «/menu» ne matcherait
  // jamais une vraie navigation sans lui ; (2) plus JAMAIS l'accueil
  // servi sous une autre URL (/checkout déguisé en home), et pas non
  // plus Response.error() : en PWA standalone (sans barre d'adresse)
  // c'est un écran blanc sans issue — une page hors-ligne minimale à la
  // place.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(request, { ignoreVary: true })
            .then((c) => c || reponseHorsLigne()),
        ),
    );
    return;
  }

  // Default network
});

/* ── Phase 11 C6 : push notifications (stub, activated when VAPID keys present) */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Rialto", body: event.data.text() };
  }
  const { title = "Rialto", body = "", url = "/", icon = "/icon-192.svg", tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: "/icon-192.svg",
      tag: tag ?? "rialto-push",
      data: { url },
      vibrate: [100, 50, 100],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((winds) => {
      for (const w of winds) {
        if (w.url.endsWith(target) && "focus" in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    }),
  );
});
