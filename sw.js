const CACHE_NAME = "moneta-shell-v5";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./assets/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (asset) => {
      const response = await fetch(asset, { cache: "reload" });
      if (!response.ok) throw new Error(`App-Datei konnte nicht vorgeladen werden: ${asset}`);
      await cache.put(asset, response);
    }));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" }).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE_NAME)).put(event.request, response.clone());
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./index.html");
      throw new Error(`Offline-Ressource nicht verfügbar: ${event.request.url}`);
    })
  );
});
