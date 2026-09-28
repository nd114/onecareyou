-- Who reads a patient record once the patient has taken it over, and who may
-- change a record a colleague filed.
--
-- The author's read path.
--
-- "Clinicians can view their own patient records" asked only whether the
-- caller had written the row. 20261009050000 made the practice read path
-- follow the patient's share, but the author's path went on reading on
-- authorship alone. A record's author, front desk included when front desk
-- filed it, kept reading the patient's conditions, medications and notes after
-- the patient had claimed the record and then revoked them.
--
-- While nobody has claimed a record it is the author's working chart and the
-- author reads it freely. Once linked_user_id is set the record is the
-- patient's, and the author reads it on a live relationship with that
-- patient: a provider share (clinician_has_patient_access(), which is what
-- accepting a record creates), or, for a record filed for a practice, the
-- condition the practice read path uses (may_read_practice_patient_record()).
-- A record the patient declined carries their linked_user_id too, so it leaves
-- the author's list with no share behind it; it could already not be edited
-- or re-sent, since editing needs linked_user_id to be null.
--
-- The practice update path.
--
-- "Practice staff update records their practice created" asked
-- may_manage_practice_patient_records(), which admits anyone holding
-- can_invite_patients, and that defaults to true for every member. It applied
-- to PUBLIC and had no WITH CHECK. Front desk had lost the right to read a
-- colleague's record but could still update it: an UPDATE with no WHERE clause
-- is not filtered by the SELECT policies, so it reached every unclaimed record
-- the practice held. enforce_patient_record_patient_update() threw the
-- clinical fields back for anyone but the author, but tags, gender, the
-- invitation and sharing fields, and practice_id went through.
--
-- A colleague's record is now changed only by a clinical member who could read
-- it. The record's own author still edits it through this policy or through
-- "Clinicians update their own unclaimed patient records", so front desk keeps
-- editing the records it filed. The policy is TO authenticated and its WITH
-- CHECK repeats the same terms, so an update cannot link the record to
-- anybody.
--
-- That trigger reverted the clinical fields for every caller who was not the
-- author, which silently discarded a colleague's edit and left the toast
-- saying it had saved. It was written to stop the patient an invitation is
-- addressed to from rewriting what their clinician filed, and it still does.
-- It now lets through a clinical member of the record's practice who could
-- read the record while it is unclaimed and stays unclaimed, and who is not
-- themselves the person it is addressed to.
--
-- Finally, no signed-in caller moves a record to another practice or
-- re-attributes it to somebody else. Before this the author could set
-- practice_id to any practice, putting their chart in front of another
-- practice's clinicians. A BEFORE UPDATE trigger refuses a change to
-- practice_id or clinician_user_id. Nothing in the client changes either;
-- a caller with no user (service role maintenance) is left alone.

-- ---------------------------------------------------------------------------
-- The author's read path
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians can view their own patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians can view their own patient records"
  ON public.clinician_patient_records
  FOR SELECT TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND (
      linked_user_id IS NULL
      OR public.clinician_has_patient_access(linked_user_id)
      OR (
        practice_id IS NOT NULL
        AND public.may_read_practice_patient_record(practice_id, linked_user_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- The practice update path
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practice staff update records their practice created" ON public.clinician_patient_records;
CREATE POLICY "Practice staff update records their practice created"
  ON public.clinician_patient_records
  FOR UPDATE TO authenticated
  USING (
    practice_id IS NOT NULL
    AND linked_user_id IS NULL
    AND public.may_manage_practice_patient_records(practice_id)
    AND (
      clinician_user_id = auth.uid()
      OR public.may_read_practice_patient_record(practice_id, linked_user_id)
    )
  )
  WITH CHECK (
    practice_id IS NOT NULL
    AND linked_user_id IS NULL
    AND public.may_manage_practice_patient_records(practice_id)
    AND (
      clinician_user_id = auth.uid()
      OR public.may_read_practice_patient_record(practice_id, linked_user_id)
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_patient_record_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.clinician_user_id
     AND NOT (
       OLD.linked_user_id IS NULL
       AND NEW.linked_user_id IS NULL
       AND OLD.practice_id IS NOT NULL
       AND public.may_read_practice_patient_record(OLD.practice_id, NULL)
       AND (OLD.patient_email IS NULL
            OR lower(OLD.patient_email) IS DISTINCT FROM public.confirmed_email())
     )
  THEN
    NEW.clinician_user_id     := OLD.clinician_user_id;
    NEW.patient_email         := OLD.patient_email;
    NEW.patient_name          := OLD.patient_name;
    NEW.patient_phone         := OLD.patient_phone;
    NEW.date_of_birth         := OLD.date_of_birth;
    NEW.blood_type            := OLD.blood_type;
    NEW.allergies             := OLD.allergies;
    NEW.health_conditions     := OLD.health_conditions;
    NEW.medications           := OLD.medications;
    NEW.vitals_history        := OLD.vitals_history;
    NEW.visits                := OLD.visits;
    NEW.notes                 := OLD.notes;
    NEW.created_at            := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- A record stays with its practice and its author
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pin_patient_record_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
      RAISE EXCEPTION 'A patient record stays with the practice that filed it'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.clinician_user_id IS DISTINCT FROM OLD.clinician_user_id THEN
      RAISE EXCEPTION 'A patient record stays with the person who filed it'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinician_patient_records_pin_owner ON public.clinician_patient_records;
CREATE TRIGGER clinician_patient_records_pin_owner
  BEFORE UPDATE ON public.clinician_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.pin_patient_record_owner();
