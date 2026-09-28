-- A practice_shares row is the patient's consent, so only the patient writes it.
--
-- The tenant functions (practice_patient_overview, practice_audit_log,
-- get_patient_identity) trust any practice_shares row, revoked ones included,
-- because a revoked share is still the tenant's accountability record. That is
-- only sound if the row cannot be forged. It could be: anyone can create a
-- practice, share themselves with it, then "end" that share as its admin while
-- rewriting user_id to a stranger. The end-share policy pinned is_active and
-- nothing else. The stranger's name, email and phone, and their audit trail
-- at other hospitals, then read as the forger's own patient's.
--
-- Staff rows had the same shape of hole: a manager could insert an active
-- membership for any clinician, or rewrite a member row's user_id, without the
-- clinician ever agreeing. Joining is now the joiner's act.
--
-- Converted from docs/security/phi-audit-2026-09/phi-p1a/r2.

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
  _attacker uuid := 'c3000000-0000-4000-8000-0000000000a3';
  _admin_b  uuid := 'd4000000-0000-4000-8000-0000000000a4';
  _dr_d     uuid := 'e5000000-0000-4000-8000-0000000000a5';
  _bode     uuid := 'f6000000-0000-4000-8000-0000000000a6';
  _invitee  uuid := 'a7000000-0000-4000-8000-0000000000a7';
  _hosp_b   uuid := 'b0000000-0000-4000-8000-0000000000b1';
  _front    uuid := 'a0000000-0000-4000-8000-0000000000a1';
  _share    uuid;
  _inv      uuid;
  _n        integer;
  _txt      text;
  _raised   boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_attacker, 'srb-attacker@test.local', now()),
    (_admin_b,  'srb-admin-b@test.local',  now()),
    (_dr_d,     'srb-dr-d@test.local',     now()),
    (_bode,     'srb-bode@test.local',     now()),
    (_invitee,  'srb-invitee@test.local',  now());
  INSERT INTO public.profiles (user_id, name, email, phone_number) VALUES
    (_attacker, 'Attacker',    'srb-attacker@test.local', NULL),
    (_admin_b,  'Admin B',     'srb-admin-b@test.local',  NULL),
    (_dr_d,     'Dr D',        'srb-dr-d@test.local',     NULL),
    (_bode,     'Bode Theirs', 'srb-bode@test.local',     '+44 7700 900123'),
    (_invitee,  'Invitee',     'srb-invitee@test.local',  NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number;

  -- Hospital B, its clinician, and Bode, who shares with B and nobody else.
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp_b, 'Hospital B', _admin_b);
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_hosp_b, _dr_d, 'clinician', 'active');
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_hosp_b, _bode, true, true, '{}');
  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, patient_user_id)
  VALUES (_dr_d, 'internal_note_written', 'internal_note', 'srb-note', _bode);

  -- ==========================================================================
  -- 1. The forgery: share yourself, then "end" the share as a stranger's
  -- ==========================================================================
  PERFORM pg_temp.as_user(_attacker);
  INSERT INTO public.practices (id, name, created_by) VALUES (_front, 'Front Co', _attacker);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_front, _attacker, true, true, '{}');

  _raised := false;
  BEGIN
    UPDATE public.practice_shares
       SET is_active = false, user_id = _bode
     WHERE practice_id = _front AND user_id = _attacker;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE practice_id = _front AND user_id = _bode;
  PERFORM pg_temp.assert(_n = 0, 'a practice admin cannot rewrite a share onto another patient');

  -- Moving a share onto somebody else's practice is the same forgery from the
  -- other side.
  PERFORM pg_temp.as_user(_attacker);
  _raised := false;
  BEGIN
    UPDATE public.practice_shares SET practice_id = _hosp_b
     WHERE practice_id = _front AND user_id = _attacker;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a share cannot be moved to another practice');

  -- Everything the forged row used to unlock stays shut.
  SELECT count(*) INTO _n FROM public.get_patient_identity(ARRAY[_bode]) WHERE name IS NOT NULL OR email IS NOT NULL;
  PERFORM pg_temp.assert(_n = 0, 'get_patient_identity does not resolve a stranger');
  SELECT count(*) INTO _n FROM public.practice_patient_overview(_front) WHERE patient_user_id = _bode;
  PERFORM pg_temp.assert(_n = 0, 'the stranger is not in the forger''s patient list');
  SELECT count(*) INTO _n FROM public.practice_audit_log(_front, 'Bode');
  PERFORM pg_temp.assert(_n = 0, 'the stranger''s audit trail at another hospital stays there');

  -- ==========================================================================
  -- 2. Nobody joins a practice without agreeing to
  -- ==========================================================================
  _raised := false;
  BEGIN
    INSERT INTO public.practice_members (practice_id, user_id, role, status)
    VALUES (_front, _dr_d, 'clinician', 'active');
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a manager cannot enrol another hospital''s clinician');

  _raised := false;
  BEGIN
    INSERT INTO public.practice_members (practice_id, user_id, role, status)
    VALUES (_front, _dr_d, 'clinician', 'pending_approval');
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'nor file a pending membership in their name');

  -- The owner row the practice trigger created is real; its user_id is not
  -- the manager's to rewrite.
  _raised := false;
  BEGIN
    UPDATE public.practice_members SET user_id = _dr_d
     WHERE practice_id = _front AND user_id = _attacker;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a member row cannot be rewritten onto someone else');

  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_members WHERE practice_id = _front AND user_id = _dr_d;
  PERFORM pg_temp.assert(_n = 0, 'Dr D is not a member of Front Co');

  -- ==========================================================================
  -- 3. What each party may still do to a real share
  -- ==========================================================================
  -- The patient: change what they share, end it, share again.
  PERFORM pg_temp.as_user(_bode);
  SELECT id INTO _share FROM public.practice_shares WHERE practice_id = _hosp_b AND user_id = _bode;
  UPDATE public.practice_shares SET share_all = false, permissions = '{"vitals": true}' WHERE id = _share;
  UPDATE public.practice_shares SET is_active = false, revoked_at = now(), revoked_by = _bode WHERE id = _share;
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions, revoked_at, revoked_by)
  VALUES (_hosp_b, _bode, true, true, '{}', NULL, NULL)
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET is_active = EXCLUDED.is_active, share_all = EXCLUDED.share_all,
        permissions = EXCLUDED.permissions, revoked_at = NULL, revoked_by = NULL;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE id = _share AND is_active AND share_all;
  PERFORM pg_temp.assert(_n = 1, 'the patient can narrow, end and restore their own share');

  -- The practice: suspend its own staff's access, and lift it again.
  PERFORM pg_temp.as_user(_admin_b);
  PERFORM public.set_practice_suspension(_hosp_b, _bode, true);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE id = _share AND practice_suspended_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'the practice can suspend its access');

  -- The suspension is the practice's switch, not the patient's.
  PERFORM pg_temp.as_user(_bode);
  UPDATE public.practice_shares SET practice_suspended_at = NULL, practice_suspended_by = NULL WHERE id = _share;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE id = _share AND practice_suspended_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'the patient cannot lift the practice''s suspension');

  PERFORM pg_temp.as_user(_admin_b);
  PERFORM public.set_practice_suspension(_hosp_b, _bode, false);
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares WHERE id = _share AND practice_suspended_at IS NULL;
  PERFORM pg_temp.assert(_n = 1, 'the practice can lift its own suspension');

  -- The practice admin may end the share, and nothing else about it.
  PERFORM pg_temp.as_user(_admin_b);
  _raised := false;
  BEGIN
    UPDATE public.practice_shares SET is_active = false, share_all = true,
           permissions = '{"vitals": true, "medications": true, "documents": true}'
     WHERE id = _share;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a practice admin cannot widen what the patient shared');

  UPDATE public.practice_shares SET is_active = false, revoked_at = now(), revoke_reason = 'discharged'
   WHERE id = _share;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_shares
   WHERE id = _share AND NOT is_active AND revoked_by = _admin_b AND user_id = _bode;
  PERFORM pg_temp.assert(_n = 1, 'a practice admin can end a share, stamped as themselves');

  -- ==========================================================================
  -- 4. Joining by invitation is the invitee's act, on the manager's terms
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin_b);
  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_hosp_b, 'srb-invitee@test.local', 'nurse', _admin_b)
  RETURNING id INTO _inv;

  -- The invitee cannot promote the invitation before accepting it.
  PERFORM pg_temp.as_user(_invitee);
  _raised := false;
  BEGIN
    UPDATE public.practice_invitations SET role = 'owner' WHERE id = _inv;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _raised := _n = 0;
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'an invitee cannot rewrite the role they were offered');

  -- Someone else cannot accept it for them.
  PERFORM pg_temp.as_user(_attacker);
  _raised := false;
  BEGIN
    PERFORM public.accept_practice_invitation(_inv);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'an invitation addressed to someone else cannot be accepted');

  PERFORM pg_temp.as_user(_invitee);
  PERFORM public.accept_practice_invitation(_inv);
  PERFORM pg_temp.as_user(NULL);
  SELECT role::text INTO _txt FROM public.practice_members
   WHERE practice_id = _hosp_b AND user_id = _invitee AND status = 'active';
  PERFORM pg_temp.assert(_txt = 'nurse', 'accepting joins with the role the manager offered');
  SELECT status INTO _txt FROM public.practice_invitations WHERE id = _inv;
  PERFORM pg_temp.assert(_txt = 'accepted', 'and marks the invitation accepted');

  PERFORM pg_temp.as_user(_invitee);
  _raised := false;
  BEGIN
    PERFORM public.accept_practice_invitation(_inv);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'an invitation is accepted once');

  -- Declining is also the invitee's alone.
  PERFORM pg_temp.as_user(_admin_b);
  INSERT INTO public.practice_invitations (practice_id, email, role, invited_by)
  VALUES (_hosp_b, 'srb-dr-d@test.local', 'clinician', _admin_b)
  RETURNING id INTO _inv;
  PERFORM pg_temp.as_user(_dr_d);
  PERFORM public.decline_practice_invitation(_inv);
  PERFORM pg_temp.as_user(NULL);
  SELECT status INTO _txt FROM public.practice_invitations WHERE id = _inv;
  PERFORM pg_temp.assert(_txt = 'declined', 'the invitee can decline');

  -- A manager still manages the people who did join.
  PERFORM pg_temp.as_user(_admin_b);
  UPDATE public.practice_members SET can_view_all_patients = false
   WHERE practice_id = _hosp_b AND user_id = _invitee;
  UPDATE public.practice_members SET status = 'archived'
   WHERE practice_id = _hosp_b AND user_id = _invitee;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.practice_members
   WHERE practice_id = _hosp_b AND user_id = _invitee AND status = 'archived' AND NOT can_view_all_patients;
  PERFORM pg_temp.assert(_n = 1, 'a manager can still change a member''s access and status');

  RAISE NOTICE 'share_rows_belong_to_their_patient: all assertions passed';
END $$;

ROLLBACK;
