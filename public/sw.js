/**
 * Service Worker — Rialto Lausanne (Phase 11 C5).
 *
 * - Cache static assets (offline shell)
 * - Network-first pour les pages dynamiques (menu, checkout)
 * - Cache-first pour les icônes et images
 * - Background sync stub pour C6 (push notifications)
 */

const CACHE_VERSION = "rialto-v11-c5-1";
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
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
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
