import type { CarePlan, Goal } from "@medplum/fhirtypes";
import { VITAL_CONFIG, type VitalType } from "@/types/health";
import { normaliseReading } from "@/lib/patient-risk";

/**
 * Care plans and goals, and whether the goals are being met.
 *
 * The differentiated part is not the plan; it is that a goal naming a vital, a
 * comparator and a number can be scored against readings the patient is already
 * taking. Nobody has to be asked at the next visit how it is going — the answer
 * is in the record.
 *
 * A goal with no measure is still a goal. "Walk more on most days" is a real
 * thing a clinician says, and the honest handling is to show it without a
 * progress figure rather than invent one.
 */

export type Comparator = "<" | "<=" | ">" | ">=";

export interface CarePlanRow {
  id: string;
  patient_user_id: string;
  practice_id: string | null;
  title: string;
  description: string | null;
  status: string;
  intent: string;
  period_start: string | null;
  period_end: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  goals?: CareGoalRow[];
}

export interface CareGoalRow {
  id: string;
  care_plan_id: string;
  description: string;
  measure_type: string | null;
  target_comparator: string | null;
  target_value: number | string | null;
  target_unit: string | null;
  due_date: string | null;
  achievement_status: string;
  sort_order: number;
}

export interface GoalProgress {
  /** Null when the goal has no measure, or there is no reading to score it on. */
  met: boolean | null;
  /** The reading it was scored against, in the goal's own units. */
  latest: number | null;
  unit: string | null;
  measuredAt: string | null;
  reason: "no-measure" | "no-readings" | "scored";
}

export interface ReadingLike {
  type: string;
  value: number | string;
  unit?: string | null;
  recorded_at: string;
}

/** Is a goal one that can be scored at all? */
export function isMeasurable(goal: CareGoalRow): boolean {
  return !!goal.measure_type && !!goal.target_comparator && goal.target_value !== null;
}

/**
 * Where a goal stands against the patient's own readings.
 *
 * Uses the most recent reading of the right type, converted to canonical units
 * first — a target of "under 7%" compared against a value logged in a different
 * unit is a comparison of two different things, which is the bug already found
 * and fixed twice elsewhere in this codebase.
 *
 * Deliberately does not decide `achievementStatus`. Whether a goal has been
 * achieved is a clinical judgement, and one reading crossing a threshold is not
 * the same thing as sustained control.
 */
export function scoreGoal(goal: CareGoalRow, readings: ReadingLike[]): GoalProgress {
  if (!isMeasurable(goal)) {
    return { met: null, latest: null, unit: null, measuredAt: null, reason: "no-measure" };
  }

  const type = goal.measure_type as VitalType;
  const matching = readings
    .filter((r) => r.type === type)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));

  if (matching.length === 0) {
    return { met: null, latest: null, unit: null, measuredAt: null, reason: "no-readings" };
  }

  const config = VITAL_CONFIG[type];
  const newest = matching[0];
  const raw = typeof newest.value === "string" ? Number(newest.value) : newest.value;
  if (!Number.isFinite(raw)) {
    return { met: null, latest: null, unit: null, measuredAt: null, reason: "no-readings" };
  }

  const value = normaliseReading(type, raw, newest.unit ?? config?.unit ?? "");
  const target = typeof goal.target_value === "string"
    ? Number(goal.target_value)
    : (goal.target_value ?? 0);

  return {
    met: compare(value, goal.target_comparator as Comparator, target),
    latest: Math.round(value * 10) / 10,
    unit: config?.unit ?? goal.target_unit ?? null,
    measuredAt: newest.recorded_at,
    reason: "scored",
  };
}

function compare(value: number, comparator: Comparator, target: number): boolean {
  switch (comparator) {
    case "<": return value < target;
    case "<=": return value <= target;
    case ">": return value > target;
    case ">=": return value >= target;
  }
}

/** The goal in words, for a patient rather than a chart. */
export function describeGoal(goal: CareGoalRow): string {
  if (!isMeasurable(goal)) return goal.description;
  const config = VITAL_CONFIG[goal.measure_type as VitalType];
  const unit = goal.target_unit ?? config?.unit ?? "";
  const word =
    goal.target_comparator === "<" ? "below"
    : goal.target_comparator === "<=" ? "at or below"
    : goal.target_comparator === ">" ? "above"
    : "at or above";
  return `${config?.label ?? goal.measure_type} ${word} ${goal.target_value}${unit}`;
}

/** FHIR Goal for a stored goal. */
export function toFhirGoal(goal: CareGoalRow, patientUserId: string): Goal {
  const resource: Goal = {
    resourceType: "Goal",
    id: goal.id,
    lifecycleStatus: "active",
    achievementStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/goal-achievement",
          code: goal.achievement_status,
        },
      ],
    },
    description: { text: goal.description },
    subject: { reference: `Patient/${patientUserId}` },
  };

  if (isMeasurable(goal)) {
    const config = VITAL_CONFIG[goal.measure_type as VitalType];
    const value = typeof goal.target_value === "string"
      ? Number(goal.target_value)
      : (goal.target_value ?? 0);

    // FHIR expresses "under 7" as a detailQuantity with a comparator, which is
    // exactly what is stored, so nothing has to be reinterpreted.
    resource.target = [
      {
        measure: { text: config?.label ?? (goal.measure_type as string) },
        detailQuantity: {
          value,
          comparator: goal.target_comparator as Comparator,
          unit: goal.target_unit ?? config?.unit,
        },
        ...(goal.due_date ? { dueDate: goal.due_date } : {}),
      },
    ];
  } else if (goal.due_date) {
    resource.target = [{ measure: { text: goal.description }, dueDate: goal.due_date }];
  }

  return resource;
}

/**
 * FHIR CarePlan for a stored plan.
 *
 * Goals are referenced rather than embedded, which is what FHIR expects: a Goal
 * is its own resource with its own identity, and copying it inside the plan
 * would create a second copy that drifts.
 */
export function toFhirCarePlan(row: CarePlanRow, goals: CareGoalRow[] = []): CarePlan {
  const plan: CarePlan = {
    resourceType: "CarePlan",
    id: row.id,
    status: row.status as CarePlan["status"],
    intent: row.intent as CarePlan["intent"],
    title: row.title,
    subject: { reference: `Patient/${row.patient_user_id}` },
  };

  if (row.description) plan.description = row.description;
  if (row.period_start || row.period_end) {
    plan.period = {
      ...(row.period_start ? { start: row.period_start } : {}),
      ...(row.period_end ? { end: row.period_end } : {}),
    };
  }
  if (goals.length > 0) {
    plan.goal = goals.map((g) => ({ reference: `Goal/${g.id}` }));
  }

  return plan;
}
