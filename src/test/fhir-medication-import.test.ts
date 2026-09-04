import { describe, expect, it } from "vitest";

import {
  MEDICATION_STATUSES,
  defaultTimesFor,
  medicationRowFromFhir,
  type FhirMedicationRequest,
} from "../../supabase/functions/_shared/fhir-medication";
import { MEDICATION_FREQUENCIES } from "@/types/health";

/**
 * The mapper lives under supabase/functions so the sync function can use it,
 * and imports nothing so this suite can too. If that ever stops being true,
 * this file stops compiling — which is the point.
 */
const context = {
  userId: "user-1",
  sourceLabel: "City General",
  connectionId: "conn-1",
  now: new Date("2026-10-01T09:00:00Z"),
};

function request(overrides: Partial<FhirMedicationRequest> = {}): FhirMedicationRequest {
  return {
    resourceType: "MedicationRequest",
    id: "mr-1",
    status: "active",
    intent: "order",
    authoredOn: "2026-09-20T08:30:00Z",
    medicationCodeableConcept: { text: "Amlodipine 5mg tablet" },
    dosageInstruction: [
      {
        timing: { repeat: { frequency: 1, period: 1, periodUnit: "d", timeOfDay: ["08:00:00"] } },
        doseAndRate: [{ doseQuantity: { value: 5, unit: "mg" } }],
      },
    ],
    ...overrides,
  };
}

describe("importing a prescription", () => {
  it("maps the parts a patient reads", () => {
    const { row, rejected } = medicationRowFromFhir(request(), context);
    expect(rejected).toBeUndefined();
    expect(row).toMatchObject({
      user_id: "user-1",
      name: "Amlodipine 5mg tablet",
      dosage: "5 mg",
      frequency: "once_daily",
      times_of_day: ["08:00"],
      type: "prescription",
      is_active: true,
      start_date: "2026-09-20",
    });
  });

  it("stamps provenance on every row", () => {
    // Without this the imported row and one the patient typed are the same
    // thing, and a bad import can never be unwound.
    const { row } = medicationRowFromFhir(request(), context);
    expect(row?.source).toBe("City General");
    expect(row?.external_id).toBe("mr-1");
    expect(row?.ehr_connection_id).toBe("conn-1");
  });

  it("never marks an imported row as the patient's own", () => {
    const { row } = medicationRowFromFhir(request(), { ...context, sourceLabel: "City General" });
    expect(row?.source).not.toBe("manual");
  });

  it("trims FHIR's mandatory seconds off the times", () => {
    // FHIR's `time` primitive requires seconds; the app stores HH:mm.
    const { row } = medicationRowFromFhir(
      request({
        dosageInstruction: [
          {
            timing: { repeat: { frequency: 2, period: 1, periodUnit: "d", timeOfDay: ["08:00:00", "20:00:00"] } },
            doseAndRate: [{ doseQuantity: { value: 5, unit: "mg" } }],
          },
        ],
      }),
      context,
    );
    expect(row?.times_of_day).toEqual(["08:00", "20:00"]);
    expect(row?.frequency).toBe("twice_daily");
  });
});

describe("what it refuses", () => {
  it("refuses a prescription with no readable name", () => {
    // A row called "unknown" is worse than a row missing: the patient cannot
    // tell it is wrong.
    const { row, rejected } = medicationRowFromFhir(
      request({ medicationCodeableConcept: { coding: [{ system: "http://snomed.info/sct", code: "108537001" }] } }),
      context,
    );
    expect(row).toBeUndefined();
    expect(rejected).toMatch(/no readable name/i);
  });

  it("refuses one with no dose at all", () => {
    const { row, rejected } = medicationRowFromFhir(
      request({ dosageInstruction: [{ timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } } }] }),
      context,
    );
    expect(row).toBeUndefined();
    expect(rejected).toMatch(/no dose/i);
  });

  it("refuses a retraction", () => {
    for (const status of ["entered-in-error", "draft", "unknown"]) {
      const { row, rejected } = medicationRowFromFhir(request({ status }), context);
      expect(row).toBeUndefined();
      expect(rejected).toContain(status);
    }
  });

  it("refuses a proposal, which is not an order", () => {
    // Importing one would tell a patient they were prescribed something that
    // was only being considered.
    const { row, rejected } = medicationRowFromFhir(request({ intent: "proposal" }), context);
    expect(row).toBeUndefined();
    expect(rejected).toMatch(/not an order/i);
  });

  it("refuses a resource that is not a MedicationRequest", () => {
    const { rejected } = medicationRowFromFhir(
      request({ resourceType: "MedicationStatement" }),
      context,
    );
    expect(rejected).toMatch(/MedicationStatement/);
  });
});

describe("what it warns about", () => {
  it("says when the name came from a code rather than text", () => {
    const { row, warnings } = medicationRowFromFhir(
      request({ medicationCodeableConcept: { coding: [{ code: "108537001", display: "Amlodipine" }] } }),
      context,
    );
    expect(row?.name).toBe("Amlodipine");
    expect(warnings.join(" ")).toMatch(/display text/i);
  });

  it("says when it dropped extra dosage instructions", () => {
    const base = request();
    const { warnings } = medicationRowFromFhir(
      { ...base, dosageInstruction: [base.dosageInstruction![0], base.dosageInstruction![0]] },
      context,
    );
    expect(warnings.join(" ")).toMatch(/first of 2/i);
  });

  it("does not present a schedule it could not map as if it were exact", () => {
    // "3 every 5 days" has no home in our vocabulary. Rounding it to something
    // that does would have the patient dosing on a schedule nobody wrote.
    const { row, warnings } = medicationRowFromFhir(
      request({
        dosageInstruction: [
          {
            timing: { repeat: { frequency: 3, period: 5, periodUnit: "d" } },
            doseAndRate: [{ doseQuantity: { value: 5, unit: "mg" } }],
          },
        ],
      }),
      context,
    );
    expect(row?.frequency).toBe("as_needed");
    expect(warnings.join(" ")).toMatch(/3 every 5 d/);
  });

  it("says when no schedule was sent at all", () => {
    const { row, warnings } = medicationRowFromFhir(
      request({ dosageInstruction: [{ doseAndRate: [{ doseQuantity: { value: 5, unit: "mg" } }] }] }),
      context,
    );
    expect(row?.frequency).toBe("as_needed");
    expect(warnings.join(" ")).toMatch(/no schedule/i);
  });
});

describe("doses that are not a single number", () => {
  it("keeps a range as a range", () => {
    const { row } = medicationRowFromFhir(
      request({
        dosageInstruction: [
          {
            timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } },
            doseAndRate: [{ doseRange: { low: { value: 5, unit: "mg" }, high: { value: 10, unit: "mg" } } }],
          },
        ],
      }),
      context,
    );
    expect(row?.dosage).toBe("5–10 mg");
  });

  it("falls back to the free text plenty of real systems send", () => {
    const { row } = medicationRowFromFhir(
      request({ dosageInstruction: [{ text: "one tablet at night" }] }),
      context,
    );
    expect(row?.dosage).toBe("one tablet at night");
  });
});

describe("hourly and periodic schedules", () => {
  const cases: Array<[number, number, string, string]> = [
    [1, 6, "h", "every_6_hours"],
    [1, 8, "h", "every_8_hours"],
    [1, 12, "h", "every_12_hours"],
    [1, 2, "d", "every_other_day"],
    [1, 1, "wk", "weekly"],
  ];
  for (const [frequency, period, unit, expected] of cases) {
    it(`maps ${frequency} every ${period}${unit} to ${expected}`, () => {
      const { row } = medicationRowFromFhir(
        request({
          dosageInstruction: [
            {
              timing: { repeat: { frequency, period, periodUnit: unit } },
              doseAndRate: [{ doseQuantity: { value: 5, unit: "mg" } }],
            },
          ],
        }),
        context,
      );
      expect(row?.frequency).toBe(expected);
    });
  }
});

describe("the duplicated default times", () => {
  it("still agrees with the app's own vocabulary", () => {
    // The mapper cannot import MEDICATION_FREQUENCIES — it has to stay
    // import-free to run under Deno — so the copy is checked here instead of
    // being allowed to drift.
    for (const entry of MEDICATION_FREQUENCIES) {
      expect(defaultTimesFor(entry.value)).toEqual(entry.defaultTimes);
    }
  });

  it("names every frequency the app knows", () => {
    const mapped = MEDICATION_FREQUENCIES.map((f) => f.value);
    for (const value of mapped) {
      // An unknown frequency returns [], which would silently give a patient
      // no dose times at all.
      expect(defaultTimesFor(value).length > 0 || value === "as_needed").toBe(true);
    }
  });
});

describe("a prescription that has been stopped", () => {
  it("comes back as inactive rather than being refused", () => {
    for (const status of ["completed", "stopped", "cancelled"]) {
      const { row, rejected } = medicationRowFromFhir(request({ status }), context);
      expect(rejected, `${status} should map, not be refused`).toBeUndefined();
      expect(row?.is_active, `${status} should be inactive`).toBe(false);
    }
  });

  it("is asked for by the sync, or that branch is unreachable", () => {
    // The mapper always handled these; both sync functions asked the server
    // for `status=active,on-hold`, so they never arrived. A prescription
    // stopped at the hospital stayed active in OneCare forever, and the
    // patient's list went on telling them to take it.
    for (const status of ["active", "on-hold", "completed", "stopped", "cancelled"]) {
      expect(MEDICATION_STATUSES.split(",")).toContain(status);
    }
  });

  it("still refuses the statuses that were never a prescription", () => {
    // 'draft' was never issued and 'entered-in-error' is a retraction. Both
    // would show a patient a live prescription that is not one.
    for (const status of ["draft", "entered-in-error", "unknown"]) {
      expect(medicationRowFromFhir(request({ status }), context).rejected).toBeDefined();
    }
  });
});
