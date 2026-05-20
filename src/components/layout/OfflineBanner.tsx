import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { flushQueue, getPendingCount } from '@/lib/offline';

/**
 * Thin banner shown when the device reports it's offline, or when there are
 * pending writes queued for sync. Mounted in the patient Header.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const c = await getPendingCount();
      if (active) setPending(c);
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [online]);

  if (online && pending === 0) return null;

  return (
    <div
      role="status"
      className={`w-full text-xs px-4 py-1.5 flex items-center justify-center gap-2 ${
        online
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {online ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Syncing {pending} pending change{pending === 1 ? '' : 's'}…</span>
          <button
            type="button"
            className="underline ml-1"
            onClick={() => void flushQueue()}
          >
            Retry now
          </button>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>You're offline. New entries will sync automatically when you reconnect.</span>
        </>
      )}
    </div>
  );
}
