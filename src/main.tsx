import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./lib/i18n";
import { startQueueWorker } from "./lib/offline";

// Kick off the offline write-queue worker (no-op outside the browser).
startQueueWorker();

// Unregister any previously-installed service worker. The kill-switch SW at
// /sw.js handles devices that still have the legacy worker registered.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => {
      // Only unregister if it was the legacy SW (scope at /). The kill-switch
      // SW unregisters itself on activate; this is belt-and-suspenders.
      r.unregister().catch(() => {});
    });
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
