import { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { flushQueue, getPendingCount } from '@/lib/offline';
import { toast } from 'sonner';

/**
 * Thin banner shown when the device reports it's offline, or when there are
 * pending writes queued for sync. Mounted in the patient Header.
 *
 * Also surfaces a one-shot success toast when the pending count drops to zero
 * after having been non-zero, so users know their queued offline entries
 * actually synced (helps avoid double-entry).
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pending, setPending] = useState(0);
  const prevPendingRef = useRef(0);
  const announcedRef = useRef(false);

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
      if (!active) return;
      const prev = prevPendingRef.current;
      // Successful drain: pending went from >0 to 0 while we're online.
      if (prev > 0 && c === 0 && navigator.onLine && !announcedRef.current) {
        announcedRef.current = true;
        toast.success('Offline changes synced', {
          description: `${prev} pending change${prev === 1 ? '' : 's'} sent to OneCare.`,
          icon: <CheckCircle2 className="h-4 w-4" />,
        });
        // Reset the latch shortly so future drains also announce.
        setTimeout(() => { announcedRef.current = false; }, 5000);
      }
      prevPendingRef.current = c;
      setPending(c);
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
          <span>You're offline. Vitals, doses, and notes will sync automatically when you reconnect.</span>
        </>
      )}
    </div>
  );
}
