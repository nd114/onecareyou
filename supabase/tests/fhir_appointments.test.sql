-- Scheduling, and who may see or change it.
--
-- fhir_appointments holds a FHIR Appointment behind the same row policies as
-- everything else in this database. That is the whole argument for keeping the
-- resource here rather than in a second backend, so the argument is worth
-- proving rather than asserting: these run the table as `authenticated` through
-- both access pathways and check what each of them can actually reach.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/fhir_appointments.test.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

DO $$
DECLARE
  _patient   uuid := 'fa000000-0000-0000-0000-000000000001';
  _doctor    uuid := 'fa000000-0000-0000-0000-000000000002';
  _stranger  uuid := 'fa000000-0000-0000-0000-000000000003';
  _hospital_doc uuid := 'fa000000-0000-0000-0000-000000000004';
  _other_pt  uuid := 'fa000000-0000-0000-0000-000000000005';
  _owner     uuid := 'fa000000-0000-0000-0000-000000000006';
  _practice  uuid := 'fa000000-0000-0000-0000-0000000000a1';
  _appt      uuid;
  _count integer; _txt text; _ok boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'fa-patient@test.local'), (_doctor,'fa-doctor@test.local'),
    (_stranger,'fa-stranger@test.local'), (_hospital_doc,'fa-hosp@test.local'),
    (_other_pt,'fa-other@test.local'), (_owner,'fa-owner@test.local');

  -- Direct clinician share: the patient invited this doctor.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_patient, _doctor, 'Dr Appt', 'fa-doctor@test.local', 'fatest',
          '{"vitals":true,"meds":true,"profile":true}'::jsonb, true);

  -- Hospital pathway: the patient shared with a practice, and one member there
  -- sees every patient.
  INSERT INTO public.practices (id, name, created_by, tenant_type)
  VALUES (_practice, 'FA General', _owner, 'hospital');

  INSERT INTO public.practice_shares (practice_id, user_id, is_active)
  VALUES (_practice, _patient, true);

  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_practice, _hospital_doc, 'provider', 'active', true);

  -- ==========================================================================
  -- 1. The patient sees their own appointment
  --
  -- The point of the module. Scheduling the person being scheduled cannot see
  -- is a calendar, not care.
  -- ==========================================================================
  INSERT INTO public.fhir_appointments
    (patient_user_id, clinician_user_id, practice_id, status, start_time, end_time,
     description, created_by, resource)
  VALUES (_patient, _doctor, _practice, 'booked',
          now() + interval '7 days', now() + interval '7 days 30 minutes',
          'Six-month diabetes review', _doctor,
          '{"resourceType":"Appointment","status":"booked"}'::jsonb)
  RETURNING id INTO _appt;

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_appointments;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the patient sees the appointment made for them');

  -- ==========================================================================
  -- 2. Somebody else's appointment is not theirs
  -- ==========================================================================
  INSERT INTO public.fhir_appointments
    (patient_user_id, clinician_user_id, status, start_time, end_time, created_by)
  VALUES (_other_pt, _doctor, 'booked',
          now() + interval '1 day', now() + interval '1 day 20 minutes', _doctor);

  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_appointments;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1,
    'a second patient''s appointment stays invisible to the first');

  -- ==========================================================================
  -- 3. Both clinician pathways reach it; a stranger reaches nothing
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_appointments WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the shared-with clinician reads the appointment');

  PERFORM set_config('request.jwt.claim.sub', _hospital_doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_appointments WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'the hospital pathway reads it too');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.fhir_appointments;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'a clinician with no relationship reads nothing at all');

  -- ==========================================================================
  -- 4. A clinician schedules only for patients they can reach
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.fhir_appointments
      (patient_user_id, clinician_user_id, status, start_time, end_time, created_by)
    VALUES (_patient, _doctor, 'booked',
            now() + interval '30 days', now() + interval '30 days 15 minutes', _doctor);
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_ok, 'the clinician can schedule for their own patient');

  PERFORM set_config('request.jwt.claim.sub', _stranger::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.fhir_appointments
      (patient_user_id, status, start_time, end_time, created_by)
    VALUES (_patient, 'booked',
            now() + interval '31 days', now() + interval '31 days 15 minutes', _stranger);
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok,
    'a clinician with no relationship cannot book into a patient''s calendar');

  -- created_by is not decorative: it is what the insert policy checks, so a
  -- clinician cannot file an appointment under somebody else's name.
  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.fhir_appointments
      (patient_user_id, status, start_time, end_time, created_by)
    VALUES (_patient, 'booked',
            now() + interval '32 days', now() + interval '32 days 15 minutes', _hospital_doc);
    _ok := true;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok, 'an appointment cannot be attributed to another clinician');

  -- ==========================================================================
  -- 5. The patient reads but does not write
  --
  -- Requesting a time is a different feature with a different flow. Until it
  -- exists, a patient editing the clinic's calendar directly is not a thing.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _patient::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.fhir_appointments SET status = 'cancelled' WHERE id = _appt;
    GET DIAGNOSTICS _count = ROW_COUNT;
    _ok := _count > 0;
  EXCEPTION WHEN insufficient_privilege THEN _ok := false;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(NOT _ok, 'the patient cannot cancel their own appointment directly');

  -- ==========================================================================
  -- 6. Cancelling is a status change, and deletion is not available to anyone
  --
  -- Asserted with the DELETE privilege in place, because Supabase's default
  -- privileges grant it on every new table in public and a future migration
  -- could re-grant it. The refusal has to come from the absence of a policy,
  -- not from the grant.
  -- ==========================================================================
  GRANT DELETE ON public.fhir_appointments TO authenticated;

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.fhir_appointments WHERE id = _appt;
  GET DIAGNOSTICS _count = ROW_COUNT;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'no DELETE policy exists, so even a privileged clinician deletes nothing');

  REVOKE DELETE ON public.fhir_appointments FROM authenticated;

  PERFORM set_config('request.jwt.claim.sub', _doctor::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.fhir_appointments SET status = 'cancelled' WHERE id = _appt;
  EXECUTE 'SET LOCAL ROLE postgres';
  SELECT status INTO _txt FROM public.fhir_appointments WHERE id = _appt;
  PERFORM pg_temp.assert(_txt = 'cancelled',
    'the clinician cancels by changing status, and the row survives');

  -- ==========================================================================
  -- 7. anon is not on this table at all
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO _count FROM public.fhir_appointments;
  EXCEPTION WHEN insufficient_privilege THEN _count := 0;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'a signed-out visitor reads no appointments');

  -- ==========================================================================
  -- 8. FHIR's app-3 invariant holds in the database
  --
  -- The validator enforces it client-side, which a client can skip. The trigger
  -- is what actually stops a booked visit with no time from being stored.
  -- ==========================================================================
  BEGIN
    INSERT INTO public.fhir_appointments (patient_user_id, status, created_by)
    VALUES (_patient, 'booked', _doctor);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a booked appointment with no time is refused (app-3)');

  BEGIN
    INSERT INTO public.fhir_appointments (patient_user_id, status, created_by)
    VALUES (_patient, 'proposed', _doctor);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(_ok, 'a proposed appointment may have no time yet, as FHIR allows');

  BEGIN
    INSERT INTO public.fhir_appointments
      (patient_user_id, status, start_time, end_time, created_by)
    VALUES (_patient, 'booked', now() + interval '1 day', now() + interval '1 hour', _doctor);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'an appointment cannot end before it starts');

  -- ==========================================================================
  -- 9. A status FHIR does not define cannot be stored
  --
  -- This is the layer the validator does not cover: Appointment.status is bound
  -- to a required ValueSet, and value-set binding needs terminology the
  -- structure-definition bundles do not carry, so @medplum/core passes a code it
  -- has never heard of. The CHECK constraint is what refuses it.
  -- ==========================================================================
  BEGIN
    INSERT INTO public.fhir_appointments
      (patient_user_id, status, start_time, end_time, created_by)
    VALUES (_patient, 'rescheduled', now() + interval '2 days',
            now() + interval '2 days 15 minutes', _doctor);
    _ok := true;
  EXCEPTION WHEN check_violation THEN _ok := false;
  END;
  PERFORM pg_temp.assert(NOT _ok, 'a status outside the FHIR value set is refused');

  -- ==========================================================================
  -- 10. updated_at is stamped by the database, not trusted from the client
  -- ==========================================================================
  UPDATE public.fhir_appointments
     SET updated_at = '2000-01-01T00:00:00Z', description = 'touched'
   WHERE id = _appt;
  SELECT (updated_at > now() - interval '1 minute') INTO _ok
    FROM public.fhir_appointments WHERE id = _appt;
  PERFORM pg_temp.assert(_ok, 'the trigger stamps updated_at over whatever was sent');

  RAISE NOTICE 'ALL FHIR APPOINTMENT TESTS PASSED';
END
$$;

ROLLBACK;
