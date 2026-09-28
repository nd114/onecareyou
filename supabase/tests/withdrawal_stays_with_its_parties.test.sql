-- A withdrawal record belongs to the people it is about, and each of them sees
-- only their part of it.
--
-- The event row carries the practice's internal incident note, which for a
-- misdirected document can name the patient it was meant for. Three ways it
-- got out:
--
--   * P1-6. Calling withdraw_shared_file on an already-withdrawn document
--     returned the stored event before asking who was calling, so anybody who
--     knew a document id could read the whole incident record.
--   * P1-7. The event was stamped with the sender's first active membership,
--     not the practice the document actually went out through. A clinician at
--     two hospitals withdrawing a hospital B patient's document put it in
--     hospital A's register.
--   * P1-9. The recipient read the base table through a policy that filtered
--     rows and not columns, so a wrong-document recipient read the note about
--     the intended patient. object_to_withdrawal handed back the same row.
--
-- And what must keep working: the sender still withdraws, the recipient still
-- learns that something was withdrawn and why in words meant for them, and the
-- sending practice still sees its register.
--
-- Converted from docs/security/phi-audit-2026-09/phi-p1a/r3, phi-p1a/r4 and
-- phi-p2/repro1 T3.

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
  _admin_a  uuid := 'a1a00000-0000-4000-8000-0000000000a1';
  _admin_b  uuid := 'b1b00000-0000-4000-8000-0000000000b1';
  _dr_both  uuid := 'd0d00000-0000-4000-8000-0000000000d0';
  _bola     uuid := '9b9b0000-0000-4000-8000-00000000009b';
  _loner    uuid := '9c9c0000-0000-4000-8000-00000000009c';
  _stranger uuid := '33000000-0000-4000-8000-000000000033';
  _hosp_a   uuid := 'aaaa0000-0000-4000-8000-00000000aaaa';
  _hosp_b   uuid := 'bbbb0000-0000-4000-8000-00000000bbbb';
  _doc      uuid := 'dddd0000-0000-4000-8000-00000000dddd';
  _doc2     uuid := 'dddd0000-0000-4000-8000-00000000ddd2';
  _note     text := 'Meant for Jane Roe (DOB 1971-02-03), same surname';
  _event    public.document_retraction_events;
  _again    public.document_retraction_events;
  _n        integer;
  _txt      text;
  _code     text;
  _raised   boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_admin_a,  'wsp-admin-a@test.local',  now()),
    (_admin_b,  'wsp-admin-b@test.local',  now()),
    (_dr_both,  'wsp-dr-both@test.local',  now()),
    (_bola,     'wsp-bola@test.local',     now()),
    (_loner,    'wsp-loner@test.local',    now()),
    (_stranger, 'wsp-stranger@test.local', now());

  INSERT INTO public.practices (id, name, created_by) VALUES
    (_hosp_a, 'Hospital A', _admin_a),
    (_hosp_b, 'Hospital B', _admin_b);
  -- Dr Both joined A first, then B: the old code's "first membership" is A.
  INSERT INTO public.practice_members (practice_id, user_id, role, status, created_at) VALUES
    (_hosp_a, _dr_both, 'clinician', 'active', now() - interval '1 year'),
    (_hosp_b, _dr_both, 'clinician', 'active', now() - interval '1 month')
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, status = EXCLUDED.status, created_at = EXCLUDED.created_at;

  -- Bola shares with hospital B only. The loner shares with nobody.
  PERFORM set_config('request.jwt.claim.sub', _bola::text, true);
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_hosp_b, _bola, true, true, '{}');

  -- Dr Both, through hospital B, files a document that was meant for somebody
  -- else into Bola's vault.
  INSERT INTO public.health_documents (id, user_id, file_path, file_name, uploaded_by_user_id)
  VALUES (_doc, _bola, _bola::text || '/lab.pdf', 'lab-results.pdf', _dr_both);

  -- ==========================================================================
  -- The sender withdraws it. This is the act everything else must not break.
  -- ==========================================================================
  PERFORM pg_temp.as_user(_dr_both);
  _event := public.withdraw_shared_file(_doc, NULL, 'wrong_recipient', _note, 'INC-2026-044');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_event.id IS NOT NULL AND _event.authority_used = 'sender',
    'the sender still withdraws their own document');

  -- ==========================================================================
  -- P1-6. Asking again is only an answer for somebody entitled to the answer.
  -- ==========================================================================
  PERFORM pg_temp.as_user(_stranger);
  _raised := false;
  BEGIN
    _again := public.withdraw_shared_file(_doc, NULL, 'superseded');
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_raised AND _again.id IS NULL,
    'a stranger re-withdrawing a withdrawn document gets an error, not the incident record');

  PERFORM pg_temp.as_user(_bola);
  _raised := false;
  BEGIN
    _again := public.withdraw_shared_file(_doc, NULL, 'superseded');
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_raised AND _again.id IS NULL,
    'the recipient cannot pull the incident record through withdraw_shared_file');

  PERFORM pg_temp.as_user(_admin_a);
  _raised := false;
  BEGIN
    _again := public.withdraw_shared_file(_doc, NULL, 'superseded');
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_raised AND _again.id IS NULL,
    'the manager of an unrelated hospital cannot pull it either');

  PERFORM pg_temp.as_user(_dr_both);
  _again := public.withdraw_shared_file(_doc, NULL, 'wrong_recipient');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_again.id = _event.id,
    'the sender checking again still gets the existing event back');

  -- ==========================================================================
  -- P1-7. The event belongs to the practice the document went out through.
  -- ==========================================================================
  PERFORM pg_temp.assert(_event.sending_practice_id IS NOT DISTINCT FROM _hosp_b,
    'the event names hospital B, through which the document reached Bola');

  PERFORM pg_temp.as_user(_admin_a);
  SELECT count(*) INTO _n FROM public.practice_withdrawal_register WHERE id = _event.id;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'hospital A does not see hospital B''s withdrawal');

  PERFORM pg_temp.as_user(_admin_b);
  SELECT count(*), max(internal_note) INTO _n, _txt
    FROM public.practice_withdrawal_register WHERE id = _event.id;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1 AND _txt = _note,
    'hospital B sees the withdrawal in its register, internal note included');

  PERFORM pg_temp.as_user(_dr_both);
  SELECT count(*) INTO _n FROM public.practice_withdrawal_register WHERE id = _event.id;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1, 'the sender still sees their own withdrawal');

  -- A document that reached somebody through no practice at all is recorded
  -- against no practice, rather than against whichever one the sender joined
  -- first.
  INSERT INTO public.health_documents (id, user_id, file_path, file_name, uploaded_by_user_id)
  VALUES (_doc2, _loner, _loner::text || '/note.pdf', 'note.pdf', _dr_both);
  PERFORM pg_temp.as_user(_dr_both);
  _again := public.withdraw_shared_file(_doc2, NULL, 'sent_in_error');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_again.sending_practice_id IS NULL,
    'with no shared practice the event names no practice');

  -- ==========================================================================
  -- P1-9. The recipient sees that it was withdrawn and why, in their words,
  --       and never the practice's note.
  -- ==========================================================================
  PERFORM pg_temp.as_user(_bola);
  SELECT count(*), max(patient_message), max(reason_code) INTO _n, _txt, _code
    FROM public.my_withdrawn_documents WHERE id = _event.id;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 1 AND coalesce(btrim(_txt), '') <> '' AND _code = 'wrong_recipient',
    'the recipient still sees the withdrawal and a patient-safe reason');
  PERFORM pg_temp.assert(_txt NOT ILIKE '%Jane Roe%', 'the patient message is not the internal note');

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'my_withdrawn_documents'
     AND column_name IN ('internal_note', 'incident_ref', 'storage_path', 'emergency_justification',
                         'intended_patient_id', 'intended_patient_ref', 'sending_clinician_id');
  PERFORM pg_temp.assert(_n = 0, 'the recipient''s view carries none of the practice''s columns');

  PERFORM pg_temp.as_user(_bola);
  _n := 0;
  BEGIN
    SELECT count(*) INTO _n FROM public.document_retraction_events WHERE internal_note IS NOT NULL;
  EXCEPTION WHEN insufficient_privilege THEN _n := 0;
  END;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'the recipient reads no internal note from the event table');

  PERFORM pg_temp.as_user(_bola);
  SELECT count(*) INTO _n FROM public.practice_withdrawal_register;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'the recipient does not see the practice register');

  -- Objecting is the recipient's right, and the answer is their view of the
  -- event, not the incident record.
  UPDATE public.document_retraction_events SET retracted_at = now() - interval '8 days' WHERE id = _event.id;
  PERFORM pg_temp.as_user(_bola);
  SELECT to_jsonb(o) INTO _txt FROM public.object_to_withdrawal(_event.id, 'This is not mine') o;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_txt IS NOT NULL AND (_txt::jsonb ->> 'objected_at') IS NOT NULL,
    'the recipient can still object');
  PERFORM pg_temp.assert(_txt NOT ILIKE '%Jane Roe%' AND _txt NOT ILIKE '%INC-2026-044%',
    'objecting does not hand back the internal note or incident reference');

  PERFORM pg_temp.as_user(_stranger);
  SELECT count(*) INTO _n FROM public.my_withdrawn_documents;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(_n = 0, 'a stranger sees no withdrawals');

  RAISE NOTICE 'withdrawal_stays_with_its_parties: all assertions passed';
END $$;

ROLLBACK;
