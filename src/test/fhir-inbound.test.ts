import { describe, expect, it } from "vitest";
import type { Appointment, MedicationStatement, Observation } from "@medplum/fhirtypes";

import {
  fromFhirAllergy,
  fromFhirAppointment,
  fromFhirCondition,
  fromFhirMedication,
  fromFhirObservation,
  subjectId,
  summariseImport,
  type Provenance,
} from "@/lib/fhir/inbound";
import { toFhirObservation } from "@/lib/fhir/observation";
import { toFhirConditions, toFhirAllergies } from "@/lib/fhir/clinical";
import { toFhirMedicationStatement } from "@/lib/fhir/medication";
import { toFhirAppointment } from "@/lib/fhir/appointment";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const SOURCE: Provenance = {
  sourceId: "conn-1",
  sourceLabel: "City General EHR",
  externalId: "ext-99",
};

describe("a reading survives the round trip", () => {
  // The strongest available check: our own outbound mapper is a correct FHIR
  // producer, so anything it emits should come back as what went in. If the
  // two ever disagree the export and the import are describing different
  // things, which is the failure that matters.
  const cases = [
    { id: "v1", type: "weight", value: 74.2, unit: "kg", recorded_at: "2026-09-01T08:00:00.000Z" },
    { id: "v2", type: "heart_rate", value: 68, unit: "bpm", recorded_at: "2026-09-01T08:01:00.000Z" },
    { id: "v3", type: "temperature", value: 36.8, unit: "°C", recorded_at: "2026-09-01T08:02:00.000Z" },
    { id: "v4", type: "oxygen_saturation", value: 98, unit: "%", recorded_at: "2026-09-01T08:03:00.000Z" },
  ];

  for (const vital of cases) {
    it(`round-trips ${vital.type}`, () => {
      const resource = toFhirObservation(vital, PATIENT);
      const back = fromFhirObservation(resource, PATIENT, SOURCE);
      expect(back.rejected).toBeUndefined();
      expect(back.row?.type).toBe(vital.type);
      expect(back.row?.value).toBe(vital.value);
      expect(back.row?.unit).toBe(vital.unit);
      expect(back.warnings).toEqual([]);
    });
  }

  it("round-trips a blood pressure with both numbers intact", () => {
    const bp = {
      id: "v5", type: "blood_pressure", value: 128, secondary_value: 82,
      unit: "mmHg", recorded_at: "2026-09-01T08:04:00.000Z",
    };
    const back = fromFhirObservation(toFhirObservation(bp, PATIENT), PATIENT, SOURCE);
    expect(back.row?.value).toBe(128);
    expect(back.row?.secondary_value).toBe(82);
  });

  it("carries provenance onto every row", () => {
    const back = fromFhirObservation(toFhirObservation(cases[0], PATIENT), PATIENT, SOURCE);
    // Without this an imported row and one the patient typed are the same
    // thing, and a bad import can never be unwound.
    expect(back.row?.source).toBe("City General EHR");
    expect(back.row?.ehr_connection_id).toBe("conn-1");
    expect(back.row?.external_id).toBe("ext-99");
  });
});

describe("readings we cannot map are refused, not filed under something near", () => {
  const base: Observation = {
    resourceType: "Observation",
    status: "final",
    code: {},
    subject: { reference: `Patient/${PATIENT}` },
    effectiveDateTime: "2026-09-01T08:00:00.000Z",
    valueQuantity: { value: 5, unit: "mg" },
  };

  it("refuses a code we do not know rather than guessing a category", () => {
    const result = fromFhirObservation(
      { ...base, code: { text: "Serum rhubarb", coding: [{ system: "http://loinc.org", code: "99999-9" }] } },
      PATIENT, SOURCE,
    );
    expect(result.row).toBeNull();
    expect(result.rejected).toMatch(/Serum rhubarb/);
  });

  it("refuses a reading with no date", () => {
    const { effectiveDateTime, ...noDate } = base;
    const result = fromFhirObservation(
      { ...noDate, code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] } } as Observation,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/no date/i);
  });

  it("refuses a reading with no number", () => {
    const { valueQuantity, ...noValue } = base;
    const result = fromFhirObservation(
      { ...noValue, code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] } } as Observation,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/no numeric value/i);
  });

  it("refuses half a blood pressure", () => {
    // A systolic on its own is not a blood pressure, and storing it as one
    // would put a number in the record that nobody measured.
    const result = fromFhirObservation(
      {
        ...base,
        code: { coding: [{ system: "http://loinc.org", code: "85354-9" }] },
        component: [
          { code: { coding: [{ system: "http://loinc.org", code: "8480-6" }] }, valueQuantity: { value: 128, unit: "mmHg" } },
        ],
      } as Observation,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/both a systolic and a diastolic/i);
  });

  it("refuses anything the sender retracted", () => {
    const result = fromFhirObservation(
      { ...base, status: "entered-in-error", code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] } },
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/entered in error/i);
  });
});

describe("units are kept as sent, and the difference is said out loud", () => {
  it("warns rather than converting when the unit is not ours", () => {
    const result = fromFhirObservation(
      {
        resourceType: "Observation", status: "final",
        subject: { reference: `Patient/${PATIENT}` },
        effectiveDateTime: "2026-09-01T08:00:00.000Z",
        code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] },
        valueQuantity: { value: 163, unit: "lbs", code: "[lb_av]" },
      },
      PATIENT, SOURCE,
    );
    // Converting silently is how a weight in pounds becomes a weight in
    // kilograms without anyone deciding to.
    expect(result.row?.value).toBe(163);
    expect(result.row?.unit).toBe("lbs");
    expect(result.warnings.join(" ")).toMatch(/not the kg this record normally uses/i);
  });

  it("keeps an unrecognised unit as written and says so", () => {
    const result = fromFhirObservation(
      {
        resourceType: "Observation", status: "final",
        subject: { reference: `Patient/${PATIENT}` },
        effectiveDateTime: "2026-09-01T08:00:00.000Z",
        code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] },
        valueQuantity: { value: 74, unit: "kilos", code: "not-ucum" },
      },
      PATIENT, SOURCE,
    );
    expect(result.row?.unit).toBe("kilos");
    expect(result.warnings.join(" ")).toMatch(/not one we recognise/i);
  });
});

describe("medications", () => {
  it("round-trips a name and its dosage line", () => {
    const out = toFhirMedicationStatement(
      { id: "m1", name: "Metformin 500mg", dosage: "500 mg", frequency: "twice daily", type: "prescription" },
      PATIENT,
    );
    const back = fromFhirMedication(out, PATIENT, SOURCE);
    expect(back.row?.name).toBe("Metformin 500mg");
    expect(back.row?.dosage).toBe("500 mg · twice daily");
  });

  it("refuses one with no readable name", () => {
    const result = fromFhirMedication(
      {
        resourceType: "MedicationStatement", status: "active",
        subject: { reference: `Patient/${PATIENT}` },
        medicationCodeableConcept: { coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "860975" }] },
      } as MedicationStatement,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/no readable name/i);
  });

  it("does not split a free-text dosage into fields", () => {
    // "500mg twice daily" parsed into dose and frequency is guessing.
    const back = fromFhirMedication(
      {
        resourceType: "MedicationStatement", status: "active",
        subject: { reference: `Patient/${PATIENT}` },
        medicationCodeableConcept: { text: "Metformin" },
        dosage: [{ text: "500mg twice daily with food" }],
      } as MedicationStatement,
      PATIENT, SOURCE,
    );
    expect(back.row?.dosage).toBe("500mg twice daily with food");
    expect(back.row?.frequency).toBe("");
  });
});

describe("conditions and allergies", () => {
  it("round-trips a condition's text", () => {
    const [condition] = toFhirConditions("Type 2 diabetes", PATIENT);
    expect(fromFhirCondition(condition).row).toBe("Type 2 diabetes");
  });

  it("round-trips an allergy's text", () => {
    const [allergy] = toFhirAllergies("Penicillin", PATIENT);
    expect(fromFhirAllergy(allergy).row).toBe("Penicillin");
  });

  it("refuses a coded condition with no display text", () => {
    expect(
      fromFhirCondition({
        resourceType: "Condition",
        subject: { reference: `Patient/${PATIENT}` },
        code: { coding: [{ system: "http://snomed.info/sct", code: "44054006" }] },
      }).rejected,
    ).toMatch(/no readable name/i);
  });

  it("says what a text list cannot hold", () => {
    // "Anaphylaxis" and "mild rash" become the same line, and somebody
    // approving the import should know that before they accept it.
    const result = fromFhirAllergy({
      resourceType: "AllergyIntolerance",
      patient: { reference: `Patient/${PATIENT}` },
      code: { text: "Penicillin" },
      criticality: "high",
      reaction: [{ manifestation: [{ text: "Anaphylaxis" }] }],
    });
    expect(result.row).toBe("Penicillin");
    expect(result.warnings.join(" ")).toMatch(/criticality/i);
    expect(result.warnings.join(" ")).toMatch(/reaction/i);
  });
});

describe("appointments", () => {
  it("round-trips a booked appointment", () => {
    const out = toFhirAppointment({
      patientUserId: PATIENT, status: "booked",
      start: "2026-10-01T09:00:00.000Z", end: "2026-10-01T09:30:00.000Z",
      description: "Annual review",
    });
    const back = fromFhirAppointment(out, PATIENT, SOURCE);
    expect(back.row?.status).toBe("booked");
    expect(back.row?.start_time).toBe("2026-10-01T09:00:00.000Z");
    expect(back.row?.description).toBe("Annual review");
  });

  it("refuses a booked appointment with no time, as app-3 requires", () => {
    const result = fromFhirAppointment(
      { resourceType: "Appointment", status: "booked" } as Appointment,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/must have a start time/i);
  });

  it("refuses one that ends before it starts", () => {
    const result = fromFhirAppointment(
      {
        resourceType: "Appointment", status: "booked",
        start: "2026-10-01T10:00:00.000Z", end: "2026-10-01T09:00:00.000Z",
      } as Appointment,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/ends before it starts/i);
  });

  it("refuses a status the record does not accept", () => {
    const result = fromFhirAppointment(
      { resourceType: "Appointment", status: "rescheduled" } as unknown as Appointment,
      PATIENT, SOURCE,
    );
    expect(result.rejected).toMatch(/not an appointment status/i);
  });

  it("keeps the whole resource, so nothing our columns lack is lost", () => {
    const out = toFhirAppointment({
      patientUserId: PATIENT, status: "booked", start: "2026-10-01T09:00:00.000Z",
    });
    expect(fromFhirAppointment(out, PATIENT, SOURCE).row?.resource).toEqual(out);
  });
});

describe("the inbound map is the exact inverse of the outbound one", () => {
  it("maps back every vital sign the outbound mapper codes", () => {
    // inbound.ts writes its own code table rather than reversing the outbound
    // one, because a reversed lookup would change meaning silently if two
    // types ever shared a code. That makes this check the thing keeping them
    // honest: every code we emit must be a code we can read.
    const vitalSigns = [
      { type: "weight", unit: "kg" },
      { type: "heart_rate", unit: "bpm" },
      { type: "temperature", unit: "°C" },
      { type: "oxygen_saturation", unit: "%" },
    ];
    for (const { type, unit } of vitalSigns) {
      const resource = toFhirObservation(
        { id: "x", type, value: 1, unit, recorded_at: "2026-09-01T08:00:00.000Z" },
        PATIENT,
      );
      const back = fromFhirObservation(resource, PATIENT, SOURCE);
      expect(back.rejected, `${type} was emitted but cannot be read back`).toBeUndefined();
      expect(back.row?.type).toBe(type);
    }
  });

  it("reads back every unit the outbound mapper codes", () => {
    const units = ["kg", "g", "lbs", "cm", "%", "°C", "°F", "mmHg", "bpm",
                   "mg/dL", "mmol/L", "g/dL", "U/L", "mL/min"];
    for (const unit of units) {
      const resource = toFhirObservation(
        { id: "x", type: "weight", value: 1, unit, recorded_at: "2026-09-01T08:00:00.000Z" },
        PATIENT,
      );
      const back = fromFhirObservation(resource, PATIENT, SOURCE);
      // The unit must survive as written. A warning about it not being kg is
      // expected and fine; an unrecognised-code warning is not.
      expect(back.row?.unit, `unit ${unit} did not survive the round trip`).toBe(unit);
      expect(
        back.warnings.join(" "),
        `unit ${unit} is emitted with a code the inbound map does not know`,
      ).not.toMatch(/not one we recognise/);
    }
  });
});

describe("who a resource is about", () => {
  it("reads the patient out of a subject reference", () => {
    expect(subjectId({ resourceType: "Observation", status: "final", code: {}, subject: { reference: "Patient/abc" } } as Observation)).toBe("abc");
  });

  it("reads it out of `patient` too, which allergies use", () => {
    expect(subjectId({ resourceType: "AllergyIntolerance", patient: { reference: "Patient/xyz" } })).toBe("xyz");
  });

  it("returns nothing rather than guessing when the reference is not a Patient", () => {
    expect(subjectId({ resourceType: "Observation", status: "final", code: {}, subject: { reference: "Group/g1" } } as Observation)).toBeNull();
    expect(subjectId({ resourceType: "Observation", status: "final", code: {} } as Observation)).toBeNull();
  });
});

describe("what a person sees before approving an import", () => {
  it("counts what will land, what will not, and why", () => {
    const summary = summariseImport([
      { row: {}, warnings: [] },
      { row: {}, warnings: ["No unit was sent with this reading."] },
      { row: null, rejected: "This reading has no date.", warnings: [] },
      { row: null, rejected: "This reading has no date.", warnings: [] },
      { row: null, rejected: "Half a blood pressure.", warnings: [] },
    ]);
    expect(summary.accepted).toBe(2);
    expect(summary.rejected).toBe(3);
    expect(summary.warnings).toBe(1);
    // Deduplicated and ordered, so five hundred identical failures read as one
    // line with a number rather than five hundred lines.
    expect(summary.reasons[0]).toEqual({ reason: "This reading has no date.", count: 2 });
  });
});
