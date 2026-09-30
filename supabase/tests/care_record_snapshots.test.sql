-- An ended relationship closes with a record neither party can take back.
--
-- The promise (sharing-access-consent-model §3, §4): a care record snapshot is
-- generated at disconnection and quarterly, filed in the patient's Vault,
-- watermarked, and undeletable by either party. Before this, the only producer
-- was the patient's own browser, on one of the four ways a relationship ends,
-- writing a row the patient could delete, edit, or forge from scratch.
--
-- What is checked here, in order:
--   1. every way a relationship ends queues exactly one snapshot job;
--   2. expiry does, from the hourly sweep, and says so in the ledger;
--   3. the quarterly sweep picks live relationships with something new, only;
--   4. only the patient may ask for one by hand;
--   5. the compiled record carries both sides, guidance, documents and the
--      ledger for that relationship and nothing from another;
--   6. once filed, nobody edits or deletes it — patient, clinician or server;
--      the patient reads it; nobody else does;
--   7. nobody can forge one, and the neighbouring clinician-document route
--      (unmark the sender, then delete) is closed too.

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
  _pat    uuid := 'c7000000-0000-4000-8000-000000000001';
  _clin   uuid := 'c7000000-0000-4000-8000-000000000002';  -- private share, ended by the patient
  _vault  uuid := 'c7000000-0000-4000-8000-000000000003';  -- whole-vault clinician
  _hadmin uuid := 'c7000000-0000-4000-8000-000000000004';  -- hospital owner
  _hdoc   uuid := 'c7000000-0000-4000-8000-000000000005';  -- hospital clinician
  _eve    uuid := 'c7000000-0000-4000-8000-000000000006';  -- private share, closed by a platform admin
  _admin  uuid := 'c7000000-0000-4000-8000-000000000007';  -- platform admin
  _expd   uuid := 'c7000000-0000-4000-8000-000000000008';  -- share that expires
  _q1     uuid := 'c7000000-0000-4000-8000-000000000009';  -- live, active this quarter
  _q2     uuid := 'c7000000-0000-4000-8000-00000000000a';  -- live, nothing new
  _q3     uuid := 'c7000000-0000-4000-8000-00000000000b';  -- live, already snapshotted
  _stranger uuid := 'c7000000-0000-4000-8000-00000000000c';
  _hosp   uuid := 'c7000000-0000-4000-8000-0000000000b1';

  _s_clin uuid; _s_vault uuid; _s_eve uuid; _s_exp uuid; _s_q1 uuid; _s_q2 uuid; _s_q3 uuid;
  _s_unclaimed uuid; _s_hosp uuid;
  _doc_sent uuid; _doc_withdrawn uuid; _doc_own uuid; _snap uuid;
  _job uuid; _job2 uuid; _hjob uuid;
  _compiled jsonb; _html text; _path text; _hpath text;
  _asof timestamptz;
  _n integer; _txt text; _raised boolean; _r jsonb;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_pat,      'crs-pat@test.local',      now()),
    (_clin,     'crs-clin@test.local',     now()),
    (_vault,    'crs-vault@test.local',    now()),
    (_hadmin,   'crs-hadmin@test.local',   now()),
    (_hdoc,     'crs-hdoc@test.local',     now()),
    (_eve,      'crs-eve@test.local',      now()),
    (_admin,    'crs-admin@test.local',    now()),
    (_expd,     'crs-expd@test.local',     now()),
    (_q1,       'crs-q1@test.local',       now()),
    (_q2,       'crs-q2@test.local',       now()),
    (_q3,       'crs-q3@test.local',       now()),
    (_stranger, 'crs-stranger@test.local', now());
  INSERT INTO public.profiles (user_id, name, email) VALUES
    (_pat, 'Ada Patient', 'crs-pat@test.local'),
    (_clin, 'Chidi Okafor', 'crs-clin@test.local'),
    (_hdoc, 'Dayo Hospital', 'crs-hdoc@test.local')
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
  INSERT INTO public.clinician_profiles (user_id, first_name, last_name, title) VALUES
    (_clin, 'Chidi', 'Okafor', 'Dr'), (_vault, 'Vera', 'Vault', 'Dr'), (_hdoc, 'Dayo', 'Hospital', 'Dr'),
    (_eve, 'Eve', 'Closed', 'Dr'), (_expd, 'Ex', 'Pired', 'Dr'),
    (_q1, 'Quinn', 'One', 'Dr'), (_q2, 'Quinn', 'Two', 'Dr'), (_q3, 'Quinn', 'Three', 'Dr')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin');

  -- Private shares, each claimed by its clinician.
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id, permissions)
  VALUES (_pat, 'Dr Okafor', 'crs-clin@test.local', 'crs-inv-clin', _clin, '{"vitals": true}')
  RETURNING id INTO _s_clin;
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id, permissions)
  VALUES (_pat, 'Dr Vault', 'crs-vault@test.local', 'crs-inv-vault', _vault, '{"documents": true}')
  RETURNING id INTO _s_vault;
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
  VALUES (_pat, 'Dr Eve', 'crs-eve@test.local', 'crs-inv-eve', _eve) RETURNING id INTO _s_eve;
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id, expires_at)
  VALUES (_pat, 'Dr Expires', 'crs-expd@test.local', 'crs-inv-exp', _expd, now() - interval '1 hour')
  RETURNING id INTO _s_exp;
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
  VALUES (_pat, 'Dr Q1', 'crs-q1@test.local', 'crs-inv-q1', _q1) RETURNING id INTO _s_q1;
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
  VALUES (_pat, 'Dr Q2', 'crs-q2@test.local', 'crs-inv-q2', _q2) RETURNING id INTO _s_q2;
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code, clinician_user_id)
  VALUES (_pat, 'Dr Q3', 'crs-q3@test.local', 'crs-inv-q3', _q3) RETURNING id INTO _s_q3;
  -- Addressed to an email nobody has an account under: nobody on the other side.
  INSERT INTO public.provider_shares (user_id, provider_name, provider_email, invite_code)
  VALUES (_pat, 'Dr Nobody', 'crs-nobody@test.local', 'crs-inv-nobody') RETURNING id INTO _s_unclaimed;

  -- A hospital, its clinician, and the patient's share with it.
  INSERT INTO public.practices (id, name, created_by) VALUES (_hosp, 'St Snapshot Hospital', _hadmin);
  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (_hosp, _hdoc, 'clinician', 'active');
  INSERT INTO public.practice_shares (practice_id, user_id, is_active, share_all, permissions)
  VALUES (_hosp, _pat, true, true, '{}') RETURNING id INTO _s_hosp;

  -- What happened in the private relationship with Dr Okafor.
  INSERT INTO public.share_events (share_id, patient_user_id, clinician_user_id, provider_label, event_type, actor_user_id, actor_role)
  VALUES (_s_clin, _pat, _clin, 'Dr Okafor', 'connected', _pat, 'patient');
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
  VALUES (_pat, _clin, _pat, 'Is <b>this</b> dose right?', now() - interval '3 days'),
         (_pat, _clin, _clin, 'Yes — take it with food.', now() - interval '2 days');
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, share_id, title, instruction)
  VALUES (_clin, _pat, _s_clin, 'Take with food', 'Every morning, after breakfast.');
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, title, category, source_context)
  VALUES (_pat, _clin, _pat || '/crs-letter.pdf', 'letter.pdf', 'Discharge letter', 'other', 'clinician_upload')
  RETURNING id INTO _doc_sent;
  INSERT INTO public.health_documents (user_id, uploaded_by_user_id, file_path, file_name, title, category, source_context,
                                       retracted_at, retracted_by, retraction_reason)
  VALUES (_pat, _clin, _pat || '/crs-wrong.pdf', 'wrong.pdf', 'Wrong patient scan', 'imaging', 'clinician_upload',
          now(), _clin, 'Sent to the wrong patient')
  RETURNING id INTO _doc_withdrawn;
  INSERT INTO public.health_documents (user_id, file_path, file_name, title, category)
  VALUES (_pat, _pat || '/crs-mine.pdf', 'mine.pdf', 'My own scan', 'imaging') RETURNING id INTO _doc_own;

  -- And in the hospital relationship.
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, practice_id)
  VALUES (_pat, _hdoc, _hdoc, 'Hospital-only note about your visit', _hosp);
  INSERT INTO public.clinician_guidance (clinician_user_id, patient_user_id, title, instruction)
  VALUES (_hdoc, _pat, 'Ward follow-up', 'Come back in two weeks.');

  -- Q1 has something new this quarter; Q2 has nothing; Q3 has a message
  -- already covered by a snapshot the patient asked for.
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body)
  VALUES (_pat, _q1, _q1, 'Quarter one check-in');
  INSERT INTO public.messages (patient_user_id, clinician_user_id, sender_user_id, body, created_at)
  VALUES (_pat, _q3, _q3, 'Already on file', now() - interval '1 day');

  -- ==========================================================================
  -- 1. Every way a relationship ends queues exactly one snapshot
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  UPDATE public.provider_shares
     SET is_active = false, revoked_at = now(), revoked_by = _pat, revoke_reason = 'moving away'
   WHERE id = _s_clin;
  -- A later edit to the ended share is not a second ending.
  UPDATE public.provider_shares SET revoke_reason = 'moved away' WHERE id = _s_clin;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_clin AND trigger_kind = 'disconnected'
     AND patient_user_id = _pat AND clinician_user_id = _clin AND relationship_kind = 'private_share';
  PERFORM pg_temp.assert(_n = 1, 'the patient ending a private share queues one snapshot');

  PERFORM pg_temp.as_user(_admin);
  PERFORM public.admin_revoke_patient_share('clinician', _s_eve, 'compromised account');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_eve AND trigger_kind = 'disconnected';
  PERFORM pg_temp.assert(_n = 1, 'a share closed from the platform side queues one snapshot');

  PERFORM pg_temp.as_user(_hadmin);
  UPDATE public.practice_shares SET is_active = false, revoked_at = now(), revoke_reason = 'discharged'
   WHERE id = _s_hosp;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_hosp AND trigger_kind = 'disconnected'
     AND relationship_kind = 'hospital_share' AND practice_id = _hosp;
  PERFORM pg_temp.assert(_n = 1, 'the hospital ending its share queues one snapshot');
  SELECT id INTO _hjob FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_hosp AND trigger_kind = 'disconnected';

  -- Reconnect, and this time the patient ends it: a second ending, a second record.
  PERFORM pg_temp.as_user(_pat);
  UPDATE public.practice_shares SET is_active = true, revoked_at = NULL, revoked_by = NULL WHERE id = _s_hosp;
  UPDATE public.practice_shares SET is_active = false, revoked_at = now() + interval '1 second', revoked_by = _pat
   WHERE id = _s_hosp;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_hosp AND trigger_kind = 'disconnected';
  PERFORM pg_temp.assert(_n = 2, 'the patient ending a hospital share after reconnecting queues its own snapshot');

  -- Nobody on the other side, nothing to record between two parties.
  PERFORM pg_temp.as_user(_pat);
  UPDATE public.provider_shares SET is_active = false, revoked_at = now() WHERE id = _s_unclaimed;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs WHERE relationship_id = _s_unclaimed;
  PERFORM pg_temp.assert(_n = 0, 'an invitation nobody ever held produces no care record');

  -- ==========================================================================
  -- 2. Expiry is an ending too, found by the sweep
  -- ==========================================================================
  PERFORM public.enqueue_due_care_record_snapshots(now());
  PERFORM public.enqueue_due_care_record_snapshots(now());
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_exp AND trigger_kind = 'expired';
  PERFORM pg_temp.assert(_n = 1, 'an expired share queues one snapshot, however often the sweep runs');
  SELECT count(*) INTO _n FROM public.share_events WHERE share_id = _s_exp AND event_type = 'expired';
  PERFORM pg_temp.assert(_n = 1, 'and the expiry is written into the relationship ledger once');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id IN (_s_clin, _s_eve, _s_hosp) AND trigger_kind = 'disconnected';
  PERFORM pg_temp.assert(_n = 4, 'the sweep does not re-queue endings the trigger already queued');

  -- ==========================================================================
  -- 3. Only the patient asks for one by hand
  -- ==========================================================================
  PERFORM pg_temp.as_user(_q3);
  _raised := false;
  BEGIN PERFORM public.request_care_record_snapshot(_s_q3);
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'the clinician cannot file a record into the patient''s Vault');

  PERFORM pg_temp.as_user(_stranger);
  _raised := false;
  BEGIN PERFORM public.request_care_record_snapshot(_s_q3);
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'nor can a stranger');

  PERFORM pg_temp.as_user(_pat);
  _job := public.request_care_record_snapshot(_s_q3);
  _job2 := public.request_care_record_snapshot(_s_q3);
  PERFORM pg_temp.assert(_job IS NOT NULL AND _job = _job2, 'the patient can; a second tap returns the same job');
  _raised := false;
  BEGIN PERFORM public.request_care_record_snapshot(_s_unclaimed);
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'asking for a record with nobody on the other side says so');
  PERFORM pg_temp.as_user(NULL);

  -- ==========================================================================
  -- 4. Quarterly: live relationships with something new, only
  -- ==========================================================================
  _asof := date_trunc('quarter', now() + interval '3 months') + interval '1 day';
  PERFORM public.enqueue_due_care_record_snapshots(_asof);
  PERFORM public.enqueue_due_care_record_snapshots(_asof + interval '1 hour');

  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs WHERE relationship_id = _s_q1 AND trigger_kind = 'quarterly';
  PERFORM pg_temp.assert(_n = 1, 'a live relationship with new activity gets one quarterly snapshot');
  SELECT trigger_key INTO _txt FROM public.care_record_snapshot_jobs WHERE relationship_id = _s_q1 AND trigger_kind = 'quarterly';
  PERFORM pg_temp.assert(_txt = to_char(now(), 'YYYY-"Q"Q'), 'labelled with the quarter it closes');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs WHERE relationship_id = _s_q2 AND trigger_kind = 'quarterly';
  PERFORM pg_temp.assert(_n = 0, 'a live relationship with nothing new gets none');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs WHERE relationship_id = _s_q3 AND trigger_kind = 'quarterly';
  PERFORM pg_temp.assert(_n = 0, 'nor one whose activity an earlier snapshot already covers');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE relationship_id IN (_s_clin, _s_exp, _s_hosp) AND trigger_kind = 'quarterly';
  PERFORM pg_temp.assert(_n = 0, 'ended and expired relationships are not live, and get none');

  -- Outside the first week of a quarter the sweep does not go looking.
  UPDATE public.care_record_snapshot_jobs SET trigger_key = 'moved-aside' WHERE relationship_id = _s_q1 AND trigger_kind = 'quarterly';
  PERFORM public.enqueue_due_care_record_snapshots(_asof + interval '20 days');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs WHERE relationship_id = _s_q1 AND trigger_kind = 'quarterly';
  PERFORM pg_temp.assert(_n = 1, 'the quarterly pass runs in the first week of a quarter only');

  -- ==========================================================================
  -- 5. The record: both sides, guidance, documents, ledger — this relationship only
  -- ==========================================================================
  SELECT id INTO _job FROM public.care_record_snapshot_jobs
   WHERE relationship_id = _s_clin AND trigger_kind = 'disconnected';
  SELECT count(*) INTO _n FROM public.claim_care_record_snapshot_jobs(5, _job, NULL);
  PERFORM pg_temp.assert(_n = 1, 'the worker claims the job it was asked for');
  SELECT count(*) INTO _n FROM public.claim_care_record_snapshot_jobs(5, _job, NULL);
  PERFORM pg_temp.assert(_n = 0, 'and a second worker does not claim it again');

  _compiled := public.compile_care_record_snapshot(_job);
  _html := _compiled ->> 'html';
  PERFORM pg_temp.assert(_html LIKE '%Is &lt;b&gt;this&lt;/b&gt; dose right?%', 'the patient''s message is there, escaped');
  PERFORM pg_temp.assert(_html LIKE '%Yes — take it with food.%', 'the clinician''s reply is there');
  PERFORM pg_temp.assert(_html LIKE '%Take with food%' AND _html LIKE '%Every morning, after breakfast.%', 'the guidance is there');
  PERFORM pg_temp.assert(_html LIKE '%Discharge letter%', 'the document the clinician sent is listed');
  PERFORM pg_temp.assert(_html NOT LIKE '%Wrong patient scan%' AND _html LIKE '%withdrawn by the sender%',
    'a withdrawn document is marked, without its title');
  PERFORM pg_temp.assert(_html LIKE '%moved away%' AND _html LIKE '%<td>Connected</td><td>patient</td>%',
    'the relationship ledger is there, with how it ended');
  PERFORM pg_temp.assert(_html NOT LIKE '%Hospital-only note%' AND _html NOT LIKE '%Ward follow-up%',
    'nothing from the hospital relationship leaks into the private record');
  PERFORM pg_temp.assert(_html LIKE '%OneCare care record%' AND _html LIKE '%' || _job::text || '%',
    'the record is watermarked with its reference');
  PERFORM pg_temp.assert(_compiled ->> 'sha256' = encode(sha256(convert_to(_html, 'UTF8')), 'hex'),
    'the digest is of exactly the bytes the worker uploads');

  _path := _pat::text || '/care-records/' || gen_random_uuid()::text || '.html';
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('health-documents', _path, NULL);
  _snap := public.file_care_record_snapshot(_job, _path, octet_length(_html), _compiled);
  PERFORM pg_temp.assert(_snap = public.file_care_record_snapshot(_job, _path, octet_length(_html), _compiled),
    'filing twice returns the same record');
  SELECT count(*) INTO _n FROM public.health_documents
   WHERE id = _snap AND user_id = _pat AND source_context = 'care_record_snapshot'
     AND category = 'care_record' AND uploaded_by_user_id IS NULL AND file_path = _path;
  PERFORM pg_temp.assert(_n = 1, 'it is filed in the patient''s Vault as a care record');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs
   WHERE id = _job AND status = 'filed' AND document_id = _snap AND content_sha256 = _compiled ->> 'sha256';
  PERFORM pg_temp.assert(_n = 1, 'and the job records what it filed and its digest');

  -- The hospital record carries the hospital's thread and not the private one.
  PERFORM public.claim_care_record_snapshot_jobs(5, _hjob, NULL);
  _html := public.compile_care_record_snapshot(_hjob) ->> 'html';
  PERFORM pg_temp.assert(_html LIKE '%Hospital-only note about your visit%' AND _html LIKE '%Ward follow-up%'
    AND _html LIKE '%St Snapshot Hospital%', 'the hospital record carries the hospital thread and its guidance');
  PERFORM pg_temp.assert(_html NOT LIKE '%dose right%', 'and none of the private thread');
  PERFORM public.fail_care_record_snapshot_job(_hjob, 'upload failed');
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs WHERE id = _hjob AND status = 'pending' AND last_error = 'upload failed';
  PERFORM pg_temp.assert(_n = 1, 'a failed attempt goes back on the queue');

  -- ==========================================================================
  -- 6. Filed means permanent. The patient reads it; nobody else does.
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _snap;
  PERFORM pg_temp.assert(_n = 1, 'the patient can read their care record');
  SELECT count(*) INTO _n FROM storage.objects WHERE name = _path;
  PERFORM pg_temp.assert(_n = 1, 'and its file');

  _raised := false;
  BEGIN DELETE FROM public.health_documents WHERE id = _snap;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'the patient deleting it is refused out loud');
  _raised := false;
  BEGIN UPDATE public.health_documents SET title = 'Nothing happened', notes = NULL WHERE id = _snap;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'as is editing it');
  _raised := false;
  BEGIN UPDATE public.health_documents SET source_context = 'direct' WHERE id = _snap;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'and relabelling it to make it deletable');
  DELETE FROM storage.objects WHERE name = _path;
  UPDATE storage.objects SET metadata = '{"replaced": true}' WHERE name = _path;
  -- Filing it away is the patient's own organising, and stays theirs.
  UPDATE public.health_documents SET folder = 'Records' WHERE id = _snap;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents
   WHERE id = _snap AND title LIKE 'Care record%' AND source_context = 'care_record_snapshot' AND folder = 'Records';
  PERFORM pg_temp.assert(_n = 1, 'the patient cannot delete or edit it (and can still file it in a folder)');
  SELECT count(*) INTO _n FROM storage.objects WHERE name = _path AND NOT (metadata ? 'replaced');
  PERFORM pg_temp.assert(_n = 1, 'nor delete or overwrite its file');

  PERFORM pg_temp.as_user(_clin);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _snap;
  PERFORM pg_temp.assert(_n = 0, 'the clinician it is about cannot read the patient''s copy');
  BEGIN DELETE FROM public.health_documents WHERE id = _snap; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.health_documents SET title = 'x' WHERE id = _snap; EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _snap AND title LIKE 'Care record%';
  PERFORM pg_temp.assert(_n = 1, 'nor delete or edit it');

  -- Whole-vault access reaches the patient's other documents, not this.
  PERFORM pg_temp.as_user(_vault);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _doc_own;
  PERFORM pg_temp.assert(_n = 1, 'a whole-vault clinician still sees ordinary documents (the probe works)');
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _snap;
  PERFORM pg_temp.assert(_n = 0, 'but not a care record about somebody else''s relationship');
  PERFORM pg_temp.as_user(_stranger);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _snap;
  PERFORM pg_temp.assert(_n = 0, 'a stranger cannot read it');
  SELECT count(*) INTO _n FROM storage.objects WHERE name = _path;
  PERFORM pg_temp.assert(_n = 0, 'or its file');
  PERFORM pg_temp.as_user(NULL);

  -- The server is not an exception: a bug or a cleanup script is how most
  -- records go missing.
  _raised := false;
  BEGIN DELETE FROM public.health_documents WHERE id = _snap;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'the server cannot delete a care record either');
  EXECUTE 'SET LOCAL ROLE service_role';
  _raised := false;
  BEGIN DELETE FROM public.health_documents WHERE id = _snap;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert(_raised, 'nor can the service role');
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _snap;
  PERFORM pg_temp.assert(_n = 1, 'the record is still there');

  -- ==========================================================================
  -- 7. Nobody forges one; the queue is not a client's to write
  -- ==========================================================================
  PERFORM pg_temp.as_user(_pat);
  _raised := false;
  BEGIN
    INSERT INTO public.health_documents (user_id, file_path, file_name, title, category, source_context)
    VALUES (_pat, _pat || '/fake.html', 'fake.html', 'Care record — Dr Okafor', 'care_record', 'care_record_snapshot');
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'a patient cannot upload something that claims to be a care record');
  _raised := false;
  BEGIN
    INSERT INTO public.health_documents (user_id, file_path, file_name, title, category)
    VALUES (_pat, _pat || '/fake2.html', 'fake2.html', 'Care record', 'care_record');
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'nor file an upload under the care-record category');
  _raised := false;
  BEGIN UPDATE public.health_documents SET source_context = 'care_record_snapshot' WHERE id = _doc_own;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%care record%'; END;
  PERFORM pg_temp.assert(_raised, 'nor relabel their own upload as one');

  -- The neighbouring hole: a clinician's document could be deleted by first
  -- blanking who sent it.
  _raised := false;
  BEGIN UPDATE public.health_documents SET uploaded_by_user_id = NULL, source_context = 'direct' WHERE id = _doc_sent;
  EXCEPTION WHEN OTHERS THEN _raised := SQLERRM ILIKE '%who filed%'; END;
  PERFORM pg_temp.assert(_raised, 'a patient cannot blank the sender of a clinician''s document');
  DELETE FROM public.health_documents WHERE id = _doc_sent;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _doc_sent AND uploaded_by_user_id = _clin;
  PERFORM pg_temp.assert(_n = 1, 'so the clinician''s document stays');

  -- The patient's own upload is still theirs to edit and remove.
  PERFORM pg_temp.as_user(_pat);
  UPDATE public.health_documents SET title = 'My scan, renamed', category = 'lab_result' WHERE id = _doc_own;
  DELETE FROM public.health_documents WHERE id = _doc_own;
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.health_documents WHERE id = _doc_own;
  PERFORM pg_temp.assert(_n = 0, 'the patient''s own upload is still theirs to edit and remove');

  -- Jobs: the patient sees theirs; nobody writes them from a client.
  PERFORM pg_temp.as_user(_pat);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs;
  PERFORM pg_temp.assert(_n > 0, 'the patient can see their own snapshot jobs');
  _raised := false;
  BEGIN
    INSERT INTO public.care_record_snapshot_jobs (patient_user_id, relationship_kind, relationship_id, trigger_kind, trigger_key)
    VALUES (_pat, 'private_share', _s_q2, 'requested', 'mine');
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'but cannot write one directly');
  _raised := false;
  BEGIN PERFORM public.compile_care_record_snapshot(_job);
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'nor run the compiler, which reads as the server');
  _raised := false;
  BEGIN PERFORM public.file_care_record_snapshot(_hjob, _pat || '/x.html', 1, _compiled);
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'nor file one');
  _raised := false;
  BEGIN PERFORM public.enqueue_due_care_record_snapshots(now());
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'nor run the sweep');
  _raised := false;
  BEGIN PERFORM * FROM public.claim_care_record_snapshot_jobs(5, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'nor claim jobs');

  PERFORM pg_temp.as_user(_clin);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs;
  PERFORM pg_temp.assert(_n = 0, 'a clinician sees none of the patient''s jobs');
  PERFORM pg_temp.as_user(_stranger);
  SELECT count(*) INTO _n FROM public.care_record_snapshot_jobs;
  PERFORM pg_temp.assert(_n = 0, 'nor does a stranger');
  PERFORM pg_temp.as_user(NULL);

  RAISE NOTICE 'care_record_snapshots: all assertions passed';
END $$;

ROLLBACK;
