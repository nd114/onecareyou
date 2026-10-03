import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // Warn 2 min before

export function useSessionTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { user, signOut } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    if (!user) return;

    // Warning toast
    warningRef.current = setTimeout(() => {
      toast.warning('Your session will expire in 2 minutes due to inactivity', {
        duration: 10000,
        action: {
          label: 'Stay Signed In',
          onClick: () => resetTimer(),
        },
      });
    }, timeoutMs - WARNING_BEFORE_MS);

    // Actual timeout
    timerRef.current = setTimeout(async () => {
      toast.error('Session expired due to inactivity');
      await signOut();
    }, timeoutMs);
  }, [user, signOut, timeoutMs]);

  useEffect(() => {
    if (!user) return;

    const events = [
      'keydown', 'input', 'change', 'pointerdown', 'pointermove', 'mousedown',
      'mousemove', 'touchstart', 'touchmove', 'scroll', 'wheel',
    ] as const;
    const onActivity = () => {
      // Throttle: only reset if >5s since last reset
      if (Date.now() - lastActivityRef.current > 5000) {
        resetTimer();
      }
    };

    const opts = { passive: true, capture: true } as const;
    events.forEach(e => document.addEventListener(e, onActivity, opts));
    resetTimer();

    return () => {
      events.forEach(e => document.removeEventListener(e, onActivity, true));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetTimer]);
}
