-- A document someone else puts in a patient's Vault says who, accurately.
--
-- Every document a clinician or a hospital filed through "Send to Vault" was
-- labelled "From your clinician", whoever sent it. A hospital's front desk
-- can file intake paperwork (the founder's decision: that is their job), so
-- the label could call a receptionist the patient's clinician. The danger
-- was the label, not the upload.
--
-- The origin is now stamped by the server at insert, from the sender's
-- membership and role at that moment, and cannot be supplied or later
-- edited by a client. The patient is told when a document arrives. A
-- non-clinical member may file only non-clinical categories.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', _label; END IF;
  RAISE NOTICE '  ok — %', _label;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_uid::text, ''), true);
  IF _uid IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
END;
$$;

DO $$
DECLARE
  _owner   uuid := 'd0100000-0000-4000-8000-0000000000a1';
  _ada     uuid := 'd0100000-0000-4000-8000-0000000000a2';
  _desk    uuid := 'd0100000-0000-4000-8000-0000000000a3';
  _kemi    uuid := 'd0100000-0000-4000-8000-0000000000a4';
  _pat     uuid := 'd0100000-0000-4000-8000-0000000000a5';
  _other   uuid := 'd0100000-0000-4000-8000-0000000000a6';
  _hosp    uuid := 'd0100000-0000-4000-8000-0000000000b1';
  _elsewhere uuid := 'd0100000-0000-4000-8000-0000000000b2';
  _doc_ada  uuid := gen_random_uuid();
  _doc_desk uuid := gen_random_uuid();
  _doc_kemi uuid := gen_random_uuid();
  _doc_own  uuid;
  _row     record;
  _n       integer;
  _txt     text;
  _raised  boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner, 'do-owner@test.local', now()),
    (_ada,   'do-ada@test.local',   now()),
    (_desk,  'do-desk@test.local',  now()),
    (_kemi,  'do-kemi@test.local',  now()),
    (_pat,   'do-pat@test.local',   now()),
    (_other, 'do-other@test.local', now());
  INSERT INTO public.profiles (user_id, name, email) VALUES
    (_owner, 'Owner',        'do-owner@test.local'),
    (_ada,   'Ada',          'do-ada@test.local'),
    (_desk,  'Rita Reception', 'do-desk@test.local'),
    (_kemi,  'Kemi',         'do-kemi@test.local'),
    (_pat,   'Pat Patient',  'do-pat@test.local'),
    (_other, 'Other Patient','do-other@test.local')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
  INSERT INTO public.clinician_profiles (user_id, title, first_name, last_name) VALUES
    (_ada,  'Dr', 'Ada',  'Obi'),
    (_kemi, 'Dr', 'Kemi', 'Bello');

  INSERT INTO public.practices (id, name, created_by) VALUES
    (_hosp, 'St Elsewhere General', _owner),
    (_elsewhere, 'Mayo Imaginary', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_hosp, _ada,  'clinician',  'active', true),
    (_hosp, _desk, 'front_desk', 'active', true);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all)
  VALUES (_hosp, _pat, true, true);
  -- Dr Bello is Pat's private clinician, invited personally.
  INSERT INTO public.provider_shares
    (user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active)
  VALUES (_pat, _kemi, 'Dr Kemi Bello', 'do-kemi@test.local', 'do-invite-1',
          '{"documents": true}'::jsonb, true);

  -- ==========================================================================
  -- 1. A clinical member: named, with the hospital, and the client's own
  --    claim about the origin thrown away
  -- ==========================================================================
  PERFORM pg_temp.as_user(_ada);
  INSERT INTO public.health_documents
    (id, user_id, uploaded_by_user_id, source_context, file_path, file_name, title, category,
     origin_practice_id, origin_role, origin_label, origin_practice_name)
  VALUES
    (_doc_ada, _pat, _ada, 'clinician_upload', _pat || '/ada.pdf', 'ada.pdf', 'Discharge summary', 'discharge_summary',
     _elsewhere, 'owner', 'From Dr House · Mayo Imaginary', 'Mayo Imaginary');
  PERFORM pg_temp.as_user(NULL);

  SELECT * INTO _row FROM public.health_documents WHERE id = _doc_ada;
  PERFORM pg_temp.assert(_row.origin_label = 'From Dr Ada Obi · St Elsewhere General',
    'a clinical member''s document reads "From Dr Ada Obi · St Elsewhere General" (got ' || COALESCE(_row.origin_label, 'null') || ')');
  PERFORM pg_temp.assert(_row.origin_role = 'clinician', 'the sender''s role at the time is recorded');
  PERFORM pg_temp.assert(_row.origin_practice_id = _hosp, 'the hospital is the one the sender acted through, not the one the client named');
  PERFORM pg_temp.assert(_row.origin_practice_name = 'St Elsewhere General', 'the hospital''s name is kept with the document');

  -- ==========================================================================
  -- 2. A non-clinical member: the hospital and the role, never "clinician"
  -- ==========================================================================
  PERFORM pg_temp.as_user(_desk);
  INSERT INTO public.health_documents
    (id, user_id, uploaded_by_user_id, source_context, file_path, file_name, title, category, origin_label)
  VALUES
    (_doc_desk, _pat, _desk, 'clinician_upload', _pat || '/intake.pdf', 'intake.pdf', 'Registration form', 'other',
     'From your clinician');
  PERFORM pg_temp.as_user(NULL);

  SELECT * INTO _row FROM public.health_documents WHERE id = _doc_desk;
  PERFORM pg_temp.assert(_row.origin_label = 'From St Elsewhere General (front desk)',
    'front desk paperwork reads "From St Elsewhere General (front desk)" (got ' || COALESCE(_row.origin_label, 'null') || ')');
  PERFORM pg_temp.assert(_row.origin_role = 'front_desk', 'the front desk role is recorded');
  PERFORM pg_temp.assert(_row.origin_label NOT ILIKE '%clinician%', 'a receptionist is never labelled a clinician');

  -- The front desk may file paperwork, not a clinical document.
  PERFORM pg_temp.as_user(_desk);
  _raised := false;
  BEGIN
    INSERT INTO public.health_documents
      (user_id, uploaded_by_user_id, source_context, file_path, file_name, title, category)
    VALUES (_pat, _desk, 'clinician_upload', _pat || '/lab.pdf', 'lab.pdf', 'Blood results', 'lab_result');
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents WHERE user_id = _pat AND file_name = 'lab.pdf';
  PERFORM pg_temp.assert(_raised AND _n = 0, 'a non-clinical member cannot file a lab result');

  -- ==========================================================================
  -- 3. A private clinician: named, no institution
  -- ==========================================================================
  PERFORM pg_temp.as_user(_kemi);
  INSERT INTO public.health_documents
    (id, user_id, uploaded_by_user_id, source_context, file_path, file_name, title, category, origin_practice_id)
  VALUES (_doc_kemi, _pat, _kemi, 'clinician_upload', _pat || '/ref.pdf', 'ref.pdf', 'Referral letter', 'referral', _hosp);
  PERFORM pg_temp.as_user(NULL);

  SELECT * INTO _row FROM public.health_documents WHERE id = _doc_kemi;
  PERFORM pg_temp.assert(_row.origin_label = 'From Dr Kemi Bello',
    'a private clinician''s document reads "From Dr Kemi Bello" (got ' || COALESCE(_row.origin_label, 'null') || ')');
  PERFORM pg_temp.assert(_row.origin_role = 'private_clinician' AND _row.origin_practice_id IS NULL,
    'a private clinician is not attributed to a hospital they did not act through');

  -- ==========================================================================
  -- 4. The patient cannot claim an origin, on insert or afterwards
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  INSERT INTO public.health_documents
    (user_id, file_path, file_name, title, category, origin_label, origin_role, origin_practice_id)
  VALUES (_pat, _pat || '/mine.pdf', 'mine.pdf', 'Sick note', 'other',
          'From Dr Ada Obi · St Elsewhere General', 'clinician', _hosp)
  RETURNING id INTO _doc_own;
  PERFORM pg_temp.as_user(NULL);
  SELECT * INTO _row FROM public.health_documents WHERE id = _doc_own;
  PERFORM pg_temp.assert(_row.origin_label IS NULL AND _row.origin_role IS NULL AND _row.origin_practice_id IS NULL,
    'a patient''s own upload carries no origin, whatever the client sent');

  PERFORM pg_temp.as_user(_pat);
  _raised := false;
  BEGIN
    UPDATE public.health_documents SET origin_label = 'From Dr Ada Obi · St Elsewhere General' WHERE id = _doc_own;
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  _raised := false;
  BEGIN
    UPDATE public.health_documents SET origin_label = 'From my GP' WHERE id = _doc_desk;
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT origin_label INTO _txt FROM public.health_documents WHERE id = _doc_own;
  PERFORM pg_temp.assert(_txt IS NULL, 'a patient cannot give their own upload an origin later');
  SELECT origin_label INTO _txt FROM public.health_documents WHERE id = _doc_desk;
  PERFORM pg_temp.assert(_raised AND _txt = 'From St Elsewhere General (front desk)',
    'a patient cannot rewrite the origin of a document someone else filed');

  -- Filing it and renaming it are still the patient's.
  PERFORM pg_temp.as_user(_pat);
  UPDATE public.health_documents SET title = 'My registration form' WHERE id = _doc_desk;
  PERFORM pg_temp.as_user(NULL);
  SELECT title INTO _txt FROM public.health_documents WHERE id = _doc_desk;
  PERFORM pg_temp.assert(_txt = 'My registration form', 'the patient can still rename a document they were sent');

  -- ==========================================================================
  -- 5. The origin is what was true at the time
  -- ==========================================================================
  UPDATE public.practice_members SET role = 'front_desk' WHERE practice_id = _hosp AND user_id = _ada;
  UPDATE public.practice_members SET status = 'ended', ended_at = now(), end_reason = 'left'
   WHERE practice_id = _hosp AND user_id = _desk;
  UPDATE public.practices SET name = 'St Elsewhere NHS Trust' WHERE id = _hosp;
  SELECT origin_label INTO _txt FROM public.health_documents WHERE id = _doc_ada;
  PERFORM pg_temp.assert(_txt = 'From Dr Ada Obi · St Elsewhere General',
    'a later role change or rename does not relabel what Dr Obi sent as a clinician');
  SELECT origin_label INTO _txt FROM public.health_documents WHERE id = _doc_desk;
  PERFORM pg_temp.assert(_txt = 'From St Elsewhere General (front desk)',
    'the sender leaving does not erase where the document came from');

  -- ==========================================================================
  -- 6. The patient is told, and only the patient
  -- ==========================================================================
  SELECT count(*) INTO _n FROM public.patient_notices
   WHERE notice_type = 'document_received' AND related_id IN (_doc_ada, _doc_desk, _doc_kemi);
  PERFORM pg_temp.assert(_n = 3, 'one notice per document someone else filed (got ' || _n || ')');
  SELECT count(*) INTO _n FROM public.patient_notices
   WHERE notice_type = 'document_received' AND related_id = _doc_own;
  PERFORM pg_temp.assert(_n = 0, 'no notice for the patient''s own upload');
  SELECT count(*) INTO _n FROM public.patient_notices
   WHERE notice_type = 'document_received' AND related_id IN (_doc_ada, _doc_desk, _doc_kemi)
     AND patient_user_id <> _pat;
  PERFORM pg_temp.assert(_n = 0, 'every notice is addressed to the patient');

  SELECT message INTO _txt FROM public.patient_notices WHERE related_id = _doc_ada;
  PERFORM pg_temp.assert(_txt = 'St Elsewhere General sent you a document: Discharge summary',
    'the notice names the hospital and the document (got ' || COALESCE(_txt, 'null') || ')');
  SELECT message INTO _txt FROM public.patient_notices WHERE related_id = _doc_kemi;
  PERFORM pg_temp.assert(_txt = 'Dr Kemi Bello sent you a document: Referral letter',
    'the notice names a private clinician (got ' || COALESCE(_txt, 'null') || ')');

  PERFORM pg_temp.as_user(_pat);
  SELECT count(*) INTO _n FROM public.patient_notices WHERE notice_type = 'document_received';
  PERFORM pg_temp.assert(_n = 3, 'the patient reads their notices');
  PERFORM pg_temp.as_user(_ada);
  SELECT count(*) INTO _n FROM public.patient_notices;
  PERFORM pg_temp.assert(_n = 0, 'the sender cannot read the patient''s notices');
  PERFORM pg_temp.as_user(_other);
  SELECT count(*) INTO _n FROM public.patient_notices;
  PERFORM pg_temp.assert(_n = 0, 'another patient cannot read them');
  _raised := false;
  BEGIN
    INSERT INTO public.patient_notices (patient_user_id, notice_type, message)
    VALUES (_pat, 'document_received', 'Mayo Imaginary sent you a document: Bill');
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'nobody can write a notice from the client');
  PERFORM pg_temp.as_user(NULL);

  RAISE NOTICE 'document_origin: all assertions passed';
END $$;

ROLLBACK;
