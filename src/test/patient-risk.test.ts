import { describe, it, expect } from "vitest";
import {
  assessPatientRisk,
  describeReadingStatus,
  isReadingOutsideRange,
  normaliseReading,
  type RiskVital,
} from "@/lib/patient-risk";

const NOW = new Date("2026-08-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const bp = (systolic: number, diastolic: number, when = daysAgo(1)): RiskVital => ({
  type: "blood_pressure", value: systolic, secondary_value: diastolic, unit: "mmHg", recorded_at: when,
});

describe("normaliseReading", () => {
  it("reads a Fahrenheit temperature as Fahrenheit even when the unit says nothing", () => {
    // 98.6 was being compared against a Celsius band and reported as critical.
    expect(normaliseReading("temperature", 98.6, "")).toBeCloseTo(37, 1);
  });

  it("leaves a Celsius temperature alone", () => {
    expect(normaliseReading("temperature", 37.0, "C")).toBeCloseTo(37, 1);
  });

  it("converts mmol/L glucose to mg/dL", () => {
    expect(normaliseReading("glucose", 7, "mmol/L")).toBeCloseTo(126, 0);
  });

  it("infers mmol/L from the magnitude when no unit was given", () => {
    expect(normaliseReading("glucose", 5.5, "")).toBeCloseTo(99, 0);
  });

  it("leaves an mg/dL glucose alone", () => {
    expect(normaliseReading("glucose", 126, "mg/dL")).toBe(126);
  });
});

describe("assessPatientRisk — blood pressure", () => {
  it("catches a dangerous diastolic behind an unremarkable systolic", () => {
    // The original scored `value` only, so this read as entirely normal.
    const result = assessPatientRisk([bp(120, 110)], undefined, NOW);
    const diastolic = result.factors.find((f) => f.type === "diastolic");
    expect(diastolic).toBeDefined();
    expect(diastolic!.severity).toBe("medium");
    expect(result.level).not.toBe("low");
  });

  it("calls a diastolic past the critical threshold critical", () => {
    const result = assessPatientRisk([bp(130, 125)], undefined, NOW);
    expect(result.factors.find((f) => f.type === "diastolic")!.severity).toBe("high");
    expect(result.level).toBe("high");
  });

  it("still catches a high systolic", () => {
    const result = assessPatientRisk([bp(190, 85)], undefined, NOW);
    expect(result.factors.find((f) => f.type === "systolic")!.severity).toBe("high");
  });

  it("leaves a normal reading alone", () => {
    expect(assessPatientRisk([bp(118, 76)], undefined, NOW).factors).toHaveLength(0);
  });

  it("copes with a blood pressure that has no diastolic recorded", () => {
    const result = assessPatientRisk(
      [{ type: "blood_pressure", value: 118, secondary_value: null, unit: "mmHg", recorded_at: daysAgo(1) }],
      undefined, NOW,
    );
    expect(result.factors).toHaveLength(0);
  });
});

describe("assessPatientRisk — explanations", () => {
  it("gives the reference range and when it was taken, not just the number", () => {
    const factor = assessPatientRisk([bp(150, 85)], undefined, NOW).factors[0];
    expect(factor.headline).toContain("150");
    expect(factor.detail).toContain("90–140");
    expect(factor.detail).toContain("yesterday");
  });
});

describe("assessPatientRisk — trends", () => {
  const falling: RiskVital[] = [250, 220, 195, 175].map((v, i) => ({
    type: "glucose", value: v, unit: "mg/dL", recorded_at: daysAgo(6 - i * 2),
  }));

  const rising: RiskVital[] = [150, 175, 205, 235].map((v, i) => ({
    type: "glucose", value: v, unit: "mg/dL", recorded_at: daysAgo(6 - i * 2),
  }));

  it("does not report improvement as a risk factor", () => {
    // Glucose falling from 250 toward normal used to be flagged as a warning
    // sitting alongside genuine findings.
    const result = assessPatientRisk(falling, undefined, NOW);
    expect(result.factors.some((f) => f.headline.includes("falling"))).toBe(false);
  });

  it("does report a measurement heading further out of range", () => {
    const result = assessPatientRisk(rising, undefined, NOW);
    expect(result.factors.some((f) => f.headline.includes("rising"))).toBe(true);
  });

  it("needs at least three readings before calling anything a trend", () => {
    const two = rising.slice(0, 2);
    expect(assessPatientRisk(two, undefined, NOW).factors.some((f) => f.headline.includes("rising"))).toBe(false);
  });
});

describe("assessPatientRisk — the rest", () => {
  it("treats an aliased type as the same measurement", () => {
    const result = assessPatientRisk(
      [{ type: "blood_glucose", value: 300, unit: "mg/dL", recorded_at: daysAgo(1) }],
      undefined, NOW,
    );
    expect(result.factors[0].severity).toBe("high");
  });

  it("flags very low adherence as serious", () => {
    expect(assessPatientRisk([bp(118, 76)], 40, NOW).level).toBe("high");
  });

  it("says nothing about adherence when it is good", () => {
    expect(assessPatientRisk([bp(118, 76)], 95, NOW).factors).toHaveLength(0);
  });

  it("notes a long silence", () => {
    const result = assessPatientRisk([bp(118, 76, daysAgo(30))], undefined, NOW);
    expect(result.factors.some((f) => f.type === "data_freshness")).toBe(true);
  });

  it("puts the most serious finding first", () => {
    const result = assessPatientRisk([bp(190, 125, daysAgo(30))], 40, NOW);
    expect(result.factors[0].severity).toBe("high");
    expect(result.factors[result.factors.length - 1].severity).not.toBe("high");
  });

  it("ignores a row with an unparseable date rather than throwing", () => {
    const result = assessPatientRisk(
      [{ type: "heart_rate", value: 72, unit: "bpm", recorded_at: "not a date" }],
      undefined, NOW,
    );
    expect(result.level).toBe("low");
  });

  it("returns a clean assessment for a patient with no readings at all", () => {
    const result = assessPatientRisk([], undefined, NOW);
    expect(result).toMatchObject({ level: "low", factors: [], highCount: 0, mediumCount: 0 });
  });
});

describe("isReadingOutsideRange", () => {
  it("flags a high diastolic behind a normal systolic", () => {
    expect(isReadingOutsideRange("blood_pressure", 120, 110, "mmHg")).toBe(true);
  });

  it("passes a normal blood pressure", () => {
    expect(isReadingOutsideRange("blood_pressure", 118, 76, "mmHg")).toBe(false);
  });

  it("does not call a Fahrenheit temperature abnormal", () => {
    // The summary view's own copy of the ranges read 98.6 as a Celsius fever.
    expect(isReadingOutsideRange("temperature", 98.6, null, "F")).toBe(false);
  });

  it("still flags a real fever", () => {
    expect(isReadingOutsideRange("temperature", 38.5, null, "C")).toBe(true);
  });

  it("says nothing about a measurement with no normal range", () => {
    expect(isReadingOutsideRange("weight", 78, null, "kg")).toBe(false);
  });

  it("agrees with the full assessment on the same reading", () => {
    const outside = isReadingOutsideRange("blood_pressure", 120, 110, "mmHg");
    const assessed = assessPatientRisk([bp(120, 110)], undefined, NOW).factors.length > 0;
    expect(outside).toBe(assessed);
  });
});

describe("describeReadingStatus — the report a patient hands their clinician", () => {
  it("does not call a dangerous diastolic Normal", () => {
    // The export read `value` alone, so this went to a doctor labelled "Normal".
    expect(describeReadingStatus("blood_pressure", 120, 110, "mmHg")).toBe("High");
  });

  it("does not call a reading High that the clinician's own screen calls normal", () => {
    // VITAL_CONFIG's normalMax of 120 is a target, not an action threshold.
    expect(describeReadingStatus("blood_pressure", 130, 80, "mmHg")).toBe("Normal");
  });

  it("still calls a genuinely high systolic High", () => {
    expect(describeReadingStatus("blood_pressure", 165, 85, "mmHg")).toBe("High");
  });

  it("calls a low reading Low", () => {
    expect(describeReadingStatus("blood_pressure", 85, 55, "mmHg")).toBe("Low");
  });

  it("prefers High when one half is high and the other low", () => {
    // A wide pulse pressure needs acting on; reporting it as Low would bury that.
    expect(describeReadingStatus("blood_pressure", 170, 55, "mmHg")).toBe("High");
  });

  it("handles a Fahrenheit temperature without inventing a fever", () => {
    expect(describeReadingStatus("temperature", 98.6, null, "F")).toBe("Normal");
  });

  it("says Normal for a measurement with no defined range rather than guessing", () => {
    expect(describeReadingStatus("weight", 78, null, "kg")).toBe("Normal");
  });
});
