import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * ADV-34: the ambient scribe could enable the microphone with a click and
 * nothing else — a line of copy telling the clinician to get consent first
 * is not the same as the product requiring it. This asserts recording
 * cannot start before an explicit confirmation, and that confirming writes
 * it against the encounter rather than only a client-side flag.
 */

const { updateMock, fromMock, startMock } = vi.hoisted(() => {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const fromMock = vi.fn(() => ({ update: updateMock }));
  const startMock = vi.fn();
  return { updateMock, fromMock, startMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn(() => ({ upload: vi.fn() })) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "clinician-1" } }),
}));

vi.mock("@/hooks/useLiveScribe", () => ({
  useLiveScribe: () => ({
    recording: false,
    paused: false,
    elapsed: 0,
    level: 0,
    start: startMock,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
  }),
}));

import { EncounterScribePanel } from "@/components/clinician/EncounterScribePanel";
import type { Encounter } from "@/hooks/useEncounters";

const baseEncounter: Encounter = {
  id: "enc-1",
  patient_user_id: "patient-1",
  clinician_user_id: "clinician-1",
  practice_id: null,
  visit_type: "follow_up",
  status: "in_progress",
  occurred_at: new Date().toISOString(),
  chief_complaint: null,
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  cpt_codes: [],
  icd_codes: [],
  follow_up_in_days: null,
  follow_up_task_id: null,
  signed_at: null,
  scribe_transcript: null,
  scribe_draft: null,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as Encounter;

describe("EncounterScribePanel recording consent", () => {
  beforeEach(() => {
    startMock.mockClear();
    fromMock.mockClear();
    updateMock.mockClear();
  });

  it("does not start recording on the first click — it asks for consent instead", () => {
    render(<EncounterScribePanel encounter={baseEncounter} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /record visit/i }));

    expect(startMock).not.toHaveBeenCalled();
    expect(screen.getByText(/tell the patient first/i)).toBeInTheDocument();
  });

  it("starts recording and records consent on the encounter once confirmed", async () => {
    render(<EncounterScribePanel encounter={baseEncounter} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /record visit/i }));
    fireEvent.click(screen.getByRole("button", { name: /they've agreed/i }));

    await waitFor(() => expect(startMock).toHaveBeenCalled());
    expect(fromMock).toHaveBeenCalledWith("encounters");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          recording_consent_confirmed_by: "clinician-1",
        }),
      }),
    );
  });

  it("does not ask again within the same encounter once consent is already on the row", () => {
    const alreadyConfirmed = {
      ...baseEncounter,
      metadata: { recording_consent_confirmed_at: new Date().toISOString() },
    } as unknown as Encounter;
    render(<EncounterScribePanel encounter={alreadyConfirmed} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /record visit/i }));

    expect(startMock).toHaveBeenCalled();
    expect(screen.queryByText(/tell the patient first/i)).not.toBeInTheDocument();
  });
});
