// Minimal pass-through Service Worker so Chrome/Android/Desktop offers native PWA installation
// while keeping all API routes and database calls strictly live on the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return;
  }
  event.respondWith(fetch(event.request));
});
