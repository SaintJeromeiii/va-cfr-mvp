const SHELL_CACHE = "va-claim-strategy-shell-v1";
const DATA_CACHE = "va-claim-strategy-data-v1";
const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/offline.html",
  "/data/conditions.json",
  "/js/command-query.js",
  "/js/notifier.js",
  "/js/confirm-modal.js",
  "/js/search-ui.js",
  "/js/timeline-utils.js",
  "/js/storage.js",
  "/js/workspace-export.js",
  "/js/evidence-binder.js",
  "/js/evidence-graph.js",
  "/js/workspace-ui.js",
  "/js/detail-view.js",
  "/js/detail-interactions.js",
  "/js/workspace-drafts.js",
  "/js/secondary-conditions.js",
  "/js/workspace-tools.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, DATA_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      networkFirst(event.request, SHELL_CACHE).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  if (url.pathname === "/api/conditions" || url.pathname === "/data/conditions.json") {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(event.request, SHELL_CACHE));
});
