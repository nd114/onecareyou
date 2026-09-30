-- A family member's rows stay the family member's.
--
-- A dependent's readings, medicines, doses, documents, folders, notes and alert
-- settings are stored under the account holder's user_id with a
-- family_member_id tag. Three things went wrong with that shape, and this suite
-- holds each of them shut:
--
--   1. Removing the family member deleted their history (ON DELETE CASCADE on
--      medications, vitals, schedule_entries, care_alert_settings) and quietly
--      made their documents, folders and notes the owner's (ON DELETE SET
--      NULL). Removing is now archiving; nothing is deleted and no key can
--      cascade or be blanked.
--   2. A clinician or hospital the parent shares with read the child's rows as
--      the parent's, because every read rule asked about user_id only. The
--      parent's share now covers the parent only, on every read path.
--   3. Missed-dose alerts counted every pending dose on the account, whoever
--      it was for. The count now belongs to the setting's person.
--
-- See docs/plans/family-caregivers-and-next-of-kin.md, phase 0.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(_condition boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS NOT TRUE THEN
    PERFORM set_config('onecare_test.failures',
      COALESCE(current_setting('onecare_test.failures', true), '') || E'\n    ' || _label, true);
    RAISE NOTICE '  FAILED — %', _label;
  ELSE
    RAISE NOTICE '  ok — %', _label;
  END IF;
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

-- Runs a statement, swallowing a refusal: the assertions are about what is
-- left, since an absent policy refuses by affecting nothing.
CREATE OR REPLACE FUNCTION pg_temp.try(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- How many of the given ids the current caller can see in a table.
CREATE OR REPLACE FUNCTION pg_temp.visible(_table text, _ids uuid[]) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s WHERE id = ANY ($1)', _table) INTO _n USING _ids;
  RETURN _n;
END;
$$;

SELECT set_config('onecare_test.failures', '', false);

DO $$
DECLARE
  _parent  uuid := 'fa000000-0000-4000-8000-0000000000a1';
  _other   uuid := 'fa000000-0000-4000-8000-0000000000a2';
  _dr      uuid := 'fa000000-0000-4000-8000-0000000000d1';
  _hdr     uuid := 'fa000000-0000-4000-8000-0000000000d2';
  _howner  uuid := 'fa000000-0000-4000-8000-0000000000e1';
  _hosp    uuid := 'fa000000-0000-4000-8000-0000000000b1';
  _child   uuid;
  _share   uuid;
  _oshare  uuid;
  -- the parent's own rows, and the child's
  _pv uuid; _cv uuid;
  _pm uuid; _cm uuid;
  _pd uuid; _cd1 uuid; _cd2 uuid;
  _pdoc uuid; _cdoc uuid; _odoc uuid;
  _cfolder uuid; _cnote uuid;
  _pset uuid; _cset uuid;
  _id uuid;
  _n integer;
  _ok boolean;
  _txt text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_parent, 'fam-parent@test.local', now()),
    (_other,  'fam-other@test.local',  now()),
    (_dr,     'fam-dr@test.local',     now()),
    (_hdr,    'fam-hdr@test.local',    now()),
    (_howner, 'fam-howner@test.local', now());
  INSERT INTO public.profiles (user_id, name, email)
  SELECT id, split_part(email, '@', 1), email FROM auth.users WHERE email LIKE 'fam-%@test.local'
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name)
  VALUES (_dr, 'Dana', 'Doctor'), (_hdr, 'Hal', 'Hospital'), (_howner, 'Olive', 'Owner')
  ON CONFLICT (user_id) DO NOTHING;

  -- ==========================================================================
  -- Fixture: the parent records for themselves and for their child
  -- ==========================================================================
  PERFORM pg_temp.as_user(_parent);
  INSERT INTO public.family_members (owner_user_id, name, relationship)
  VALUES (_parent, 'Kit', 'child') RETURNING id INTO _child;

  INSERT INTO public.vitals (user_id, type, value, unit)
  VALUES (_parent, 'heart_rate', 70, 'bpm') RETURNING id INTO _pv;
  INSERT INTO public.vitals (user_id, family_member_id, type, value, unit)
  VALUES (_parent, _child, 'heart_rate', 130, 'bpm') RETURNING id INTO _cv;

  INSERT INTO public.medications (user_id, name, dosage, frequency)
  VALUES (_parent, 'Parent med', '5 mg', 'once_daily') RETURNING id INTO _pm;
  INSERT INTO public.medications (user_id, family_member_id, name, dosage, frequency)
  VALUES (_parent, _child, 'Child med', '2 mg', 'twice_daily') RETURNING id INTO _cm;

  -- Past, still pending: missed. The child's second dose is written without a
  -- tag, as the old client could; it must still count as the child's.
  INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time, status)
  VALUES (_parent, _pm, now() - interval '1 minute', 'pending') RETURNING id INTO _pd;
  INSERT INTO public.schedule_entries (user_id, medication_id, family_member_id, scheduled_time, status)
  VALUES (_parent, _cm, _child, now() - interval '2 minutes', 'pending') RETURNING id INTO _cd1;
  INSERT INTO public.schedule_entries (user_id, medication_id, scheduled_time, status)
  VALUES (_parent, _cm, now() - interval '3 minutes', 'pending') RETURNING id INTO _cd2;

  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_parent, _parent || '/fam-parent.pdf', 'fam-parent.pdf', 'Parent letter') RETURNING id INTO _pdoc;
  INSERT INTO public.health_documents (user_id, family_member_id, file_path, file_name, title)
  VALUES (_parent, _child, _parent || '/fam-child.pdf', 'fam-child.pdf', 'Child discharge letter') RETURNING id INTO _cdoc;
  INSERT INTO public.document_folders (user_id, family_member_id, name)
  VALUES (_parent, _child, 'Kit''s letters') RETURNING id INTO _cfolder;
  INSERT INTO public.personal_notes (user_id, family_member_id, title)
  VALUES (_parent, _child, 'Kit''s asthma') RETURNING id INTO _cnote;

  INSERT INTO public.care_alert_settings (user_id, alert_recipient_email, alert_recipient_name, missed_dose_threshold)
  VALUES (_parent, 'fam-contact@test.local', 'Contact', 1) RETURNING id INTO _pset;
  INSERT INTO public.care_alert_settings (user_id, family_member_id, alert_recipient_email, alert_recipient_name, missed_dose_threshold)
  VALUES (_parent, _child, 'fam-contact@test.local', 'Contact', 1) RETURNING id INTO _cset;

  -- The parent shares everything with a clinician, and with a hospital.
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active, permissions)
  VALUES (_parent, 'Dr Dana', 'FAM-SHARE', _dr, true,
          '{"profile": true, "vitals": true, "medications": true, "adherence": true, "documents": true}')
  RETURNING id INTO _share;
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES
    ('health-documents', _parent || '/fam-parent.pdf', _parent),
    ('health-documents', _parent || '/fam-child.pdf', _parent);
  INSERT INTO public.document_shares (document_id, user_id, provider_share_id, is_active)
  VALUES (_pdoc, _parent, _share, true), (_cdoc, _parent, _share, true);

  ALTER TABLE public.practices DISABLE TRIGGER add_practice_owner_trigger;
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'Family Hospital', _howner);
  ALTER TABLE public.practices ENABLE TRIGGER add_practice_owner_trigger;
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_hosp, _hdr, 'clinician', 'active', true);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_hosp, _parent, true, true, '{}');

  -- ==========================================================================
  -- 1. The parent's clinician: the parent's rows, and none of the child's
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.assert(pg_temp.visible('public.vitals', ARRAY[_pv]) = 1,
    '1a fixture: the clinician reads the parent''s own reading');
  PERFORM pg_temp.assert(pg_temp.visible('public.vitals', ARRAY[_cv]) = 0,
    '1a the clinician reads none of the child''s readings');
  PERFORM pg_temp.assert(pg_temp.visible('public.medications', ARRAY[_pm]) = 1,
    '1b fixture: the clinician reads the parent''s own medication');
  PERFORM pg_temp.assert(pg_temp.visible('public.medications', ARRAY[_cm]) = 0,
    '1b the clinician reads none of the child''s medications');
  PERFORM pg_temp.assert(pg_temp.visible('public.medications_with_status', ARRAY[_cm]) = 0,
    '1b nor through medications_with_status');
  PERFORM pg_temp.assert(pg_temp.visible('public.schedule_entries', ARRAY[_pd]) = 1,
    '1c fixture: the clinician reads the parent''s own dose');
  PERFORM pg_temp.assert(pg_temp.visible('public.schedule_entries', ARRAY[_cd1, _cd2]) = 0,
    '1c the clinician reads none of the child''s doses, tagged or not');
  PERFORM pg_temp.assert(pg_temp.visible('public.health_documents', ARRAY[_pdoc]) = 1,
    '1d fixture: the clinician reads the parent''s own document');
  PERFORM pg_temp.assert(pg_temp.visible('public.health_documents', ARRAY[_cdoc]) = 0,
    '1d the clinician reads none of the child''s documents (whole vault or shared one at a time)');
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'health-documents' AND name = _parent || '/fam-parent.pdf';
  PERFORM pg_temp.assert(_n = 1, '1e fixture: the clinician can open the parent''s shared file');
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'health-documents' AND name = _parent || '/fam-child.pdf';
  PERFORM pg_temp.assert(_n = 0, '1e the clinician cannot open the child''s file');

  -- Nor write into the child's record through the parent's share.
  _ok := pg_temp.try(format(
    'INSERT INTO public.vitals (user_id, family_member_id, type, value, unit, source, recorded_by_user_id) '
    'VALUES (%L, %L, %L, 99, %L, %L, %L)', _parent, _child, 'heart_rate', 'bpm', 'clinician', _dr));
  PERFORM pg_temp.assert(NOT _ok, '1f the clinician cannot record a reading into the child''s record');
  _ok := pg_temp.try(format(
    'INSERT INTO public.health_documents (user_id, family_member_id, file_path, file_name, uploaded_by_user_id, source_context) '
    'VALUES (%L, %L, %L, %L, %L, %L)', _parent, _child, _parent || '/fam-dr.pdf', 'fam-dr.pdf', _dr, 'clinician_upload'));
  PERFORM pg_temp.assert(NOT _ok, '1f nor file a document into it');
  _ok := pg_temp.try(format(
    'INSERT INTO public.record_change_proposals (patient_user_id, proposed_by_user_id, kind, payload, medication_id) '
    'VALUES (%L, %L, %L, %L, %L)', _parent, _dr, 'medication_change', '{"dosage": "4 mg"}', _cm));
  PERFORM pg_temp.assert(NOT _ok, '1f nor propose a change to the child''s medication');
  _ok := pg_temp.try(format(
    'INSERT INTO public.record_change_proposals (patient_user_id, proposed_by_user_id, kind, payload, medication_id) '
    'VALUES (%L, %L, %L, %L, %L)', _parent, _dr, 'medication_change', '{"dosage": "10 mg"}', _pm));
  PERFORM pg_temp.assert(_ok, '1f fixture: a change to the parent''s own medication can still be proposed');

  -- ==========================================================================
  -- 2. The parent's hospital: the same
  -- ==========================================================================
  PERFORM pg_temp.as_user(_hdr);
  PERFORM pg_temp.assert(pg_temp.visible('public.vitals', ARRAY[_pv]) = 1
                     AND pg_temp.visible('public.medications', ARRAY[_pm]) = 1
                     AND pg_temp.visible('public.schedule_entries', ARRAY[_pd]) = 1
                     AND pg_temp.visible('public.health_documents', ARRAY[_pdoc]) = 1,
    '2 fixture: the hospital reads the parent''s own rows in every table');
  PERFORM pg_temp.assert(pg_temp.visible('public.vitals', ARRAY[_cv]) = 0,
    '2a the hospital reads none of the child''s readings');
  PERFORM pg_temp.assert(pg_temp.visible('public.medications', ARRAY[_cm]) = 0,
    '2b nor medications');
  PERFORM pg_temp.assert(pg_temp.visible('public.schedule_entries', ARRAY[_cd1, _cd2]) = 0,
    '2c nor doses');
  PERFORM pg_temp.assert(pg_temp.visible('public.health_documents', ARRAY[_cdoc]) = 0,
    '2d nor documents');
  _ok := pg_temp.try(format(
    'INSERT INTO public.vitals (user_id, family_member_id, type, value, unit, source, recorded_by_user_id) '
    'VALUES (%L, %L, %L, 99, %L, %L, %L)', _parent, _child, 'heart_rate', 'bpm', 'clinician', _hdr));
  PERFORM pg_temp.assert(NOT _ok, '2e the hospital cannot record into the child''s record');

  -- ==========================================================================
  -- 3. A document share pointing at somebody else's document
  -- ==========================================================================
  -- document_shares' UPDATE policy lets a patient repoint document_id. A
  -- clinician's read must still be of the sharing patient's own document.
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_other, _other || '/fam-other.pdf', 'fam-other.pdf', 'Someone else''s') RETURNING id INTO _odoc;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('health-documents', _other || '/fam-other.pdf', _other);
  INSERT INTO public.document_shares (document_id, user_id, provider_share_id, is_active)
  VALUES (_odoc, _parent, _share, true);
  PERFORM pg_temp.as_user(_dr);
  PERFORM pg_temp.assert(pg_temp.visible('public.health_documents', ARRAY[_odoc]) = 0,
    '3 a document share on the parent''s share cannot open another patient''s document');
  SELECT count(*) INTO _n FROM storage.objects
   WHERE bucket_id = 'health-documents' AND name = _other || '/fam-other.pdf';
  PERFORM pg_temp.assert(_n = 0, '3 nor its file');
  -- A fresh share, so a refusal here is the rule and not a duplicate key.
  PERFORM pg_temp.as_user(_parent);
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, is_active, permissions)
  VALUES (_parent, 'Dr Later', 'FAM-SHARE-2', true, '{}') RETURNING id INTO _oshare;
  _ok := pg_temp.try(format(
    'INSERT INTO public.document_shares (document_id, user_id, provider_share_id) VALUES (%L, %L, %L)',
    _pdoc, _parent, _oshare));
  PERFORM pg_temp.assert(_ok, '3 fixture: the parent can share their own document one at a time');
  _ok := pg_temp.try(format(
    'INSERT INTO public.document_shares (document_id, user_id, provider_share_id) VALUES (%L, %L, %L)',
    _cdoc, _parent, _oshare));
  PERFORM pg_temp.assert(NOT _ok, '3 the parent cannot share the child''s document on their own share');
  _ok := pg_temp.try(format(
    'INSERT INTO public.document_shares (document_id, user_id, provider_share_id) VALUES (%L, %L, %L)',
    _odoc, _parent, _oshare));
  PERFORM pg_temp.assert(NOT _ok, '3 nor somebody else''s document');

  -- ==========================================================================
  -- 4. Tags name the owner's own family member
  -- ==========================================================================
  PERFORM pg_temp.as_user(_other);
  _ok := pg_temp.try(format(
    'INSERT INTO public.vitals (user_id, family_member_id, type, value, unit) VALUES (%L, %L, %L, 80, %L)',
    _other, _child, 'heart_rate', 'bpm'));
  PERFORM pg_temp.assert(NOT _ok, '4 another account cannot file a row under the parent''s child');
  PERFORM pg_temp.as_user(NULL);
  SELECT family_member_id INTO _id FROM public.schedule_entries WHERE id = _cd2;
  PERFORM pg_temp.assert(_id = _child, '4 a dose belongs to whoever its medicine is for, whatever the writer said');

  -- ==========================================================================
  -- 5. Missed-dose alerts count the setting's person
  -- ==========================================================================
  SELECT count(*) INTO _n FROM public.care_alert_missed_doses(_pset, now() - interval '1 hour', now());
  PERFORM pg_temp.assert(_n = 1, '5 the parent''s alert counts the parent''s one missed dose (got ' || _n || ')');
  SELECT count(*) INTO _n FROM public.care_alert_missed_doses(_cset, now() - interval '1 hour', now());
  PERFORM pg_temp.assert(_n = 2, '5 the child''s alert counts the child''s two missed doses (got ' || _n || ')');
  PERFORM pg_temp.as_user(_parent);
  _ok := pg_temp.try(format('SELECT public.care_alert_missed_doses(%L, now() - interval ''1 hour'', now())', _pset));
  PERFORM pg_temp.assert(NOT _ok, '5 the count is the scheduled job''s, not a client''s');

  -- ==========================================================================
  -- 6. Removing is archiving: nothing is deleted, nothing changes hands
  -- ==========================================================================
  -- A member with nothing recorded yet, so no key can be what refuses: the
  -- refusal here is the missing DELETE policy and grant.
  PERFORM pg_temp.as_user(_parent);
  INSERT INTO public.family_members (owner_user_id, name) VALUES (_parent, 'Empty') RETURNING id INTO _id;
  PERFORM pg_temp.try(format('DELETE FROM public.family_members WHERE id = %L', _id));
  PERFORM pg_temp.try(format('DELETE FROM public.family_members WHERE id = %L', _child));
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.family_members WHERE id IN (_id, _child);
  PERFORM pg_temp.assert(_n = 2, '6a the owner cannot delete a family member, even one with no history yet');

  -- The platform, a cleanup script or the dashboard cannot either: every key
  -- refuses rather than cascading or blanking.
  _ok := pg_temp.try(format('DELETE FROM public.family_members WHERE id = %L', _child));
  PERFORM pg_temp.assert(NOT _ok, '6b a delete with rows attached is refused, even as the superuser');
  SELECT string_agg(c.conrelid::regclass::text, ', ' ORDER BY 1) INTO _txt
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid = 'public.family_members'::regclass
     AND c.confdeltype <> 'r';
  PERFORM pg_temp.assert(_txt IS NULL, '6b every key to family_members is ON DELETE RESTRICT: ' || COALESCE(_txt, 'yes'));

  PERFORM pg_temp.as_user(_parent);
  UPDATE public.family_members SET archived_at = now() WHERE id = _child;
  SELECT count(*) INTO _n FROM public.family_members
   WHERE id = _child AND archived_at IS NOT NULL AND is_active = false;
  PERFORM pg_temp.assert(_n = 1, '6c the owner archives, and the member leaves the pickers (is_active false)');
  PERFORM pg_temp.assert(
        pg_temp.visible('public.vitals', ARRAY[_cv]) = 1
    AND pg_temp.visible('public.medications', ARRAY[_cm]) = 1
    AND pg_temp.visible('public.schedule_entries', ARRAY[_cd1, _cd2]) = 2
    AND pg_temp.visible('public.health_documents', ARRAY[_cdoc]) = 1
    AND pg_temp.visible('public.document_folders', ARRAY[_cfolder]) = 1
    AND pg_temp.visible('public.personal_notes', ARRAY[_cnote]) = 1
    AND pg_temp.visible('public.care_alert_settings', ARRAY[_cset]) = 1,
    '6d the archived member''s whole history is kept and the owner can still read it');
  SELECT count(*) INTO _n FROM (
    SELECT family_member_id FROM public.health_documents WHERE id = _cdoc
    UNION ALL SELECT family_member_id FROM public.document_folders WHERE id = _cfolder
    UNION ALL SELECT family_member_id FROM public.personal_notes WHERE id = _cnote
  ) t WHERE family_member_id = _child;
  PERFORM pg_temp.assert(_n = 3, '6e the child''s documents, folders and notes are still the child''s, not the owner''s');

  UPDATE public.family_members SET archived_at = NULL WHERE id = _child;
  SELECT count(*) INTO _n FROM public.family_members WHERE id = _child AND archived_at IS NULL AND is_active;
  PERFORM pg_temp.assert(_n = 1, '6f the owner can restore an archived member');

  -- is_active is derived, so the two cannot come to disagree.
  UPDATE public.family_members SET is_active = false WHERE id = _child;
  SELECT count(*) INTO _n FROM public.family_members WHERE id = _child AND is_active;
  PERFORM pg_temp.assert(_n = 1, '6g is_active follows archived_at and cannot be set on its own');

  PERFORM pg_temp.as_user(_other);
  UPDATE public.family_members SET archived_at = now() WHERE id = _child;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.family_members WHERE id = _child AND archived_at IS NULL;
  PERFORM pg_temp.assert(_n = 1, '6h nobody else can archive somebody''s family member');

  PERFORM pg_temp.as_user(NULL);
  IF current_setting('onecare_test.failures', true) <> '' THEN
    RAISE EXCEPTION 'family_rows_stay_the_family_members FAILED:%', current_setting('onecare_test.failures', true);
  END IF;
  RAISE NOTICE 'family_rows_stay_the_family_members: all assertions passed';
END $$;

ROLLBACK;
