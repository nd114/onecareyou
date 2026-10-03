import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
}

/**
 * Keeps the screen awake while `active` is true, so a phone or tablet does not
 * sleep and interrupt a consultation recording. The browser drops the lock
 * whenever the tab is hidden, so it is re-requested on return. Where the API
 * is missing (iOS before 16.4, older browsers) or refuses, this does nothing
 * and never throws.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const wl = (navigator as unknown as {
      wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> };
    }).wakeLock;
    if (!wl || typeof wl.request !== 'function') return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (cancelled || sentinel) return;
        const s = await wl.request('screen');
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* unsupported, denied, or low battery: silent */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const s = sentinel;
      sentinel = null;
      try {
        s?.release().catch(() => {});
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}
