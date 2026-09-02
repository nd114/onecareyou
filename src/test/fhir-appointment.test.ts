import { describe, it, expect } from "vitest";
import {
  fromAppointmentRow,
  participantId,
  requiresSchedule,
  toAppointmentRow,
  toFhirAppointment,
  toStatusPatch,
  type AppointmentRow,
} from "@/lib/fhir/appointment";
import { validateFhir } from "@/lib/fhir/validate";
import type { Appointment } from "@medplum/fhirtypes";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const CLINICIAN = "22222222-2222-2222-2222-222222222222";

const booked = {
  patientUserId: PATIENT,
  clinicianUserId: CLINICIAN,
  status: "booked" as const,
  start: "2026-09-10T09:00:00.000Z",
  end: "2026-09-10T09:30:00.000Z",
  description: "Six-month diabetes review",
};

describe("toFhirAppointment", () => {
  it("always names the patient as a participant, which FHIR requires", () => {
    const a = toFhirAppointment({ patientUserId: PATIENT, status: "proposed" });
    expect(a.participant?.[0].actor?.reference).toBe(`Patient/${PATIENT}`);
  });

  it("adds the clinician when there is one", () => {
    const a = toFhirAppointment(booked);
    expect(a.participant).toHaveLength(2);
    expect(participantId(a, "Practitioner")).toBe(CLINICIAN);
  });

  it("leaves the clinician out rather than inventing a reference", () => {
    // A department-level slot with nobody assigned yet is a real case.
    const a = toFhirAppointment({ patientUserId: PATIENT, status: "proposed" });
    expect(a.participant).toHaveLength(1);
    expect(participantId(a, "Practitioner")).toBeNull();
  });

  it("carries the visit type as display text, not an invented code", () => {
    const a = toFhirAppointment({ ...booked, visitType: "Follow-up" });
    expect(a.appointmentType?.text).toBe("Follow-up");
    expect(a.appointmentType?.coding).toBeUndefined();
  });
});

describe("validateFhir", () => {
  it("accepts a well-formed booked appointment", () => {
    expect(() => validateFhir(toFhirAppointment(booked))).not.toThrow();
  });

  it("rejects a booked appointment with no end — FHIR's app-3 invariant", () => {
    // Worth having: this is a rule we would otherwise have had to think of.
    expect(() =>
      validateFhir(toFhirAppointment({ ...booked, end: null })),
    ).toThrow(/app-3|start/i);
  });

  it("allows a proposed appointment with no times at all", () => {
    expect(() =>
      validateFhir(toFhirAppointment({ patientUserId: PATIENT, status: "proposed" })),
    ).not.toThrow();
  });

  it("does NOT catch an undefined status code — the database does", () => {
    // Worth pinning down rather than assuming. Appointment.status is bound to a
    // required ValueSet, and value-set binding needs terminology that the
    // structure-definition bundles do not carry, so the validator passes a code
    // it has never heard of. The CHECK constraint on fhir_appointments.status
    // is what refuses it, which is why both layers exist rather than one.
    const bogus = { ...toFhirAppointment(booked), status: "rescheduled" as never };
    expect(() => validateFhir(bogus)).not.toThrow();
  });

  it("still catches the structural rules, which is what it is for", () => {
    const noParticipant = { ...toFhirAppointment(booked), participant: [] };
    expect(() => validateFhir(noParticipant)).toThrow();
  });
});

describe("toAppointmentRow", () => {
  it("derives the columns from the resource rather than the input", () => {
    const row = toAppointmentRow(booked, CLINICIAN);
    expect(row.status).toBe("booked");
    expect(row.start_time).toBe(booked.start);
    expect(row.patient_user_id).toBe(PATIENT);
    expect((row.resource as { resourceType: string }).resourceType).toBe("Appointment");
  });

  it("records who created it, which the insert policy requires", () => {
    expect(toAppointmentRow(booked, CLINICIAN).created_by).toBe(CLINICIAN);
  });

  it("does not validate — it maps, and the database refuses", () => {
    // A booked appointment with no end breaks app-3, and this still builds a
    // row for it. That is deliberate: the validator needs 34 MB of structure
    // definitions read off disk, which cannot ship to a browser, so the mapper
    // stays pure and the refusal lives in the validate_fhir_appointment
    // trigger. Callers that can afford the check should run validateFhir first.
    const row = toAppointmentRow({ ...booked, end: null }, CLINICIAN);
    expect(row.end_time).toBeNull();
    expect(() => validateFhir(row.resource as Appointment)).toThrow(/app-3|start/i);
  });

  it("carries the tenant, without which one hospital could see another's", () => {
    const row = toAppointmentRow({ ...booked, practiceId: "practice-1" }, CLINICIAN);
    expect(row.practice_id).toBe("practice-1");
  });
});

describe("fromAppointmentRow", () => {
  const base: AppointmentRow = {
    id: "appt-1",
    practice_id: null,
    patient_user_id: PATIENT,
    clinician_user_id: CLINICIAN,
    department_id: null,
    status: "booked",
    start_time: booked.start,
    end_time: booked.end,
    description: booked.description,
    visit_type: null,
    location_text: null,
    resource: toFhirAppointment(booked),
    created_by: CLINICIAN,
    created_at: booked.start,
    updated_at: booked.start,
  };

  it("returns the stored resource, which is the record", () => {
    const a = fromAppointmentRow(base);
    expect(a.resourceType).toBe("Appointment");
    expect(a.description).toBe(booked.description);
    expect(a.id).toBe("appt-1");
  });

  it("rebuilds from the columns when the resource is missing", () => {
    // Rows written before this module existed, or by anything touching the
    // table directly. Returning nothing would lose a real appointment.
    const a = fromAppointmentRow({ ...base, resource: null });
    expect(a.resourceType).toBe("Appointment");
    expect(a.status).toBe("booked");
    expect(participantId(a, "Patient")).toBe(PATIENT);
  });

  it("rebuilds when the stored json is not an Appointment", () => {
    const a = fromAppointmentRow({ ...base, resource: { resourceType: "Patient" } });
    expect(a.resourceType).toBe("Appointment");
  });

  it("round-trips without losing anything", () => {
    const a = fromAppointmentRow(base);
    expect(() => validateFhir(a)).not.toThrow();
    expect(participantId(a, "Practitioner")).toBe(CLINICIAN);
  });
});

describe("toStatusPatch", () => {
  it("moves the column and the resource together", () => {
    // The bug this exists to stop: updating only the status column leaves the
    // stored resource saying "booked", and fromAppointmentRow trusts the stored
    // resource — so a cancelled appointment reads back as still booked, and
    // anything consuming the FHIR never learns it was cancelled.
    const patch = toStatusPatch(toFhirAppointment(booked), "cancelled");
    expect(patch.status).toBe("cancelled");
    expect((patch.resource as unknown as Appointment).status).toBe("cancelled");
  });

  it("keeps everything else in the resource", () => {
    const patch = toStatusPatch(toFhirAppointment(booked), "fulfilled");
    const after = patch.resource as unknown as Appointment;
    expect(after.participant).toHaveLength(2);
    expect(after.description).toBe(booked.description);
    expect(after.start).toBe(booked.start);
  });

  it("produces a resource the round-trip reads back as cancelled", () => {
    const patch = toStatusPatch(toFhirAppointment(booked), "cancelled");
    const row: AppointmentRow = {
      id: "row-1", practice_id: null, patient_user_id: PATIENT,
      clinician_user_id: CLINICIAN, department_id: null,
      status: patch.status, start_time: booked.start, end_time: booked.end,
      description: booked.description, visit_type: null, location_text: null,
      resource: patch.resource, created_by: CLINICIAN,
      created_at: booked.start, updated_at: booked.start,
    };
    expect(fromAppointmentRow(row).status).toBe("cancelled");
  });
});

describe("requiresSchedule", () => {
  it("knows which statuses can exist without a time", () => {
    expect(requiresSchedule("proposed")).toBe(false);
    expect(requiresSchedule("cancelled")).toBe(false);
    expect(requiresSchedule("waitlist")).toBe(false);
    expect(requiresSchedule("booked")).toBe(true);
    expect(requiresSchedule("arrived")).toBe(true);
  });
});
