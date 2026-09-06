/**
 * Where a hospital's cover has holes.
 *
 * The rosters answer "who works here" and "who are our patients". They do not
 * answer the question an administrator actually has on a Monday morning, which
 * is *who is falling through the gaps*: the patient who shared their record with
 * the hospital and was never assigned to anybody, the department running without
 * a lead, the clinician carrying four times what their colleague carries.
 *
 * Every figure here is derived from rows the administration page has already
 * fetched, so this adds no queries. It is a separate module because the
 * arithmetic is worth testing — a coverage report that misses a patient is
 * worse than no coverage report, since it is read as an all-clear.
 *
 * Two rules run through it:
 *
 *  - **A gap is only a gap where the structure exists.** A hospital that has not
 *    created departments has no un-departmented patients; it has no departments.
 *    Reporting hundreds of gaps against a structure the tenant does not use
 *    trains people to ignore the page.
 *  - **Only clinical roles carry patients.** A receptionist assigned to nobody
 *    is a receptionist, not an idle clinician. This mirrors
 *    `practice_role_is_clinical`, via `isClinicalRole`.
 */
import { isClinicalRole, type PracticeRole } from '@/lib/staff-roles';

export interface StaffRow {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  departments: string[];
  leads_departments: string[];
  assigned_patient_count: number;
  has_tenant_wide_view: boolean;
}

export interface PatientRow {
  patient_user_id: string;
  name: string | null;
  email: string | null;
  is_active: boolean;
  departments: string[];
  assigned_clinicians: string[];
}

export interface DepartmentRow {
  id: string;
  name: string;
  is_active: boolean;
}

export interface DepartmentMemberRow {
  department_id: string;
  user_id: string;
  is_lead: boolean;
}

export type CoverageKind =
  | 'patient_unassigned'
  | 'patient_no_department'
  | 'department_no_lead'
  | 'department_empty'
  | 'clinician_idle';

export interface CoverageGap {
  kind: CoverageKind;
  /** Stable across renders: the row this gap is about. */
  id: string;
  subject: string;
  detail: string;
  /** Gaps that leave a patient unattended come first. */
  severity: 'high' | 'medium';
}

/** A member still working here. Archived staff raise nothing. */
function isCurrent(row: StaffRow): boolean {
  return row.status === 'active';
}

function displayName(row: { name: string | null; email: string | null }): string {
  return row.name?.trim() || row.email?.trim() || 'Unnamed';
}

export interface CoverageInput {
  staff: readonly StaffRow[];
  patients: readonly PatientRow[];
  departments: readonly DepartmentRow[];
  members: readonly DepartmentMemberRow[];
}

/**
 * Every hole in the cover, worst first.
 *
 * An unattended patient outranks an empty department: one is a person nobody is
 * looking after, the other is an organisational tidy-up.
 */
export function coverageGaps({
  staff,
  patients,
  departments,
  members,
}: CoverageInput): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const activeDepartments = departments.filter((d) => d.is_active);
  const usesDepartments = activeDepartments.length > 0;

  for (const patient of patients) {
    if (!patient.is_active) continue;

    if (patient.assigned_clinicians.length === 0) {
      gaps.push({
        kind: 'patient_unassigned',
        id: patient.patient_user_id,
        subject: displayName(patient),
        detail: 'Sharing with the hospital, assigned to no clinician.',
        severity: 'high',
      });
    }

    // Only meaningful once the hospital actually runs departments.
    if (usesDepartments && patient.departments.length === 0) {
      gaps.push({
        kind: 'patient_no_department',
        id: patient.patient_user_id,
        subject: displayName(patient),
        detail: 'Not routed to a department.',
        severity: 'medium',
      });
    }
  }

  for (const department of activeDepartments) {
    const inDepartment = members.filter((m) => m.department_id === department.id);

    if (inDepartment.length === 0) {
      gaps.push({
        kind: 'department_empty',
        id: department.id,
        subject: department.name,
        detail: 'No one works in this department.',
        severity: 'medium',
      });
      // An empty department has no lead either; saying so twice adds nothing.
      continue;
    }

    if (!inDepartment.some((m) => m.is_lead)) {
      gaps.push({
        kind: 'department_no_lead',
        id: department.id,
        subject: department.name,
        detail: `${inDepartment.length} ${inDepartment.length === 1 ? 'person' : 'people'}, no department lead.`,
        severity: 'medium',
      });
    }
  }

  for (const member of staff) {
    if (!isCurrent(member)) continue;
    if (!isClinicalRole(member.role as PracticeRole)) continue;
    // Somebody who sees the whole hospital is not waiting for an assignment.
    if (member.has_tenant_wide_view) continue;
    if (member.assigned_patient_count > 0) continue;

    gaps.push({
      kind: 'clinician_idle',
      id: member.user_id,
      subject: displayName(member),
      detail: 'No patients assigned.',
      severity: 'medium',
    });
  }

  return gaps.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

/**
 * The people the work is actually spread across.
 *
 * Active, clinical, and either carrying patients already or available to. A
 * chief administrator with a hospital-wide view and no caseload is not in the
 * pool — but the owner-doctor who has a hospital-wide view *and* forty patients
 * is, or a single-doctor hospital would report having no clinicians.
 */
export function caseloadPool(staff: readonly StaffRow[]): StaffRow[] {
  return staff.filter(
    (s) =>
      isCurrent(s) &&
      isClinicalRole(s.role as PracticeRole) &&
      (s.assigned_patient_count > 0 || !s.has_tenant_wide_view),
  );
}

export interface CaseloadSpread {
  /** Clinicians in the pool. */
  clinicians: number;
  /** Assignments in force. One patient seen by two clinicians counts twice. */
  assignments: number;
  median: number;
  mean: number;
  busiest: { name: string; count: number } | null;
  lightest: { name: string; count: number } | null;
  /** Clinicians in the pool carrying nobody. */
  idle: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** How evenly the caseload sits across the people carrying it. */
export function caseloadSpread(staff: readonly StaffRow[]): CaseloadSpread {
  const pool = caseloadPool(staff);
  const counts = pool.map((s) => s.assigned_patient_count);
  const assignments = counts.reduce((sum, n) => sum + n, 0);

  const ranked = [...pool].sort((a, b) => b.assigned_patient_count - a.assigned_patient_count);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];

  return {
    clinicians: pool.length,
    assignments,
    median: median(counts),
    // Rounded to one place: "8.3 patients each" reads; 8.333333 does not.
    mean: pool.length === 0 ? 0 : Math.round((assignments / pool.length) * 10) / 10,
    busiest: top ? { name: displayName(top), count: top.assigned_patient_count } : null,
    lightest: bottom ? { name: displayName(bottom), count: bottom.assigned_patient_count } : null,
    idle: counts.filter((n) => n === 0).length,
  };
}

export interface Kpi {
  label: string;
  value: number;
  /** Reads under the number. Absent where the label says it all. */
  note?: string;
}

/**
 * The numbers an owner would put in front of a board.
 *
 * Deliberately counts rather than rates: a rate over a tenant with eleven
 * patients is noise wearing a percentage sign.
 */
export function practiceKpis(input: CoverageInput): Kpi[] {
  const { staff, patients, departments } = input;
  const activePatients = patients.filter((p) => p.is_active);
  const spread = caseloadSpread(staff);
  const gaps = coverageGaps(input);
  const unassigned = gaps.filter((g) => g.kind === 'patient_unassigned').length;

  return [
    {
      label: 'Patients sharing',
      value: activePatients.length,
      note: `${patients.length - activePatients.length} ended`,
    },
    {
      label: 'Unassigned patients',
      value: unassigned,
      note: unassigned === 0 ? 'Everyone has a clinician' : 'Nobody is looking after these',
    },
    {
      label: 'Clinicians carrying patients',
      value: spread.clinicians - spread.idle,
      note: `${spread.idle} with none assigned`,
    },
    {
      label: 'Active departments',
      value: departments.filter((d) => d.is_active).length,
    },
    {
      label: 'Assignments in force',
      value: spread.assignments,
      note: `${spread.mean} per clinician on average`,
    },
    {
      label: 'Median caseload',
      value: spread.median,
      note: spread.busiest ? `Busiest: ${spread.busiest.name} (${spread.busiest.count})` : undefined,
    },
  ];
}

export interface CoverageReportRow {
  section: string;
  item: string;
  value: string;
  detail: string;
}

/**
 * The whole report as rows, so an owner can send it on.
 *
 * Long format on purpose: the figures are label/value pairs and the findings
 * are who/what pairs, and a `section` column carries both without bending
 * either into the other's shape. Squeezing two tables into one wide CSV is how
 * a spreadsheet ends up with columns that mean different things down the page.
 */
export function coverageReportRows({
  kpis,
  spread,
  gaps,
  groupTitle,
}: {
  kpis: readonly Kpi[];
  spread: CaseloadSpread;
  gaps: readonly CoverageGap[];
  /** How a finding is titled on screen, so the file and the page agree. */
  groupTitle: (kind: CoverageKind) => string;
}): CoverageReportRow[] {
  const rows: CoverageReportRow[] = kpis.map((kpi) => ({
    section: 'Summary',
    item: kpi.label,
    value: String(kpi.value),
    detail: kpi.note ?? '',
  }));

  rows.push(
    { section: 'Caseload', item: 'Median', value: String(spread.median), detail: '' },
    { section: 'Caseload', item: 'Average', value: String(spread.mean), detail: '' },
    {
      section: 'Caseload',
      item: 'Busiest',
      value: String(spread.busiest?.count ?? 0),
      detail: spread.busiest?.name ?? '',
    },
    {
      section: 'Caseload',
      item: 'Lightest',
      value: String(spread.lightest?.count ?? 0),
      detail: spread.lightest?.name ?? '',
    },
  );

  for (const gap of gaps) {
    rows.push({
      section: groupTitle(gap.kind),
      item: gap.subject,
      value: gap.severity,
      detail: gap.detail,
    });
  }

  return rows;
}
