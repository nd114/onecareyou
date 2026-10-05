import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/**
 * Step 2: the recorder lives above the router. It survives the encounter
 * dialog unmounting, shows a persistent pill, and rebuilds an interrupted
 * recording from IndexedDB chunks so it can be recovered.
 */

const { liveState } = vi.hoisted(() => ({ liveState: { wav: null as Blob | null, onChunk: null as any } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: { message: "offline" } }) })) },
  },
}));
// The scribe is gated by plan; these tests are about the scribe itself, so the plan includes it.
vi.mock("@/hooks/useEntitlements", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useEntitlements")>()),
  useEntitlements: () => ({ entitlements: { tier: "pro", scribeIncluded: true }, isLoading: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "clinician-1" } }) }));
vi.mock("@/hooks/useLiveScribe", async () => {
  const React = await import("react");
  return {
    useLiveScribe: (opts: any) => {
      liveState.onChunk = opts.onChunk;
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
vi.mock("@/lib/scribe-pipeline", async (orig) => {
  const actual = await orig<typeof import("@/lib/scribe-pipeline")>();
  actual.UPLOAD_BACKOFF_MS.splice(0, actual.UPLOAD_BACKOFF_MS.length);
  return actual;
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

import { ScribeRecorderProvider, useScribeRecorder } from "@/contexts/ScribeRecorderContext";
import { ScribeRecordingPill } from "@/components/clinician/ScribeRecordingPill";
import {
  createMemoryKV,
  setScribeStoreBackend,
  saveSession,
  appendChunk,
  listPending,
  listChunks,
} from "@/lib/scribe-local-store";

function Starter({ label = "go" }: { label?: string }) {
  const s = useScribeRecorder();
  return (
    <button onClick={() => s.start({ encounterId: "enc-1", returnTo: "/clinician/patients/ABC?tab=encounters" }, "soap")}>
      {label}
    </button>
  );
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search + (loc.state ? ":reopen" : "")}</div>;
}

beforeEach(() => {
  setScribeStoreBackend(createMemoryKV());
  liveState.wav = new Blob([new Uint8Array(4096)], { type: "audio/wav" });
});

describe("global scribe recorder", () => {
  it("keeps recording when the component that started it unmounts, and the pill returns to the chart", async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/clinician/patients/ABC?tab=encounters"]}>
        <ScribeRecorderProvider>
          <Routes>
            <Route path="/clinician/patients/:code" element={<Starter />} />
            <Route path="*" element={<div>elsewhere</div>} />
          </Routes>
          <ScribeRecordingPill />
          <Where />
        </ScribeRecorderProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("scribe-pill")).toBeNull();
    fireEvent.click(screen.getByText("go"));
    expect(await screen.findByText(/recording - 00:05/i)).toBeInTheDocument();

    // Simulate a route change: the page (and its starter) unmount.
    rerender(
      <MemoryRouter initialEntries={["/clinician/patients/ABC?tab=encounters"]}>
        <ScribeRecorderProvider>
          <div>other page</div>
          <ScribeRecordingPill />
          <Where />
        </ScribeRecorderProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/recording - 00:05/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /return to the visit/i }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("tab=encounters:reopen"));
  });

  it("asks the browser to confirm leaving while recording", async () => {
    render(
      <MemoryRouter>
        <ScribeRecorderProvider>
          <Starter />
        </ScribeRecorderProvider>
      </MemoryRouter>,
    );
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByText("go"));
    await waitFor(() => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });
  });

  it("writes chunks while recording and clears them once the WAV is saved at Stop", async () => {
    render(
      <MemoryRouter>
        <ScribeRecorderProvider>
          <Starter />
          <ScribeRecordingPill />
        </ScribeRecorderProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("go"));
    await screen.findByText(/recording - 00:05/i);

    // Feed more than the flush interval's worth of samples.
    const realNow = Date.now;
    Date.now = () => realNow() + 5000;
    await act(async () => {
      liveState.onChunk(new Float32Array(16000).fill(0.2), 16000);
      await Promise.resolve();
    });
    Date.now = realNow;
    await waitFor(async () => {
      const sessions = (await import("@/lib/scribe-local-store")).listSessions;
      expect((await sessions("clinician-1")).length).toBe(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    // Upload mock fails, so the WAV stays on this device and the pill offers recovery.
    await screen.findByText(/unsaved recording - recover/i);
    expect((await listPending("clinician-1")).length).toBe(1);
    const sessions = (await import("@/lib/scribe-local-store")).listSessions;
    expect((await sessions("clinician-1")).length).toBe(0);
  });

  it("rebuilds an interrupted recording from chunks and offers to recover it", async () => {
    await saveSession({
      id: "dead-session",
      userId: "clinician-1",
      encounterId: "enc-9",
      sampleRate: 16000,
      startedAt: Date.now() - 600_000,
      transcript: "words heard",
      noteStyle: "soap",
      heartbeatAt: Date.now() - 600_000,
    });
    await appendChunk("dead-session", 0, new Float32Array(16000).fill(0.3));
    await appendChunk("dead-session", 1, new Float32Array(16000).fill(0.3));

    render(
      <MemoryRouter>
        <ScribeRecorderProvider>
          <ScribeRecordingPill />
        </ScribeRecorderProvider>
      </MemoryRouter>,
    );
    await screen.findByText(/unsaved recording - recover/i);
    const pending = await listPending("clinician-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].recovered).toBe(true);
    expect(pending[0].encounterId).toBe("enc-9");
    expect(pending[0].transcript).toBe("words heard");
    expect(await listChunks("dead-session")).toHaveLength(0);

    fireEvent.click(screen.getByText(/unsaved recording - recover/i));
    expect(await screen.findByRole("button", { name: /download audio/i })).toBeInTheDocument();
  });

  it("leaves a session that is still beating alone (another open tab)", async () => {
    await saveSession({
      id: "live-elsewhere",
      userId: "clinician-1",
      encounterId: "enc-2",
      sampleRate: 16000,
      startedAt: Date.now(),
      transcript: "",
      noteStyle: "soap",
      heartbeatAt: Date.now(),
    });
    await appendChunk("live-elsewhere", 0, new Float32Array(16000).fill(0.3));
    render(
      <MemoryRouter>
        <ScribeRecorderProvider>
          <ScribeRecordingPill />
        </ScribeRecorderProvider>
      </MemoryRouter>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await listPending("clinician-1")).toHaveLength(0);
    expect(await listChunks("live-elsewhere")).toHaveLength(1);
  });
});
