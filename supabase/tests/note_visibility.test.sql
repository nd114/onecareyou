-- A private note stays private, including from colleagues who can see
-- everything else about the patient.
--
-- The patient record had two note surfaces with nothing in their names to say
-- who each was for, and the private one was a single blob rather than entries.
-- Making both entries means the difference has to be recorded explicitly, and
-- the read policy is where that difference is either honoured or lost.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/note_visibility.test.sql

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
  _patient   uuid := 'b7000000-0000-0000-0000-000000000001';
  _author    uuid := 'b7000000-0000-0000-0000-000000000002';
  _colleague uuid := 'b7000000-0000-0000-0000-000000000003';
  _outsider  uuid := 'b7000000-0000-0000-0000-000000000004';
  _hosp_doc  uuid := 'b7000000-0000-0000-0000-000000000005';
  _hospital  uuid := 'b7111111-0000-0000-0000-000000000001';
  _count integer;
  _i integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_patient,'nv-patient@test.local'), (_author,'nv-author@test.local'),
    (_colleague,'nv-colleague@test.local'), (_outsider,'nv-outsider@test.local');

  -- Both clinicians hold a share with this patient.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES
    (_patient, _author, 'Dr Author', 'nv-author@test.local', 'nvauth',
     '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb, true),
    (_patient, _colleague, 'Dr Colleague', 'nv-colleague@test.local', 'nvcoll',
     '{"vitals":true,"meds":true,"adherence":true,"profile":true}'::jsonb, true);

  PERFORM set_config('request.jwt.claim.sub', _author::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_patient, _author, 'For the team: chase the lipid panel.', 'team');
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_patient, _author, 'My own thought, not for sharing.', 'private');
  EXECUTE 'SET LOCAL ROLE postgres';

  -- ==========================================================================
  -- 1. The author sees both of their own notes
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _author::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2, 'the author sees both their team note and their private one');

  -- ==========================================================================
  -- 2. A colleague with full access to the patient sees only the team note
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 1, 'a colleague sees the team note but not the private one');

  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE patient_user_id = _patient AND visibility = 'private';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'asking for it directly does not reveal a private note');

  -- ==========================================================================
  -- 3. Someone with no access to the patient sees nothing at all
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _outsider::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes WHERE patient_user_id = _patient;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0, 'a clinician with no access to the patient sees no notes');

  -- ==========================================================================
  -- 4. Team remains the default, so an existing note keeps behaving as before
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _author::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body)
  VALUES (_patient, _author, 'No visibility given.');
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE patient_user_id = _patient AND visibility = 'team';
  PERFORM pg_temp.assert(_count = 2, 'a note written without a visibility is a team note');

  -- ==========================================================================
  -- 5. Only the author can amend their own entry
  -- ==========================================================================
  PERFORM set_config('request.jwt.claim.sub', _colleague::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.internal_notes SET body = 'Rewritten by someone else'
   WHERE patient_user_id = _patient AND visibility = 'team';
  EXECUTE 'SET LOCAL ROLE postgres';

  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE body = 'Rewritten by someone else';
  PERFORM pg_temp.assert(_count = 0, 'a colleague cannot rewrite a note they did not author');

  -- ==========================================================================
  -- 6. Hospital staff still read team notes
  --
  -- clinician_has_patient_access() reads provider_shares only. Narrowing the
  -- read policy to that one function would have taken team notes away from
  -- every hospital-assigned patient — the population they exist for. This is
  -- the assertion that would have caught it.
  -- ==========================================================================
  INSERT INTO auth.users (id, email) VALUES (_hosp_doc, 'nv-hospdoc@test.local');
  INSERT INTO public.practices (id, name, tenant_type, slug, created_by)
  VALUES (_hospital, 'Note Visibility Hospital', 'hospital', 'nvhosp', _hosp_doc);
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_hospital, _hosp_doc, 'clinician', 'active', true)
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET status = 'active', can_view_all_patients = true;
  INSERT INTO public.practice_shares (practice_id, user_id, share_all, permissions)
  VALUES (_hospital, _patient, true, '{}'::jsonb);

  PERFORM set_config('request.jwt.claim.sub', _hosp_doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE patient_user_id = _patient AND visibility = 'team';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 2,
    'a hospital clinician with no private share still reads the team notes');

  PERFORM set_config('request.jwt.claim.sub', _hosp_doc::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE patient_user_id = _patient AND visibility = 'private';
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg_temp.assert(_count = 0,
    'hospital access does not reach another clinician''s private notes either');

  -- ==========================================================================
  -- 7. The blob backfill lands as a private entry, once
  --
  -- The old private notes lived in provider_shares.clinician_notes. This is the
  -- migration's own statement, re-run: it must carry the text across and must
  -- not duplicate on a second replay.
  -- ==========================================================================
  UPDATE public.provider_shares SET clinician_notes = '  Old blob: two weeks of observations.  '
   WHERE user_id = _patient AND clinician_user_id = _author;

  FOR _i IN 1..2 LOOP
    INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility, created_at, updated_at)
    SELECT s.user_id, s.clinician_user_id, btrim(s.clinician_notes), 'private', s.created_at, s.created_at
      FROM public.provider_shares s
     WHERE s.clinician_user_id IS NOT NULL
       AND btrim(COALESCE(s.clinician_notes, '')) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM public.internal_notes n
          WHERE n.patient_user_id = s.user_id
            AND n.author_user_id = s.clinician_user_id
            AND n.visibility = 'private'
            AND n.body = btrim(s.clinician_notes)
       );
  END LOOP;

  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE patient_user_id = _patient
     AND body = 'Old blob: two weeks of observations.'
     AND visibility = 'private';
  PERFORM pg_temp.assert(_count = 1,
    'an old notes blob becomes exactly one private entry, trimmed, even on replay');

  SELECT count(*) INTO _count FROM public.internal_notes
   WHERE body = 'Old blob: two weeks of observations.' AND created_at <> updated_at;
  PERFORM pg_temp.assert(_count = 0,
    'a carried-over blob is not marked as edited');

  RAISE NOTICE 'ALL NOTE VISIBILITY TESTS PASSED';
END $$;

ROLLBACK;
