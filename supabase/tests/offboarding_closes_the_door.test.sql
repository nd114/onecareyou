-- Someone who has left a practice can no longer change its record, and leaving
-- is one enforced act with a history.
--
-- Before: a removed provider could still edit and sign their unsigned draft,
-- add addenda, rewrite or hard-delete their team notes, and edit or delete the
-- unclaimed managed records they filed for the hospital, because every one of
-- those write policies asked only "are you the author". Ending a membership
-- was a direct UPDATE that skipped the last-owner rule, left department lead
-- rows behind and wrote no audit; any manager could hard-delete a membership;
-- and a member moved to billing kept view-all and could message patients as a
-- clinician.
--
-- Converted from the probe behind docs/plans/clinician-offboarding.md §3.

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

-- Runs a statement as the current caller and reports whether it changed a row.
-- An RLS refusal on UPDATE or DELETE affects zero rows and raises nothing, so
-- counting rows is the only honest test; a raised error also counts as refused.
CREATE OR REPLACE FUNCTION pg_temp.changed(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.raises(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END;
$$;

DO $$
DECLARE
  _owner     uuid := '0ff00000-0000-4000-8000-000000000001';
  _admin     uuid := '0ff00000-0000-4000-8000-000000000002';
  _leaver    uuid := '0ff00000-0000-4000-8000-000000000003';  -- assigned, leads a department
  _colleague uuid := '0ff00000-0000-4000-8000-000000000004';  -- provider, sees every patient
  _mover     uuid := '0ff00000-0000-4000-8000-000000000005';  -- provider moved to billing
  _quitter   uuid := '0ff00000-0000-4000-8000-000000000006';  -- leaves of their own accord
  _pat       uuid := '0ff00000-0000-4000-8000-000000000007';  -- the hospital's patient
  _private   uuid := '0ff00000-0000-4000-8000-000000000008';  -- the leaver's own patient
  _owner2    uuid := '0ff00000-0000-4000-8000-000000000009';
  _prac      uuid := '0ff10000-0000-4000-8000-000000000001';
  _dept      uuid := '0ff20000-0000-4000-8000-000000000001';
  _draft     uuid;
  _signed    uuid;
  _team_note uuid;
  _priv_note uuid;
  _record    uuid;
  _solo_rec  uuid;
  _own_enc   uuid;
  _n         integer;
  _txt       text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner,     'offb-owner@test.local',     now()),
    (_admin,     'offb-admin@test.local',     now()),
    (_leaver,    'offb-leaver@test.local',    now()),
    (_colleague, 'offb-colleague@test.local', now()),
    (_mover,     'offb-mover@test.local',     now()),
    (_quitter,   'offb-quitter@test.local',   now()),
    (_pat,       'offb-patient@test.local',   now()),
    (_private,   'offb-private@test.local',   now()),
    (_owner2,    'offb-owner2@test.local',    now());

  INSERT INTO public.practices (id, name, created_by) VALUES (_prac, 'Offboarding General', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _owner, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_prac, _admin,     'admin',     'active', true),
    (_prac, _leaver,    'provider',  'active', false),
    (_prac, _colleague, 'provider',  'active', true),
    (_prac, _mover,     'provider',  'active', true),
    (_prac, _quitter,   'clinician', 'active', true);

  INSERT INTO public.practice_departments (id, practice_id, name, created_by)
  VALUES (_dept, _prac, 'Cardiology', _owner);
  INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead)
  VALUES (_dept, _prac, _leaver, true), (_dept, _prac, _quitter, false);

  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_prac, _pat, true, true, '{}');
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _leaver, _owner);

  INSERT INTO public.provider_shares (user_id, clinician_user_id, provider_name, provider_email,
                                      invite_code, permissions, is_active)
  VALUES (_private, _leaver, 'Dr Leaver', 'offb-leaver@test.local', 'OFFB0001', '{"profile": true}', true);

  -- While still employed, the leaver writes for the hospital and for their own
  -- patient.
  PERFORM pg_temp.as_user(_leaver);
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, assessment)
  VALUES (_pat, _leaver, _prac, 'offb: draft') RETURNING id INTO _draft;
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, assessment)
  VALUES (_pat, _leaver, _prac, 'offb: signed') RETURNING id INTO _signed;
  UPDATE public.encounters SET signed_at = now(), status = 'finished' WHERE id = _signed;
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_pat, _leaver, 'offb: team note', 'team') RETURNING id INTO _team_note;
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_pat, _leaver, 'offb: private note', 'private') RETURNING id INTO _priv_note;
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, practice_id)
  VALUES (_leaver, 'Offb Walk-in', _prac) RETURNING id INTO _record;
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, practice_id)
  VALUES (_leaver, 'Offb Solo Patient', NULL) RETURNING id INTO _solo_rec;
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment)
  VALUES (_private, _leaver, 'offb: private draft') RETURNING id INTO _own_enc;

  PERFORM pg_temp.assert(
    pg_temp.changed(format('UPDATE public.encounters SET assessment = %L WHERE id = %L', 'offb: draft v2', _draft)),
    'an active author can still edit their draft');

  -- ==========================================================================
  -- 1. The row refuses every route except the functions
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.practice_members SET status = %L WHERE practice_id = %L AND user_id = %L',
                               'revoked', _prac, _leaver)),
    'a manager cannot end a membership by direct UPDATE');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.practice_members SET role = %L WHERE practice_id = %L AND user_id = %L',
                               'billing', _prac, _leaver)),
    'nor change a role by direct UPDATE');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.practice_members SET can_view_all_patients = true WHERE practice_id = %L AND user_id = %L',
                               _prac, _leaver)),
    'nor widen view-all by direct UPDATE');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.practice_members SET ended_at = now(), end_reason = %L WHERE practice_id = %L AND user_id = %L',
                               'left', _prac, _leaver)),
    'nor write the end stamp by hand');
  PERFORM pg_temp.assert(
    pg_temp.changed(format('UPDATE public.practice_members SET can_invite_patients = false WHERE practice_id = %L AND user_id = %L',
                           _prac, _leaver)),
    'other member settings stay directly editable by a manager');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM public.practice_members WHERE practice_id = %L AND user_id = %L', _prac, _leaver)),
    'a manager cannot delete a colleague''s membership');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM public.practice_members WHERE practice_id = %L AND user_id = %L', _prac, _admin)),
    'nor their own');

  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM public.practice_members WHERE practice_id = %L AND user_id = %L', _prac, _leaver)),
    'a member cannot delete their own membership');

  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_members
   WHERE practice_id = _prac AND user_id IN (_leaver, _admin) AND status = 'active' AND role IN ('provider', 'admin');
  PERFORM pg_temp.assert(_n = 2, 'both memberships are still there, unchanged');
  PERFORM pg_temp.assert(
    (SELECT NOT can_view_all_patients FROM public.practice_members WHERE practice_id = _prac AND user_id = _leaver),
    'view-all was not widened');

  -- ==========================================================================
  -- 2. Owners
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.end_practice_membership(%L, %L, %L)', _prac, _owner, 'coup')),
    'an admin cannot end an owner');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.change_practice_member_access(%L, %L, %L::public.practice_role)', _prac, _owner, 'provider')),
    'an admin cannot demote an owner');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.change_practice_member_access(%L, %L, %L::public.practice_role)', _prac, _admin, 'owner')),
    'an admin cannot make themselves an owner');

  PERFORM pg_temp.as_user(_owner);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.leave_practice(%L, %L)', _prac, 'retiring')),
    'the last owner cannot leave');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.change_practice_member_access(%L, %L, %L::public.practice_role)', _prac, _owner, 'provider')),
    'the last owner cannot demote themselves');

  -- The legacy offboarding RPC is held to the same rule by the row.
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.set_practice_affiliation_status(%L, %L, %L)', _prac, _owner, 'revoked')),
    'the affiliation RPC cannot end the last owner either');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'active' AND role = 'owner' FROM public.practice_members WHERE practice_id = _prac AND user_id = _owner),
    'the owner is still the active owner');

  -- ==========================================================================
  -- 3. A manager ends the leaver's membership
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.end_practice_membership(_prac, _leaver, 'contract ended');
  PERFORM pg_temp.as_user(NULL);

  SELECT count(*) INTO _n FROM public.practice_members
   WHERE practice_id = _prac AND user_id = _leaver
     AND status = 'revoked' AND ended_by = _admin AND ended_at IS NOT NULL AND end_reason = 'ended_by_practice';
  PERFORM pg_temp.assert(_n = 1, 'the membership is ended, stamped with who, when and why');
  SELECT count(*) INTO _n FROM public.practice_patient_assignments
   WHERE clinician_user_id = _leaver AND effective_to IS NOT NULL AND effective_to <= now();
  PERFORM pg_temp.assert(_n = 1, 'their assignment is closed, not deleted');
  SELECT count(*) INTO _n FROM public.practice_department_members WHERE practice_id = _prac AND user_id = _leaver;
  PERFORM pg_temp.assert(_n = 0, 'their department lead row is gone');
  SELECT count(*) INTO _n FROM public.practice_membership_events
   WHERE practice_id = _prac AND user_id = _leaver AND event_type = 'ended'
     AND actor_user_id = _admin AND reason = 'contract ended'
     AND details -> 'departments' @> jsonb_build_array(jsonb_build_object('department_id', _dept, 'is_lead', true));
  PERFORM pg_temp.assert(_n = 1, 'the ledger records the ending, its reason, and the lead role it closed');
  SELECT count(*) INTO _n FROM public.hipaa_audit_logs
   WHERE user_id = _admin AND action = 'practice_membership_ended' AND resource_type = 'practice_member'
     AND details ->> 'member_user_id' = _leaver::text;
  PERFORM pg_temp.assert(_n = 1, 'and an audit row names the manager');
  -- practice_audit_log is read as a manager.
  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.practice_audit_log(_prac, 'practice_membership')
   WHERE action = 'practice_membership_ended';
  PERFORM pg_temp.assert(_n = 1, 'the tenant''s own audit log shows the departure');
  SELECT count(*) INTO _n FROM public.practice_membership_events WHERE practice_id = _prac AND user_id = _leaver;
  PERFORM pg_temp.assert(_n >= 1, 'managers read the membership ledger');

  -- The ledger is append-only for everyone signed in.
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.practice_membership_events SET reason = %L WHERE user_id = %L', 'rewritten', _leaver)),
    'a manager cannot rewrite the ledger');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM public.practice_membership_events WHERE user_id = %L', _leaver)),
    'nor delete from it');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('INSERT INTO public.practice_membership_events (practice_id, user_id, event_type) VALUES (%L, %L, %L)',
                          _prac, _colleague, 'ended')),
    'nor forge an entry');

  -- ==========================================================================
  -- 4. The leaver writes nothing more to the hospital's record (G1)
  -- ==========================================================================
  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.encounters SET assessment = %L WHERE id = %L', 'offb: after leaving', _draft)),
    'a leaver cannot edit their unsigned draft');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.encounters SET signed_at = now(), status = %L WHERE id = %L', 'finished', _draft)),
    'nor sign it');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.encounters SET status = %L WHERE id = %L', 'entered-in-error', _signed)),
    'nor retract their signed note');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body) VALUES (%L, %L, %L)',
                               _signed, _leaver, 'offb: late addendum')),
    'nor add an addendum');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.internal_notes SET body = %L WHERE id = %L', 'rewritten', _team_note)),
    'nor rewrite their team note');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.internal_notes SET visibility = %L WHERE id = %L', 'private', _team_note)),
    'nor pull it out of the team''s view');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM public.internal_notes WHERE id = %L', _team_note)),
    'nor delete the team note');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.clinician_patient_records SET patient_name = %L WHERE id = %L', 'Renamed', _record)),
    'nor edit the hospital record they filed');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM public.clinician_patient_records WHERE id = %L', _record)),
    'nor delete the hospital record');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT assessment = 'offb: draft v2' AND signed_at IS NULL FROM public.encounters WHERE id = _draft),
    'the draft is exactly as they left it');
  PERFORM pg_temp.assert(
    (SELECT status = 'finished' FROM public.encounters WHERE id = _signed)
    AND (SELECT count(*) FROM public.encounter_addenda WHERE encounter_id = _signed) = 0,
    'the signed note is unchanged and has no late addendum');
  PERFORM pg_temp.assert(
    (SELECT body = 'offb: team note' AND visibility = 'team' FROM public.internal_notes WHERE id = _team_note),
    'the team note is intact');
  PERFORM pg_temp.assert(
    (SELECT patient_name = 'Offb Walk-in' FROM public.clinician_patient_records WHERE id = _record),
    'the hospital record is intact');

  -- What they wrote stays readable to them.
  PERFORM pg_temp.as_user(_leaver);
  SELECT count(*) INTO _n FROM public.encounters WHERE id IN (_draft, _signed);
  PERFORM pg_temp.assert(_n = 2, 'the leaver still reads their own encounters');
  SELECT count(*) INTO _n FROM public.internal_notes WHERE id IN (_team_note, _priv_note);
  PERFORM pg_temp.assert(_n = 2, 'and their own notes');

  -- Their private practice is untouched.
  PERFORM pg_temp.assert(
    pg_temp.changed(format('UPDATE public.encounters SET assessment = %L WHERE id = %L', 'offb: private v2', _own_enc)),
    'the leaver still edits a draft for their own patient');
  PERFORM pg_temp.assert(
    pg_temp.changed(format('UPDATE public.clinician_patient_records SET patient_name = %L WHERE id = %L', 'Solo Renamed', _solo_rec)),
    'and their own solo managed record');
  PERFORM pg_temp.assert(
    pg_temp.changed(format('UPDATE public.internal_notes SET body = %L WHERE id = %L', 'still mine', _priv_note)),
    'and their own private note');

  -- The hospital keeps the record.
  PERFORM pg_temp.as_user(_colleague);
  SELECT count(*) INTO _n FROM public.encounters WHERE id IN (_draft, _signed);
  PERFORM pg_temp.assert(_n = 2, 'a colleague still reads the leaver''s encounters');
  PERFORM pg_temp.assert(
    pg_temp.changed(format('INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body) VALUES (%L, %L, %L)',
                           _signed, _colleague, 'offb: colleague addendum')),
    'an active clinician can still add an addendum');
  PERFORM pg_temp.assert(
    pg_temp.changed(format('INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body) VALUES (%L, %L, %L, %L)',
                           _pat, _colleague, _colleague, 'offb: hello')),
    'an active clinician can still message the patient');

  -- Ending twice is not a second event.
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.end_practice_membership(_prac, _leaver, 'double tap');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_membership_events
   WHERE practice_id = _prac AND user_id = _leaver AND event_type = 'ended';
  PERFORM pg_temp.assert(_n = 1, 'ending an ended membership writes nothing');

  -- ==========================================================================
  -- 5. Moving to a non-clinical role (G8)
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.change_practice_member_access(_prac, _mover, 'billing'::public.practice_role, NULL, 'moved to accounts');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT role = 'billing' AND NOT can_view_all_patients FROM public.practice_members
      WHERE practice_id = _prac AND user_id = _mover),
    'moving to billing clears view-all');
  SELECT count(*) INTO _n FROM public.practice_membership_events
   WHERE practice_id = _prac AND user_id = _mover AND event_type = 'role_changed'
     AND details ->> 'from_role' = 'provider' AND details ->> 'to_role' = 'billing';
  PERFORM pg_temp.assert(_n = 1, 'the role change is in the ledger');

  PERFORM pg_temp.as_user(_mover);
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body) VALUES (%L, %L, %L, %L)',
                               _pat, _mover, _mover, 'offb: from billing')),
    'billing cannot message the patient as a clinician');

  -- Even if a manager then grants billing the wide view, messaging stays clinical.
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.change_practice_member_access(_prac, _mover, NULL, true);
  PERFORM pg_temp.as_user(_mover);
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body) VALUES (%L, %L, %L, %L)',
                               _pat, _mover, _mover, 'offb: from billing again')),
    'billing with view-all still cannot message as a clinician');

  -- ==========================================================================
  -- 6. Leaving of one's own accord
  -- ==========================================================================
  PERFORM pg_temp.as_user(_quitter);
  PERFORM public.leave_practice(_prac, 'moving abroad');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'revoked' AND end_reason = 'left' AND ended_by = _quitter
       FROM public.practice_members WHERE practice_id = _prac AND user_id = _quitter),
    'a member can leave, recorded as having left');
  SELECT count(*) INTO _n FROM public.practice_department_members WHERE practice_id = _prac AND user_id = _quitter;
  PERFORM pg_temp.assert(_n = 0, 'leaving ends their department membership too');
  SELECT count(*) INTO _n FROM public.practice_membership_events
   WHERE practice_id = _prac AND user_id = _quitter AND event_type = 'ended' AND reason = 'moving abroad';
  PERFORM pg_temp.assert(_n = 1, 'the ledger records it');
  PERFORM pg_temp.as_user(_quitter);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.leave_practice(%L, NULL)', _prac)),
    'leaving twice is refused');

  -- A manager cannot re-enrol someone who chose to leave.
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.set_practice_affiliation_status(%L, %L, %L)', _prac, _quitter, 'active')),
    'a manager cannot restore a member who left of their own accord');

  -- ==========================================================================
  -- 7. Coming back is a new period, not a revival
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.set_practice_affiliation_status(_prac, _leaver, 'active');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'active' AND ended_at IS NULL AND end_reason IS NULL
       FROM public.practice_members WHERE practice_id = _prac AND user_id = _leaver),
    'restoring a member clears the end stamp');
  SELECT count(*) INTO _n FROM public.practice_membership_events
   WHERE practice_id = _prac AND user_id = _leaver AND event_type = 'rejoined' AND actor_user_id = _admin;
  PERFORM pg_temp.assert(_n = 1, 'and is recorded as a new event');
  SELECT count(*) INTO _n FROM public.practice_membership_events
   WHERE practice_id = _prac AND user_id = _leaver AND event_type = 'ended';
  PERFORM pg_temp.assert(_n = 1, 'without touching the earlier ending');
  SELECT count(*) INTO _n FROM public.practice_department_members WHERE practice_id = _prac AND user_id = _leaver;
  PERFORM pg_temp.assert(_n = 0, 'the lead role does not come back');
  SELECT count(*) INTO _n FROM public.practice_patient_assignments
   WHERE clinician_user_id = _leaver AND (effective_to IS NULL OR effective_to > now());
  PERFORM pg_temp.assert(_n = 0, 'nor do the assignments');

  -- ==========================================================================
  -- 8. With a second owner, an owner may hand over and go
  -- ==========================================================================
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_prac, _owner2, 'owner', 'active');
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.end_practice_membership(%L, %L, NULL)', _prac, _owner2)),
    'an admin still cannot end an owner when there are two');
  PERFORM pg_temp.as_user(_owner);
  PERFORM public.end_practice_membership(_prac, _owner2, 'duplicate account');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'revoked' FROM public.practice_members WHERE practice_id = _prac AND user_id = _owner2),
    'an owner can end another owner');

  -- Fixtures and the service role are not end users: the guard lets them by.
  UPDATE public.practice_members SET status = 'archived' WHERE practice_id = _prac AND user_id = _colleague;
  PERFORM pg_temp.assert(
    (SELECT status = 'archived' FROM public.practice_members WHERE practice_id = _prac AND user_id = _colleague),
    'a superuser can still change status directly');

  RAISE NOTICE 'offboarding_closes_the_door: all assertions passed';
END $$;

ROLLBACK;
