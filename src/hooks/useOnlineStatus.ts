import { useEffect, useState } from 'react';

/**
 * Tracks browser online/offline status. Defaults to `true` in non-browser envs.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
