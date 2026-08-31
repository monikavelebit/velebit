const CACHE_NAME = "velebit-console-v2";
const PRECACHE_URLS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for everything so you always get the latest data/build.
  // cache: "no-store" bypasses the browser's own HTTP cache too, not just
  // this service worker's cache — important for PWA app shortcuts, which
  // can otherwise keep showing an old build even after a fresh deploy.
  // Falls back to the service worker cache only if genuinely offline.
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request))
  );
});
