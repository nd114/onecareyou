import { describe, it, expect } from "vitest";
import type { Bundle } from "@medplum/fhirtypes";

import { summariseRecordBundle, toRecordBundle } from "@/lib/fhir/record-bundle";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";

const vitals = [
  { id: "v-1", type: "blood_pressure", value: 128, secondary_value: 82, unit: "mmHg", recorded_at: "2026-09-01T08:30:00.000Z" },
  { id: "v-2", type: "weight", value: 74.2, unit: "kg", recorded_at: "2026-09-01T08:31:00.000Z" },
];

const medications = [
  { id: "m-1", name: "Metformin 500mg", dosage: "500 mg", frequency: "twice daily", type: "prescription", times_of_day: ["08:00", "20:00"] },
  { id: "m-2", name: "Vitamin D", dosage: "1000 IU", frequency: "daily", type: "vitamin", times_of_day: null },
];

function build(): Bundle {
  return toRecordBundle({
    patientUserId: PATIENT,
    vitals,
    medications,
    conditions: "Type 2 diabetes; Hypertension",
    allergies: "Penicillin",
  });
}

describe("the whole record leaves as one bundle", () => {
  it("carries every kind of thing we hold", () => {
    expect(summariseRecordBundle(build())).toEqual({
      Observation: 2,
      MedicationStatement: 2,
      Condition: 2,
      AllergyIntolerance: 1,
    });
  });

  it("validates as a bundle, not only resource by resource", () => {
    // The envelope is its own thing. An earlier hand-built bundle here carried
    // a `total`, which bdl-1 forbids on a collection, and every resource in it
    // was valid.
    expect(() => validateFhir(build())).not.toThrow();
  });

  it("is a collection and claims no total", () => {
    const bundle = build();
    expect(bundle.type).toBe("collection");
    expect(bundle.total).toBeUndefined();
  });

  it("gives a fullUrl only to resources that have a real id", () => {
    const bundle = build();
    const withUrl = bundle.entry?.filter((e) => e.fullUrl) ?? [];
    const withoutUrl = bundle.entry?.filter((e) => !e.fullUrl) ?? [];
    // Vitals and medications carry row ids; conditions and allergies are
    // mapped from free text and have none, so nothing is fabricated for them.
    expect(withUrl.map((e) => e.fullUrl)).toEqual([
      "urn:uuid:v-1",
      "urn:uuid:v-2",
      "urn:uuid:m-1",
      "urn:uuid:m-2",
    ]);
    expect(withoutUrl).toHaveLength(3);
  });

  it("points every resource at the same patient", () => {
    const subjects = new Set(
      (build().entry ?? []).map((e) => {
        const r = e.resource as { subject?: { reference?: string }; patient?: { reference?: string } };
        return r.subject?.reference ?? r.patient?.reference;
      }),
    );
    expect(subjects).toEqual(new Set([`Patient/${PATIENT}`]));
  });
});

describe("a partial record is still a valid record", () => {
  it("handles someone who has only logged medications", () => {
    const bundle = toRecordBundle({ patientUserId: PATIENT, medications });
    expect(summariseRecordBundle(bundle)).toEqual({ MedicationStatement: 2 });
    expect(() => validateFhir(bundle)).not.toThrow();
  });

  it("produces an empty but valid bundle for someone with nothing yet", () => {
    const bundle = toRecordBundle({ patientUserId: PATIENT });
    expect(bundle.entry).toEqual([]);
    expect(() => validateFhir(bundle)).not.toThrow();
  });

  it("treats a withheld list as withheld, not as none recorded", () => {
    // null means "not shared"; the mapper emits nothing rather than asserting
    // the patient has no conditions.
    const bundle = toRecordBundle({ patientUserId: PATIENT, conditions: null, allergies: null });
    expect(bundle.entry).toEqual([]);
  });
});
