// No-op shim. The legacy service worker has been retired (see public/sw.js
// for the inert kill-switch). Pages that still import this hook continue to
// compile but do nothing — preventing any re-registration that could trigger
// stale-tab reloads or navigation glitches.

import { useCallback } from 'react';

export function useServiceWorker() {
  const scheduleNotification = useCallback(
    async (
      _title: string,
      _body: string,
      _scheduledTime: Date,
      _tag: string,
      _data?: Record<string, unknown>,
    ): Promise<boolean> => false,
    [],
  );

  const cancelNotification = useCallback((_tag: string) => undefined, []);

  const showNotification = useCallback(
    async (_title: string, _options?: NotificationOptions): Promise<boolean> => false,
    [],
  );

  return {
    isSupported: false,
    isRegistered: false,
    registration: null as ServiceWorkerRegistration | null,
    error: null as Error | null,
    scheduleNotification,
    cancelNotification,
    showNotification,
  };
}
