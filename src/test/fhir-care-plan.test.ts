import { describe, it, expect } from "vitest";
import {
  describeGoal,
  isMeasurable,
  scoreGoal,
  toFhirCarePlan,
  toFhirGoal,
  type CareGoalRow,
  type CarePlanRow,
} from "@/lib/fhir/care-plan";
import { validateFhir } from "@/lib/fhir/validate";

const PATIENT = "11111111-1111-1111-1111-111111111111";

const plan: CarePlanRow = {
  id: "cp1", patient_user_id: PATIENT, practice_id: null,
  title: "Diabetes control", description: "Bring the HbA1c down and keep it there",
  status: "active", intent: "plan",
  period_start: "2026-09-01", period_end: "2027-03-01",
  created_by: null, created_at: "2026-09-01", updated_at: "2026-09-01",
};

const measurable: CareGoalRow = {
  id: "g1", care_plan_id: "cp1", description: "Get the HbA1c under 7%",
  measure_type: "hba1c", target_comparator: "<", target_value: 7, target_unit: "%",
  due_date: "2027-03-01", achievement_status: "in-progress", sort_order: 0,
};

const vague: CareGoalRow = {
  ...measurable, id: "g2", description: "Walk more on most days",
  measure_type: null, target_comparator: null, target_value: null, target_unit: null,
};

const at = (d: string) => `2026-${d}T08:00:00.000Z`;

describe("scoreGoal", () => {
  it("says a goal is met when the latest reading clears the target", () => {
    const p = scoreGoal(measurable, [{ type: "hba1c", value: 6.4, unit: "%", recorded_at: at("09-01") }]);
    expect(p.met).toBe(true);
    expect(p.latest).toBe(6.4);
    expect(p.reason).toBe("scored");
  });

  it("says it is not, when it does not", () => {
    expect(scoreGoal(measurable, [{ type: "hba1c", value: 8.1, unit: "%", recorded_at: at("09-01") }]).met)
      .toBe(false);
  });

  it("scores on the newest reading, not the best one", () => {
    // Otherwise a patient who once hit target stays "met" forever.
    const p = scoreGoal(measurable, [
      { type: "hba1c", value: 6.2, unit: "%", recorded_at: at("07-01") },
      { type: "hba1c", value: 8.4, unit: "%", recorded_at: at("09-01") },
    ]);
    expect(p.met).toBe(false);
    expect(p.latest).toBe(8.4);
  });

  it("ignores readings of a different measurement", () => {
    const p = scoreGoal(measurable, [
      { type: "glucose", value: 5, unit: "mmol/L", recorded_at: at("09-02") },
      { type: "hba1c", value: 6.5, unit: "%", recorded_at: at("09-01") },
    ]);
    expect(p.latest).toBe(6.5);
  });

  it("converts units before comparing, which is the bug found twice already", () => {
    // A goal of "under 37.5 °C" scored against a Fahrenheit reading compares two
    // different things. 98.6 °F is 37 °C and clears it.
    const tempGoal: CareGoalRow = {
      ...measurable, id: "g3", description: "Stay afebrile",
      measure_type: "temperature", target_comparator: "<", target_value: 37.5, target_unit: "°C",
    };
    const p = scoreGoal(tempGoal, [{ type: "temperature", value: 98.6, unit: "°F", recorded_at: at("09-01") }]);
    expect(p.met).toBe(true);
    expect(p.latest).toBe(37);
  });

  it("honours each comparator", () => {
    const g = (c: string, v: number): CareGoalRow => ({ ...measurable, target_comparator: c, target_value: v });
    const r = [{ type: "hba1c", value: 7, unit: "%", recorded_at: at("09-01") }];
    expect(scoreGoal(g("<", 7), r).met).toBe(false);
    expect(scoreGoal(g("<=", 7), r).met).toBe(true);
    expect(scoreGoal(g(">", 7), r).met).toBe(false);
    expect(scoreGoal(g(">=", 7), r).met).toBe(true);
  });

  it("scores nothing for a goal with no measure, and says why", () => {
    // "Walk more" is a real thing to say. Inventing a number for it is not.
    const p = scoreGoal(vague, [{ type: "hba1c", value: 6, unit: "%", recorded_at: at("09-01") }]);
    expect(p.met).toBeNull();
    expect(p.reason).toBe("no-measure");
  });

  it("distinguishes no readings from a goal that cannot be scored", () => {
    // A patient who has not tested yet is in a different position from one whose
    // goal was never measurable, and the two should not look the same.
    const p = scoreGoal(measurable, []);
    expect(p.met).toBeNull();
    expect(p.reason).toBe("no-readings");
  });

  it("treats an unreadable value as no reading rather than as a failure", () => {
    const p = scoreGoal(measurable, [{ type: "hba1c", value: "not a number", recorded_at: at("09-01") }]);
    expect(p.met).toBeNull();
    expect(p.reason).toBe("no-readings");
  });

  it("reads a numeric string, which is what postgres numeric arrives as", () => {
    expect(scoreGoal({ ...measurable, target_value: "7" }, [
      { type: "hba1c", value: "6.5", unit: "%", recorded_at: at("09-01") },
    ]).met).toBe(true);
  });
});

describe("isMeasurable and describeGoal", () => {
  it("knows which goals can be scored", () => {
    expect(isMeasurable(measurable)).toBe(true);
    expect(isMeasurable(vague)).toBe(false);
  });

  it("puts a measurable goal in words a patient would use", () => {
    expect(describeGoal(measurable)).toBe("HbA1c below 7%");
    expect(describeGoal({ ...measurable, target_comparator: ">=" })).toBe("HbA1c at or above 7%");
  });

  it("leaves an unmeasurable goal exactly as the clinician wrote it", () => {
    expect(describeGoal(vague)).toBe("Walk more on most days");
  });
});

describe("FHIR mapping", () => {
  it("produces a CarePlan that validates against R4", () => {
    expect(() => validateFhir(toFhirCarePlan(plan, [measurable, vague]))).not.toThrow();
  });

  it("produces Goals that validate", () => {
    expect(() => validateFhir(toFhirGoal(measurable, PATIENT))).not.toThrow();
    expect(() => validateFhir(toFhirGoal(vague, PATIENT))).not.toThrow();
  });

  it("references goals rather than copying them", () => {
    // A Goal is its own resource with its own identity; embedding a copy would
    // create a second one that drifts.
    const c = toFhirCarePlan(plan, [measurable]);
    expect(c.goal?.[0].reference).toBe("Goal/g1");
  });

  it("expresses a target as a quantity with a comparator, as FHIR does", () => {
    const g = toFhirGoal(measurable, PATIENT);
    expect(g.target?.[0].detailQuantity?.value).toBe(7);
    expect(g.target?.[0].detailQuantity?.comparator).toBe("<");
    expect(g.target?.[0].dueDate).toBe("2027-03-01");
  });

  it("gives an unmeasurable goal no quantity to misread", () => {
    expect(toFhirGoal(vague, PATIENT).target?.[0].detailQuantity).toBeUndefined();
  });

  it("carries the period and the patient", () => {
    const c = toFhirCarePlan(plan);
    expect(c.period?.start).toBe("2026-09-01");
    expect(c.period?.end).toBe("2027-03-01");
    expect(c.subject?.reference).toBe(`Patient/${PATIENT}`);
  });
});
