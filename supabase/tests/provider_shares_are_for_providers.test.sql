-- A provider share is a patient sharing with a clinician.
--
-- Before 20261010050000 every gate on a provider_shares row asked whether the
-- caller had claimed it or held the confirmed email it was addressed to, and
-- never whether the caller was a clinician. A patient account whose confirmed
-- address matched a share read that patient's vitals, documents and identity,
-- and could claim the share for itself.
--
-- The same migration gives background jobs clinician_can_see_patient_as(),
-- the gate evaluated for a named account, because check-vital-alerts honoured
-- only claimed shares and so dropped alerts a clinician had set up on an
-- unclaimed share addressed to them. It must agree with
-- clinician_has_patient_permission() in every case, and it must not be
-- callable by a signed-in user. Rules whose clinician lost access by expiry,
-- which no trigger sees, are archived with a notice rather than skipped.

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
  _pat       uuid := '7a000000-0000-4000-8000-000000000001';  -- the patient who shares
  _look      uuid := '7a000000-0000-4000-8000-000000000002';  -- patient account under a shared address
  _look_cl   uuid := '7a000000-0000-4000-8000-000000000003';  -- patient account that claimed a share earlier
  _dr_open   uuid := '7a000000-0000-4000-8000-000000000011';  -- clinician, share addressed to them, unclaimed
  _dr_claim  uuid := '7a000000-0000-4000-8000-000000000012';  -- clinician, claimed share
  _dr_unconf uuid := '7a000000-0000-4000-8000-000000000013';  -- clinician, address not confirmed
  _dr_exp    uuid := '7a000000-0000-4000-8000-000000000014';  -- clinician, share expired
  _dr_rev    uuid := '7a000000-0000-4000-8000-000000000015';  -- clinician, share revoked
  _member    uuid := '7a000000-0000-4000-8000-000000000016';  -- hospital member, no clinician profile
  _admin     uuid := '7a000000-0000-4000-8000-000000000017';
  _hosp      uuid := '7b000000-0000-4000-8000-000000000001';
  _doc       uuid := '7c000000-0000-4000-8000-000000000001';
  _s_look    uuid := '7d000000-0000-4000-8000-000000000001';
  _s_look_cl uuid := '7d000000-0000-4000-8000-000000000002';
  _s_open    uuid := '7d000000-0000-4000-8000-000000000003';
  _s_claim   uuid := '7d000000-0000-4000-8000-000000000004';
  _s_unconf  uuid := '7d000000-0000-4000-8000-000000000005';
  _s_exp     uuid := '7d000000-0000-4000-8000-000000000006';
  _s_rev     uuid := '7d000000-0000-4000-8000-000000000007';
  _s_member  uuid := '7d000000-0000-4000-8000-000000000008';
  _r_exp     uuid;
  _r_open    uuid;
  _r_look    uuid;
  _who       uuid;
  _perm      text;
  _as_caller boolean;
  _as_named  boolean;
  _n         integer;
  _txt       text;
  _raised    boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_pat,       'psp-pat@test.local',    now()),
    (_look,      'psp-look@test.local',   now()),
    (_look_cl,   'psp-lookcl@test.local', now()),
    (_dr_open,   'psp-open@test.local',   now()),
    (_dr_claim,  'psp-claim@test.local',  now()),
    (_dr_unconf, 'psp-unconf@test.local', NULL),
    (_dr_exp,    'psp-exp@test.local',    now()),
    (_dr_rev,    'psp-rev@test.local',    now()),
    (_member,    'psp-member@test.local', now()),
    (_admin,     'psp-admin@test.local',  now());
  INSERT INTO public.profiles (user_id, name, email, phone_number) VALUES
    (_pat,  'Pia Shared', 'psp-pat@test.local', '+44 7700 900456'),
    (_look, 'Lou Look',   'psp-look@test.local', NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number;

  INSERT INTO public.clinician_profiles (user_id, first_name, last_name) VALUES
    (_dr_open, 'Open', 'Doc'), (_dr_claim, 'Claim', 'Doc'), (_dr_unconf, 'Unconf', 'Doc'),
    (_dr_exp, 'Exp', 'Doc'), (_dr_rev, 'Rev', 'Doc');

  -- A hospital member with no clinical profile is clinician-side in the app.
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'PSP Hospital', _admin);
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_hosp, _member, 'clinician', 'active');

  INSERT INTO public.vitals (user_id, type, value, unit, source)
  VALUES (_pat, 'heart_rate', 72, 'bpm', 'manual'), (_pat, 'weight', 70, 'kg', 'manual');
  INSERT INTO public.health_documents (id, user_id, uploaded_by_user_id, file_path, file_name, title, category)
  VALUES (_doc, _pat, _pat, 'psp/panel.pdf', 'panel.pdf', 'Blood panel', 'lab_result');
  INSERT INTO storage.objects (bucket_id, name) VALUES ('health-documents', 'psp/panel.pdf');

  INSERT INTO public.provider_shares
    (id, user_id, clinician_user_id, provider_name, provider_email, invite_code, permissions, is_active, expires_at)
  VALUES
    (_s_look,    _pat, NULL,      'Lou',    'psp-look@test.local',   'psp-look',   '{"vitals":true,"documents":true,"profile":true}', true, NULL),
    (_s_look_cl, _pat, _look_cl,  'LouCl',  'psp-lookcl@test.local', 'psp-lookcl', '{"vitals":true,"documents":true,"profile":true}', true, NULL),
    (_s_open,    _pat, NULL,      'Open',   'psp-open@test.local',   'psp-open',   '{"vitals":true}',                               true, NULL),
    (_s_claim,   _pat, _dr_claim, 'Claim',  'elsewhere@test.local',  'psp-claim',  '{"vitals":true,"documents":true}',              true, NULL),
    (_s_unconf,  _pat, NULL,      'Unconf', 'psp-unconf@test.local', 'psp-unconf', '{"vitals":true,"documents":true}',              true, NULL),
    (_s_exp,     _pat, _dr_exp,   'Exp',    'psp-exp@test.local',    'psp-exp',    '{"vitals":true,"documents":true}',              true, now() - interval '1 day'),
    (_s_rev,     _pat, _dr_rev,   'Rev',    'psp-rev@test.local',    'psp-rev',    '{"vitals":true,"documents":true}',              false, NULL),
    (_s_member,  _pat, NULL,      'Member', 'psp-member@test.local', 'psp-member', '{"vitals":true}',                               true, NULL);

  -- The one document, shared per-document on every share that grants documents.
  INSERT INTO public.document_shares (document_id, user_id, provider_share_id, is_active)
  SELECT _doc, _pat, s, true FROM unnest(ARRAY[_s_look, _s_look_cl, _s_claim, _s_unconf, _s_exp, _s_rev]) s;

  -- ==========================================================================
  -- 1. A patient account under a shared address sees and claims nothing
  -- ==========================================================================
  FOREACH _who IN ARRAY ARRAY[_look, _look_cl] LOOP
    PERFORM pg_temp.as_user(_who);
    SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _pat;
    PERFORM pg_temp.assert(_n = 0, format('patient account %s reads none of the patient''s vitals', _who));
    SELECT count(*) INTO _n FROM public.health_documents WHERE user_id = _pat;
    PERFORM pg_temp.assert(_n = 0, 'nor their documents');
    SELECT count(*) INTO _n FROM public.document_shares WHERE document_id = _doc;
    PERFORM pg_temp.assert(_n = 0, 'nor the document shares');
    SELECT count(*) INTO _n FROM storage.objects WHERE name = 'psp/panel.pdf';
    PERFORM pg_temp.assert(_n = 0, 'nor the file');
    SELECT count(*) INTO _n FROM public.search_documents('blood panel', 25);
    PERFORM pg_temp.assert(_n = 0, 'search_documents shows nothing');
    SELECT count(*) INTO _n FROM public.get_patient_identity(ARRAY[_pat]);
    PERFORM pg_temp.assert(_n = 0, 'get_patient_identity does not resolve the patient');
    SELECT count(*) INTO _n FROM public.get_patient_clinical_profile(ARRAY[_pat]);
    PERFORM pg_temp.assert(_n = 0, 'nor get_patient_clinical_profile');
    SELECT count(*) INTO _n FROM public.provider_shares WHERE user_id = _pat;
    PERFORM pg_temp.assert(_n = 0, 'the share rows themselves are not visible');
    PERFORM pg_temp.assert(NOT public.clinician_has_patient_access(_pat), 'clinician_has_patient_access is false');
    PERFORM pg_temp.assert(NOT public.clinician_had_patient_access(_pat), 'clinician_had_patient_access is false');
  END LOOP;

  PERFORM pg_temp.as_user(_look);
  UPDATE public.provider_shares SET clinician_user_id = _look WHERE id = _s_look;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.provider_shares WHERE id = _s_look AND clinician_user_id IS NULL;
  PERFORM pg_temp.assert(_n = 1, 'a patient account cannot claim a share addressed to it');

  -- ==========================================================================
  -- 2. A clinician in the same situation reads what the share grants
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr_open);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 2, 'a clinician reads vitals on an unclaimed share addressed to them');
  SELECT count(*) INTO _n FROM public.health_documents WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 0, 'but not documents, which that share does not grant');
  SELECT count(*) INTO _n FROM public.get_patient_identity(ARRAY[_pat]) WHERE name = 'Pia Shared';
  PERFORM pg_temp.assert(_n = 1, 'and can resolve who the patient is');
  SELECT count(*) INTO _n FROM public.provider_shares WHERE id = _s_open;
  PERFORM pg_temp.assert(_n = 1, 'and sees the share');

  PERFORM pg_temp.as_user(_member);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 2, 'a hospital member without a clinical profile is a clinician here too');

  PERFORM pg_temp.as_user(_dr_claim);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 2, 'a claimed-share clinician still reads vitals');
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _doc;
  PERFORM pg_temp.assert(_n = 1, 'and the document shared with them');
  SELECT count(*) INTO _n FROM storage.objects WHERE name = 'psp/panel.pdf';
  PERFORM pg_temp.assert(_n = 1, 'and its file');

  PERFORM pg_temp.as_user(_dr_unconf);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 0, 'an unconfirmed address opens nothing, clinician or not');

  -- The patient's own access is untouched.
  PERFORM pg_temp.as_user(_pat);
  SELECT count(*) INTO _n FROM public.vitals WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 2, 'the patient reads their own vitals');
  SELECT count(*) INTO _n FROM public.provider_shares WHERE user_id = _pat;
  PERFORM pg_temp.assert(_n = 8, 'and sees every share they made');

  -- ==========================================================================
  -- 3. clinician_can_see_patient_as agrees with the caller's gate
  -- ==========================================================================
  FOREACH _who IN ARRAY ARRAY[_look, _look_cl, _dr_open, _dr_claim, _dr_unconf, _dr_exp, _dr_rev, _member] LOOP
    FOREACH _perm IN ARRAY ARRAY['vitals', 'documents', 'profile', 'medications'] LOOP
      PERFORM pg_temp.as_user(_who);
      _as_caller := public.clinician_has_patient_permission(_pat, _perm);
      PERFORM pg_temp.as_user(NULL);
      _as_named := public.clinician_can_see_patient_as(_who, _pat, _perm);
      IF _as_caller IS DISTINCT FROM _as_named THEN
        RAISE EXCEPTION 'FAILED: % / %: caller gate % but named gate %', _who, _perm, _as_caller, _as_named;
      END IF;
    END LOOP;
    PERFORM pg_temp.as_user(_who);
    _as_caller := public.clinician_has_patient_access(_pat);
    PERFORM pg_temp.as_user(NULL);
    PERFORM pg_temp.assert(_as_caller IS NOT DISTINCT FROM public.clinician_can_see_patient_as(_who, _pat, NULL),
      format('%s: any-access answer matches clinician_has_patient_access', _who));
  END LOOP;
  PERFORM pg_temp.assert(true, 'clinician_can_see_patient_as matches clinician_has_patient_permission in every case');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(public.clinician_can_see_patient_as(_dr_claim, _pat, 'vitals'), 'claimed: yes');
  PERFORM pg_temp.assert(public.clinician_can_see_patient_as(_dr_open, _pat, 'vitals'), 'unclaimed, confirmed address: yes');
  PERFORM pg_temp.assert(NOT public.clinician_can_see_patient_as(_dr_open, _pat, 'documents'), 'unclaimed: only what it grants');
  PERFORM pg_temp.assert(NOT public.clinician_can_see_patient_as(_dr_unconf, _pat, 'vitals'), 'unconfirmed address: no');
  PERFORM pg_temp.assert(NOT public.clinician_can_see_patient_as(_dr_exp, _pat, 'vitals'), 'expired: no');
  PERFORM pg_temp.assert(NOT public.clinician_can_see_patient_as(_dr_rev, _pat, 'vitals'), 'revoked: no');
  PERFORM pg_temp.assert(NOT public.clinician_can_see_patient_as(_look, _pat, 'vitals'), 'patient account, addressed: no');
  PERFORM pg_temp.assert(NOT public.clinician_can_see_patient_as(_look_cl, _pat, 'vitals'), 'patient account, claimed: no');

  -- Asking on anyone's behalf is the server's alone.
  PERFORM pg_temp.as_user(_dr_claim);
  _raised := false;
  BEGIN
    PERFORM public.clinician_can_see_patient_as(_dr_open, _pat, 'vitals');
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'clinician_can_see_patient_as is not executable by authenticated');
  _raised := false;
  BEGIN
    PERFORM public.is_clinician_account(_look);
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'nor is is_clinician_account');
  _raised := false;
  BEGIN
    PERFORM public.archive_alert_rules_without_access();
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'nor is archive_alert_rules_without_access');
  PERFORM pg_temp.assert(public.caller_is_clinician(), 'a clinician can ask about themselves');
  PERFORM pg_temp.as_user(_look);
  PERFORM pg_temp.assert(NOT public.caller_is_clinician(), 'and a patient account is told it is not one');

  -- ==========================================================================
  -- 4. The clinician claims a share addressed to them
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr_open);
  UPDATE public.provider_shares SET clinician_user_id = _dr_open WHERE id = _s_open;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.provider_shares WHERE id = _s_open AND clinician_user_id = _dr_open;
  PERFORM pg_temp.assert(_n = 1, 'a clinician can still claim a share addressed to their confirmed email');

  -- ==========================================================================
  -- 5. Rules that lost their patient are archived and said so, not skipped
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value)
  VALUES (_dr_exp, _pat, _s_exp, 'heart_rate', 'above', 120) RETURNING id INTO _r_exp;
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value)
  VALUES (_dr_open, _pat, _s_open, 'heart_rate', 'above', 120) RETURNING id INTO _r_open;
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value)
  VALUES (_look, _pat, _s_look, 'heart_rate', 'above', 120) RETURNING id INTO _r_look;

  SET LOCAL ROLE service_role;
  _n := public.archive_alert_rules_without_access();
  RESET ROLE;
  PERFORM pg_temp.assert(_n >= 2, 'the sweep archives rules that can no longer see their patient');

  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE id = _r_exp AND archived_at IS NOT NULL AND NOT is_active;
  PERFORM pg_temp.assert(_n = 1, 'a rule on an expired share is archived');
  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE id = _r_look AND archived_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'a rule held by a patient account is archived');
  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE id = _r_open AND archived_at IS NULL AND is_active;
  PERFORM pg_temp.assert(_n = 1, 'a rule on a live share is left alone');

  SELECT message INTO _txt FROM public.clinician_guidance_notifications
   WHERE clinician_user_id = _dr_exp AND patient_user_id = _pat
     AND notification_type = 'share_ended' AND related_id = _s_exp;
  PERFORM pg_temp.assert(_txt LIKE 'Pia S.''s share with you expired on %', 'the clinician is told the share expired');
  PERFORM pg_temp.assert(_txt LIKE '%1 alert rule you set for them has been archived.', 'and that their rule was archived');

  SET LOCAL ROLE service_role;
  _n := public.archive_alert_rules_without_access();
  RESET ROLE;
  PERFORM pg_temp.assert(_n = 0, 'a second sweep finds nothing left to archive');
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE clinician_user_id = _dr_exp AND notification_type = 'share_ended';
  PERFORM pg_temp.assert(_n = 1, 'and tells nobody twice');

  RAISE NOTICE 'provider_shares_are_for_providers: all assertions passed';
END $$;

ROLLBACK;
