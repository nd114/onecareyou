import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** The memo inbox: status, retry, transcript, assign, make draft note, discard. */

const h = vi.hoisted(() => ({
  memos: [] as any[],
  updates: [] as { patch: any; id: string }[],
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const listQuery: any = {
    select: () => listQuery,
    neq: () => listQuery,
    order: () => listQuery,
    limit: async () => ({ data: h.memos, error: null }),
  };
  return {
    supabase: {
      functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
      rpc: (...a: unknown[]) => h.rpc(...a),
      from: (table: string) => {
        if (table === "clinician_profiles") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { keep_memo_audio: false } }) }) }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        return {
          ...listQuery,
          update: (patch: any) => ({
            eq: async (_c: string, id: string) => {
              h.updates.push({ patch, id });
              return { error: null };
            },
          }),
        };
      },
    },
  };
});
// The scribe is gated by plan; these tests are about the scribe itself, so the plan includes it.
vi.mock("@/hooks/useEntitlements", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useEntitlements")>()),
  useEntitlements: () => ({ entitlements: { tier: "pro", scribeIncluded: true }, isLoading: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "clin-1" } }) }));
vi.mock("@/components/layout/SectionTabs", () => ({ SectionTabs: () => null }));
vi.mock("@/components/clinician/ClinicianHeader", () => ({ ClinicianHeader: () => null }));
vi.mock("@/hooks/useClinicianPatients", () => ({
  useClinicianPatients: () => ({
    patients: [
      { user_id: "pat-1", invite_code: "ABC123", patient_name: "Ada Obi", share_active: true },
      { user_id: "pat-2", invite_code: "ZZZ999", patient_name: "Ended Share", share_active: false },
    ],
  }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
// Radix Select needs pointer APIs jsdom lacks; a native select keeps the flow testable.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select aria-label="Assign to patient" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

import ClinicianVoiceMemos from "@/pages/ClinicianVoiceMemos";

const memo = (over: Record<string, unknown>) => ({
  id: "m-1",
  clinician_user_id: "clin-1",
  practice_id: null,
  patient_user_id: null,
  audio_path: "clin-1/memos/m-1.wav",
  status: "transcribed",
  transcript: "Review bloods next week.",
  draft: null,
  error_code: null,
  duration_ms: 65000,
  transcript_confirmed_at: null,
  created_at: "2026-10-03T10:00:00Z",
  ...over,
});

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

const renderInbox = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/clinician/voice-memos"]}>
        <Routes>
          <Route path="/clinician/voice-memos" element={<ClinicianVoiceMemos />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.memos = [];
  h.updates = [];
  h.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  h.invoke.mockReset().mockResolvedValue({ data: { status: "transcribed" }, error: null });
});

describe("voice memo inbox", () => {
  it("shows an empty state", async () => {
    renderInbox();
    expect(await screen.findByText("No voice memos yet.")).toBeInTheDocument();
  });

  it("shows status and a plain-words reason for a failed memo, and Retry calls the server", async () => {
    h.memos = [memo({ id: "m-f", status: "failed", transcript: null, error_code: "no_speech" })];
    renderInbox();
    const card = await screen.findByTestId("voice-memo");
    expect(within(card).getByText("Failed")).toBeInTheDocument();
    expect(within(card).getByRole("alert")).toHaveTextContent("No speech was heard in this memo.");
    fireEvent.click(within(card).getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("voice-memo-process", { body: { memoId: "m-f" } }));
  });

  it("hides the transcript until asked", async () => {
    h.memos = [memo({})];
    renderInbox();
    await screen.findByTestId("voice-memo");
    expect(screen.queryByText("Review bloods next week.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view transcript/i }));
    expect(screen.getByText("Review bloods next week.")).toBeInTheDocument();
  });

  it("assigns a memo through the RPC and offers only patients with an active share", async () => {
    h.memos = [memo({})];
    renderInbox();
    const select = await screen.findByLabelText("Assign to patient");
    expect(within(select).queryByText("Ended Share")).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "pat-1" } });
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("assign_voice_memo", { _memo_id: "m-1", _patient_user_id: "pat-1" }),
    );
  });

  it("makes a draft note only for an assigned memo, opening the patient's encounters with the memo id", async () => {
    h.memos = [memo({ status: "assigned", patient_user_id: "pat-1" })];
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /make draft note/i }));
    expect(await screen.findByTestId("where")).toHaveTextContent(
      "/clinician/patients/ABC123?tab=encounters&scribe=1&memo=m-1",
    );
  });

  it("offers no draft note for an unassigned memo", async () => {
    h.memos = [memo({})];
    renderInbox();
    await screen.findByTestId("voice-memo");
    expect(screen.queryByRole("button", { name: /make draft note/i })).not.toBeInTheDocument();
  });

  it("keeps a transcript on its own", async () => {
    h.memos = [memo({})];
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: /keep transcript/i }));
    await waitFor(() => expect(h.updates[0]?.id).toBe("m-1"));
    expect(h.updates[0].patch.transcript_confirmed_at).toEqual(expect.any(String));
  });

  it("asks before discarding, then marks the memo discarded", async () => {
    h.memos = [memo({})];
    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(await screen.findByText("Discard this memo?")).toBeInTheDocument();
    expect(h.updates).toHaveLength(0);
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(h.updates).toEqual([{ patch: { status: "discarded" }, id: "m-1" }]));
  });

  it("cannot discard or reassign a filed memo", async () => {
    h.memos = [memo({ status: "filed", patient_user_id: "pat-1" })];
    renderInbox();
    await screen.findByTestId("voice-memo");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assign to patient")).not.toBeInTheDocument();
  });
});
