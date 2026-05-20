// Kill-switch service worker.
// The legacy `meditracker-v1` SW cached push-notification logic and is being
// removed. This stub installs immediately, clears every cache, unregisters
// itself, and reloads any tabs so the next request goes straight to the
// network. Keep this file for at least one release cycle before deleting it,
// so devices that still have the old SW registered get the cleanup signal.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      await self.clients.claim();
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(clients.map((c) => {
        try {
          const url = new URL(c.url);
          url.searchParams.set('sw-cleanup', Date.now().toString());
          return c.navigate(url.toString());
        } catch {
          return undefined;
        }
      }));
      await self.registration.unregister();
    } catch (e) {
      // best-effort cleanup; never throw
    }
  })());
});

// No fetch handler — let the network handle every request.
