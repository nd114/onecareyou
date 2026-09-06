import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";
import {
  caseloadPool,
  caseloadSpread,
  coverageGaps,
  coverageReportRows,
  practiceKpis,
  type CoverageInput,
  type DepartmentRow,
  type PatientRow,
  type StaffRow,
} from "@/lib/practice-coverage";

/**
 * The rosters say who works here and who the patients are. These figures say
 * who is falling through the gaps between the two — which is only worth showing
 * if it is right, because a coverage report that misses somebody is read as an
 * all-clear.
 */

const staffRow = (over: Partial<StaffRow> & { user_id: string }): StaffRow => ({
  name: "Dr Ade",
  email: "ade@example.com",
  role: "clinician",
  status: "active",
  departments: [],
  leads_departments: [],
  assigned_patient_count: 0,
  has_tenant_wide_view: false,
  ...over,
});

const patientRow = (over: Partial<PatientRow> & { patient_user_id: string }): PatientRow => ({
  name: "Ada",
  email: "ada@example.com",
  is_active: true,
  departments: [],
  assigned_clinicians: ["Dr Ade"],
  ...over,
});

const department = (over: Partial<DepartmentRow> & { id: string }): DepartmentRow => ({
  name: "Cardiology",
  is_active: true,
  ...over,
});

const empty: CoverageInput = { staff: [], patients: [], departments: [], members: [] };

describe("patients nobody is looking after", () => {
  it("is the first thing reported", () => {
    const gaps = coverageGaps({
      ...empty,
      staff: [staffRow({ user_id: "s1", assigned_patient_count: 0 })],
      patients: [patientRow({ patient_user_id: "p1", assigned_clinicians: [] })],
    });

    expect(gaps[0].kind).toBe("patient_unassigned");
    expect(gaps[0].severity).toBe("high");
  });

  it("says nothing about a patient whose share has ended", () => {
    const gaps = coverageGaps({
      ...empty,
      patients: [patientRow({ patient_user_id: "p1", assigned_clinicians: [], is_active: false })],
    });
    expect(gaps).toHaveLength(0);
  });
});

describe("gaps against structure that does not exist", () => {
  it("does not report un-departmented patients in a hospital with no departments", () => {
    const gaps = coverageGaps({
      ...empty,
      patients: [patientRow({ patient_user_id: "p1", departments: [] })],
    });
    expect(gaps.filter((g) => g.kind === "patient_no_department")).toHaveLength(0);
  });

  it("reports them once a department exists", () => {
    const gaps = coverageGaps({
      ...empty,
      patients: [patientRow({ patient_user_id: "p1", departments: [] })],
      departments: [department({ id: "d1" })],
      members: [{ department_id: "d1", user_id: "s1", is_lead: true }],
    });
    expect(gaps.filter((g) => g.kind === "patient_no_department")).toHaveLength(1);
  });

  it("ignores an archived department entirely", () => {
    const gaps = coverageGaps({
      ...empty,
      departments: [department({ id: "d1", is_active: false })],
    });
    expect(gaps).toHaveLength(0);
  });
});

describe("departments", () => {
  it("reports an empty one without also calling it leaderless", () => {
    const gaps = coverageGaps({ ...empty, departments: [department({ id: "d1" })] });
    expect(gaps.map((g) => g.kind)).toEqual(["department_empty"]);
  });

  it("reports a staffed department with no lead", () => {
    const gaps = coverageGaps({
      ...empty,
      departments: [department({ id: "d1" })],
      members: [{ department_id: "d1", user_id: "s1", is_lead: false }],
    });
    expect(gaps.map((g) => g.kind)).toEqual(["department_no_lead"]);
    expect(gaps[0].detail).toContain("1 person");
  });
});

describe("who counts as idle", () => {
  it("does not call a receptionist an idle clinician", () => {
    const gaps = coverageGaps({
      ...empty,
      staff: [staffRow({ user_id: "s1", role: "front_desk", name: "Reception" })],
    });
    expect(gaps).toHaveLength(0);
  });

  it("does not call someone with a hospital-wide view idle", () => {
    const gaps = coverageGaps({
      ...empty,
      staff: [staffRow({ user_id: "s1", role: "admin", has_tenant_wide_view: true })],
    });
    expect(gaps).toHaveLength(0);
  });

  it("says nothing about archived staff", () => {
    const gaps = coverageGaps({
      ...empty,
      staff: [staffRow({ user_id: "s1", status: "archived" })],
    });
    expect(gaps).toHaveLength(0);
  });

  it("reports a working clinician carrying nobody", () => {
    const gaps = coverageGaps({ ...empty, staff: [staffRow({ user_id: "s1" })] });
    expect(gaps.map((g) => g.kind)).toEqual(["clinician_idle"]);
  });
});

describe("the pool the work is spread across", () => {
  it("keeps a single-doctor hospital from reporting no clinicians", () => {
    // The owner-doctor has a hospital-wide view and forty patients. Excluding
    // everyone with that view would leave the pool empty and every figure zero.
    const pool = caseloadPool([
      staffRow({ user_id: "s1", role: "owner", has_tenant_wide_view: true, assigned_patient_count: 40 }),
    ]);
    expect(pool).toHaveLength(1);
  });

  it("leaves out a chief administrator who carries nobody", () => {
    expect(
      caseloadPool([staffRow({ user_id: "s1", role: "admin", has_tenant_wide_view: true })]),
    ).toHaveLength(0);
  });

  it("leaves out non-clinical and archived staff", () => {
    expect(
      caseloadPool([
        staffRow({ user_id: "s1", role: "billing", assigned_patient_count: 3 }),
        staffRow({ user_id: "s2", status: "archived", assigned_patient_count: 3 }),
      ]),
    ).toHaveLength(0);
  });
});

describe("caseload spread", () => {
  const team = [
    staffRow({ user_id: "s1", name: "Dr A", assigned_patient_count: 12 }),
    staffRow({ user_id: "s2", name: "Dr B", assigned_patient_count: 4 }),
    staffRow({ user_id: "s3", name: "Dr C", assigned_patient_count: 0 }),
  ];

  it("names who is carrying most and least", () => {
    const spread = caseloadSpread(team);
    expect(spread.busiest).toEqual({ name: "Dr A", count: 12 });
    expect(spread.lightest).toEqual({ name: "Dr C", count: 0 });
    expect(spread.idle).toBe(1);
  });

  it("uses the middle value, not the average, for the median", () => {
    // 12 / 4 / 0 averages 5.3 but sits at 4 — the point of showing both.
    expect(caseloadSpread(team).median).toBe(4);
    expect(caseloadSpread(team).mean).toBe(5.3);
  });

  it("takes the midpoint of the two middle values on an even team", () => {
    const spread = caseloadSpread([
      staffRow({ user_id: "s1", assigned_patient_count: 2 }),
      staffRow({ user_id: "s2", assigned_patient_count: 5 }),
    ]);
    expect(spread.median).toBe(3.5);
  });

  it("returns zeroes rather than NaN for an empty hospital", () => {
    const spread = caseloadSpread([]);
    expect(spread).toMatchObject({ clinicians: 0, assignments: 0, median: 0, mean: 0 });
    expect(spread.busiest).toBeNull();
  });
});

describe("the owner's numbers", () => {
  const input: CoverageInput = {
    staff: [
      staffRow({ user_id: "s1", name: "Dr A", assigned_patient_count: 3 }),
      staffRow({ user_id: "s2", name: "Dr B", assigned_patient_count: 0 }),
    ],
    patients: [
      patientRow({ patient_user_id: "p1" }),
      patientRow({ patient_user_id: "p2", assigned_clinicians: [] }),
      patientRow({ patient_user_id: "p3", is_active: false }),
    ],
    departments: [department({ id: "d1" })],
    members: [{ department_id: "d1", user_id: "s1", is_lead: true }],
  };

  it("counts only live shares as patients, and says how many ended", () => {
    const kpis = practiceKpis(input);
    const sharing = kpis.find((k) => k.label === "Patients sharing");
    expect(sharing?.value).toBe(2);
    expect(sharing?.note).toBe("1 ended");
  });

  it("agrees with the gap list on how many are unassigned", () => {
    const unassigned = practiceKpis(input).find((k) => k.label === "Unassigned patients");
    const fromGaps = coverageGaps(input).filter((g) => g.kind === "patient_unassigned");
    expect(unassigned?.value).toBe(fromGaps.length);
    expect(unassigned?.value).toBe(1);
  });

  it("says plainly when nobody is unattended", () => {
    const clean = practiceKpis({ ...input, patients: [patientRow({ patient_user_id: "p1" })] });
    expect(clean.find((k) => k.label === "Unassigned patients")?.note).toBe(
      "Everyone has a clinician",
    );
  });

  it("separates clinicians carrying patients from those carrying none", () => {
    const carrying = practiceKpis(input).find((k) => k.label === "Clinicians carrying patients");
    expect(carrying?.value).toBe(1);
    expect(carrying?.note).toBe("1 with none assigned");
  });

  it("survives a hospital with nothing in it", () => {
    expect(() => practiceKpis(empty)).not.toThrow();
    expect(practiceKpis(empty).every((k) => k.value === 0)).toBe(true);
  });
});

describe("the report an owner sends on", () => {
  const input: CoverageInput = {
    staff: [staffRow({ user_id: "s1", name: "Dr A", assigned_patient_count: 3 })],
    patients: [
      patientRow({ patient_user_id: "p1" }),
      patientRow({ patient_user_id: "p2", assigned_clinicians: [], name: 'Ade, "Junior"' }),
    ],
    departments: [],
    members: [],
  };

  const rows = () =>
    coverageReportRows({
      kpis: practiceKpis(input),
      spread: caseloadSpread(input.staff),
      gaps: coverageGaps(input),
      groupTitle: (kind) => (kind === "patient_unassigned" ? "Patients with no clinician" : kind),
    });

  it("carries the figures and the findings in one file", () => {
    const sections = new Set(rows().map((r) => r.section));
    expect(sections.has("Summary")).toBe(true);
    expect(sections.has("Caseload")).toBe(true);
    expect(sections.has("Patients with no clinician")).toBe(true);
  });

  it("titles a finding the same way the page does", () => {
    const finding = rows().find((r) => r.section === "Patients with no clinician");
    expect(finding?.item).toBe('Ade, "Junior"');
  });

  it("survives a name with a comma and a quote in it", () => {
    // JSON.stringify is not CSV escaping — this is the check that the file
    // opens with its columns still lined up.
    const csv = toCsv(rows(), ["section", "item", "value", "detail"]);
    expect(csv).toContain('"Ade, ""Junior"""');
    const dataLines = csv.trim().split("\n").length;
    expect(dataLines).toBe(rows().length + 1);
  });
});
