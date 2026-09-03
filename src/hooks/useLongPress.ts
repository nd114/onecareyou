import { useCallback, useRef } from "react";

/**
 * Long-press, for touch screens that have no right-click.
 *
 * A context menu is the desktop idiom and there is no touch equivalent, so the
 * same action needs both doors. Cancels on movement, because a press that turns
 * into a scroll is a scroll — firing a menu on it is how a list becomes
 * unusable on a phone.
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      fired.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    [onLongPress, ms],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.touches[0];
      // Ten pixels of drift is a scroll, not a press.
      if (Math.abs(t.clientX - start.current.x) > 10 || Math.abs(t.clientY - start.current.y) > 10) {
        clear();
      }
    },
    [clear],
  );

  /** True when the last touch was a long press, so a tap handler can stand down. */
  const consumed = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd: clear, onTouchCancel: clear, consumed };
}
