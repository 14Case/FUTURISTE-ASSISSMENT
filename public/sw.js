/**
 * Service Worker — FUTURISTE ASSESSMENT (PWA Terrain)
 *
 * Stratégie de cache contrôlée :
 * - Pré-cache les ressources d'identité visuelle et le manifeste.
 * - Cache-first pour les bundles statiques immuables (/_next/static/*).
 * - Network-first avec repli vers le cache pour les pages HTML / navigations
 *   afin que l'interface terrain (/terrain, /synchronisation, /tableau-de-bord)
 *   reste accessible même après rechargement hors connexion.
 * - AUCUNE mise en cache des routes /api/* dans le Cache Storage (les données
 *   métier sont gérées de façon contrôlée et chiffrée par session dans IndexedDB).
 */

const CACHE_STATIC = "fafc-static-v1";
const CACHE_PAGES = "fafc-pages-v1";

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/brand/logo.svg",
  "/brand/icon-192.svg",
  "/brand/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
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
            .filter((k) => k !== CACHE_STATIC && k !== CACHE_PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ne jamais mettre en cache les appels API ou Auth dans le Service Worker
  if (url.pathname.startsWith("/api/")) return;

  // Bundles immuables Next.js & ressources marque : Cache-First
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_STATIC).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Navigations & payloads RSC : Network-First avec repli hors ligne
  if (
    request.mode === "navigate" ||
    request.headers.get("RSC") === "1"
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_PAGES).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === "navigate") {
            const fallback = await caches.match("/terrain");
            if (fallback) return fallback;
          }
          return new Response(
            "Mode hors ligne : cette page n'a pas encore été préchargée sur cet appareil. Ouvrez /terrain lorsque vous êtes connecté pour préparer la saisie terrain.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          );
        }),
    );
  }
});
