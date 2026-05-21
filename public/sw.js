// Inert kill-switch service worker.
//
// The legacy `meditracker-v1` SW cached push-notification logic and HTML.
// This stub no longer claims clients or navigates them — it just installs,
// clears caches, and unregisters itself silently. Existing devices get
// cleaned up the next time the SW loads; nothing in the app should be
// re-registering this file (see useServiceWorker hook, which is a no-op).

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.registration.unregister();
    } catch (e) {
      // best-effort cleanup; never throw
    }
  })());
});

// No fetch handler — let the network handle every request.
// No clients.claim() — do not steal control of open tabs.
// No clients.navigate() — do not reload anyone.
