import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The assistant's audit trail.
 *
 * `patient_action_log.actor_user_id` is NOT NULL and the read policy keys off
 * it, so an entry without one is rejected and would be invisible to the
 * clinician who caused it. It was missing, and the failure was swallowed, so
 * every assistant action went unlogged while looking exactly like one that had
 * been logged. These assert the actor is supplied on every path.
 */

const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => ({
    insert: (row: Record<string, unknown>) => {
      inserted.push({ table, row });
      const result = { data: [{ id: "new-row" }], error: null };
      return {
        ...result,
        select: () => ({ single: async () => ({ data: { id: "new-row" }, error: null }) }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
    },
    select: () => ({
      eq: () => ({
        eq: () => ({ or: () => ({ limit: async () => ({ data: [{ id: "share-1" }], error: null }) }) }),
      }),
    }),
  });
  return { supabase: { from: (table: string) => builder(table) } };
});

const { executeClinicianAction } = await import("@/lib/clinician-ai-actions");

const CLINICIAN = { id: "clinician-abc", email: "jane.evans@example.com" };
const PATIENT = "patient-xyz";

function logRows() {
  return inserted.filter((i) => i.table === "patient_action_log").map((i) => i.row);
}

describe("the assistant's action log", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("records the clinician as the actor when a message is sent", async () => {
    await executeClinicianAction(
      { id: "a1", type: "send_message", params: { patient_user_id: PATIENT, body: "Please book a review." } },
      CLINICIAN,
    );
    const rows = logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(CLINICIAN.id);
    expect(rows[0].patient_user_id).toBe(PATIENT);
  });

  it("never writes a log entry without an actor", async () => {
    await executeClinicianAction(
      { id: "a2", type: "create_guidance", params: { patient_user_id: PATIENT, title: "Diet", instruction: "Less salt." } },
      CLINICIAN,
    );
    await executeClinicianAction(
      {
        id: "a3",
        type: "set_alert_rule",
        params: {
          patient_user_id: PATIENT,
          vital_type: "blood_pressure",
          condition: "above",
          threshold_value: 140,
        },
      },
      CLINICIAN,
    );

    const rows = logRows();
    // Name the actions rather than counting, so a case that quietly stops
    // reaching its branch fails here instead of passing on the others.
    expect(rows.map((r) => r.action)).toEqual(["guidance_sent", "alert_rule_created"]);
    for (const row of rows) {
      expect(row.actor_user_id, `a ${row.action} entry had no actor`).toBe(CLINICIAN.id);
    }
  });

  it("marks entries as coming from the assistant, not typed by hand", async () => {
    await executeClinicianAction(
      { id: "a4", type: "send_message", params: { patient_user_id: PATIENT, body: "Hello." } },
      CLINICIAN,
    );
    expect(logRows()[0].metadata).toEqual({ source: "clinician_assistant", approved: true });
  });
});
