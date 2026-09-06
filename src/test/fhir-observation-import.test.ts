import { describe, expect, it } from "vitest";

import {
  VITAL_LOINC,
  vitalRowsFrom,
  type FhirObservation,
} from "../../supabase/functions/_shared/fhir-observation";
import { VITAL_CONFIG } from "@/types/health";

/**
 * The LOINC table lived twice — once in ehr-sync and once in
 * scheduled-ehr-sync — and the copies had already drifted in how they treated
 * a code neither recognised. It lives in one import-free module now, which is
 * what makes this suite possible at all.
 */
const context = {
  userId: "user-1",
  sourceLabel: "City General",
  connectionId: "conn-1",
  now: new Date("2026-10-01T09:00:00Z"),
};

function observation(overrides: Partial<FhirObservation> = {}): FhirObservation {
  return {
    resourceType: "Observation",
    id: "obs-1",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] },
    valueQuantity: { value: 72, unit: "bpm" },
    effectiveDateTime: "2026-09-30T08:15:00Z",
    ...overrides,
  };
}

describe("reading a vital out of an observation", () => {
  it("maps the parts a patient sees", () => {
    const [row] = vitalRowsFrom(observation(), context);
    expect(row).toMatchObject({
      user_id: "user-1",
      type: "heart_rate",
      value: 72,
      secondary_value: null,
      unit: "bpm",
      recorded_at: "2026-09-30T08:15:00Z",
    });
  });

  it("stamps provenance on every row", () => {
    // Without this an imported reading and one the patient typed are the same
    // row, and useVitals could not refuse to let them edit it.
    const [row] = vitalRowsFrom(observation(), context);
    expect(row.source).toBe("ehr_import");
    expect(row.external_id).toBe("obs-1");
    expect(row.ehr_connection_id).toBe("conn-1");
    expect(row.notes).toContain("City General");
  });

  it("keeps a blood pressure as one row with both numbers", () => {
    // Half a blood pressure is not a blood pressure.
    const [row] = vitalRowsFrom(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
        valueQuantity: undefined,
        component: [
          { code: { coding: [{ code: "8480-6" }] }, valueQuantity: { value: 128, unit: "mmHg" } },
          { code: { coding: [{ code: "8462-4" }] }, valueQuantity: { value: 82, unit: "mmHg" } },
        ],
      }),
      context,
    );
    expect(row).toMatchObject({ type: "blood_pressure", value: 128, secondary_value: 82, unit: "mmHg" });
  });

  it("refuses half a blood pressure rather than storing it as a number", () => {
    const rows = vitalRowsFrom(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
        valueQuantity: undefined,
        component: [{ code: { coding: [{ code: "8480-6" }] }, valueQuantity: { value: 128 } }],
      }),
      context,
    );
    expect(rows).toEqual([]);
  });
});

describe("what it refuses", () => {
  it("refuses a code it does not recognise", () => {
    // A reading filed under the nearest-looking vital is worse than one
    // missing, because nobody can tell it is wrong.
    expect(vitalRowsFrom(observation({ code: { coding: [{ code: "99999-9" }] } }), context)).toEqual([]);
  });

  it("refuses an observation with no value", () => {
    expect(vitalRowsFrom(observation({ valueQuantity: undefined }), context)).toEqual([]);
  });

  it("refuses a retraction", () => {
    // Importing one would put back a reading somebody deliberately withdrew.
    expect(vitalRowsFrom(observation({ status: "entered-in-error" }), context)).toEqual([]);
  });

  it("refuses a resource that is not an Observation", () => {
    expect(vitalRowsFrom(observation({ resourceType: "Condition" }), context)).toEqual([]);
  });

  it("keeps a zero, which is a value", () => {
    // `if (!value)` would drop it. A glucose of 0 is wrong but it is not absent.
    const [row] = vitalRowsFrom(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "2339-0" }] },
        valueQuantity: { value: 0, unit: "mg/dL" },
      }),
      context,
    );
    expect(row.value).toBe(0);
  });
});

describe("when the sender was vague", () => {
  it("falls back through the date fields rather than inventing now", () => {
    const [withPeriod] = vitalRowsFrom(
      observation({ effectiveDateTime: undefined, effectivePeriod: { start: "2026-09-29T07:00:00Z" } }),
      context,
    );
    expect(withPeriod.recorded_at).toBe("2026-09-29T07:00:00Z");

    const [withIssued] = vitalRowsFrom(
      observation({ effectiveDateTime: undefined, issued: "2026-09-28T07:00:00Z" }),
      context,
    );
    expect(withIssued.recorded_at).toBe("2026-09-28T07:00:00Z");
  });

  it("uses the run time only when the sender gave no date at all", () => {
    const [row] = vitalRowsFrom(
      observation({ effectiveDateTime: undefined, issued: undefined }),
      context,
    );
    expect(row.recorded_at).toBe("2026-10-01T09:00:00.000Z");
  });

  it("supplies the unit we would show rather than leaving it blank", () => {
    const [row] = vitalRowsFrom(observation({ valueQuantity: { value: 72 } }), context);
    expect(row.unit).toBe("bpm");
  });
});

describe("the codes it knows", () => {
  it("only names vital types the app can store", () => {
    // A code mapping to a type VITAL_CONFIG has never heard of would import a
    // reading the app cannot label or chart.
    const known = new Set(Object.keys(VITAL_CONFIG));
    for (const type of Object.values(VITAL_LOINC)) {
      expect(known.has(type), `${type} is not a vital type the app knows`).toBe(true);
    }
  });

  it("covers the vitals a hospital actually sends", () => {
    const covered = new Set(Object.values(VITAL_LOINC));
    for (const type of ["blood_pressure", "heart_rate", "temperature", "weight", "glucose"]) {
      expect(covered.has(type), `no LOINC code maps to ${type}`).toBe(true);
    }
  });
});

describe("what the old map got wrong", () => {
  it("does not import a vital the app cannot label or range", () => {
    // The maps this replaced sent respiratory rate and BMI through. The app
    // has no configuration for either, so they arrived with a generated label
    // and no normal range — and a reading with no range never triggers an
    // alert while looking like it was checked.
    expect(
      vitalRowsFrom(
        observation({
          code: { coding: [{ system: "http://loinc.org", code: "9279-1" }] },
          valueQuantity: { value: 16, unit: "breaths/min" },
        }),
        context,
      ),
    ).toEqual([]);
    expect(
      vitalRowsFrom(
        observation({
          code: { coding: [{ system: "http://loinc.org", code: "39156-5" }] },
          valueQuantity: { value: 24, unit: "kg/m2" },
        }),
        context,
      ),
    ).toEqual([]);
  });

  it("writes glucose under the name the app uses, not one needing an alias", () => {
    const [row] = vitalRowsFrom(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "2339-0" }] },
        valueQuantity: { value: 5.4, unit: "mmol/L" },
      }),
      context,
    );
    expect(row.type).toBe("glucose");
    // And the unit the hospital sent is kept, not replaced with ours.
    expect(row.unit).toBe("mmol/L");
  });
});

/**
 * The webhook was the last import path running its own copy of all this.
 *
 * ehr-webhook had its own LOINC map, its own unit defaults and its own loop.
 * These are the four things that loop did differently, each of which reached
 * the record.
 */
describe("what the webhook's own loop got wrong", () => {
  it("does not import a reading the sender retracted", () => {
    // The webhook never looked at status, so an observation the hospital had
    // withdrawn as entered-in-error was imported as though it stood.
    const rows = vitalRowsFrom(
      observation({ status: "entered-in-error", valueQuantity: { value: 180, unit: "bpm" } }),
      context,
    );
    expect(rows).toEqual([]);
  });

  it("takes the time the reading was taken, not the time it arrived", () => {
    // It read only effectiveDateTime. A resource carrying effectivePeriod or
    // issued got stamped with the moment the webhook fired instead.
    const period = vitalRowsFrom(
      observation({ effectiveDateTime: undefined, effectivePeriod: { start: "2026-09-29T07:00:00Z" } }),
      context,
    );
    expect(period[0].recorded_at).toBe("2026-09-29T07:00:00Z");

    const issued = vitalRowsFrom(
      observation({ effectiveDateTime: undefined, issued: "2026-09-28T06:00:00Z" }),
      context,
    );
    expect(issued[0].recorded_at).toBe("2026-09-28T06:00:00Z");
  });

  it("reads a blood pressure sent as components, and refuses one sent as half", () => {
    const bp = vitalRowsFrom(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
        valueQuantity: undefined,
        component: [
          { code: { coding: [{ code: "8480-6" }] }, valueQuantity: { value: 128, unit: "mmHg" } },
          { code: { coding: [{ code: "8462-4" }] }, valueQuantity: { value: 82, unit: "mmHg" } },
        ],
      }),
      context,
    );
    expect(bp).toHaveLength(1);
    expect(bp[0]).toMatchObject({ type: "blood_pressure", value: 128, secondary_value: 82 });
  });

  it("refuses the two types the webhook's own map used to send through", () => {
    // 39156-5 and 9279-1 have no VITAL_CONFIG entry, so a row of either
    // arrives with no reference range and gets graded against nothing.
    for (const code of ["39156-5", "9279-1"]) {
      const rows = vitalRowsFrom(
        observation({ code: { coding: [{ system: "http://loinc.org", code }] } }),
        context,
      );
      expect(rows, code).toEqual([]);
    }
  });

  it("writes glucose under the name the app queries", () => {
    // The webhook wrote 'blood_glucose'; every screen asks for 'glucose'.
    const rows = vitalRowsFrom(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "2339-0" }] },
        valueQuantity: { value: 96, unit: "mg/dL" },
      }),
      context,
    );
    expect(rows[0].type).toBe("glucose");
    expect(VITAL_CONFIG[rows[0].type as keyof typeof VITAL_CONFIG]).toBeDefined();
  });
});
