import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

/**
 * The bug this exists to stop: a recording that ends because it ran out of
 * time used to be built and then dropped. `onstop` handed the blob to
 * `stopResolverRef`, which is only ever set by `stop()` — and the cap did not
 * call `stop()`. The UI reset as though nothing had happened, so a clinician
 * who dictated past the limit lost the lot with no error.
 */

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = 'audio/webm';
  stream = { getTracks: () => [{ stop: () => {} }] };

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
  static isTypeSupported() {
    return true;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('when the clock ends the recording', () => {
  it('hands the recording over instead of dropping it', async () => {
    const onLimitReached = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecorder({ maxDurationMs: 1000, onLimitReached }),
    );

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRecording).toBe(true);

    // Past the cap: the ticker runs every 200ms.
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });

    expect(onLimitReached).toHaveBeenCalledTimes(1);
    const blob = onLimitReached.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('says the limit is why it stopped, so the caller can tell the person', async () => {
    const { result } = renderHook(() => useVoiceRecorder({ maxDurationMs: 1000 }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.hitLimit).toBe(true);
  });

  it('does not claim the limit when the person stopped it themselves', async () => {
    const onLimitReached = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecorder({ maxDurationMs: 60_000, onLimitReached }),
    );

    await act(async () => {
      await result.current.start();
    });

    let blob: Blob | null = null;
    await act(async () => {
      blob = await result.current.stop();
    });

    expect(blob).toBeInstanceOf(Blob);
    // The person's own stop resolves the promise; the limit handler is for the
    // recordings nobody asked to end.
    expect(onLimitReached).not.toHaveBeenCalled();
    expect(result.current.hitLimit).toBe(false);
  });

  it('clears the limit flag when a new recording starts', async () => {
    const { result } = renderHook(() => useVoiceRecorder({ maxDurationMs: 1000 }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current.hitLimit).toBe(true);

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.hitLimit).toBe(false);
  });
});
