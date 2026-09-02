import { describe, it, expect } from "vitest";
import { toClinicalList, wasShared } from "@/lib/clinical-lists";
import { toFhirAllergies, toFhirConditions } from "@/lib/fhir/clinical";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";

describe("toClinicalList", () => {
  it("passes a clean array through", () => {
    expect(toClinicalList(["Diabetes", "Hypertension"])).toEqual(["Diabetes", "Hypertension"]);
  });

  it("splits a loose comma-separated string", () => {
    // The shape that crashes FamilyDashboard's .map and renders "22 conditions"
    // from .length. Stored because the column had no constraint requiring an array.
    expect(toClinicalList("Diabetes, Hypertension")).toEqual(["Diabetes", "Hypertension"]);
  });

  it("splits on semicolons too, which is what the CSV import writes", () => {
    expect(toClinicalList("Penicillin; Sulfa")).toEqual(["Penicillin", "Sulfa"]);
  });

  it("drops empties rather than rendering a blank badge", () => {
    expect(toClinicalList(["Diabetes", "", "  ", "Asthma"])).toEqual(["Diabetes", "Asthma"]);
    expect(toClinicalList("Diabetes,,Asthma,")).toEqual(["Diabetes", "Asthma"]);
  });

  it("removes duplicates case-insensitively", () => {
    // One allergy listed twice in different case is how a clinician stops
    // trusting the list.
    expect(toClinicalList(["Penicillin", "penicillin", "PENICILLIN"])).toEqual(["Penicillin"]);
  });

  it("keeps the first spelling, not the last", () => {
    expect(toClinicalList(["Penicillin", "penicillin"])[0]).toBe("Penicillin");
  });

  it("reads the text out of objects, which extraction produces", () => {
    expect(toClinicalList([{ name: "Diabetes" }, { text: "Asthma" }])).toEqual([
      "Diabetes",
      "Asthma",
    ]);
  });

  it("drops an object with no readable text rather than rendering [object Object]", () => {
    expect(toClinicalList([{ severity: "high" }, "Asthma"])).toEqual(["Asthma"]);
  });

  it("treats null and undefined as no entries, never as a crash", () => {
    expect(toClinicalList(null)).toEqual([]);
    expect(toClinicalList(undefined)).toEqual([]);
  });

  it("survives the shapes that would otherwise throw", () => {
    // Every one of these has a path into the column, and .map on any of them
    // would take the page down.
    expect(() => toClinicalList(42)).not.toThrow();
    expect(() => toClinicalList(true)).not.toThrow();
    expect(() => toClinicalList({ name: "Asthma" })).not.toThrow();
    expect(toClinicalList({ name: "Asthma" })).toEqual(["Asthma"]);
  });
});

describe("wasShared", () => {
  it("separates a withheld category from an empty one", () => {
    // These mean opposite things. "No known allergies" when the truth is "you
    // were not told" is the failure being prevented.
    expect(wasShared(null)).toBe(false);
    expect(wasShared(undefined)).toBe(false);
    expect(wasShared([])).toBe(true);
    expect(wasShared(["Penicillin"])).toBe(true);
  });
});

describe("toFhirConditions", () => {
  it("produces a Condition per entry, valid against FHIR R4", () => {
    const conditions = toFhirConditions(["Diabetes", "Hypertension"], PATIENT);
    expect(conditions).toHaveLength(2);
    conditions.forEach((c) => expect(() => validateFhir(c)).not.toThrow());
  });

  it("carries the text and no invented code", () => {
    // The rule: "Diabetes" in a text box is not a SNOMED concept, and emitting
    // one because the string looked close puts a clinical claim nobody made
    // into an exported record.
    const [c] = toFhirConditions(["Diabetes"], PATIENT);
    expect(c.code?.text).toBe("Diabetes");
    expect(c.code?.coding).toBeUndefined();
  });

  it("marks them unconfirmed, because self-reported text is", () => {
    const [c] = toFhirConditions(["Diabetes"], PATIENT);
    expect(c.verificationStatus?.coding?.[0].code).toBe("unconfirmed");
  });

  it("names the patient as the subject", () => {
    const [c] = toFhirConditions(["Diabetes"], PATIENT);
    expect(c.subject?.reference).toBe(`Patient/${PATIENT}`);
  });

  it("maps the dirty shapes too, via the same normaliser", () => {
    expect(toFhirConditions("Diabetes, Hypertension", PATIENT)).toHaveLength(2);
    expect(toFhirConditions(null, PATIENT)).toEqual([]);
  });
});

describe("toFhirAllergies", () => {
  it("produces an AllergyIntolerance per entry, valid against FHIR R4", () => {
    const allergies = toFhirAllergies(["Penicillin", "Sulfa"], PATIENT);
    expect(allergies).toHaveLength(2);
    allergies.forEach((a) => expect(() => validateFhir(a)).not.toThrow());
  });

  it("leaves criticality absent rather than guessing it", () => {
    // Absence reads as unknown; a value reads as assessed. Free text says what
    // the patient reacts to and nothing about how badly.
    const [a] = toFhirAllergies(["Penicillin"], PATIENT);
    expect(a.criticality).toBeUndefined();
    expect(a.type).toBeUndefined();
    expect(a.reaction).toBeUndefined();
  });

  it("uses `patient`, which is what AllergyIntolerance requires", () => {
    // Condition has `subject`; AllergyIntolerance has `patient`. Getting this
    // wrong produces a resource that validates as neither.
    const [a] = toFhirAllergies(["Penicillin"], PATIENT);
    expect(a.patient?.reference).toBe(`Patient/${PATIENT}`);
  });
});
