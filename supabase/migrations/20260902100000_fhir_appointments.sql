-- Scheduling, as a FHIR Appointment, in our own database.
--
-- The clinical-depth modules are shaped after FHIR resources so that export,
-- QHIN and EHR write-back have something real to map from later. What they are
-- *not* is a second backend: the resource lives in this Postgres, behind the
-- same row policies as everything else, and Medplum's Apache-2.0 libraries are
-- used as libraries — their validator, their search parser, their FHIR router —
-- against a repository implementation that reads this table.
--
-- That keeps one identity system, one authorisation model, and the RLS suite
-- that already proves it, while still getting a real FHIR object rather than an
-- approximation of one.
--
-- Storage shape: the columns a clinician filters and sorts on are real columns;
-- everything else in the resource lives in `resource` as jsonb. Promoting only
-- what is queried keeps indexes honest without pretending a relational table
-- can hold FHIR's full shape.

CREATE TABLE IF NOT EXISTS public.fhir_appointments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which hospital this belongs to. Every extracted or created clinical record
  -- must carry its tenant: without it one hospital's admin could see another's.
  practice_id   uuid REFERENCES public.practices(id) ON DELETE CASCADE,

  patient_user_id   uuid NOT NULL,
  clinician_user_id uuid,
  department_id     uuid REFERENCES public.practice_departments(id) ON DELETE SET NULL,

  -- FHIR Appointment.status. Constrained to the codes the resource allows, so a
  -- value that would fail validation cannot be stored in the first place.
  status text NOT NULL DEFAULT 'proposed',

  start_time timestamptz,
  end_time   timestamptz,

  -- Free text the clinician sees at a glance; FHIR keeps the coded versions
  -- inside `resource`.
  description  text,
  visit_type   text,
  location_text text,

  -- The resource as FHIR, which is the thing exported and mapped. Columns above
  -- are projections of it, maintained together by the application.
  resource jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fhir_appointments_status_check CHECK (status IN (
    'proposed', 'pending', 'booked', 'arrived', 'fulfilled',
    'cancelled', 'noshow', 'entered-in-error', 'checked-in', 'waitlist'
  ))
);

CREATE INDEX IF NOT EXISTS idx_fhir_appointments_patient
  ON public.fhir_appointments (patient_user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_appointments_clinician
  ON public.fhir_appointments (clinician_user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_fhir_appointments_practice
  ON public.fhir_appointments (practice_id, start_time DESC);

COMMENT ON TABLE public.fhir_appointments IS
  'FHIR R4 Appointment. Queried columns are promoted out of the resource; the full '
  'resource stays in `resource` as jsonb. Validated by @medplum/core before it is written '
  '— see src/lib/fhir/. Not a mirror of anything: this is the system of record.';

COMMENT ON COLUMN public.fhir_appointments.resource IS
  'The complete FHIR Appointment. The promoted columns are projections of this and are '
  'written together; the resource is what export and interop read.';

-- Time-dependent rules go in triggers, never CHECK constraints: a CHECK is
-- re-evaluated on every future write, so "must be in the future" would make an
-- old row unupdatable the moment it aged.
CREATE OR REPLACE FUNCTION public.validate_fhir_appointment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Mirrors FHIR's app-3 invariant, which Medplum's validator also enforces
  -- client-side. Kept here too because the database is the last line, and a
  -- booked visit with no time is not schedulable by anyone.
  IF NEW.status NOT IN ('proposed', 'cancelled', 'waitlist')
     AND (NEW.start_time IS NULL OR NEW.end_time IS NULL) THEN
    RAISE EXCEPTION 'An appointment that is % must have a start and an end', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL
     AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'An appointment cannot end before it starts'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fhir_appointment ON public.fhir_appointments;
CREATE TRIGGER trg_validate_fhir_appointment
  BEFORE INSERT OR UPDATE ON public.fhir_appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_fhir_appointment();

-- ---------------------------------------------------------------------------
-- Access, decided by the helpers that already decide it everywhere else
-- ---------------------------------------------------------------------------
ALTER TABLE public.fhir_appointments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.fhir_appointments TO authenticated;

-- Supabase applies default privileges to every new table in public, which hand
-- anon and authenticated the full set including DELETE — the GRANT above does
-- not narrow that, it only adds to it. Verified, not assumed: the privilege is
-- there after a plain replay. So revoke explicitly.
--
-- Refusal does not depend on this. RLS with no DELETE policy already denies
-- every delete, and the test asserts that with the privilege granted. This is
-- the second layer, so the intent is visible in \dp rather than living only in
-- the absence of a policy that someone could add without realising what it
-- turns on.
REVOKE DELETE, TRUNCATE ON public.fhir_appointments FROM anon, authenticated;

-- anon has no policy on this table at all, so it reads and writes nothing.
-- Appointments are never public.
REVOKE ALL ON public.fhir_appointments FROM anon;

-- The patient sees their own appointments. This is the point of the module:
-- scheduling that the person being scheduled can actually see.
DROP POLICY IF EXISTS "Patients read their own appointments" ON public.fhir_appointments;
CREATE POLICY "Patients read their own appointments"
  ON public.fhir_appointments FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid());

DROP POLICY IF EXISTS "Clinicians read appointments for their patients" ON public.fhir_appointments;
CREATE POLICY "Clinicians read appointments for their patients"
  ON public.fhir_appointments FOR SELECT TO authenticated
  USING (
    clinician_user_id = auth.uid()
    OR public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

DROP POLICY IF EXISTS "Clinicians schedule for patients they can reach" ON public.fhir_appointments;
CREATE POLICY "Clinicians schedule for patients they can reach"
  ON public.fhir_appointments FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
  );

DROP POLICY IF EXISTS "Clinicians amend appointments they can reach" ON public.fhir_appointments;
CREATE POLICY "Clinicians amend appointments they can reach"
  ON public.fhir_appointments FOR UPDATE TO authenticated
  USING (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  )
  WITH CHECK (
    public.clinician_has_patient_access(patient_user_id)
    OR public.institution_has_patient_access(patient_user_id)
  );

-- Cancelling is a status change, not a deletion: an appointment that happened,
-- or that someone failed to attend, is part of the record. FHIR has statuses
-- for exactly this, so no DELETE policy is granted to anyone.
COMMENT ON POLICY "Clinicians amend appointments they can reach" ON public.fhir_appointments IS
  'Includes cancelling, which is a status change. No DELETE policy exists on this table by '
  'design — a cancelled or missed appointment is part of the record, and FHIR has statuses '
  'for both.';
