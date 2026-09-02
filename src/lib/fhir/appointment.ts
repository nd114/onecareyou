import type { Appointment, AppointmentParticipant } from "@medplum/fhirtypes";

/**
 * A row of public.fhir_appointments, and the FHIR Appointment it holds.
 *
 * The table promotes the fields a clinician filters and sorts on into real
 * columns and keeps the whole resource in `resource`. That only stays honest if
 * one place writes both, which is this file: build the resource, derive the
 * columns from it, never the other way round. Deriving in the other direction
 * is how a projection quietly stops matching what it projects.
 */

export type AppointmentStatus = NonNullable<Appointment["status"]>;

/** Statuses FHIR allows a booked-but-unscheduled appointment to be in (app-3). */
const TIMELESS_STATUSES: AppointmentStatus[] = ["proposed", "cancelled", "waitlist"];

export interface AppointmentRow {
  id: string;
  practice_id: string | null;
  patient_user_id: string;
  clinician_user_id: string | null;
  department_id: string | null;
  status: string;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  visit_type: string | null;
  location_text: string | null;
  resource: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentInput {
  patientUserId: string;
  clinicianUserId?: string | null;
  practiceId?: string | null;
  departmentId?: string | null;
  status: AppointmentStatus;
  start?: string | null;
  end?: string | null;
  description?: string | null;
  visitType?: string | null;
  locationText?: string | null;
  /** Existing id when amending, so the resource keeps its identity. */
  id?: string;
}

/**
 * Build the FHIR resource for an appointment.
 *
 * Participants are how FHIR says who an appointment is with, and it requires at
 * least one — a fact the validator enforces, so the patient is always present
 * and the clinician joins them when there is one.
 */
export function toFhirAppointment(input: AppointmentInput): Appointment {
  const participant: AppointmentParticipant[] = [
    {
      actor: { reference: `Patient/${input.patientUserId}` },
      status: "accepted",
      required: "required",
    },
  ];

  if (input.clinicianUserId) {
    participant.push({
      actor: { reference: `Practitioner/${input.clinicianUserId}` },
      status: "accepted",
      required: "required",
    });
  }

  const appointment: Appointment = {
    resourceType: "Appointment",
    ...(input.id ? { id: input.id } : {}),
    status: input.status,
    participant,
  };

  if (input.start) appointment.start = input.start;
  if (input.end) appointment.end = input.end;
  if (input.description) appointment.description = input.description;

  if (input.visitType) {
    // FHIR wants a coded type; without a code system agreed with the tenant,
    // the display text is the honest representation rather than a code we made up.
    appointment.appointmentType = { text: input.visitType };
  }

  return appointment;
}

/**
 * The database columns for a resource. Projections, derived from it.
 *
 * Deliberately does not validate: @medplum/definitions cannot run in a browser
 * (34 MB, loaded from disk), and validation a client performs is one it can
 * skip. The rules that must hold are enforced by the database — the CHECK on
 * status and the app-3 trigger — and the full FHIR check runs in tests and
 * server-side through src/lib/fhir/validate.ts.
 */
export function toAppointmentRow(
  input: AppointmentInput,
  createdBy: string,
): Record<string, unknown> {
  const resource = toFhirAppointment(input);

  return {
    ...(input.id ? { id: input.id } : {}),
    practice_id: input.practiceId ?? null,
    patient_user_id: input.patientUserId,
    clinician_user_id: input.clinicianUserId ?? null,
    department_id: input.departmentId ?? null,
    status: input.status,
    start_time: input.start ?? null,
    end_time: input.end ?? null,
    description: input.description ?? null,
    visit_type: input.visitType ?? null,
    location_text: input.locationText ?? null,
    resource: resource as unknown as Record<string, unknown>,
    created_by: createdBy,
  };
}

/**
 * The resource for a row that came back from the database.
 *
 * Prefers the stored resource, because that is the record. Falls back to
 * rebuilding one from the columns for rows written before this module existed,
 * or by anything that touched the table directly — a reader should not have to
 * care which, and returning nothing would lose a real appointment.
 */
export function fromAppointmentRow(row: AppointmentRow): Appointment {
  const stored = row.resource;
  if (
    stored &&
    typeof stored === "object" &&
    (stored as { resourceType?: string }).resourceType === "Appointment"
  ) {
    return { ...(stored as Appointment), id: row.id };
  }

  return toFhirAppointment({
    id: row.id,
    patientUserId: row.patient_user_id,
    clinicianUserId: row.clinician_user_id,
    practiceId: row.practice_id,
    departmentId: row.department_id,
    status: row.status as AppointmentStatus,
    start: row.start_time,
    end: row.end_time,
    description: row.description,
    visitType: row.visit_type,
    locationText: row.location_text,
  });
}

/**
 * The columns and resource for a status change, written together.
 *
 * A status lives in two places — the `status` column the clinic filters on, and
 * `Appointment.status` inside the resource that gets exported. Updating only the
 * column leaves the resource saying `booked` for an appointment that was
 * cancelled, and since `fromAppointmentRow` trusts the stored resource, the
 * cancellation would simply not be visible to anything reading FHIR. Both move
 * here or neither does.
 */
export function toStatusPatch(
  current: Appointment,
  status: AppointmentStatus,
): { status: AppointmentStatus; resource: Record<string, unknown> } {
  return {
    status,
    resource: { ...current, status } as unknown as Record<string, unknown>,
  };
}

/** Does this status require a time? Mirrors FHIR's app-3 invariant. */
export function requiresSchedule(status: AppointmentStatus): boolean {
  return !TIMELESS_STATUSES.includes(status);
}

/** The user id behind a `Patient/<id>` or `Practitioner/<id>` reference. */
export function participantId(
  appointment: Appointment,
  type: "Patient" | "Practitioner",
): string | null {
  const match = appointment.participant?.find((p) =>
    p.actor?.reference?.startsWith(`${type}/`),
  );
  return match?.actor?.reference?.slice(type.length + 1) ?? null;
}
