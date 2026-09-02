import { describe, it, expect } from "vitest";
import { normaliseVitalType, parseRecordQuery, resolvePatient } from "@/lib/ai-record-query";

describe("parseRecordQuery", () => {
  it("reads a well-formed request", () => {
    const q = parseRecordQuery({ kind: "vitals", patient_name: "Alex Moreau", vital_type: "hba1c", limit: 3 })!;
    expect(q).toEqual({ kind: "vitals", patientName: "Alex Moreau", vitalType: "hba1c", limit: 3 });
  });

  it("returns null for a kind it does not serve", () => {
    // Rendering the wrong records confidently is worse than rendering none: the
    // clinician has no way to tell it guessed.
    expect(parseRecordQuery({ kind: "genome", patient_name: "Alex Moreau" })).toBeNull();
    expect(parseRecordQuery({ kind: "", limit: 3 })).toBeNull();
    expect(parseRecordQuery(null)).toBeNull();
    expect(parseRecordQuery("vitals")).toBeNull();
  });

  it("caps the limit so a request cannot pull a whole history", () => {
    expect(parseRecordQuery({ kind: "vitals", limit: 5000 })!.limit).toBe(20);
    expect(parseRecordQuery({ kind: "vitals", limit: -3 })!.limit).toBe(5);
    expect(parseRecordQuery({ kind: "vitals" })!.limit).toBe(5);
    expect(parseRecordQuery({ kind: "vitals", limit: "4" })!.limit).toBe(4);
  });

  it("drops a vital type it cannot map rather than showing the wrong measurement", () => {
    const q = parseRecordQuery({ kind: "vitals", vital_type: "chakra alignment" })!;
    expect(q.vitalType).toBeUndefined();
  });

  it("ignores a vital type on a kind that has none", () => {
    expect(parseRecordQuery({ kind: "invoices", vital_type: "hba1c" })!.vitalType).toBeUndefined();
  });
});

describe("normaliseVitalType", () => {
  it("takes the key as stored", () => {
    expect(normaliseVitalType("blood_pressure")).toBe("blood_pressure");
  });

  it("takes what a clinician would actually say", () => {
    // A model asked for "HbA1c" should not fail because the column says hba1c.
    expect(normaliseVitalType("HbA1c")).toBe("hba1c");
    expect(normaliseVitalType("Blood Pressure")).toBe("blood_pressure");
    expect(normaliseVitalType("blood sugar")).toBe("glucose");
    expect(normaliseVitalType("BP")).toBe("blood_pressure");
    expect(normaliseVitalType("pulse")).toBe("heart_rate");
    expect(normaliseVitalType("SpO2")).toBe("oxygen_saturation");
    expect(normaliseVitalType("temp")).toBe("temperature");
  });

  it("matches the configured label, so a new vital works without editing a list", () => {
    expect(normaliseVitalType("Total Cholesterol")).toBe("cholesterol_total");
  });

  it("returns null rather than a near miss", () => {
    expect(normaliseVitalType("cholesterol-ish")).toBeNull();
    expect(normaliseVitalType("")).toBeNull();
  });
});

describe("resolvePatient", () => {
  const panel = [
    { user_id: "u1", patient_name: "Alex Moreau" },
    { user_id: "u2", patient_name: "Jane Evans" },
    { user_id: "u3", patient_name: "Priya Nair" },
  ];

  it("finds an exact name", () => {
    expect(resolvePatient("Alex Moreau", panel)?.user_id).toBe("u1");
  });

  it("ignores case and punctuation", () => {
    expect(resolvePatient("alex  moreau", panel)?.user_id).toBe("u1");
    expect(resolvePatient("Moreau, Alex", panel)?.user_id).toBeUndefined();
    expect(resolvePatient("ALEX MOREAU", panel)?.user_id).toBe("u1");
  });

  it("accepts a surname alone, which is how clinicians talk", () => {
    expect(resolvePatient("Moreau", panel)?.user_id).toBe("u1");
    expect(resolvePatient("Nair", panel)?.user_id).toBe("u3");
  });

  it("refuses when two patients could be meant", () => {
    // Showing one of two people's records because their surnames collide is
    // precisely the mistake worth refusing to make.
    const colliding = [
      { user_id: "a", patient_name: "Jane Evans" },
      { user_id: "b", patient_name: "Tom Evans" },
    ];
    expect(resolvePatient("Evans", colliding)).toBeNull();
  });

  it("refuses when two patients share a name exactly", () => {
    const twins = [
      { user_id: "a", patient_name: "Jane Evans" },
      { user_id: "b", patient_name: "Jane Evans" },
    ];
    expect(resolvePatient("Jane Evans", twins)).toBeNull();
  });

  it("returns null for nobody, rather than the first patient on the list", () => {
    expect(resolvePatient("Someone Else", panel)).toBeNull();
    expect(resolvePatient(undefined, panel)).toBeNull();
    expect(resolvePatient("", panel)).toBeNull();
  });

  it("copes with a panel entry that has no name", () => {
    expect(resolvePatient("Moreau", [{ user_id: "x", patient_name: null }])).toBeNull();
  });
});
