const CACHE = "pixelsnack-shell-v3";
const CORE = ["/", "/manifest.webmanifest", "/logo.png", "/logo-192.png", "/image-worker.js"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch("/", { cache: "reload" });
    await cache.put("/", response.clone());
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/[^"?#]+)"/g)].map((match) => match[1]);
    await cache.addAll([...new Set([...CORE.slice(1), ...assets])]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      return (await cache.match(event.request)) || (event.request.mode === "navigate" ? await cache.match("/") : Response.error());
    }
  })());
});
