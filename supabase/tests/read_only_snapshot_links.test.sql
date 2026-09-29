-- A read-only snapshot link opens what the patient froze into it, to whoever
-- holds the link, until it expires or the patient revokes it — and nothing else.
--
-- The link is the one place in OneCare where somebody with no account reads a
-- patient's record, so every way that could widen is pinned here: another
-- patient creating, listing or revoking it; the anonymous role reading either
-- table directly; the link carrying data added after it was made; a document
-- that was not chosen, or was retracted or archived since, being handed out;
-- an expired or revoked link still answering; a passcode being guessed; and
-- the raw token being kept anywhere the database could leak it.

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

-- The edge function hashes the token it was handed and asks with the hash.
CREATE OR REPLACE FUNCTION pg_temp.h(_token text) RETURNS text
LANGUAGE sql AS $$ SELECT encode(digest(_token, 'sha256'), 'hex') $$;

CREATE OR REPLACE FUNCTION pg_temp.open(_token text, _passcode text DEFAULT NULL, _doc uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  _r := public.open_snapshot_link(pg_temp.h(_token), _passcode, 'Firefox on Linux', _doc);
  EXECUTE 'RESET ROLE';
  RETURN _r;
END;
$$;

DO $$
DECLARE
  _ada    uuid := 'a1000000-0000-4000-8000-00000000051a';
  _bea    uuid := 'b2000000-0000-4000-8000-00000000051b';
  _fam    uuid;
  _doc1   uuid;
  _doc2   uuid;
  _doc3   uuid;
  _bdoc   uuid;
  _link   uuid;
  _token  text;
  _pin    text;
  _plink  uuid;
  _ptoken text;
  _r      jsonb;
  _n      integer;
  _i      integer;
  _txt    text;
  _raised boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (_ada, 'snap-ada@test.local', now()),
    (_bea, 'snap-bea@test.local', now());
  INSERT INTO public.profiles (user_id, name, email, health_conditions, allergies, date_of_birth, phone_number)
  VALUES
    (_ada, 'Ada Obi-Lovelace', 'snap-ada@test.local', '["Asthma"]', '["Penicillin"]', '1980-01-02', '+44 7700 900001'),
    (_bea, 'Bea Other',        'snap-bea@test.local', '[]',         '[]',            NULL,         NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name, health_conditions = EXCLUDED.health_conditions,
        allergies = EXCLUDED.allergies, date_of_birth = EXCLUDED.date_of_birth,
        phone_number = EXCLUDED.phone_number;

  INSERT INTO public.vitals (user_id, type, value, unit, recorded_at)
  VALUES (_ada, 'heart_rate', 71, 'bpm', now() - interval '1 day');
  INSERT INTO public.medications (user_id, name, dosage, frequency, is_active)
  VALUES (_ada, 'Salbutamol', '100mcg', 'as needed', true);
  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_ada, _ada || '/scan.pdf', 'scan.pdf', 'Chest X-ray') RETURNING id INTO _doc1;
  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_ada, _ada || '/letter.pdf', 'letter.pdf', 'Discharge letter') RETURNING id INTO _doc2;
  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_ada, _ada || '/private.pdf', 'private.pdf', 'Not chosen') RETURNING id INTO _doc3;
  INSERT INTO public.health_documents (user_id, file_path, file_name, title)
  VALUES (_bea, _bea || '/bea.pdf', 'bea.pdf', 'Bea''s') RETURNING id INTO _bdoc;

  -- A reading recorded against somebody Ada looks after is not Ada's record.
  INSERT INTO public.family_members (owner_user_id, name)
  VALUES (_ada, 'Ada''s child') RETURNING id INTO _fam;
  INSERT INTO public.vitals (user_id, family_member_id, type, value, unit, recorded_at)
  VALUES (_ada, _fam, 'heart_rate', 140, 'bpm', now() - interval '2 hours');

  -- ==========================================================================
  -- 1. The patient makes a link, and chooses exactly what is in it
  -- ==========================================================================
  PERFORM pg_temp.as_user(_ada);
  SELECT c.link_id, c.token INTO _link, _token
    FROM public.create_snapshot_link(
      ARRAY['vitals', 'medications', 'allergies', 'documents'],
      ARRAY[_doc1, _doc2], 168, false, 'For my sister') c;
  PERFORM pg_temp.assert(_link IS NOT NULL AND length(_token) >= 43,
    'the patient can create a link and gets a token of at least 256 bits back');

  SELECT count(*) INTO _n FROM public.snapshot_links WHERE id = _link AND user_id = _ada
     AND expires_at BETWEEN now() + interval '167 hours' AND now() + interval '169 hours';
  PERFORM pg_temp.assert(_n = 1, 'the owner sees their own link, expiring when they chose');

  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.snapshot_links
   WHERE id = _link AND token_hash = pg_temp.h(_token)
     AND position(_token IN (to_jsonb(snapshot_links.*))::text) = 0;
  PERFORM pg_temp.assert(_n = 1, 'only the token''s SHA-256 is stored, never the token');

  -- Choices that are not the patient's to make, or not in the vocabulary.
  PERFORM pg_temp.as_user(_ada);
  _raised := false;
  BEGIN
    PERFORM public.create_snapshot_link(ARRAY['vitals'], '{}', 721, false, NULL);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a link cannot outlive 30 days');

  _raised := false;
  BEGIN
    PERFORM public.create_snapshot_link(ARRAY['profile'], '{}', 24, false, NULL);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'only the snapshot categories can be chosen (not the whole profile row)');

  _raised := false;
  BEGIN
    PERFORM public.create_snapshot_link(ARRAY['documents'], ARRAY[_bdoc], 24, false, NULL);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'a patient cannot put somebody else''s document in a link');

  _raised := false;
  BEGIN
    PERFORM public.create_snapshot_link(ARRAY['vitals'], ARRAY[_doc1], 24, false, NULL);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'documents are only included when the documents category is');

  -- ==========================================================================
  -- 2. The anonymous role reads nothing directly
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  EXECUTE 'SET LOCAL ROLE anon';
  _raised := false;
  BEGIN PERFORM 1 FROM public.snapshot_links; EXCEPTION WHEN insufficient_privilege THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'anon cannot read snapshot_links');
  _raised := false;
  BEGIN PERFORM 1 FROM public.snapshot_link_views; EXCEPTION WHEN insufficient_privilege THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'anon cannot read snapshot_link_views');
  _raised := false;
  BEGIN PERFORM public.open_snapshot_link(pg_temp.h(_token), NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'anon cannot call the validating function; only the edge function can');
  _raised := false;
  BEGIN PERFORM public.create_snapshot_link(ARRAY['vitals'], '{}', 24, false, NULL);
  EXCEPTION WHEN insufficient_privilege THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'anon cannot create a link');
  EXECUTE 'RESET ROLE';

  -- ==========================================================================
  -- 3. Another patient can neither see nor end it
  -- ==========================================================================
  PERFORM pg_temp.as_user(_bea);
  SELECT count(*) INTO _n FROM public.snapshot_links WHERE id = _link;
  PERFORM pg_temp.assert(_n = 0, 'another patient does not see the link');
  SELECT count(*) INTO _n FROM public.list_my_snapshot_links() l WHERE l.id = _link;
  PERFORM pg_temp.assert(_n = 0, 'nor in their own list');

  _raised := false;
  BEGIN PERFORM public.revoke_snapshot_link(_link); EXCEPTION WHEN OTHERS THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'another patient cannot revoke it');

  _raised := false;
  BEGIN
    UPDATE public.snapshot_links SET revoked_at = now() WHERE id = _link;
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'and cannot write the table directly');

  _raised := false;
  BEGIN PERFORM public.open_snapshot_link(pg_temp.h(_token), NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'a signed-in user cannot call the validating function either');

  -- Even the owner writes only through the functions: an UPDATE that pushed
  -- expires_at out a year, or un-revoked a link, would bypass both rules.
  PERFORM pg_temp.as_user(_ada);
  _raised := false;
  BEGIN
    UPDATE public.snapshot_links SET expires_at = now() + interval '1 year' WHERE id = _link;
  EXCEPTION WHEN insufficient_privilege THEN _raised := true;
  END;
  PERFORM pg_temp.assert(_raised, 'the owner cannot extend a link past what they chose');
  _raised := false;
  BEGIN DELETE FROM public.snapshot_links WHERE id = _link; EXCEPTION WHEN insufficient_privilege THEN _raised := true; END;
  PERFORM pg_temp.assert(_raised, 'nobody deletes a link: it is revoked, and the record of it stays');

  -- ==========================================================================
  -- 4. Opening it returns the snapshot as it was — nothing added since
  -- ==========================================================================
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.vitals (user_id, type, value, unit, recorded_at)
  VALUES (_ada, 'heart_rate', 99, 'bpm', now());
  INSERT INTO public.medications (user_id, name, dosage, frequency, is_active)
  VALUES (_ada, 'Added Later', '1mg', 'daily', true);
  UPDATE public.profiles SET allergies = '["Penicillin","Latex"]' WHERE user_id = _ada;

  _r := pg_temp.open(_token);
  PERFORM pg_temp.assert(_r->>'status' = 'ok', 'the holder of the link can open it');
  PERFORM pg_temp.assert(_r->>'sharer_first_name' = 'Ada', 'it names the sharer by first name only');
  PERFORM pg_temp.assert(jsonb_array_length(_r->'snapshot'->'vitals') = 1
      AND (_r->'snapshot'->'vitals'->0->>'value')::numeric = 71,
    'readings recorded after the link was made do not leak through it');
  PERFORM pg_temp.assert((_r->'snapshot'->'vitals')::text NOT LIKE '%140%',
    'a family member''s readings are not the patient''s snapshot');
  PERFORM pg_temp.assert((_r->'snapshot'->'medications')::text NOT LIKE '%Added Later%'
      AND (_r->'snapshot'->'medications')::text LIKE '%Salbutamol%',
    'nor do medicines added since');
  PERFORM pg_temp.assert((_r->'snapshot'->'allergies')::text NOT LIKE '%Latex%',
    'nor allergies added since');
  PERFORM pg_temp.assert(NOT (_r->'snapshot' ? 'conditions'),
    'a category that was not chosen is not in the snapshot at all');
  PERFORM pg_temp.assert(_r::text NOT LIKE '%1980-01-02%' AND _r::text NOT LIKE '%7700%'
      AND _r::text NOT LIKE '%snap-ada@%' AND _r::text NOT LIKE '%Lovelace%',
    'no date of birth, phone, email or surname rides along');
  PERFORM pg_temp.assert(_r::text NOT LIKE '%file_path%' AND _r::text NOT LIKE '%' || _doc3 || '%',
    'the snapshot lists chosen documents only, and no storage paths');

  SELECT count(*) INTO _n FROM public.snapshot_link_views
   WHERE link_id = _link AND kind = 'snapshot' AND user_agent = 'Firefox on Linux';
  PERFORM pg_temp.assert(_n = 1, 'every view is logged with a coarse user agent');

  -- ==========================================================================
  -- 5. Documents: only the chosen ones, only while live
  -- ==========================================================================
  _r := pg_temp.open(_token, NULL, _doc1);
  PERFORM pg_temp.assert(_r->>'status' = 'ok' AND _r->>'file_path' = _ada || '/scan.pdf',
    'a chosen document resolves to its file for a signed URL');
  _r := pg_temp.open(_token, NULL, _doc3);
  PERFORM pg_temp.assert(_r->>'status' = 'document_unavailable' AND NOT (_r ? 'file_path'),
    'a document of the patient''s that was not chosen does not');
  _r := pg_temp.open(_token, NULL, _bdoc);
  PERFORM pg_temp.assert(_r->>'status' = 'document_unavailable', 'nor anybody else''s');

  UPDATE public.health_documents SET archived_at = now() WHERE id = _doc2;
  _r := pg_temp.open(_token, NULL, _doc2);
  PERFORM pg_temp.assert(_r->>'status' = 'document_unavailable', 'an archived document stops being served');
  UPDATE public.health_documents SET retracted_at = now() WHERE id = _doc1;
  _r := pg_temp.open(_token, NULL, _doc1);
  PERFORM pg_temp.assert(_r->>'status' = 'document_unavailable', 'a retracted document stops being served');
  _r := pg_temp.open(_token);
  PERFORM pg_temp.assert(
    (SELECT bool_and(NOT (d->>'available')::boolean) FROM jsonb_array_elements(_r->'documents') d),
    'and the snapshot says so in its place rather than silently dropping it');

  -- ==========================================================================
  -- 6. The owner's list shows views; revocation and expiry bite immediately
  -- ==========================================================================
  PERFORM pg_temp.as_user(_ada);
  SELECT view_count INTO _n FROM public.list_my_snapshot_links() l WHERE l.id = _link;
  PERFORM pg_temp.assert(_n = 2, 'the owner sees how many times the snapshot was opened');
  SELECT count(*) INTO _n FROM public.snapshot_link_views WHERE link_id = _link;
  PERFORM pg_temp.assert(_n >= 2, 'and can read their own view log');
  PERFORM pg_temp.as_user(_bea);
  SELECT count(*) INTO _n FROM public.snapshot_link_views WHERE link_id = _link;
  PERFORM pg_temp.assert(_n = 0, 'another patient cannot read it');

  PERFORM pg_temp.as_user(_ada);
  PERFORM public.revoke_snapshot_link(_link);
  _r := pg_temp.open(_token);
  PERFORM pg_temp.assert(_r->>'status' = 'revoked' AND NOT (_r ? 'snapshot'),
    'a revoked link returns nothing from the next request on');
  _r := pg_temp.open(_token, NULL, _doc1);
  PERFORM pg_temp.assert(_r->>'status' = 'revoked' AND NOT (_r ? 'file_path'), 'including its documents');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.snapshot_links WHERE id = _link AND revoked_at IS NOT NULL;
  PERFORM pg_temp.assert(_n = 1, 'the revoked link is kept, marked, not deleted');

  PERFORM pg_temp.as_user(_ada);
  SELECT c.link_id, c.token INTO _link, _token
    FROM public.create_snapshot_link(ARRAY['conditions'], '{}', 24, false, NULL) c;
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.snapshot_links
     SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
   WHERE id = _link;
  _r := pg_temp.open(_token);
  PERFORM pg_temp.assert(_r->>'status' = 'expired' AND NOT (_r ? 'snapshot'),
    'an expired link returns nothing');

  _r := pg_temp.open('not-a-real-token');
  PERFORM pg_temp.assert(_r->>'status' = 'not_found' AND NOT (_r ? 'snapshot'),
    'an unknown token finds nothing');

  -- ==========================================================================
  -- 7. The optional passcode
  -- ==========================================================================
  PERFORM pg_temp.as_user(_ada);
  SELECT c.link_id, c.token, c.passcode INTO _plink, _ptoken, _pin
    FROM public.create_snapshot_link(ARRAY['medications'], '{}', 24, true, NULL) c;
  PERFORM pg_temp.assert(_pin ~ '^[0-9]{6}$', 'asking for a passcode returns a six-digit one, once');
  PERFORM pg_temp.as_user(NULL);
  SELECT count(*) INTO _n FROM public.snapshot_links
   WHERE id = _plink AND passcode_hash IS NOT NULL AND passcode_hash <> _pin;
  PERFORM pg_temp.assert(_n = 1, 'the passcode is stored hashed');

  _r := pg_temp.open(_ptoken);
  PERFORM pg_temp.assert(_r->>'status' = 'passcode_required' AND NOT (_r ? 'snapshot')
      AND NOT (_r ? 'sharer_first_name'),
    'without the passcode the link shows nothing, not even whose it is');
  _r := pg_temp.open(_ptoken, CASE WHEN _pin = '000000' THEN '000001' ELSE '000000' END);
  PERFORM pg_temp.assert(_r->>'status' = 'passcode_wrong' AND NOT (_r ? 'snapshot'),
    'a wrong passcode shows nothing');
  _r := pg_temp.open(_ptoken, NULL, _doc1);
  PERFORM pg_temp.assert(_r->>'status' = 'passcode_required' AND NOT (_r ? 'file_path'),
    'the passcode guards the document route too');
  _r := pg_temp.open(_ptoken, _pin);
  PERFORM pg_temp.assert(_r->>'status' = 'ok', 'the right passcode opens it');

  FOR _i IN 1..10 LOOP
    _r := pg_temp.open(_ptoken, CASE WHEN _pin = '000000' THEN '000001' ELSE '000000' END);
  END LOOP;
  _r := pg_temp.open(_ptoken, _pin);
  PERFORM pg_temp.assert(_r->>'status' = 'locked' AND NOT (_r ? 'snapshot'),
    'after ten wrong passcodes the link is locked, even to the right one');
  PERFORM pg_temp.as_user(_ada);
  SELECT locked INTO _raised FROM public.list_my_snapshot_links() l WHERE l.id = _plink;
  PERFORM pg_temp.assert(_raised, 'and the owner is shown that it locked');

  RAISE NOTICE 'read_only_snapshot_links: all assertions passed';
END $$;

ROLLBACK;
