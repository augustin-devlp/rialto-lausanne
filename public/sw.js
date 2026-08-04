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
// worker installé → état « waiting » → toast (PwaRegister).
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

self.addEventListener("install", (event) => {
  // ⚠️ PAS de skipWaiting() ici (retiré 29.07.2026) : l'activation
  // immédiate faisait tourner le NOUVEAU worker sous l'ANCIENNE page —
  // le skew écran/encaissement constaté sur R-2026-039. Le nouveau worker
  // reste en « waiting » jusqu'au clic du toast (message SKIP_WAITING).
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
});

// Le toast (PwaRegister) envoie SKIP_WAITING quand l'utilisateur accepte
// de recharger : activation à la demande, jamais en douce.
// GET_VERSION (amortisseur 04.08.2026) : permet à la page d'identifier LA
// version d'un worker en attente — « Plus tard » mémorise cette version
// précise et ne re-prompte plus pour elle ; toute version NOUVELLE
// prompte toujours (protection anti-front-gelé conservée).
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

  // Network-first pour pages HTML (fallback cache si offline)
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/"))),
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
