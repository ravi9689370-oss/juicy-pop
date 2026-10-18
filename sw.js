// sw.js — custom cache-first shell for zero-network offline play.
const CACHE_NAME = "juicy-pop-v1";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/audio.js",
  "js/particles.js",
  "js/fruits.js",
  "js/physics.js",
  "js/game.js",
  "manifest.json",
  "assets/icon-192.png",
  "assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return resp;
        }).catch(() => cached)
      );
    })
  );
});
