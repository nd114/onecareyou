import { describe, expect, it } from "vitest";

import {
  firstMedicationError,
  isMedicationDraftValid,
  validateMedicationDraft,
  type MedicationDraft,
} from "@/lib/medication-form";

const complete: MedicationDraft = {
  name: "Amlodipine",
  type: "prescription",
  dosage: "5mg",
  frequency: "once_daily",
  times_of_day: ["09:00"],
};

describe("the form the review found saving with required fields empty", () => {
  it("accepts a complete medication", () => {
    expect(validateMedicationDraft(complete)).toEqual({});
    expect(isMedicationDraftValid(complete)).toBe(true);
  });

  it("refuses a medication with no frequency", () => {
    // The one that matters. Frequency picks the dose times, so a medication
    // saved without it has no schedule, generates no reminders, and sits in
    // the list looking complete while never telling the patient to take it.
    const errors = validateMedicationDraft({ ...complete, frequency: "" });
    expect(errors.frequency).toBeDefined();
    expect(errors.frequency).toMatch(/reminder/i);
  });

  it("refuses a medication with no type rather than calling it a prescription", () => {
    // The handler did `type: formData.type || 'prescription'` — a claim about
    // who told the patient to take it, made by a default.
    const errors = validateMedicationDraft({ ...complete, type: "" });
    expect(errors.type).toBeDefined();
  });

  it("refuses a blank name or dosage", () => {
    expect(validateMedicationDraft({ ...complete, name: "   " }).name).toBeDefined();
    expect(validateMedicationDraft({ ...complete, dosage: "" }).dosage).toBeDefined();
  });

  it("refuses a frequency that is not one we can schedule", () => {
    // Reachable through a stale draft or a hand-made request, and it would
    // store a schedule nothing can act on.
    expect(validateMedicationDraft({ ...complete, frequency: "hourly" }).frequency).toMatch(
      /reminders/i,
    );
  });

  it("refuses a schedule with no times, which fails the same way", () => {
    expect(
      validateMedicationDraft({ ...complete, times_of_day: [] }).times_of_day,
    ).toBeDefined();
    expect(
      validateMedicationDraft({ ...complete, times_of_day: ["not a time"] }).times_of_day,
    ).toBeDefined();
  });

  it("does not demand times for something taken as needed", () => {
    // "As needed" has no schedule by definition, and asking for one would
    // make the honest answer unenterable.
    expect(
      validateMedicationDraft({ ...complete, frequency: "as_needed", times_of_day: [] }),
    ).toEqual({});
  });
});

describe("where to send somebody who got it wrong", () => {
  it("names the first problem in form order, not object order", () => {
    const errors = validateMedicationDraft({
      name: "",
      type: "",
      dosage: "",
      frequency: "",
      times_of_day: [],
    });
    expect(firstMedicationError(errors)).toBe("name");
  });

  it("skips fields that are fine", () => {
    const errors = validateMedicationDraft({ ...complete, dosage: "", frequency: "" });
    expect(firstMedicationError(errors)).toBe("dosage");
  });

  it("says nothing when there is nothing wrong", () => {
    expect(firstMedicationError({})).toBeNull();
  });
});
