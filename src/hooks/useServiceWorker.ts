// No-op shim. The legacy service worker has been retired (see public/sw.js
// for the inert kill-switch). Pages that still import this hook continue to
// compile but do nothing — preventing any re-registration that could trigger
// stale-tab reloads or navigation glitches.

import { useCallback } from 'react';

export function useServiceWorker() {
  const noop = useCallback(async () => false, []);
  const cancel = useCallback(() => undefined, []);

  return {
    isSupported: false,
    isRegistered: false,
    registration: null as ServiceWorkerRegistration | null,
    error: null as Error | null,
    scheduleNotification: noop,
    cancelNotification: cancel,
    showNotification: noop,
  };
}
