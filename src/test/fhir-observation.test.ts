import { describe, it, expect } from "vitest";
import { readJson } from "@medplum/definitions";
import type { Bundle, Observation, ValueSet } from "@medplum/fhirtypes";
import { isVitalSign, toFhirBundle, toFhirObservation, toFhirObservations } from "@/lib/fhir/observation";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const WHEN = "2026-09-01T08:30:00.000Z";

const bp = {
  id: "v-bp",
  type: "blood_pressure",
  value: 128,
  secondary_value: 82,
  unit: "mmHg",
  recorded_at: WHEN,
};

describe("the LOINC codes are the specification's, not ours", () => {
  // The point of this block: every code in the mapper was read out of the R4
  // bundle, and this re-reads it. If a code is ever changed to one somebody
  // remembered, the spec disagrees here rather than in an exported record.
  const vitalSignCodes = (() => {
    const bundle = readJson("fhir/r4/valuesets.json") as Bundle;
    const vs = bundle.entry
      ?.map((e) => e.resource as ValueSet)
      .find((r) => r?.url === "http://hl7.org/fhir/ValueSet/observation-vitalsignresult");
    return new Set(
      vs?.compose?.include?.flatMap((i) => i.concept?.map((c) => c.code) ?? []) ?? [],
    );
  })();

  it("finds the spec's vital-sign value set at all", () => {
    expect(vitalSignCodes.size).toBeGreaterThan(0);
  });

  it.each([
    ["weight", "29463-7"],
    ["heart_rate", "8867-4"],
    ["temperature", "8310-5"],
    ["oxygen_saturation", "2708-6"],
    ["blood_pressure", "85354-9"],
  ])("%s uses %s, and the spec lists it", (type, code) => {
    expect(vitalSignCodes.has(code)).toBe(true);
    const o = toFhirObservation({ type, value: 1, unit: null, recorded_at: WHEN }, PATIENT);
    expect(o?.code?.coding?.[0].code).toBe(code);
  });

  it("uses the two component codes the bp profile defines", () => {
    const o = toFhirObservation(bp, PATIENT)!;
    expect(vitalSignCodes.has("8480-6")).toBe(true);
    expect(vitalSignCodes.has("8462-4")).toBe(true);
    expect(o.component?.[0].code?.coding?.[0].code).toBe("8480-6");
    expect(o.component?.[1].code?.coding?.[0].code).toBe("8462-4");
  });
});

describe("toFhirObservation", () => {
  it("produces a resource that validates against FHIR R4", () => {
    expect(() => validateFhir(toFhirObservation(bp, PATIENT)!)).not.toThrow();
  });

  it("splits blood pressure into components rather than a number with a spare", () => {
    // 128 in valueQuantity with 82 hidden in a secondary column is our storage
    // shape, not a clinical fact, and it must not survive the mapping.
    const o = toFhirObservation(bp, PATIENT)!;
    expect(o.valueQuantity).toBeUndefined();
    expect(o.component).toHaveLength(2);
    expect(o.component?.[0].valueQuantity?.value).toBe(128);
    expect(o.component?.[1].valueQuantity?.value).toBe(82);
  });

  it("omits the diastolic component rather than inventing one", () => {
    const o = toFhirObservation({ ...bp, secondary_value: null }, PATIENT)!;
    expect(o.component).toHaveLength(1);
    expect(() => validateFhir(o)).not.toThrow();
  });

  it("uses the spec's UCUM spellings, not our display units", () => {
    const hr = toFhirObservation(
      { type: "heart_rate", value: 72, unit: "bpm", recorded_at: WHEN },
      PATIENT,
    )!;
    expect(hr.valueQuantity?.unit).toBe("bpm");
    expect(hr.valueQuantity?.code).toBe("/min");
    expect(hr.valueQuantity?.system).toBe("http://unitsofmeasure.org");

    const temp = toFhirObservation(
      { type: "temperature", value: 37, unit: "°C", recorded_at: WHEN },
      PATIENT,
    )!;
    expect(temp.valueQuantity?.code).toBe("Cel");

    expect(toFhirObservation(bp, PATIENT)!.component?.[0].valueQuantity?.code).toBe("mm[Hg]");
  });

  it("leaves a unit uncoded rather than guessing its UCUM form", () => {
    // x10³/µL is not valid UCUM, and inventing a code for it would put a claim
    // into an exported record that nobody checked.
    const wbc = toFhirObservation(
      { type: "wbc", value: 7.2, unit: "x10³/µL", recorded_at: WHEN },
      PATIENT,
    )!;
    expect(wbc.valueQuantity?.unit).toBe("x10³/µL");
    expect(wbc.valueQuantity?.code).toBeUndefined();
    expect(wbc.valueQuantity?.system).toBeUndefined();
    expect(() => validateFhir(wbc)).not.toThrow();
  });
});

describe("vital signs and laboratory results are different things", () => {
  it("categorises the five the profile covers as vital signs", () => {
    ["weight", "blood_pressure", "heart_rate", "oxygen_saturation", "temperature"].forEach((t) => {
      expect(isVitalSign(t)).toBe(true);
      const o = toFhirObservation({ type: t, value: 1, unit: null, recorded_at: WHEN }, PATIENT)!;
      expect(o.category?.[0].coding?.[0].code).toBe("vital-signs");
    });
  });

  it("categorises the rest as laboratory, with no invented LOINC", () => {
    // LOINC does have codes for these, but they are not in the FHIR bundles and
    // would have to be typed from memory — the same failure as inventing SNOMED
    // for "Diabetes" in a different costume.
    ["hba1c", "creatinine", "ldl", "potassium", "wbc"].forEach((t) => {
      expect(isVitalSign(t)).toBe(false);
      const o = toFhirObservation({ type: t, value: 5, unit: null, recorded_at: WHEN }, PATIENT)!;
      expect(o.category?.[0].coding?.[0].code).toBe("laboratory");
      expect(o.code?.coding).toBeUndefined();
      expect(o.code?.text).toBeTruthy();
    });
  });

  it("still names the measurement in text, coded or not", () => {
    const o = toFhirObservation({ type: "hba1c", value: 5.4, unit: "%", recorded_at: WHEN }, PATIENT)!;
    expect(o.code?.text).toBe("HbA1c");
    expect(() => validateFhir(o)).not.toThrow();
  });
});

describe("rows that are not observations", () => {
  it("returns null for a reading with no value rather than exporting a blank", () => {
    // A measurement that never happened must not appear in an export as one.
    expect(toFhirObservation({ type: "weight", value: null, recorded_at: WHEN }, PATIENT)).toBeNull();
    expect(
      toFhirObservation({ type: "weight", value: "not a number", recorded_at: WHEN }, PATIENT),
    ).toBeNull();
  });

  it("reads a numeric string, which is what postgres numeric arrives as", () => {
    const o = toFhirObservation({ type: "weight", value: "82.5", unit: "kg", recorded_at: WHEN }, PATIENT)!;
    expect(o.valueQuantity?.value).toBe(82.5);
  });

  it("drops the unreadable ones from a list instead of failing the whole export", () => {
    const list = toFhirObservations(
      [
        { type: "weight", value: 82, unit: "kg", recorded_at: WHEN },
        { type: "weight", value: null, recorded_at: WHEN },
        bp,
      ],
      PATIENT,
    );
    expect(list).toHaveLength(2);
    list.forEach((o: Observation) => expect(() => validateFhir(o)).not.toThrow());
  });
});

describe("the record around the reading", () => {
  it("carries when it was taken and who it belongs to", () => {
    const o = toFhirObservation(bp, PATIENT)!;
    expect(o.effectiveDateTime).toBe(WHEN);
    expect(o.subject?.reference).toBe(`Patient/${PATIENT}`);
    expect(o.status).toBe("final");
  });

  it("carries the note when there is one, and no empty note when there is not", () => {
    expect(toFhirObservation({ ...bp, notes: "After walking" }, PATIENT)!.note?.[0].text)
      .toBe("After walking");
    expect(toFhirObservation(bp, PATIENT)!.note).toBeUndefined();
  });
});

describe("toFhirBundle", () => {
  const rows = [
    bp,
    { id: "v-wt", type: "weight", value: "82.5", unit: "kg", recorded_at: WHEN },
    { id: "v-a1c", type: "hba1c", value: 5.4, unit: "%", recorded_at: WHEN },
    { id: "v-empty", type: "weight", value: null, recorded_at: WHEN },
  ];

  it("validates as a Bundle, not only as the resources inside it", () => {
    // This is the test that was missing. The bundle was built inline at the
    // download site where nothing could reach it, and it carried a `total` —
    // which bdl-1 forbids on a collection bundle. Every Observation was valid
    // and the file a receiver got was not.
    expect(() => validateFhir(toFhirBundle(rows, PATIENT))).not.toThrow();
  });

  it("carries no total, because bdl-1 allows it only on searchset or history", () => {
    expect(toFhirBundle(rows, PATIENT).total).toBeUndefined();
  });

  it("is a collection: records handed over, not a transaction", () => {
    expect(toFhirBundle(rows, PATIENT).type).toBe("collection");
  });

  it("holds one entry per readable row and drops the rest", () => {
    const bundle = toFhirBundle(rows, PATIENT);
    expect(bundle.entry).toHaveLength(3);
    bundle.entry?.forEach((e) => expect(e.resource?.resourceType).toBe("Observation"));
  });

  it("gives each entry a resolvable fullUrl", () => {
    expect(toFhirBundle(rows, PATIENT).entry?.[0].fullUrl).toBe("urn:uuid:v-bp");
  });

  it("produces a valid empty bundle rather than throwing on no readings", () => {
    const empty = toFhirBundle([], PATIENT);
    expect(empty.entry).toHaveLength(0);
    expect(() => validateFhir(empty)).not.toThrow();
  });
});
