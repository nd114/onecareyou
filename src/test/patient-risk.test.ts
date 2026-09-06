import { describe, it, expect } from "vitest";
import {
  assessPatientRisk,
  describeNormalRange,
  describeReadingStatus,
  explainRiskLevel,
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

describe("describeNormalRange", () => {
  it("prints both halves for a blood pressure", () => {
    // Printing only the systolic band beside a 130/85 figure invites the
    // reader to check the wrong half.
    expect(describeNormalRange("blood_pressure")).toBe("90–140 / 60–90");
  });

  it("prints a single band for a single-value measurement", () => {
    expect(describeNormalRange("heart_rate")).toBe("60–100");
  });

  it("resolves an alias", () => {
    expect(describeNormalRange("blood_glucose")).toBe("70–140");
  });

  it("says nothing rather than inventing a range it does not have", () => {
    expect(describeNormalRange("weight")).toBe("—");
  });
});

describe("explaining the level", () => {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("names the critical finding when one drove it", () => {
    const risk = assessPatientRisk([
      { type: "heart_rate", value: 165, unit: "bpm", recorded_at: at(0) },
    ]);
    expect(risk.level).toBe("high");
    expect(explainRiskLevel(risk)).toBe("High because 1 finding is critical.");
  });

  it("says so when the level is high on volume rather than severity", () => {
    // Two moderate findings, nothing critical — the case where a clinician
    // would otherwise be looking for a critical value that is not there.
    const risk = assessPatientRisk([
      { type: "heart_rate", value: 110, unit: "bpm", recorded_at: at(0) },
      { type: "oxygen_saturation", value: 93, unit: "%", recorded_at: at(0) },
    ]);
    expect(risk.level).toBe("high");
    expect(risk.highCount).toBe(0);
    expect(explainRiskLevel(risk)).toContain("two or more moves the level up");
  });

  it("tells a clinician what would take moderate to high", () => {
    const risk = assessPatientRisk([
      { type: "heart_rate", value: 110, unit: "bpm", recorded_at: at(0) },
    ]);
    expect(risk.level).toBe("medium");
    expect(explainRiskLevel(risk)).toContain("Two would make it high");
  });

  it("distinguishes a clean assessment from an empty one", () => {
    const clean = assessPatientRisk([
      { type: "heart_rate", value: 72, unit: "bpm", recorded_at: at(0) },
    ]);
    expect(explainRiskLevel(clean)).toBe("Stable: nothing assessed fell outside its normal range.");
  });
});

describe("what was and was not looked at", () => {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("lists a measurement with no band as unassessed rather than fine", () => {
    // A cholesterol of 400 has no reference band here. Left silent it reads as
    // an all-clear, which is the most convincing kind of wrong answer.
    const risk = assessPatientRisk([
      { type: "heart_rate", value: 72, unit: "bpm", recorded_at: at(0) },
      { type: "cholesterol_total", value: 400, unit: "mg/dL", recorded_at: at(0) },
    ]);

    expect(risk.level).toBe("low");
    expect(risk.assessed).toContain("heart_rate");
    expect(risk.unassessed).toContain("cholesterol_total");
    expect(risk.assessed).not.toContain("cholesterol_total");
  });

  it("counts a blood pressure as assessed", () => {
    const risk = assessPatientRisk([
      { type: "blood_pressure", value: 120, secondary_value: 80, unit: "mmHg", recorded_at: at(0) },
    ]);
    expect(risk.assessed).toEqual(["blood_pressure"]);
    expect(risk.unassessed).toEqual([]);
  });

  it("resolves an alias to the measurement it stands for", () => {
    const risk = assessPatientRisk([
      { type: "spo2", value: 98, unit: "%", recorded_at: at(0) },
    ]);
    expect(risk.assessed).toEqual(["oxygen_saturation"]);
  });
});
