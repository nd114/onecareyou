import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, signOut }) }));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

import { useSessionTimeout } from '@/hooks/useSessionTimeout';

const MIN = 60_000;
beforeEach(() => {
  vi.useFakeTimers();
  signOut.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('useSessionTimeout', () => {
  it('logs out after 30 minutes with no activity', () => {
    renderHook(() => useSessionTimeout());
    vi.advanceTimersByTime(30 * MIN + 10);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('typing in an editor (input event, non-bubbling) resets the timer', () => {
    renderHook(() => useSessionTimeout());
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(20 * MIN);
      ta.dispatchEvent(new Event('input'));
    }
    expect(signOut).not.toHaveBeenCalled();
    vi.advanceTimersByTime(31 * MIN);
    expect(signOut).toHaveBeenCalledTimes(1);
    ta.remove();
  });

  it('keydown whose handler stops propagation still counts', () => {
    renderHook(() => useSessionTimeout());
    const el = document.createElement('div');
    el.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    vi.advanceTimersByTime(25 * MIN);
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    vi.advanceTimersByTime(25 * MIN);
    expect(signOut).not.toHaveBeenCalled();
    el.remove();
  });
});
