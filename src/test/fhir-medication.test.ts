import { describe, it, expect } from "vitest";
import type { MedicationStatement } from "@medplum/fhirtypes";

import {
  dosageText,
  medicationStatus,
  structuredTimes,
  toFhirMedicationStatement,
  toFhirMedicationStatements,
  type MedicationRecord,
} from "@/lib/fhir/medication";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";

const metformin: MedicationRecord = {
  id: "med-1",
  name: "Metformin 500mg",
  dosage: "500 mg",
  frequency: "twice daily",
  type: "prescription",
  instructions: "with food",
  prescriber: "Dr Jane Evans",
  pharmacy: "Riverside Pharmacy",
  start_date: "2026-03-01",
  end_date: null,
  is_active: true,
  discontinued_at: null,
  discontinuation_reason: null,
  times_of_day: ["08:00", "20:00"],
  created_at: "2026-03-01T09:12:00.000Z",
};

describe("the resource is a statement, not a request", () => {
  it("emits MedicationStatement, because we hold no order", () => {
    // A MedicationRequest asserts that somebody with prescribing authority
    // asked for this. We have a name in a text box. Emitting one would put a
    // claim in an exported record that nobody made.
    expect(toFhirMedicationStatement(metformin, PATIENT).resourceType).toBe(
      "MedicationStatement",
    );
  });

  it("never emits a drug code", () => {
    // A wrong RxNorm code reaching an interaction checker is worse than none.
    const s = toFhirMedicationStatement(metformin, PATIENT);
    expect(s.medicationCodeableConcept?.text).toBe("Metformin 500mg");
    expect(s.medicationCodeableConcept?.coding).toBeUndefined();
  });

  it("does not claim who said so", () => {
    // We do not record whether the patient or a clinician added the row.
    const s = toFhirMedicationStatement(metformin, PATIENT);
    expect(s.informationSource).toBeUndefined();
    expect(s.category).toBeUndefined();
  });
});

describe("status comes from the columns that carry it", () => {
  it("is active while it is being taken", () => {
    expect(medicationStatus(metformin)).toBe("active");
  });

  it("is stopped when discontinued, even if the row still says active", () => {
    // Somebody made a decision to end it; that outranks a stale flag.
    expect(
      medicationStatus({ ...metformin, is_active: true, discontinued_at: "2026-06-01T00:00:00Z" }),
    ).toBe("stopped");
  });

  it("is completed when it simply ran out", () => {
    expect(medicationStatus({ ...metformin, is_active: false })).toBe("completed");
  });

  it("carries the reason it was stopped, as text and not as a code", () => {
    const s = toFhirMedicationStatement(
      {
        ...metformin,
        discontinued_at: "2026-06-01T00:00:00Z",
        discontinuation_reason: "Persistent nausea",
      },
      PATIENT,
    );
    expect(s.statusReason?.[0].text).toBe("Persistent nausea");
    expect(s.statusReason?.[0].coding).toBeUndefined();
  });
});

describe("dosage keeps the words and only the real structure", () => {
  it("joins what the columns actually say", () => {
    expect(dosageText(metformin)).toBe("500 mg · twice daily · with food");
  });

  it("drops the empty parts rather than leaving separators", () => {
    expect(dosageText({ ...metformin, instructions: null })).toBe("500 mg · twice daily");
    expect(dosageText({ ...metformin, instructions: "   " })).toBe("500 mg · twice daily");
  });

  it("emits timing only from times_of_day, which is already structured", () => {
    const s = toFhirMedicationStatement(metformin, PATIENT);
    // Padded to seconds: FHIR's `time` primitive requires them, and the
    // validator rejects "08:00" outright.
    expect(s.dosage?.[0].timing?.repeat?.timeOfDay).toEqual(["08:00:00", "20:00:00"]);
    // "twice daily" is not parsed into a frequency — it stays as text.
    expect(s.dosage?.[0].timing?.repeat?.frequency).toBeUndefined();
  });

  it("ignores entries that are not times", () => {
    expect(structuredTimes(["08:00", "morning", "25:00", "", "20:00:00"])).toEqual([
      "08:00:00",
      "20:00:00",
    ]);
    expect(structuredTimes("08:00")).toEqual([]);
    expect(structuredTimes(null)).toEqual([]);
  });
});

describe("the period it was taken for", () => {
  it("runs from the start date", () => {
    expect(toFhirMedicationStatement(metformin, PATIENT).effectivePeriod).toEqual({
      start: "2026-03-01",
    });
  });

  it("ends when discontinued, if nobody filled in an end date", () => {
    const s = toFhirMedicationStatement(
      { ...metformin, discontinued_at: "2026-06-01T00:00:00Z" },
      PATIENT,
    );
    expect(s.effectivePeriod?.end).toBe("2026-06-01T00:00:00Z");
  });

  it("prefers the recorded end date over the discontinuation timestamp", () => {
    const s = toFhirMedicationStatement(
      { ...metformin, end_date: "2026-05-20", discontinued_at: "2026-06-01T00:00:00Z" },
      PATIENT,
    );
    expect(s.effectivePeriod?.end).toBe("2026-05-20");
  });

  it("omits the period entirely when there are no dates", () => {
    const s = toFhirMedicationStatement(
      { ...metformin, start_date: null, end_date: null, discontinued_at: null },
      PATIENT,
    );
    expect(s.effectivePeriod).toBeUndefined();
  });
});

describe("nothing real is dropped on the way out", () => {
  it("keeps the kind of medicine it is, which interaction checkers need", () => {
    const s = toFhirMedicationStatement({ ...metformin, type: "herbal" }, PATIENT);
    expect(s.note?.map((n) => n.text)).toContain("Recorded as: herbal");
  });

  it("keeps the prescriber and pharmacy as the free text they are", () => {
    const s = toFhirMedicationStatement(metformin, PATIENT);
    expect(s.note?.map((n) => n.text)).toEqual([
      "Recorded as: prescription",
      "Prescriber (as entered): Dr Jane Evans",
      "Pharmacy (as entered): Riverside Pharmacy",
    ]);
  });

  it("emits no note element at all when there is nothing to say", () => {
    const s = toFhirMedicationStatement(
      { ...metformin, type: "", prescriber: null, pharmacy: null },
      PATIENT,
    );
    expect(s.note).toBeUndefined();
  });
});

describe("the specification agrees, not just us", () => {
  const cases: Array<[string, MedicationRecord]> = [
    ["an active prescription", metformin],
    ["a discontinued one", { ...metformin, discontinued_at: "2026-06-01T00:00:00Z", discontinuation_reason: "Nausea" }],
    ["a finished course", { ...metformin, is_active: false, end_date: "2026-05-20" }],
    ["a patient-logged supplement", {
      id: "med-2", name: "Vitamin D", dosage: "1000 IU", frequency: "daily",
      type: "vitamin", instructions: null, prescriber: null, pharmacy: null,
      start_date: "2026-01-05", end_date: null, is_active: true,
      discontinued_at: null, discontinuation_reason: null,
      times_of_day: ["09:00"], created_at: "2026-01-05T07:00:00.000Z",
    }],
    ["one with nothing but a name", {
      id: "med-3", name: "Paracetamol", dosage: "", frequency: "",
      type: "", times_of_day: null,
    }],
  ];

  for (const [label, record] of cases) {
    it(`validates ${label} against the R4 definitions`, () => {
      expect(() =>
        validateFhir(toFhirMedicationStatement(record, PATIENT) as MedicationStatement),
      ).not.toThrow();
    });
  }

  it("maps a whole list", () => {
    const list = toFhirMedicationStatements(cases.map(([, r]) => r), PATIENT);
    expect(list).toHaveLength(5);
    expect(new Set(list.map((s) => s.subject?.reference))).toEqual(
      new Set([`Patient/${PATIENT}`]),
    );
  });
});
