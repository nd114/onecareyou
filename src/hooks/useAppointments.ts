import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  fromAppointmentRow,
  toAppointmentRow,
  toStatusPatch,
  type AppointmentInput,
  type AppointmentRow,
  type AppointmentStatus,
} from "@/lib/fhir/appointment";
import type { Appointment } from "@medplum/fhirtypes";

export interface ScheduledAppointment {
  id: string;
  status: AppointmentStatus;
  start: string | null;
  end: string | null;
  description: string | null;
  visitType: string | null;
  locationText: string | null;
  patientUserId: string;
  clinicianUserId: string | null;
  practiceId: string | null;
  /** The FHIR resource, for anything that needs the real thing. */
  resource: Appointment;
}

function toScheduled(row: AppointmentRow): ScheduledAppointment {
  return {
    id: row.id,
    status: row.status as AppointmentStatus,
    start: row.start_time,
    end: row.end_time,
    description: row.description,
    visitType: row.visit_type,
    locationText: row.location_text,
    patientUserId: row.patient_user_id,
    clinicianUserId: row.clinician_user_id,
    practiceId: row.practice_id,
    resource: fromAppointmentRow(row),
  };
}

/**
 * Appointments, as FHIR, from our own database.
 *
 * The rows are read through the ordinary Supabase client, so row policies decide
 * what comes back exactly as they do everywhere else — a patient sees their own,
 * a clinician sees the patients they can reach. What Medplum contributes is the
 * resource shape, not the access decision.
 *
 * The full FHIR validation does not run here: it needs 34 MB of structure
 * definitions read off disk and cannot ship to a browser. The rules are enforced
 * by the database instead — the CHECK on status and the app-3 trigger — which is
 * the right place for them anyway, since validation a client performs is
 * validation a client can skip.
 *
 * Pass a patient id for one person's schedule, or nothing for the signed-in
 * clinician's own diary.
 */
export function useAppointments(patientUserId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["fhir-appointments", patientUserId ?? "mine", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async (): Promise<ScheduledAppointment[]> => {
      let q = supabase
        .from("fhir_appointments")
        .select("*")
        .order("start_time", { ascending: true, nullsFirst: false });

      if (patientUserId) q = q.eq("patient_user_id", patientUserId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as AppointmentRow[]).map(toScheduled);
    },
  });

  const schedule = useMutation({
    mutationFn: async (input: Omit<AppointmentInput, "id">) => {
      if (!user) throw new Error("Not authenticated");
      // Built as FHIR first, with the columns derived from the resource, so the
      // two cannot drift. The database refuses anything FHIR would reject.
      const row = toAppointmentRow(input, user.id);
      const { error } = await supabase.from("fhir_appointments").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Appointment scheduled");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not schedule that appointment"),
  });

  /**
   * Cancelling is a status change, not a delete. A cancelled or missed
   * appointment is part of the record, and the table grants no DELETE at all.
   */
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const current = (query.data ?? []).find((a) => a.id === id);
      if (!current) throw new Error("That appointment is no longer loaded");

      const { error } = await supabase
        .from("fhir_appointments")
        .update(toStatusPatch(current.resource, status))
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Appointment updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update that appointment"),
  });

  return {
    appointments: query.data ?? [],
    isLoading: query.isLoading,
    schedule,
    setStatus,
  };
}
