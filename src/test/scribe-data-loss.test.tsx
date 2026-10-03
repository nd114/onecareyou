import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook } from "@testing-library/react";

/**
 * Step 1 of the scribe reachability plan: a visit must survive a failed upload.
 * The WAV and live transcript are written locally before upload, retried, can
 * be downloaded, and are removed only after the server confirms a draft.
 */

const { uploadMock, invokeMock, liveState, downloadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  invokeMock: vi.fn(),
  liveState: { wav: null as Blob | null },
  downloadMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })),
    functions: { invoke: invokeMock },
    storage: { from: vi.fn(() => ({ upload: uploadMock })) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "clinician-1" } }) }));
vi.mock("@/hooks/useLiveScribe", async () => {
  const React = await import("react");
  return {
    useLiveScribe: () => {
      const [rec, setRec] = React.useState(false);
      return {
        recording: rec,
        paused: false,
        elapsed: 5000,
        level: 0,
        start: async () => {
          setRec(true);
          return true;
        },
        pause: vi.fn(),
        resume: vi.fn(),
        stop: () => {
          setRec(false);
          return liveState.wav;
        },
      };
    },
  };
});
vi.mock("@/lib/edge-function-error", () => ({ edgeFunctionError: async (e: Error) => e }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/lib/scribe-local-store", async (orig) => {
  const actual = await orig<typeof import("@/lib/scribe-local-store")>();
  return { ...actual, downloadBlob: downloadMock };
});

import { ScribeRecorderProvider } from "@/contexts/ScribeRecorderContext";
import { EncounterScribePanel } from "@/components/clinician/EncounterScribePanel";
import { UPLOAD_BACKOFF_MS } from "@/lib/scribe-pipeline";
import { createMemoryKV, setScribeStoreBackend, listPending } from "@/lib/scribe-local-store";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import type { Encounter } from "@/hooks/useEncounters";

const encounter = {
  id: "enc-1",
  patient_user_id: "p1",
  metadata: { recording_consent_confirmed_at: "2026-01-01" },
} as unknown as Encounter;

async function startAndStop() {
  render(
    <ScribeRecorderProvider>
      <EncounterScribePanel encounter={encounter} onApply={vi.fn()} />
    </ScribeRecorderProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /record visit/i }));
  fireEvent.click(await screen.findByRole("button", { name: /stop/i }));
}

beforeEach(() => {
  setScribeStoreBackend(createMemoryKV());
  UPLOAD_BACKOFF_MS.splice(0, UPLOAD_BACKOFF_MS.length); // no waiting in tests
  uploadMock.mockReset();
  invokeMock.mockReset();
  downloadMock.mockReset();
  liveState.wav = new Blob([new Uint8Array(4096)], { type: "audio/wav" });
});

describe("scribe stop -> upload", () => {
  it("keeps the recording locally and offers retry + download when upload fails", async () => {
    uploadMock.mockResolvedValue({ error: { message: "network down" } });
    await startAndStop();

    await screen.findByText(/saved on this device/i);
    expect(invokeMock).not.toHaveBeenCalled();
    expect((await listPending("clinician-1")).length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /download audio/i }));
    expect(downloadMock).toHaveBeenCalledTimes(1);

    // Retry succeeds: draft arrives and the local copy is cleared.
    uploadMock.mockResolvedValue({ error: null });
    invokeMock.mockResolvedValue({ data: { transcript: "hello", draft: { subjective: "s" } }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(async () => expect((await listPending("clinician-1")).length).toBe(0));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("reuses one requestId across retries and sends the duration", async () => {
    uploadMock.mockResolvedValue({ error: null });
    invokeMock.mockResolvedValue({ data: { error: "gateway busy" }, error: null });
    await startAndStop();
    await screen.findByText(/saved on this device/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const [a, b] = invokeMock.mock.calls.map((c) => c[1].body);
    expect(a.requestId).toBeTruthy();
    expect(a.requestId).toBe(b.requestId);
    expect(a.durationSeconds).toBe(5);
  });

  it("keeps the local copy when drafting fails after a good upload", async () => {
    uploadMock.mockResolvedValue({ error: null });
    invokeMock.mockResolvedValue({ data: { error: "gateway busy" }, error: null });
    await startAndStop();
    await screen.findByText(/saved on this device/i);
    expect((await listPending("clinician-1")).length).toBe(1);
  });

  it("clears the local copy only after a confirmed draft", async () => {
    uploadMock.mockResolvedValue({ error: null });
    invokeMock.mockResolvedValue({ data: { transcript: "t", draft: { subjective: "s" } }, error: null });
    await startAndStop();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(async () => expect((await listPending("clinician-1")).length).toBe(0));
  });

  it("retries the upload automatically before giving up", async () => {
    UPLOAD_BACKOFF_MS.push(0, 0);
    uploadMock
      .mockResolvedValueOnce({ error: { message: "x" } })
      .mockResolvedValueOnce({ error: { message: "x" } })
      .mockResolvedValueOnce({ error: null });
    invokeMock.mockResolvedValue({ data: { transcript: "t", draft: {} }, error: null });
    await startAndStop();
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(uploadMock).toHaveBeenCalledTimes(3);
  });
});

describe("useBeforeUnloadGuard", () => {
  it("blocks unload only while active", () => {
    const { rerender } = renderHook(({ on }) => useBeforeUnloadGuard(on), { initialProps: { on: true } });
    const during = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    rerender({ on: false });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
