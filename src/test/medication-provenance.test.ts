import { describe, expect, it } from "vitest";

import { isMedicationEditable } from "@/types/health";

/**
 * Mirrors `isVitalEditable`. A row that came from a hospital's system is that
 * system's record of what it prescribed; editing it locally would make the two
 * disagree with no way to tell which is right.
 */
describe("who may change a medication", () => {
  it("lets the patient change what they entered", () => {
    expect(isMedicationEditable({ source: "manual" })).toBe(true);
  });

  it("treats a row with no source as the patient's", () => {
    // Every medication predating provenance was typed by the patient, and the
    // migration backfills 'manual'. This is belt and braces for a row that
    // somehow arrives without it.
    expect(isMedicationEditable({})).toBe(true);
    expect(isMedicationEditable({ source: null })).toBe(true);
  });

  it("refuses to let the patient edit an imported one", () => {
    expect(isMedicationEditable({ source: "City General EHR" })).toBe(false);
    expect(isMedicationEditable({ source: "epic" })).toBe(false);
  });

  it("does not treat a source that merely contains 'manual' as manual", () => {
    // "manual-import" is not the patient typing it.
    expect(isMedicationEditable({ source: "manual-import" })).toBe(false);
  });
});
