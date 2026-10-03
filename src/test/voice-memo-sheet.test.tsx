import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Voice memo capture: the bottom sheet, the shared recorder and its IndexedDB
 * persistence, the upload queue and "Recover unsaved memo".
 */

const h = vi.hoisted(() => ({
  wav: null as Blob | null,
  onWindow: null as null | ((b: Blob) => void),
  upload: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    storage: { from: () => ({ upload: (...a: unknown[]) => h.upload(...a), remove: (...a: unknown[]) => h.remove(...a) }) },
    from: () => ({ insert: (...a: unknown[]) => h.insert(...a) }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "clin-1" } }) }));
vi.mock("@/hooks/useLiveScribe", async () => {
  const React = await import("react");
  return {
    useLiveScribe: (opts: any) => {
      h.onWindow = opts.onWindow;
      const [rec, setRec] = React.useState(false);
      return {
        recording: rec,
        paused: false,
        elapsed: 65000,
        level: 0,
        start: async () => {
          setRec(true);
          return true;
        },
        pause: vi.fn(),
        resume: vi.fn(),
        stop: () => {
          setRec(false);
          return h.wav;
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
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

import { ScribeRecorderProvider } from "@/contexts/ScribeRecorderContext";
import {
  VoiceMemoSheetProvider,
  useOptionalVoiceMemoSheet,
  VOICE_MEMO_NOTICE,
} from "@/components/clinician/VoiceMemoSheet";
import { createMemoryKV, listPending, savePending, setScribeStoreBackend } from "@/lib/scribe-local-store";

function Opener() {
  const sheet = useOptionalVoiceMemoSheet();
  return <button onClick={sheet?.openSheet}>open sheet</button>;
}

const renderSheet = () =>
  render(
    <MemoryRouter initialEntries={["/clinician/today"]}>
      <ScribeRecorderProvider>
        <VoiceMemoSheetProvider>
          <Opener />
        </VoiceMemoSheetProvider>
      </ScribeRecorderProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  setScribeStoreBackend(createMemoryKV());
  h.wav = new Blob([new Uint8Array(4096)], { type: "audio/wav" });
  h.upload.mockReset().mockResolvedValue({ error: null });
  h.insert.mockReset().mockResolvedValue({ error: null });
  h.remove.mockReset().mockResolvedValue({ error: null });
  h.invoke.mockReset().mockResolvedValue({ data: { status: "transcribed" }, error: null });
});

describe("voice memo sheet", () => {
  it("says what it is for and offers Record visit for patient conversations", async () => {
    renderSheet();
    fireEvent.click(screen.getByText("open sheet"));
    expect(await screen.findByText(VOICE_MEMO_NOTICE)).toBeInTheDocument();
    expect(VOICE_MEMO_NOTICE).toBe(
      "Dictate your own notes. Do not record the patient. For a conversation with a patient use Record visit.",
    );
    expect(screen.getByRole("link", { name: "Record visit" })).toHaveAttribute("href", "/clinician/scribe");
    expect(screen.getByRole("link", { name: /memo inbox/i })).toHaveAttribute("href", "/clinician/voice-memos");
  });

  it("records, uploads to the memo path, creates the row and asks the server to process it", async () => {
    renderSheet();
    fireEvent.click(screen.getByText("open sheet"));
    fireEvent.click(await screen.findByRole("button", { name: /record memo/i }));
    const stop = await screen.findByRole("button", { name: /stop and save/i });

    // Live words are never sent for a memo.
    h.onWindow?.(new Blob([new Uint8Array(10)]));
    expect(h.invoke).not.toHaveBeenCalledWith("transcribe-segment", expect.anything());

    fireEvent.click(stop);
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("voice-memo-process", { body: { memoId: expect.any(String) } }));

    const path = h.upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^clin-1\/memos\/[0-9a-f-]{36}\.wav$/);
    const row = h.insert.mock.calls[0][0];
    expect(row).toMatchObject({ clinician_user_id: "clin-1", audio_path: path });
    expect(path).toContain(row.id);
    // Safely on the server: nothing left waiting on this device.
    await waitFor(async () => expect(await listPending("clin-1")).toHaveLength(0));
  });

  it("keeps the audio on this device when the upload fails, then recovers it", async () => {
    h.upload.mockResolvedValue({ error: { message: "offline" } });
    renderSheet();
    fireEvent.click(screen.getByText("open sheet"));
    fireEvent.click(await screen.findByRole("button", { name: /record memo/i }));
    fireEvent.click(await screen.findByRole("button", { name: /stop and save/i }));

    expect(await screen.findByText(/recover unsaved memo/i)).toBeInTheDocument();
    const kept = await listPending("clin-1");
    expect(kept).toHaveLength(1);
    expect(kept[0].kind).toBe("memo");
    expect(h.insert).not.toHaveBeenCalled();

    // Back online: one tap and it goes through, once.
    h.upload.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: /upload now/i }));
    await waitFor(async () => expect(await listPending("clin-1")).toHaveLength(0));
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("voice-memo-process", { body: { memoId: kept[0].id } });
  });

  it("offers a memo rebuilt after a reload and uploads it when the browser comes back online", async () => {
    await savePending({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "clin-1",
      encounterId: "",
      blob: new Blob([new Uint8Array(4096)], { type: "audio/wav" }),
      transcript: "",
      noteStyle: "soap",
      createdAt: Date.now(),
      recovered: true,
      kind: "memo",
    });
    renderSheet();
    fireEvent.click(screen.getByText("open sheet"));
    expect(await screen.findByText(/recover unsaved memo/i)).toBeInTheDocument();

    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(h.insert).toHaveBeenCalledTimes(1));
    expect(h.insert.mock.calls[0][0].id).toBe("11111111-1111-4111-8111-111111111111");
    await waitFor(async () => expect(await listPending("clin-1")).toHaveLength(0));
  });

  it("treats a duplicate row as success so a retry never makes a second memo", async () => {
    h.insert.mockResolvedValue({ error: { code: "23505" } });
    await savePending({
      id: "22222222-2222-4222-8222-222222222222",
      userId: "clin-1",
      encounterId: "",
      blob: new Blob([new Uint8Array(4096)], { type: "audio/wav" }),
      transcript: "",
      noteStyle: "soap",
      createdAt: Date.now(),
      kind: "memo",
    });
    renderSheet();
    fireEvent.click(screen.getByText("open sheet"));
    fireEvent.click(await screen.findByRole("button", { name: /upload now/i }));
    await waitFor(async () => expect(await listPending("clin-1")).toHaveLength(0));
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("removes the uploaded audio if the memo row cannot be created", async () => {
    h.insert.mockResolvedValue({ error: { code: "42501" } });
    await savePending({
      id: "33333333-3333-4333-8333-333333333333",
      userId: "clin-1",
      encounterId: "",
      blob: new Blob([new Uint8Array(4096)], { type: "audio/wav" }),
      transcript: "",
      noteStyle: "soap",
      createdAt: Date.now(),
      kind: "memo",
    });
    renderSheet();
    fireEvent.click(screen.getByText("open sheet"));
    fireEvent.click(await screen.findByRole("button", { name: /upload now/i }));
    await waitFor(() => expect(h.remove).toHaveBeenCalledWith([expect.stringMatching(/memos\/3333/)]));
    expect(await listPending("clin-1")).toHaveLength(1);
  });
});
