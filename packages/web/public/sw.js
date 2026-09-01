/*
 * Servicearbetare för appskalet.
 *
 * Syftet är att appen ska starta även på en svag uppkoppling, inte att spara
 * data på enheten. Därför gäller en enkel men bestämd regel:
 *
 *   Svar från /api/ cachas aldrig.
 *
 * Boendeuppgifter, ärenden, avier och meddelanden ska inte ligga kvar i
 * webbläsarens cache på en delad eller borttappad telefon (krav C.5.2, C.3.12).
 * Endast programfilerna – HTML, JavaScript, CSS och ikoner – sparas.
 */

const CACHE = 'hemvist-skal-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, '/manifest.webmanifest', '/ikon.svg']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Allt som rör användarens uppgifter går alltid till servern.
  if (url.pathname.startsWith('/api/')) return;

  // Sidnavigering: hämta från nätet, fall tillbaka på skalet när nätet saknas.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(SHELL).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Programfiler: svara från cachen och uppdatera i bakgrunden.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
