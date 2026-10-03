-- Scribe minutes are counted, privately, and nothing is limited.
--
-- scribe_usage is a ledger written only by the service role. A user reads
-- their own rows; a practice owner or admin reads counts through
-- scribe_usage_summary, which names no user, patient or content.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/scribe_usage.test.sql

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
  _owner uuid := 'e1000000-0000-4000-8000-0000000005c1';
  _doc   uuid := 'e1000000-0000-4000-8000-0000000005c2';
  _other uuid := 'e1000000-0000-4000-8000-0000000005c3';
  _prac  uuid := 'e2000000-0000-4000-8000-0000000005c1';
  _n integer; _ok boolean; _r record; _cols text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_owner, 'su-owner@test.local'), (_doc, 'su-doc@test.local'), (_other, 'su-other@test.local');
  INSERT INTO public.practices (id, name, created_by) VALUES (_prac, 'Usage Clinic', _owner);
  INSERT INTO public.practice_members (practice_id, user_id, role, status) VALUES
    (_prac, _doc, 'clinician', 'active');  -- the creator is made owner by a trigger

  -- The service role records usage (the test runs as the migration owner,
  -- which is not a client role).
  SELECT * INTO _r FROM public.record_scribe_usage(_doc, _prac, 'encounter', 61, 'req-1');
  PERFORM pg_temp.assert(_r.inserted AND _r.billed_minutes = 2, '61 seconds bills as 2 minutes and is inserted');
  SELECT * INTO _r FROM public.record_scribe_usage(_doc, _prac, 'encounter', 999, 'req-1');
  PERFORM pg_temp.assert(NOT _r.inserted AND _r.billed_minutes = 2, 'a repeated request_id returns the earlier usage');
  SELECT count(*) INTO _n FROM public.scribe_usage WHERE request_id = 'req-1';
  PERFORM pg_temp.assert(_n = 1, 'a repeated request_id records nothing new');
  PERFORM public.record_scribe_usage(_doc, _prac, 'dictation', 60, 'req-2');
  PERFORM public.record_scribe_usage(_doc, _prac, 'dictation', 0, 'req-3');
  SELECT billed_minutes INTO _n FROM public.scribe_usage WHERE request_id = 'req-2';
  PERFORM pg_temp.assert(_n = 1, '60 seconds bills as 1 minute');
  SELECT billed_minutes INTO _n FROM public.scribe_usage WHERE request_id = 'req-3';
  PERFORM pg_temp.assert(_n = 0, '0 seconds bills as 0 minutes');
  PERFORM public.record_scribe_usage(_other, NULL, 'memo', 300, 'req-4');

  -- No patient identifiers or content anywhere in the table.
  SELECT string_agg(column_name, ',') INTO _cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scribe_usage';
  PERFORM pg_temp.assert(_cols !~* 'patient|transcript|encounter_id|content|note', 'the ledger holds no patient id or content columns');

  -- Own rows only
  PERFORM pg_temp.as_user(_doc);
  SELECT count(*) INTO _n FROM public.scribe_usage;
  PERFORM pg_temp.assert(_n = 3, 'a user sees their own usage rows');
  SELECT count(*) INTO _n FROM public.scribe_usage WHERE user_id <> _doc;
  PERFORM pg_temp.assert(_n = 0, 'a user sees nobody else''s rows');
  PERFORM pg_temp.as_user(_other);
  SELECT count(*) INTO _n FROM public.scribe_usage;
  PERFORM pg_temp.assert(_n = 1, 'another user sees only their own single row');
  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.scribe_usage;
  PERFORM pg_temp.assert(_n = 0, 'even a practice owner cannot read member rows directly');

  -- Clients cannot write
  PERFORM pg_temp.as_user(_doc);
  _ok := false;
  BEGIN
    INSERT INTO public.scribe_usage (user_id, kind, audio_seconds, request_id) VALUES (_doc, 'memo', 1, 'forged');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  PERFORM pg_temp.assert(_ok, 'a client cannot insert usage');
  _ok := false;
  BEGIN
    UPDATE public.scribe_usage SET audio_seconds = 0 WHERE user_id = _doc;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  PERFORM pg_temp.assert(_ok, 'a client cannot update usage');
  _ok := false;
  BEGIN
    DELETE FROM public.scribe_usage WHERE user_id = _doc;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  PERFORM pg_temp.assert(_ok, 'a client cannot delete usage');
  _ok := false;
  BEGIN
    PERFORM public.record_scribe_usage(_doc, _prac, 'memo', 1, 'forged-2');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  PERFORM pg_temp.assert(_ok, 'a client cannot call record_scribe_usage');
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.record_scribe_usage(uuid,uuid,text,integer,text)', 'EXECUTE'), 'anon cannot execute record_scribe_usage');
  PERFORM pg_temp.assert(NOT has_function_privilege('anon', 'public.scribe_usage_summary(uuid,date)', 'EXECUTE'), 'anon cannot execute scribe_usage_summary');
  PERFORM pg_temp.assert(NOT has_function_privilege('authenticated', 'public.record_scribe_usage(uuid,uuid,text,integer,text)', 'EXECUTE'), 'authenticated has no execute on record_scribe_usage');

  -- Summary: owner yes, member and stranger no, counts only
  PERFORM pg_temp.as_user(_owner);
  SELECT count(*) INTO _n FROM public.scribe_usage_summary(_prac, current_date);
  PERFORM pg_temp.assert(_n = 2, 'the owner gets one summary row per kind');
  SELECT sessions, billed_minutes INTO _r FROM public.scribe_usage_summary(_prac, current_date) WHERE kind = 'dictation';
  PERFORM pg_temp.assert(_r.sessions = 2 AND _r.billed_minutes = 1, 'summary counts sessions and billed minutes');
  SELECT string_agg(a.attname, ',') INTO _cols
    FROM pg_proc p, unnest(p.proargnames, p.proargmodes) AS a(attname, mode)
   WHERE p.proname = 'scribe_usage_summary' AND a.mode = 't';
  PERFORM pg_temp.assert(_cols !~* 'user|patient|transcript|encounter', 'the summary returns no user or patient identifiers');
  SELECT count(*) INTO _n FROM public.scribe_usage_summary(_prac, (current_date - interval '2 months')::date);
  PERFORM pg_temp.assert(_n = 0, 'a month with no usage summarises to nothing');

  PERFORM pg_temp.as_user(_doc);
  _ok := false;
  BEGIN
    PERFORM * FROM public.scribe_usage_summary(_prac, current_date);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  PERFORM pg_temp.assert(_ok, 'an ordinary member cannot read the practice summary');
  PERFORM pg_temp.as_user(_other);
  _ok := false;
  BEGIN
    PERFORM * FROM public.scribe_usage_summary(_prac, current_date);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  PERFORM pg_temp.assert(_ok, 'a stranger cannot read the practice summary');

  RAISE NOTICE 'scribe_usage: all assertions passed';
END $$;

ROLLBACK;
