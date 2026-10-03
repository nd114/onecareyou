import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

function mockLock() {
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ release });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { release, request };
}

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe('useScreenWakeLock', () => {
  it('acquires while active and releases on stop', async () => {
    const { request, release } = mockLock();
    const { rerender } = renderHook(({ a }) => useScreenWakeLock(a), { initialProps: { a: true } });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    rerender({ a: false });
    expect(release).toHaveBeenCalled();
  });

  it('does nothing when inactive', async () => {
    const { request } = mockLock();
    renderHook(() => useScreenWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('re-acquires on visibilitychange after the lock was released', async () => {
    const { request } = mockLock();
    let released: (() => void) | undefined;
    request.mockResolvedValue({
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: (_: string, cb: () => void) => {
        released = cb;
      },
    });
    renderHook(() => useScreenWakeLock(true));
    await flush();
    released?.();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('is a silent no-op when unsupported or rejected', async () => {
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow();
    const { request } = mockLock();
    request.mockRejectedValue(new Error('NotAllowed'));
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow();
    await flush();
  });
});
