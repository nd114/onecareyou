-- Two notices that ride on the one in-app notification table.
--
-- 1. When a patient stops sharing, the people who were receiving their data
--    are told, and alert rules that can no longer see a reading are archived.
--    Before this, a clinician's rules for a patient who had left kept showing
--    as active, and nobody on the receiving side was told anything: the
--    patient simply went quiet, which reads the same as a patient who is well.
-- 2. When a department lead routes or assigns a patient who sits under
--    somebody else's department, the hospital's owners and admins are told
--    and it is written to the audit trail. Leads may still route hospital-wide;
--    the point is that it is seen, not that it is stopped.

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
  _ada      uuid := '5a000000-0000-4000-8000-000000000001';  -- patient
  _ben      uuid := '5a000000-0000-4000-8000-000000000002';  -- patient, sits in Cardiology
  _cai      uuid := '5a000000-0000-4000-8000-000000000003';  -- patient, sits in Renal
  _dee      uuid := '5a000000-0000-4000-8000-000000000004';  -- patient, not yet routed
  _dr_solo  uuid := '5a000000-0000-4000-8000-000000000011';  -- clinician on a direct share
  _dr_two   uuid := '5a000000-0000-4000-8000-000000000012';  -- clinician with two shares
  _owner    uuid := '5a000000-0000-4000-8000-000000000021';
  _admin    uuid := '5a000000-0000-4000-8000-000000000022';
  _member   uuid := '5a000000-0000-4000-8000-000000000023';  -- assigned to Ada
  _lead     uuid := '5a000000-0000-4000-8000-000000000024';  -- leads Renal
  _elsewhere uuid := '5a000000-0000-4000-8000-000000000031'; -- admin of another hospital
  _stranger uuid := '5a000000-0000-4000-8000-000000000032';
  _hosp     uuid := '5b000000-0000-4000-8000-000000000001';
  _other    uuid := '5b000000-0000-4000-8000-000000000002';
  _cardio   uuid := '5c000000-0000-4000-8000-000000000001';
  _renal    uuid := '5c000000-0000-4000-8000-000000000002';
  _share    uuid;
  _share2   uuid;
  _pshare   uuid;
  _rule     uuid;
  _rule_old uuid;
  _rule_two uuid;
  _rule_mem uuid;
  _notice   uuid;
  _owner_notice uuid;
  _n        integer;
  _txt      text;
  _raised   boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_ada, 'ssr-ada@test.local', now()),
    (_ben, 'ssr-ben@test.local', now()),
    (_cai, 'ssr-cai@test.local', now()),
    (_dee, 'ssr-dee@test.local', now()),
    (_dr_solo, 'ssr-solo@test.local', now()),
    (_dr_two, 'ssr-two@test.local', now()),
    (_owner, 'ssr-owner@test.local', now()),
    (_admin, 'ssr-admin@test.local', now()),
    (_member, 'ssr-member@test.local', now()),
    (_lead, 'ssr-lead@test.local', now()),
    (_elsewhere, 'ssr-elsewhere@test.local', now()),
    (_stranger, 'ssr-stranger@test.local', now());
  INSERT INTO public.profiles (user_id, name, email) VALUES
    (_ada, 'Ada Lovelace', 'ssr-ada@test.local'),
    (_ben, 'Ben Okafor', 'ssr-ben@test.local'),
    (_cai, 'Cai Wen', 'ssr-cai@test.local'),
    (_dee, 'Dee', 'ssr-dee@test.local'),
    (_dr_solo, 'Dr Solo', 'ssr-solo@test.local'),
    (_dr_two, 'Dr Two', 'ssr-two@test.local'),
    (_owner, 'Owner O', 'ssr-owner@test.local'),
    (_admin, 'Admin A', 'ssr-admin@test.local'),
    (_member, 'Member M', 'ssr-member@test.local'),
    (_lead, 'Lena Lead', 'ssr-lead@test.local'),
    (_elsewhere, 'Elsewhere E', 'ssr-elsewhere@test.local'),
    (_stranger, 'Stranger S', 'ssr-stranger@test.local')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

  -- ==========================================================================
  -- 1. A patient ends a direct share
  -- ==========================================================================
  -- Provider shares open only to clinician accounts (20261010050000).
  INSERT INTO public.clinician_profiles (user_id) VALUES (_dr_solo), (_dr_two) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active)
  VALUES (_ada, 'Dr Solo', 'ssr-solo-1', _dr_solo, true) RETURNING id INTO _share;
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value, is_active)
  VALUES (_dr_solo, _ada, _share, 'heart_rate', 'above', 120, true) RETURNING id INTO _rule;
  -- Already archived last month: its date must survive, not be restamped.
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value, is_active, archived_at)
  VALUES (_dr_solo, _ada, _share, 'weight', 'above', 100, false, now() - interval '30 days') RETURNING id INTO _rule_old;

  -- Dr Two holds two live shares with Ada. Ending one leaves the other, and a
  -- rule that can still see readings is not the patient's to lose by accident.
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active)
  VALUES (_ada, 'Dr Two', 'ssr-two-1', _dr_two, true) RETURNING id INTO _share2;
  INSERT INTO public.provider_shares (user_id, provider_name, invite_code, clinician_user_id, is_active)
  VALUES (_ada, 'Dr Two (clinic)', 'ssr-two-2', _dr_two, true);
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, share_id, vital_type, condition, threshold_value, is_active)
  VALUES (_dr_two, _ada, _share2, 'heart_rate', 'below', 40, true) RETURNING id INTO _rule_two;

  PERFORM pg_temp.as_user(_ada);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now(), revoked_by = _ada WHERE id = _share;
  UPDATE public.provider_shares SET is_active = false, revoked_at = now(), revoked_by = _ada WHERE id = _share2;
  PERFORM pg_temp.as_user(NULL);

  SELECT count(*) INTO _n FROM public.clinician_alert_rules
   WHERE id = _rule AND archived_at IS NOT NULL AND is_active = false;
  PERFORM pg_temp.assert(_n = 1, 'the clinician''s live rule for that patient is archived and stops firing');
  SELECT count(*) INTO _n FROM public.clinician_alert_rules
   WHERE id = _rule_old AND archived_at < now() - interval '29 days';
  PERFORM pg_temp.assert(_n = 1, 'a rule archived earlier keeps its original date');
  SELECT count(*) INTO _n FROM public.clinician_alert_rules
   WHERE id = _rule_two AND archived_at IS NULL AND is_active;
  PERFORM pg_temp.assert(_n = 1, 'a clinician still reached by another live share keeps their rule');

  PERFORM pg_temp.as_user(_dr_solo);
  SELECT count(*), max(message) INTO _n, _txt FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND patient_user_id = _ada;
  PERFORM pg_temp.assert(_n = 1, 'the clinician is told, once');
  PERFORM pg_temp.assert(_txt LIKE 'Ada L. stopped sharing with you%', 'by first name and initial: ' || _txt);
  PERFORM pg_temp.assert(_txt LIKE '%no further updates will be transmitted%', 'saying nothing more will arrive');
  PERFORM pg_temp.assert(_txt LIKE '%1 alert rule you set for them has been archived%', 'and how many rules were archived');
  PERFORM pg_temp.assert(_txt NOT LIKE '%Lovelace%' AND _txt NOT LIKE '%heart%', 'with no surname and no clinical detail');

  PERFORM pg_temp.as_user(_dr_two);
  SELECT max(message) INTO _txt FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND patient_user_id = _ada;
  PERFORM pg_temp.assert(_txt IS NOT NULL AND _txt NOT LIKE '%archived%',
    'a clinician whose rules were kept is not told they were archived');

  -- The notice is the recipient's, not the patient's and not anyone else's.
  PERFORM pg_temp.as_user(_stranger);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications;
  PERFORM pg_temp.assert(_n = 0, 'another user reads none of it');
  PERFORM pg_temp.as_user(_ada);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications;
  PERFORM pg_temp.assert(_n = 0, 'nor does the patient read the clinician''s inbox');

  -- A recipient marks it read, and nothing else.
  PERFORM pg_temp.as_user(_dr_solo);
  SELECT id INTO _notice FROM public.clinician_guidance_notifications WHERE notification_type = 'share_ended';
  UPDATE public.clinician_guidance_notifications SET is_read = true WHERE id = _notice;
  _raised := false;
  BEGIN
    UPDATE public.clinician_guidance_notifications SET message = 'edited' WHERE id = _notice;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a recipient cannot rewrite a notice');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE id = _notice AND is_read AND message LIKE 'Ada L.%';
  PERFORM pg_temp.assert(_n = 1, 'but can mark it read');

  -- Nobody can forge one into another clinician's inbox.
  PERFORM pg_temp.as_user(_stranger);
  _raised := false;
  BEGIN
    INSERT INTO public.clinician_guidance_notifications (clinician_user_id, patient_user_id, notification_type, message)
    VALUES (_dr_solo, _stranger, 'share_ended', 'forged');
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a client cannot insert a notice');

  -- An unclaimed share still opened to a confirmed account under its email,
  -- so that account is the one told. An email with no account has nobody.
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, is_active)
  VALUES (_ben, 'Dr Email', 'SSR-Elsewhere@test.local', 'ssr-email-1', true),
         (_ben, 'Dr Nobody', 'ssr-nobody@test.local', 'ssr-email-2', true);
  PERFORM pg_temp.as_user(_ben);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now(), revoked_by = _ben
   WHERE invite_code IN ('ssr-email-1', 'ssr-email-2');
  PERFORM pg_temp.as_user(_elsewhere);
  SELECT count(*), max(message) INTO _n, _txt FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND patient_user_id = _ben;
  PERFORM pg_temp.assert(_n = 1 AND _txt LIKE 'Ben O. stopped sharing with you%',
    'an unclaimed share tells the confirmed account its email opened to');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND patient_user_id = _ben;
  PERFORM pg_temp.assert(_n = 1, 'and one to an email with no account tells nobody');

  -- ==========================================================================
  -- 2. A hospital, its staff and departments
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'St Elsewhere General', _owner);
  INSERT INTO public.practices (id, name, created_by) VALUES (_other, 'Other Infirmary', _elsewhere);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_hosp, _admin, 'admin', 'active'),
    (_hosp, _member, 'clinician', 'active'),
    (_hosp, _lead, 'sub_admin', 'active');
  INSERT INTO public.practice_departments (id, practice_id, name) VALUES
    (_cardio, _hosp, 'Cardiology'),
    (_renal, _hosp, 'Renal');
  INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead) VALUES
    (_renal, _hosp, _lead, true),
    (_cardio, _hosp, _member, false),
    -- The owner also leads a department. They are still the owner.
    (_cardio, _hosp, _owner, true);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions) VALUES
    (_hosp, _ada, true, true, '{}'),
    (_hosp, _ben, true, true, '{}'),
    (_hosp, _cai, true, true, '{}'),
    (_hosp, _dee, true, true, '{}');
  SELECT id INTO _pshare FROM public.practice_shares WHERE practice_id = _hosp AND user_id = _ada;
  INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id) VALUES
    (_hosp, _cardio, _ben),
    (_hosp, _renal, _cai);

  -- ==========================================================================
  -- 3. A lead routing outside their department is seen
  -- ==========================================================================
  -- Ben sits under Cardiology. Lena leads Renal and pulls him in.
  PERFORM pg_temp.as_user(_lead);
  INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id, assigned_by)
  VALUES (_hosp, _renal, _ben, _lead);
  PERFORM pg_temp.as_user(NULL);

  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE user_id = _lead AND patient_user_id = _ben AND action = 'routed_outside_department';
  PERFORM pg_temp.assert(_n = 1, 'the routing is written to the audit trail against the lead');
  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.practice_audit_log(_hosp, 'routed_outside_department');
  PERFORM pg_temp.assert(_n = 1, 'and the hospital''s own activity log shows it');

  SELECT count(*), max(message), max(id::text)::uuid INTO _n, _txt, _owner_notice
    FROM public.clinician_guidance_notifications
   WHERE notification_type = 'routed_outside_department' AND practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 1, 'the owner is told');
  PERFORM pg_temp.assert(_txt LIKE '%Lena Lead%Ben O.%Renal%Cardiology%', 'naming lead, patient, and both departments: ' || _txt);
  PERFORM pg_temp.as_user(_admin);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'routed_outside_department' AND acknowledged_at IS NULL;
  PERFORM pg_temp.assert(_n = 1, 'so is the admin, unacknowledged');
  PERFORM pg_temp.as_user(_lead);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications;
  PERFORM pg_temp.assert(_n = 0, 'the lead is not sent their own oversight notice');
  PERFORM pg_temp.as_user(_member);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications WHERE notification_type = 'routed_outside_department';
  PERFORM pg_temp.assert(_n = 0, 'nor is an ordinary clinician');

  -- Cai already sits in Renal: assigning her there is Lena's own job.
  PERFORM pg_temp.as_user(_lead);
  PERFORM public.assign_practice_patient(_hosp, _cai, _member, _renal, NULL);
  -- Dee is in nobody's department yet; working the unrouted queue is what a lead is for.
  INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id, assigned_by)
  VALUES (_hosp, _renal, _dee, _lead);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE user_id = _lead AND action IN ('routed_outside_department', 'assigned_outside_department');
  PERFORM pg_temp.assert(_n = 1, 'inside the lead''s scope nothing is flagged');

  -- Ada sits in Cardiology; Lena assigns her under Renal without routing her.
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id)
  VALUES (_hosp, _cardio, _ada);
  PERFORM pg_temp.as_user(_lead);
  PERFORM public.assign_practice_patient(_hosp, _ada, _member, _renal, NULL);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE user_id = _lead AND patient_user_id = _ada AND action = 'assigned_outside_department';
  PERFORM pg_temp.assert(_n = 1, 'an assignment outside the lead''s departments is flagged too');

  -- The owner doing the same thing is simply running their hospital.
  PERFORM pg_temp.as_user(_owner);
  PERFORM public.assign_practice_patient(_hosp, _ben, _lead, _cardio, NULL);
  INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id, assigned_by)
  VALUES (_hosp, _cardio, _cai, _owner);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE user_id = _owner AND action IN ('routed_outside_department', 'assigned_outside_department');
  PERFORM pg_temp.assert(_n = 0, 'an owner routing anywhere is not flagged');

  -- ==========================================================================
  -- 4. Acknowledging belongs to this hospital's managers
  -- ==========================================================================
  PERFORM pg_temp.as_user(_elsewhere);
  _raised := false;
  BEGIN
    PERFORM public.acknowledge_practice_notice(_owner_notice);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'another hospital''s admin cannot acknowledge it');

  PERFORM pg_temp.as_user(_lead);
  _raised := false;
  BEGIN
    PERFORM public.acknowledge_practice_notice(_owner_notice);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'nor can the lead acknowledge their own routing');

  -- Holding a copy is not enough once you no longer run the place.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET role = 'clinician' WHERE practice_id = _hosp AND user_id = _admin;
  PERFORM pg_temp.as_user(_admin);
  SELECT id INTO _notice FROM public.clinician_guidance_notifications
   WHERE notification_type = 'routed_outside_department' AND message LIKE '%Ben O.%';
  _raised := false;
  BEGIN
    PERFORM public.acknowledge_practice_notice(_notice);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_notice IS NOT NULL AND _raised, 'an admin demoted since the notice arrived cannot acknowledge it');
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET role = 'admin' WHERE practice_id = _hosp AND user_id = _admin;

  PERFORM pg_temp.as_user(_admin);
  _raised := false;
  BEGIN
    UPDATE public.clinician_guidance_notifications SET acknowledged_at = now(), acknowledged_by = _admin
     WHERE notification_type = 'routed_outside_department';
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'acknowledging is not a bare column write');

  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'routed_outside_department' AND acknowledged_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 0, 'nothing is acknowledged yet');

  PERFORM pg_temp.as_user(_admin);
  SELECT id INTO _notice FROM public.clinician_guidance_notifications
   WHERE notification_type = 'routed_outside_department' AND message LIKE '%Ben O.%';
  PERFORM public.acknowledge_practice_notice(_notice);
  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE id = _owner_notice AND acknowledged_at IS NOT NULL AND acknowledged_by = _admin;
  PERFORM pg_temp.assert(_n = 1, 'one admin''s acknowledgement shows on every manager''s copy, naming who');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE user_id = _admin AND action = 'outside_department_routing_acknowledged';
  PERFORM pg_temp.assert(_n = 1, 'and the acknowledgement is itself audited');

  -- ==========================================================================
  -- 5. A hospital suspending its own access is not the patient leaving
  -- ==========================================================================
  INSERT INTO public.clinician_alert_rules (clinician_user_id, patient_user_id, vital_type, condition, threshold_value, is_active)
  VALUES (_member, _ada, 'blood_glucose', 'above', 15, true) RETURNING id INTO _rule_mem;

  PERFORM pg_temp.as_user(_owner);
  PERFORM public.set_practice_suspension(_hosp, _ada, true);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 0, 'a suspension sends no stopped-sharing notice');
  SELECT count(*) INTO _n FROM public.clinician_alert_rules WHERE id = _rule_mem AND archived_at IS NULL;
  PERFORM pg_temp.assert(_n = 1, 'and archives nothing');
  PERFORM pg_temp.as_user(_owner);
  PERFORM public.set_practice_suspension(_hosp, _ada, false);

  -- ==========================================================================
  -- 6. The patient ends the hospital share
  -- ==========================================================================
  PERFORM pg_temp.as_user(_ada);
  UPDATE public.practice_shares SET is_active = false, revoked_at = now(), revoked_by = _ada WHERE id = _pshare;
  PERFORM pg_temp.as_user(NULL);

  SELECT count(*) INTO _n FROM public.clinician_alert_rules
   WHERE id = _rule_mem AND archived_at IS NOT NULL AND NOT is_active;
  PERFORM pg_temp.assert(_n = 1, 'a member''s rule with no other way to see the patient is archived');

  PERFORM pg_temp.as_user(_owner);
  SELECT count(*), max(message) INTO _n, _txt FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND practice_id = _hosp AND patient_user_id = _ada;
  PERFORM pg_temp.assert(_n = 1, 'the owner is told');
  PERFORM pg_temp.assert(_txt LIKE 'Ada L. stopped sharing with St Elsewhere General%', 'naming the hospital: ' || _txt);
  PERFORM pg_temp.as_user(_admin);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 1, 'the admin is told');
  PERFORM pg_temp.as_user(_member);
  SELECT count(*), max(message) INTO _n, _txt FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 1, 'the clinician assigned to her is told');
  PERFORM pg_temp.assert(_txt LIKE '%alert rule you set for them has been archived%', 'with their own archived count');
  PERFORM pg_temp.as_user(_lead);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications WHERE notification_type = 'share_ended';
  PERFORM pg_temp.assert(_n = 0, 'staff with no part in her care and no rules for her are not told');
  PERFORM pg_temp.as_user(_elsewhere);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications WHERE patient_user_id = _ada;
  PERFORM pg_temp.assert(_n = 0, 'another hospital hears nothing');

  -- ==========================================================================
  -- 7. The hospital ends a share itself
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  UPDATE public.practice_shares SET is_active = false, revoke_reason = 'discharged'
   WHERE practice_id = _hosp AND user_id = _ben;
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND patient_user_id = _ben;
  PERFORM pg_temp.assert(_n = 0, 'the admin who ended it is not told what they just did');
  PERFORM pg_temp.as_user(_owner);
  SELECT max(message) INTO _txt FROM public.clinician_guidance_notifications
   WHERE notification_type = 'share_ended' AND patient_user_id = _ben;
  PERFORM pg_temp.assert(_txt LIKE 'Ben O.''s share with St Elsewhere General was ended from the hospital''s side%',
    'and the others are not told the patient left: ' || COALESCE(_txt, '(none)'));

  -- Staff who leave stop seeing the hospital's notices, as they stop seeing
  -- its patients.
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.practice_members SET status = 'archived' WHERE practice_id = _hosp AND user_id = _member;
  PERFORM pg_temp.as_user(_member);
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications WHERE practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 0, 'an archived member no longer reads the hospital''s notices');

  RAISE NOTICE 'stopped_sharing_and_routing_notices: all assertions passed';
END $$;

ROLLBACK;
