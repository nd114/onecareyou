-- When someone leaves a hospital, the hospital keeps its record, its open work
-- lands with someone, and the leaver keeps nothing of it.
--
-- Before: a leaver still read every hospital note, internal note, dictation,
-- managed record, task and appointment they had authored or been given; their
-- unsigned drafts sat editable by nobody and visible to nobody at the hospital;
-- the hospital could not read the message threads its patients had with them;
-- nothing told an admin what ending a membership would leave behind; and the
-- patient was never told who had taken over.
--
-- Founder decisions (docs/plans/clinician-offboarding.md §7), grounded in the
-- consent model: the relationship was the hospital's (pathway B), nothing is
-- deleted (P2), hidden is not deleted (P3), and there is no break-glass (P4).

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

-- The message a refusal gives, or NULL when nothing was refused.
CREATE OR REPLACE FUNCTION pg_temp.error_of(_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.n(_sql text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || _sql || ') q' INTO _n;
  RETURN _n;
END;
$$;

DO $$
DECLARE
  _owner     uuid := '0ab00000-0000-4000-8000-000000000001';
  _admin     uuid := '0ab00000-0000-4000-8000-000000000002';  -- clinical admin, sees every patient
  _leaver    uuid := '0ab00000-0000-4000-8000-000000000003';  -- assigned, leads Neurology
  _lead      uuid := '0ab00000-0000-4000-8000-000000000004';  -- leads Cardiology, not assigned
  _colleague uuid := '0ab00000-0000-4000-8000-000000000005';  -- provider, sees every patient
  _newdoc    uuid := '0ab00000-0000-4000-8000-000000000006';
  _desk      uuid := '0ab00000-0000-4000-8000-000000000007';  -- front desk with view-all
  _pat       uuid := '0ab00000-0000-4000-8000-000000000008';  -- the hospital's patient, in Cardiology
  _private   uuid := '0ab00000-0000-4000-8000-000000000009';  -- the leaver's own patient
  _owner2    uuid := '0ab00000-0000-4000-8000-00000000000a';
  _mover     uuid := '0ab00000-0000-4000-8000-00000000000b';  -- a nurse later moved to reception
  _mdraft    uuid;
  _mdict     uuid;
  _prac      uuid := '0ab10000-0000-4000-8000-000000000001';
  _elsewhere uuid := '0ab10000-0000-4000-8000-000000000002';
  _cardio    uuid := '0ab20000-0000-4000-8000-000000000001';
  _neuro     uuid := '0ab20000-0000-4000-8000-000000000002';
  _draft     uuid;
  _signed    uuid;
  _priv_enc  uuid;
  _team_note uuid;
  _priv_note uuid;
  _own_note  uuid;
  _dict      uuid;
  _record    uuid;
  _solo_rec  uuid;
  _msg       uuid;
  _pmsg      uuid;
  _proposal  uuid;
  _task      uuid;
  _appt      uuid;
  _impact    jsonb;
  _n         integer;
  _txt       text;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_owner,     'hand-owner@test.local',     now()),
    (_admin,     'hand-admin@test.local',     now()),
    (_leaver,    'hand-leaver@test.local',    now()),
    (_lead,      'hand-lead@test.local',      now()),
    (_colleague, 'hand-colleague@test.local', now()),
    (_newdoc,    'hand-newdoc@test.local',    now()),
    (_desk,      'hand-desk@test.local',      now()),
    (_pat,       'hand-patient@test.local',   now()),
    (_private,   'hand-private@test.local',   now()),
    (_owner2,    'hand-owner2@test.local',    now());

  INSERT INTO public.profiles (user_id, name) VALUES
    (_leaver, 'Lena Leaver'), (_newdoc, 'Nadia Newdoc'), (_pat, 'Ada Lovelace'),
    (_admin, 'Arthur Admin'), (_lead, 'Lara Lead')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.practices (id, name, created_by, member_limit) VALUES
    (_prac, 'Handover General', _owner, 50),
    (_elsewhere, 'Elsewhere Clinic', _owner, 50);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _owner, 'owner', 'active')
  ON CONFLICT (practice_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients) VALUES
    (_prac, _admin,     'admin',      'active', true),
    (_prac, _leaver,    'provider',   'active', false),
    (_prac, _lead,      'provider',   'active', false),
    (_prac, _colleague, 'provider',   'active', true),
    (_prac, _newdoc,    'provider',   'active', false),
    (_prac, _desk,      'front_desk', 'active', true);

  INSERT INTO public.practice_departments (id, practice_id, name, created_by) VALUES
    (_cardio, _prac, 'Cardiology', _owner),
    (_neuro,  _prac, 'Neurology',  _owner);
  INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead) VALUES
    (_cardio, _prac, _lead,   true),
    (_neuro,  _prac, _leaver, true);

  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_prac, _pat, true, true, '{}');
  INSERT INTO public.practice_patient_departments (practice_id, department_id, patient_user_id, assigned_by)
  VALUES (_prac, _cardio, _pat, _owner);
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _leaver, _owner);

  -- The leaver is a clinician in their own right: that is what keeps their
  -- private share working once the practice membership is gone.
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name) VALUES (_leaver, 'Lena', 'Leaver');

  INSERT INTO public.provider_shares (user_id, clinician_user_id, provider_name, provider_email,
                                      invite_code, permissions, is_active)
  VALUES (_private, _leaver, 'Dr Leaver', 'hand-leaver@test.local', 'HAND0001', '{"profile": true}', true);

  -- ==========================================================================
  -- 1. What the leaver writes is stamped with the context it was written in
  -- ==========================================================================
  PERFORM pg_temp.as_user(_leaver);
  -- No practice_id from the client: the server works it out.
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment)
  VALUES (_pat, _leaver, 'hand: draft') RETURNING id INTO _draft;
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment)
  VALUES (_pat, _leaver, 'hand: signed') RETURNING id INTO _signed;
  UPDATE public.encounters SET signed_at = now(), status = 'signed' WHERE id = _signed;
  INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body)
  VALUES (_signed, _leaver, 'hand: my own addendum');
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment)
  VALUES (_private, _leaver, 'hand: private draft') RETURNING id INTO _priv_enc;
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_pat, _leaver, 'hand: team note', 'team') RETURNING id INTO _team_note;
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_pat, _leaver, 'hand: private jotting', 'private') RETURNING id INTO _priv_note;
  INSERT INTO public.internal_notes (patient_user_id, author_user_id, body, visibility)
  VALUES (_private, _leaver, 'hand: own patient note', 'private') RETURNING id INTO _own_note;
  INSERT INTO public.clinician_dictations (clinician_user_id, patient_user_id, audio_path, transcript, summary, status)
  VALUES (_leaver, _pat, _leaver || '/hand.webm', 'hand: transcript', 'hand: summary', 'transcribed')
  RETURNING id INTO _dict;
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, practice_id)
  VALUES (_leaver, 'Hand Walk-in', _prac) RETURNING id INTO _record;
  INSERT INTO public.clinician_patient_records (clinician_user_id, patient_name, practice_id)
  VALUES (_leaver, 'Hand Solo Patient', NULL) RETURNING id INTO _solo_rec;
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _leaver, _leaver, 'hand: how are you?') RETURNING id INTO _msg;
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_private, _leaver, _leaver, 'hand: private hello') RETURNING id INTO _pmsg;
  INSERT INTO public.record_change_proposals (patient_user_id, proposed_by_user_id, kind, payload)
  VALUES (_pat, _leaver, 'medication_start', '{"name": "Hand-azole"}') RETURNING id INTO _proposal;

  PERFORM pg_temp.assert(
    pg_temp.raises(format('INSERT INTO public.encounters (patient_user_id, clinician_user_id, practice_id, assessment) VALUES (%L, %L, %L, %L)',
                          _private, _leaver, _elsewhere, 'hand: forged')),
    'a clinician cannot file a note under a practice they do not work at');

  PERFORM pg_temp.as_user(_pat);
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _leaver, _pat, 'hand: better, thanks');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('UPDATE public.messages SET practice_id = NULL WHERE id = %L', _msg)) OR
    (SELECT practice_id FROM public.messages WHERE id = _msg) IS NOT DISTINCT FROM _prac,
    'a participant cannot move a hospital message out of the hospital');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT practice_id FROM public.encounters WHERE id = _draft) = _prac,
    'a hospital note written with no practice is stamped with the hospital');
  PERFORM pg_temp.assert((SELECT practice_id FROM public.encounters WHERE id = _priv_enc) IS NULL,
    'a note for the leaver''s own patient stays private');
  PERFORM pg_temp.assert((SELECT practice_id FROM public.internal_notes WHERE id = _team_note) = _prac
                         AND (SELECT practice_id FROM public.internal_notes WHERE id = _priv_note) = _prac,
    'internal notes about a hospital patient, team or private, belong to the hospital');
  PERFORM pg_temp.assert((SELECT practice_id FROM public.internal_notes WHERE id = _own_note) IS NULL,
    'an internal note about their own patient does not');
  PERFORM pg_temp.assert((SELECT practice_id FROM public.clinician_dictations WHERE id = _dict) = _prac,
    'a dictation about a hospital patient belongs to the hospital');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.messages WHERE patient_user_id = _pat AND clinician_user_id = _leaver AND practice_id = _prac) = 2,
    'both sides of the hospital thread are the hospital''s');
  PERFORM pg_temp.assert((SELECT practice_id FROM public.messages WHERE id = _pmsg) IS NULL,
    'a private-share thread stays private');
  PERFORM pg_temp.assert((SELECT practice_id FROM public.record_change_proposals WHERE id = _proposal) = _prac,
    'a proposal made through the hospital belongs to it');

  INSERT INTO storage.objects (bucket_id, name, owner) VALUES
    ('clinician-dictations', _leaver || '/hand.webm', _leaver),
    ('clinician-dictations', _leaver || '/own.webm', _leaver);
  INSERT INTO public.practice_tasks (practice_id, assignee_user_id, created_by, patient_user_id, title)
  VALUES (_prac, _leaver, _admin, _pat, 'hand: call back about results') RETURNING id INTO _task;
  INSERT INTO public.fhir_appointments (practice_id, patient_user_id, clinician_user_id, status, start_time, end_time, created_by)
  VALUES (_prac, _pat, _leaver, 'booked', now() + interval '7 days', now() + interval '7 days 30 minutes', _admin)
  RETURNING id INTO _appt;

  -- Before anyone leaves, a colleague does not read someone else's thread.
  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND clinician_user_id = %L', _pat, _leaver)) = 0,
    'while the clinician works here, their thread is theirs');

  -- ==========================================================================
  -- 2. Before ending: what it will leave behind, in plain counts
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  _impact := public.offboarding_impact(_prac, _leaver);
  PERFORM pg_temp.assert((_impact ->> 'open_assignments')::int = 1, 'impact: one open assignment');
  PERFORM pg_temp.assert((_impact ->> 'patients_left_unassigned')::int = 1, 'impact: one patient will have nobody');
  PERFORM pg_temp.assert((_impact ->> 'unsigned_drafts')::int = 1, 'impact: one unsigned draft (the signed note and the private draft are not counted)');
  PERFORM pg_temp.assert((_impact ->> 'unfiled_dictations')::int = 1, 'impact: one unfiled dictation');
  PERFORM pg_temp.assert((_impact ->> 'open_tasks')::int = 1, 'impact: one open task');
  PERFORM pg_temp.assert((_impact ->> 'future_appointments')::int = 1, 'impact: one future appointment');
  PERFORM pg_temp.assert((_impact ->> 'pending_proposals')::int = 1, 'impact: one pending proposal');
  PERFORM pg_temp.assert(_impact -> 'lead_departments' = '["Neurology"]'::jsonb, 'impact: the department they lead, by name');
  PERFORM pg_temp.assert(NOT (_impact ->> 'is_owner')::boolean AND (_impact ->> 'blocked_reason') IS NULL,
    'impact: not an owner, nothing blocks it');

  _impact := public.offboarding_impact(_prac, _owner);
  PERFORM pg_temp.assert((_impact ->> 'is_owner')::boolean AND (_impact ->> 'other_active_owners')::int = 0
                         AND (_impact ->> 'blocked_reason') ILIKE '%another owner%',
    'impact: the only owner is blocked, and told to appoint another owner');

  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert((public.offboarding_impact(_prac, _leaver) ->> 'unsigned_drafts')::int = 1,
    'a member can preview their own leaving');
  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(pg_temp.raises(format('SELECT public.offboarding_impact(%L, %L)', _prac, _leaver)),
    'a colleague cannot preview someone else''s');

  -- ==========================================================================
  -- 3. The only owner is told plainly to appoint a successor
  -- ==========================================================================
  PERFORM pg_temp.as_user(_owner);
  _txt := pg_temp.error_of(format('SELECT public.leave_practice(%L, NULL)', _prac));
  PERFORM pg_temp.assert(_txt ILIKE '%only owner%' AND _txt ILIKE '%co-owner%',
    'leave_practice tells the only owner to make a co-owner first: ' || COALESCE(_txt, '(no error)'));
  _txt := pg_temp.error_of(format('SELECT public.end_practice_membership(%L, %L, NULL)', _prac, _owner));
  PERFORM pg_temp.assert(_txt ILIKE '%only owner%',
    'and so does end_practice_membership: ' || COALESCE(_txt, '(no error)'));

  -- ==========================================================================
  -- 4. The leaver goes
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.end_practice_membership(_prac, _leaver, 'contract ended');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT author_departed_at IS NOT NULL AND signed_at IS NULL AND assessment = 'hand: draft'
       FROM public.encounters WHERE id = _draft),
    'the unsigned draft is frozen, not deleted, and unchanged');
  PERFORM pg_temp.assert((SELECT author_departed_at IS NULL FROM public.encounters WHERE id = _signed),
    'a signed note is not a draft and is not frozen');
  PERFORM pg_temp.assert((SELECT author_departed_at IS NULL FROM public.encounters WHERE id = _priv_enc),
    'the leaver''s private draft is untouched');
  PERFORM pg_temp.assert(
    (SELECT author_departed_at IS NOT NULL AND archived_at IS NULL FROM public.clinician_dictations WHERE id = _dict),
    'the unfiled dictation is frozen, not deleted');

  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'departed_author_drafts' AND practice_id = _prac AND related_id IN (_draft, _dict);
  PERFORM pg_temp.assert(_n = 6, 'two items, each routed to the owner, the admin and the patient''s department lead (got ' || _n || ')');
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'departed_author_drafts' AND clinician_user_id IN (_colleague, _leaver, _newdoc);
  PERFORM pg_temp.assert(_n = 0, 'not to other clinicians, nor to the leaver');
  PERFORM pg_temp.assert(
    (SELECT message FROM public.clinician_guidance_notifications
      WHERE clinician_user_id = _lead AND related_id = _draft) ILIKE '%Lena Leaver%unsigned note%Ada L.%',
    'the notice says who left, what is unsigned, and for whom');
  PERFORM pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.patient_notices WHERE patient_user_id = _pat),
    'the patient is not told at departure');

  -- The leaver reads nothing of the hospital's, including what they wrote.
  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounters WHERE patient_user_id = %L', _pat)) = 0,
    'the leaver reads none of the hospital''s notes, their own included');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounter_addenda a JOIN public.encounters e ON e.id = a.encounter_id WHERE e.patient_user_id = %L', _pat)) = 0,
    'nor any addenda');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.internal_notes WHERE patient_user_id = %L', _pat)) = 0,
    'nor their internal notes about the hospital''s patient, team or private');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.clinician_dictations WHERE id = %L', _dict)) = 0,
    'nor their hospital dictation');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM storage.objects WHERE bucket_id = %L AND name = %L', 'clinician-dictations', _leaver || '/hand.webm')) = 0,
    'nor play its recording, although it sits in their own folder');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('DELETE FROM storage.objects WHERE bucket_id = %L AND name = %L', 'clinician-dictations', _leaver || '/hand.webm')),
    'nor delete it');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM storage.objects WHERE bucket_id = %L AND name = %L', 'clinician-dictations', _leaver || '/own.webm')) = 1,
    'while a recording of their own stays theirs');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.clinician_patient_records WHERE id = %L', _record)) = 0,
    'nor the managed record they filed for the hospital');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'nor the hospital thread');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.record_change_proposals WHERE id = %L', _proposal)) = 0,
    'nor the proposal they made through the hospital');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.practice_tasks WHERE id = %L', _task)) = 0,
    'nor the hospital task assigned to them');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.fhir_appointments WHERE id = %L', _appt)) = 0,
    'nor the hospital appointment booked with them');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.withdraw_change_proposal(%L, NULL)', _proposal)),
    'nor withdraw the proposal after leaving');
  -- Their own practice is untouched.
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounters WHERE id = %L', _priv_enc)) = 1,
    'the leaver still reads their private patient''s note');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.internal_notes WHERE id = %L', _own_note)) = 1,
    'and their own-patient note');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.clinician_patient_records WHERE id = %L', _solo_rec)) = 1,
    'and their solo managed record');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE id = %L', _pmsg)) = 1,
    'and their private thread');
  PERFORM pg_temp.assert(
    pg_temp.changed(format('UPDATE public.encounters SET assessment = %L WHERE id = %L', 'hand: private v2', _priv_enc)),
    'and still writes for their own patient');

  -- ==========================================================================
  -- 5. The frozen draft: nobody edits it; the lead can read it and decide
  -- ==========================================================================
  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body) VALUES (%L, %L, %L)',
                               _draft, _colleague, 'hand: addendum to a frozen draft')),
    'nobody adds an addendum to a frozen unsigned draft');
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.resolve_departed_draft(%L, %L, %L)', 'encounter', _draft, 'archive')),
    'a clinician who neither leads nor manages cannot dispose of it');
  -- A client cannot freeze or unfreeze by hand.
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment, author_departed_at, disposition)
  VALUES (_pat, _colleague, 'hand: sneaky', now(), 'archived') RETURNING id INTO _txt;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT author_departed_at IS NULL AND disposition IS NULL FROM public.encounters WHERE id = _txt::uuid),
    'the freeze columns cannot be written by a client');

  PERFORM pg_temp.as_user(_lead);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounters WHERE id = %L', _draft)) = 1,
    'the department lead reads the frozen draft');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounters WHERE id = %L', _signed)) = 0,
    'and nothing else of the patient''s they were not given');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.clinician_dictations WHERE id = %L', _dict)) = 1,
    'and the frozen dictation');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.encounters SET assessment = %L WHERE id = %L', 'hand: lead edit', _draft)),
    'the lead cannot edit the draft');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.clinician_dictations SET summary = %L WHERE id = %L', 'hand: lead edit', _dict)),
    'nor the dictation');
  _txt := pg_temp.error_of(format('SELECT public.resolve_departed_draft(%L, %L, %L)', 'encounter', _draft, 'cosign'));
  PERFORM pg_temp.assert(_txt ILIKE '%assign%',
    'signing off is clinical: a lead not on the patient''s care is told to assign themselves first: ' || COALESCE(_txt, '(no error)'));

  -- The lead archives the dictation. Kept, not deleted.
  PERFORM public.resolve_departed_draft('dictation', _dict, 'archive', 'duplicate of the note');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT disposition = 'archived' AND disposition_by = _lead AND archived_at IS NOT NULL AND transcript = 'hand: transcript'
       FROM public.clinician_dictations WHERE id = _dict),
    'the archived dictation is kept, with who archived it');
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE related_id = _dict AND acknowledged_at IS NOT NULL AND acknowledged_by = _lead;
  PERFORM pg_temp.assert(_n = 3, 'resolving it closes every recipient''s copy of the notice');

  -- The admin, who sees every patient, signs the draft off. Authorship stays.
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND item_id = %L', _prac, 'draft', _draft)) = 1,
    'before it is resolved, the draft is in the handover queue');
  PERFORM public.resolve_departed_draft('encounter', _draft, 'cosign', 'Reviewed with the patient by phone.');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT clinician_user_id = _leaver AND signed_at IS NOT NULL AND status = 'signed'
            AND disposition = 'cosigned' AND disposition_by = _admin AND NOT shared_with_patient
            AND assessment = 'hand: draft'
       FROM public.encounters WHERE id = _draft),
    'the note is signed off, still the leaver''s, unchanged, and not shared by default');
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.encounter_addenda
             WHERE encounter_id = _draft AND author_user_id = _admin
               AND body ILIKE '%Signed off%Lena Leaver%Reviewed with the patient%'),
    'the sign-off is an addendum under the admin''s own name');
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.hipaa_audit_logs WHERE user_id = _admin AND action = 'departed_draft_cosign'
             AND resource_id = _draft::text),
    'and is audited');

  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT public.resolve_departed_draft(%L, %L, %L)', 'encounter', _draft, 'archive')),
    'a resolved draft cannot be resolved again');
  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(
    pg_temp.changed(format('INSERT INTO public.encounter_addenda (encounter_id, author_user_id, body) VALUES (%L, %L, %L)',
                           _draft, _colleague, 'hand: follow-up')),
    'once signed off, colleagues add addenda as to any signed note');

  -- ==========================================================================
  -- 6. The hospital's threads carry on
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _leaver, _pat, 'hand: is anyone there?');

  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND clinician_user_id = %L', _pat, _leaver)) = 3,
    'after the clinician leaves, a colleague who sees the patient reads the whole hospital thread');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE id = %L', _pmsg)) = 0,
    'but never the leaver''s private thread');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.my_message_threads(%L) WHERE counterparty_id = %L AND unread >= 1', 'clinician', _pat)) = 1,
    'the patient''s unanswered message shows in the colleague''s inbox');
  PERFORM public.mark_practice_thread_read(_pat);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L AND clinician_user_id = %L AND sender_user_id = %L AND read_at IS NULL', _pat, _leaver, _pat)) = 0,
    'and they can mark it read, so the patient sees someone did');
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _colleague, _colleague, 'hand: I am covering, how can I help?') RETURNING id INTO _msg;
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT practice_id FROM public.messages WHERE id = _msg) = _prac,
    'the reply continues as a hospital thread');

  PERFORM pg_temp.as_user(_desk);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'front desk, even with the wide view, reads no clinical thread');
  PERFORM pg_temp.as_user(_newdoc);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'a clinician not on the patient''s care reads none of it');

  -- ==========================================================================
  -- 7. Needs cover: open work is flagged, not deleted
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND patient_user_id = %L AND departed_user_id = %L',
                     _prac, 'patient', _pat, _leaver)) = 1,
    'the patient left with nobody is on the needs-cover list, with who they were with');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND item_id = %L', _prac, 'task', _task)) = 1,
    'so is the open task');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND item_id = %L', _prac, 'appointment', _appt)) = 1,
    'and the future appointment');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND item_id = %L', _prac, 'proposal', _proposal)) = 1,
    'and the pending proposal');
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind IN (%L, %L)', _prac, 'draft', 'dictation')) = 0,
    'resolved drafts and dictations leave the list');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'open' FROM public.practice_tasks WHERE id = _task)
    AND (SELECT status = 'booked' FROM public.fhir_appointments WHERE id = _appt),
    'nothing was cancelled or deleted');

  PERFORM pg_temp.as_user(_lead);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND patient_user_id = %L', _prac, 'patient', _pat)) = 1,
    'the lead sees the patient in their department on the list');
  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(
    pg_temp.raises(format('SELECT * FROM public.practice_handover_queue(%L)', _prac)),
    'a clinician who neither leads nor manages does not get the list');

  -- The practice may withdraw a departed member's pending proposal.
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.withdraw_change_proposal(_proposal, 'The proposing clinician has left.');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT status = 'withdrawn' FROM public.record_change_proposals WHERE id = _proposal),
    'a manager withdraws a departed clinician''s proposal; it is kept as withdrawn');

  -- ==========================================================================
  -- 8. The patient is told once, when their care is handed over
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by, department_id)
  VALUES (_prac, _pat, _newdoc, _admin, _cardio);
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _colleague, _admin);

  PERFORM pg_temp.as_user(_pat);
  SELECT count(*) INTO _n FROM public.patient_notices WHERE patient_user_id = _pat AND notice_type = 'care_handed_over';
  PERFORM pg_temp.assert(_n = 1, 'the patient is told once, not once per new assignment (got ' || _n || ')');
  SELECT message INTO _txt FROM public.patient_notices WHERE patient_user_id = _pat;
  PERFORM pg_temp.assert(_txt ILIKE '%Lena Leaver%no longer%Handover General%Nadia Newdoc%Cardiology%',
    'naming who left, the hospital, and who and which department now looks after them: ' || COALESCE(_txt, '(none)'));
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.patient_notices SET message = %L WHERE patient_user_id = %L', 'rewritten', _pat)),
    'the patient cannot rewrite the notice');
  PERFORM public.mark_patient_notice_seen((SELECT id FROM public.patient_notices WHERE patient_user_id = _pat));
  PERFORM pg_temp.assert((SELECT seen_at IS NOT NULL FROM public.patient_notices WHERE patient_user_id = _pat),
    'and marks it seen through the function');
  PERFORM pg_temp.as_user(_colleague);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.patient_notices WHERE patient_user_id = %L', _pat)) = 0,
    'nobody else reads the patient''s notices');

  PERFORM pg_temp.as_user(_admin);
  PERFORM pg_temp.assert(
    pg_temp.n(format('SELECT 1 FROM public.practice_handover_queue(%L) WHERE kind = %L AND patient_user_id = %L', _prac, 'patient', _pat)) = 0,
    'once covered, the patient leaves the needs-cover list');

  -- ==========================================================================
  -- 9. Coming back does not reopen what was frozen
  -- ==========================================================================
  PERFORM pg_temp.as_user(_admin);
  PERFORM public.set_practice_affiliation_status(_prac, _leaver, 'active');
  PERFORM pg_temp.as_user(_leaver);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.clinician_patient_records WHERE id = %L', _record)) = 1,
    'a returning member reads the hospital record they filed again, because they are a member again');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('UPDATE public.clinician_dictations SET summary = %L WHERE id = %L', 'hand: back again', _dict)),
    'but cannot pick up the dictation that was frozen when they left');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert((SELECT author_departed_at IS NOT NULL FROM public.clinician_dictations WHERE id = _dict),
    'what was frozen stays frozen');

  -- ==========================================================================
  -- 10. With a co-owner, the owner may go
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES (_prac, _owner2, 'provider', 'active');
  PERFORM pg_temp.as_user(_owner);
  PERFORM public.change_practice_member_access(_prac, _owner2, 'owner'::public.practice_role, NULL, 'successor');
  PERFORM pg_temp.assert((public.offboarding_impact(_prac, _owner) ->> 'blocked_reason') IS NULL,
    'with a co-owner, nothing blocks the owner');
  PERFORM public.leave_practice(_prac, 'retiring');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'revoked' AND end_reason = 'left' FROM public.practice_members WHERE practice_id = _prac AND user_id = _owner),
    'the owner has left, and the hospital still has an owner');

  -- ==========================================================================
  -- 11. Moving to a non-clinical role is leaving clinical work
  -- ==========================================================================
  -- Founder decision: a member moved from a clinical role to a non-clinical one
  -- stays a member, but their clinical work is handed over exactly as a
  -- leaver's is. Before 20261010100000 only a departure froze drafts, so a
  -- nurse moved to reception left an unsigned note nobody could finish and
  -- nobody at the hospital was told about.
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES (_mover, 'hand-mover@test.local', now());
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name) VALUES (_mover, 'Max', 'Mover');
  INSERT INTO public.practice_members (practice_id, user_id, role, status, can_view_all_patients)
  VALUES (_prac, _mover, 'nurse', 'active', false);
  INSERT INTO public.practice_patient_assignments (practice_id, patient_user_id, clinician_user_id, assigned_by)
  VALUES (_prac, _pat, _mover, _admin);

  PERFORM pg_temp.as_user(_mover);
  INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment)
  VALUES (_pat, _mover, 'hand: mover draft') RETURNING id INTO _mdraft;
  INSERT INTO public.clinician_dictations (clinician_user_id, patient_user_id, audio_path, transcript, summary, status)
  VALUES (_mover, _pat, _mover || '/move.webm', 'hand: mover transcript', 'hand: mover summary', 'transcribed')
  RETURNING id INTO _mdict;
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _mover, _mover, 'hand: nurse checking in');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounters WHERE patient_user_id = %L', _pat)) >= 1,
    'while clinical, the nurse reads the patient''s notes');

  PERFORM pg_temp.as_user(_admin);
  PERFORM public.change_practice_member_access(_prac, _mover, 'front_desk'::public.practice_role, NULL, 'moved to reception');

  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(
    (SELECT status = 'active' AND role = 'front_desk' FROM public.practice_members WHERE practice_id = _prac AND user_id = _mover),
    'they remain a member, in their new role');
  PERFORM pg_temp.assert(
    (SELECT author_departed_at IS NOT NULL AND signed_at IS NULL AND assessment = 'hand: mover draft'
       FROM public.encounters WHERE id = _mdraft),
    'their unsigned draft is frozen as it was');
  PERFORM pg_temp.assert(
    (SELECT author_departed_at IS NOT NULL FROM public.clinician_dictations WHERE id = _mdict),
    'and their unfiled dictation');
  PERFORM pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.practice_patient_assignments
                 WHERE practice_id = _prac AND clinician_user_id = _mover
                   AND (effective_to IS NULL OR effective_to > now())),
    'their patient assignments have ended');
  SELECT count(*) INTO _n FROM public.clinician_guidance_notifications
   WHERE notification_type = 'departed_author_drafts' AND related_id IN (_mdraft, _mdict);
  PERFORM pg_temp.assert(_n = 6, 'each item is routed to the owner, the admin and the patient''s department lead (got ' || _n || ')');
  SELECT message INTO _txt FROM public.clinician_guidance_notifications
   WHERE clinician_user_id = _lead AND related_id = _mdraft;
  PERFORM pg_temp.assert(_txt ILIKE '%Max Mover moved to a non-clinical role at Handover General%unsigned note%'
                         AND _txt NOT ILIKE '%left Handover General%',
    'the notice says they moved to a non-clinical role, not that they left: ' || COALESCE(_txt, '(none)'));

  PERFORM pg_temp.as_user(_mover);
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.encounters WHERE patient_user_id = %L', _pat)) = 0,
    'in their new role they read none of the patient''s notes, their own included');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.clinician_dictations WHERE id = %L', _mdict)) = 0,
    'nor their dictation');
  PERFORM pg_temp.assert(pg_temp.n(format('SELECT 1 FROM public.messages WHERE patient_user_id = %L', _pat)) = 0,
    'nor the hospital''s threads');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('INSERT INTO public.encounters (patient_user_id, clinician_user_id, assessment) VALUES (%L, %L, %L)',
                               _pat, _mover, 'hand: reception note')),
    'and cannot write a clinical note');
  PERFORM pg_temp.assert(
    NOT pg_temp.changed(format('INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body) VALUES (%L, %L, %L, %L)',
                               _pat, _mover, _mover, 'hand: from reception')),
    'nor message the patient as a clinician');

  PERFORM pg_temp.as_user(_admin);
  SELECT detail INTO _txt FROM public.practice_handover_queue(_prac) WHERE kind = 'draft' AND item_id = _mdraft;
  PERFORM pg_temp.assert(_txt ILIKE '%non-clinical role%',
    'the draft is on the handover list, saying why: ' || COALESCE(_txt, '(not listed)'));

  PERFORM pg_temp.as_user(_pat);
  PERFORM pg_temp.assert(
    (SELECT clinician_status = 'non_clinical' FROM public.my_message_counterparties() WHERE clinician_user_id = _mover),
    'the patient''s list does not say the nurse left');

  RAISE NOTICE 'offboarding_handover: all assertions passed';
END $$;

ROLLBACK;
