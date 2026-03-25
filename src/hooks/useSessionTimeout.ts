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

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    const onActivity = () => {
      // Throttle: only reset if >30s since last reset
      if (Date.now() - lastActivityRef.current > 30000) {
        resetTimer();
      }
    };

    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetTimer]);
}
