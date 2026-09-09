import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { describeVitalSource, isVitalEditable } from "@/hooks/useVitals";
import {
  VITAL_TYPE_ALIASES,
  describeMedicationSource,
  medicationSourceSyncs,
  resolveVitalType,
} from "@/types/health";
import {
  describeInvitationStatus,
  describeSharingModel,
  patientHasAccepted,
} from "@/lib/managed-record-labels";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

/**
 * Found by signing in as a patient and looking at the screen.
 *
 * A clinician records a blood pressure during the visit; two screens write it
 * with `source: 'clinician'`. That value was in neither the VitalSource union
 * nor the badge's lookup nor the refusal message, so the patient's own history
 * showed the reading with an Edit button, a Delete button, a confirmation
 * saying it would be permanently removed — and then a toast blaming an EHR
 * import that had never happened.
 */
describe("a reading somebody else recorded", () => {
  it("is not the patient's to change", () => {
    expect(isVitalEditable({ source: "clinician" })).toBe(false);
    expect(isVitalEditable({ source: "ehr_import" })).toBe(false);
    expect(isVitalEditable({ source: "device" })).toBe(false);
  });

  it("still lets the patient change their own", () => {
    expect(isVitalEditable({ source: "manual" })).toBe(true);
    expect(isVitalEditable({ source: null })).toBe(true);
    expect(isVitalEditable({})).toBe(true);
  });

  it("names who recorded it rather than blaming an EHR", () => {
    expect(describeVitalSource("clinician")).toBe("your clinician");
    expect(describeVitalSource("clinician")).not.toMatch(/EHR/i);
    expect(describeVitalSource("device")).toMatch(/device/i);
  });

  it("carries the source the clinician screens actually write", () => {
    // The union is the contract those two screens are writing against.
    const hook = read("src/hooks/useVitals.ts");
    expect(hook).toMatch(/VitalSource =[^;]*'clinician'/);
    for (const file of [
      "src/components/clinician/EncounterScribePanel.tsx",
      "src/components/clinician/FileDictationDialog.tsx",
    ]) {
      expect(read(file)).toMatch(/source: "clinician"/);
    }
  });

  it("has a badge for it, so the row says who recorded it", () => {
    const badge = read("src/components/vitals/VitalSourceBadge.tsx");
    expect(badge).toMatch(/clinician: \{/);
    // Falling through to the default labelled a clinician's reading "You".
    expect(badge).toMatch(/label: 'Clinician'/);
  });

  it("offers no control that will refuse", () => {
    // The medicine cabinet's rule, applied to the history log: a row that is
    // not the patient's shows provenance instead of Edit and Delete.
    const log = read("src/components/vitals/VitalHistoryLog.tsx");
    expect(log).toMatch(/isVitalEditable\(vital\)\s*\?/);
    expect(log).toMatch(/VitalSourceBadge source=\{vital\.source\}/);
  });
});

/**
 * `fromUnit` was optional and no caller passed it, so every reading was assumed
 * to already be in the config's unit. A glucose stored as 5.8 mmol/L — what an
 * import or a dictation writes — was shown as "5.8 mg/dL" and judged against a
 * mg/dL band, which reads as a severe hypo.
 */
describe("the unit a reading was stored in", () => {
  it("is required at every call site", () => {
    const hook = read("src/hooks/useUnitPreferences.ts");
    expect(hook).toMatch(/fromUnit: string \| null \| undefined/);
    expect(hook).not.toMatch(/fromUnit\?: string/);
  });

  it("is passed by every screen that converts a stored reading", () => {
    const sites = [
      "src/components/vitals/VitalHistoryLog.tsx",
      "src/components/vitals/VitalStatsCard.tsx",
      "src/components/vitals/VitalTrendChart.tsx",
      "src/components/vitals/ExpandedChartModal.tsx",
      "src/components/vitals/EditVitalDialog.tsx",
      "src/pages/Vitals.tsx",
    ];
    for (const file of sites) {
      const src = read(file);
      const calls = src.match(/convertVitalValue\([^)]*\)/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        // Three arguments, and for a row's own value the third is its unit.
        expect(call.split(",").length).toBeGreaterThanOrEqual(3);
        if (/\.value|\.secondary_value/.test(call)) {
          expect(call).toMatch(/\.unit|stats\.unit/);
        }
      }
    }
  });
});

/**
 * The alias map was applied when labelling a row and not when selecting one, so
 * a legacy-keyed reading appeared in the history log and was missing from the
 * card, the chart and the statistics — which read "No readings" with the rows
 * sitting in the table.
 */
describe("a reading stored under a legacy key", () => {
  it("resolves to the canonical type", () => {
    expect(resolveVitalType("blood_glucose")).toBe("glucose");
    expect(resolveVitalType("pulse")).toBe("heart_rate");
    expect(resolveVitalType("glucose")).toBe("glucose");
  });

  it("is selected by the card that summarises it", () => {
    const hook = read("src/hooks/useVitals.ts");
    expect(hook).toMatch(/const sameType =/);
    // The bare comparison is what hid them.
    expect(hook).not.toMatch(/v\.type === type/);
  });

  it("is selected by the history log's type filter", () => {
    const log = read("src/components/vitals/VitalHistoryLog.tsx");
    expect(log).not.toMatch(/v\.type === typeFilter/);
  });

  it("covers every alias the map declares", () => {
    for (const [legacy, canonical] of Object.entries(VITAL_TYPE_ALIASES)) {
      expect(resolveVitalType(legacy)).toBe(canonical);
    }
  });
});

/**
 * `medications.source` holds two kinds of value: a provider name the EHR sync
 * writes, which reads correctly in a sentence, and an internal token, which
 * does not. Four patient-facing strings printed whichever it got.
 */
describe("naming who manages a medication", () => {
  it("translates the platform's own tokens", () => {
    expect(describeMedicationSource("clinician")).toBe("your clinician");
    expect(describeMedicationSource("clinician_assistant")).toBe("your clinician");
    expect(describeMedicationSource("ehr_import")).toMatch(/provider/);
  });

  it("keeps a provider's name as written", () => {
    expect(describeMedicationSource("City General EHR")).toBe("City General EHR");
  });

  it("tidies an unknown value instead of printing the raw token", () => {
    // Never "some_new_pipeline" at a patient, and never nothing either: an
    // unrecognised source is often a practice's own provider name.
    expect(describeMedicationSource("some_new_pipeline")).toBe("Some new pipeline");
    expect(describeMedicationSource("kaiser")).toBe("Kaiser");
    expect(describeMedicationSource("some_new_pipeline")).not.toMatch(/_/);
  });

  it("only promises a sync for a source that syncs", () => {
    expect(medicationSourceSyncs("clinician")).toBe(false);
    expect(medicationSourceSyncs("City General EHR")).toBe(true);
    expect(medicationSourceSyncs("manual")).toBe(false);
  });

  it("is what the patient-facing strings use", () => {
    // Checking only that the file mentions the helper passes on the import
    // line alone — the first version of this test did, and did not notice the
    // raw token going back into the JSX underneath it.
    for (const file of [
      "src/pages/Medications.tsx",
      "src/hooks/useMedications.ts",
      "src/lib/ai-actions.ts",
      "src/components/medications/MedicationSourceBadge.tsx",
    ]) {
      const src = read(file)
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("import"))
        .join("\n");
      expect(src).toMatch(/describeMedicationSource\(/);
      // Both the template-literal form and the JSX one. `source={x.source}` is
      // a prop being handed to a component that does its own labelling, so the
      // lookbehind lets that through and catches only the rendered text.
      expect(src).not.toMatch(/\$\{\s*\w+\.source\s*\}/);
      expect(src).not.toMatch(/(?<![=\w.])\{\s*(existing|med|medication)\.source\s*\}/);
    }
  });
});

/**
 * The clinician's record header showed both of these as tokens, and the invite
 * button's badge said "Accepted" for any status it did not recognise — over a
 * column with no CHECK behind it. Fixing the detail page left the list page and
 * the filter dropdown still rendering the raw word, which is the shape half the
 * findings on this branch have had: the rule was fixed and the neighbour was
 * not.
 */
describe("the words on a managed record", () => {
  it("never presents an unrecognised status as consent", () => {
    expect(patientHasAccepted("accepted")).toBe(true);
    for (const odd of ["pending", "", "ACCEPTED", "sort-of", null, undefined]) {
      expect(patientHasAccepted(odd as string | null | undefined)).toBe(false);
      expect(describeInvitationStatus(odd as string | null | undefined)).toBe("Invitation unknown");
    }
  });

  it("labels the four statuses the application writes", () => {
    expect(describeInvitationStatus("not_invited")).toBe("Not invited");
    expect(describeInvitationStatus("invited")).toBe("Invited");
    expect(describeInvitationStatus("accepted")).toBe("Accepted");
    expect(describeInvitationStatus("declined")).toBe("Declined");
  });

  it("labels the sharing model in the clinician's own terms", () => {
    expect(describeSharingModel("clinician_managed")).toBe("You keep this record");
    expect(describeSharingModel("collaborative")).toMatch(/patient/i);
    expect(describeSharingModel("nonsense")).toBe("Sharing not set");
  });

  it("is used everywhere either column reaches a screen", () => {
    for (const file of [
      "src/pages/ClinicianManagedRecord.tsx",
      "src/pages/ClinicianPatients.tsx",
      "src/components/clinician/ManagedRecordActions.tsx",
      "src/components/clinician/ManagedRecordFilters.tsx",
    ]) {
      const src = read(file);
      expect(src).toMatch(/describe(InvitationStatus|SharingModel)\(/);
      expect(src).not.toMatch(/(invitation_status|data_sharing_model)\.replace\(/);
    }
  });

  it("keeps the vocabulary the database enforces", () => {
    const migration = read(
      "supabase/migrations/20260927100000_a_status_nobody_recognises_is_not_consent.sql",
    );
    for (const word of ["not_invited", "invited", "accepted", "declined"]) {
      expect(migration).toContain(`'${word}'`);
      expect(describeInvitationStatus(word)).not.toBe("Invitation unknown");
    }
    for (const word of ["clinician_managed", "collaborative", "view_only"]) {
      expect(migration).toContain(`'${word}'`);
      expect(describeSharingModel(word)).not.toBe("Sharing not set");
    }
  });
});
