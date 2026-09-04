-- Search that survives a typo, and cannot see further than a read.
--
-- The second half is the part that matters. A search function is a very
-- tempting place to put SECURITY DEFINER — it makes the query simple and fast
-- — and it would let any clinician enumerate every patient in the database by
-- guessing names. So these assertions check the security declaration as much
-- as the matching.

BEGIN;

DO $$
DECLARE
  v_owner  uuid := '11111111-1111-1111-1111-111111111111';
  v_secdef text;
  v_name   text;
  v_count  int;
  v_score  real;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner, 'patient@example.com');
  INSERT INTO public.medications (user_id, name, dosage, frequency) VALUES
    (v_owner, 'Amlodipine', '5 mg', 'once_daily'),
    (v_owner, 'Metformin', '500 mg', 'twice_daily'),
    (v_owner, 'Co-codamol', '30/500', 'as_needed'),
    (v_owner, 'Atorvastatin', '20 mg', 'once_daily');

  -- ---------------------------------------------------------------
  -- Search may never see further than a read
  -- ---------------------------------------------------------------
  FOR v_name IN
    SELECT proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND (proname LIKE 'search\_%' OR proname LIKE 'suggest\_%')
  LOOP
    SELECT CASE WHEN prosecdef THEN 'definer' ELSE 'invoker' END INTO v_secdef
    FROM pg_proc WHERE proname = v_name AND pronamespace = 'public'::regnamespace;
    IF v_secdef = 'definer' AND v_name NOT IN ('search_normalise') THEN
      RAISE EXCEPTION
        '%() is SECURITY DEFINER — a search that runs as its owner lets anybody enumerate rows they cannot read',
        v_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'no search function runs as its owner: t';

  -- anon must not be able to search at all.
  -- Postgres grants EXECUTE to PUBLIC by default, so each of these needs an
  -- explicit revoke; the first version of the migration revoked only two.
  IF has_function_privilege('anon', 'public.search_medications(text,int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.search_documents(text,int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.search_patient_records(text,int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.suggest_medication_name(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a signed-out visitor can run a search';
  END IF;
  RAISE NOTICE 'searching requires being signed in: t';

  -- ---------------------------------------------------------------
  -- Normalisation matches the client
  -- ---------------------------------------------------------------
  -- If these diverge, the same query answers differently in the browser and
  -- in the database, which is worse than either behaviour alone.
  IF public.search_normalise('José Álvarez') <> 'jose alvarez' THEN
    RAISE EXCEPTION 'accents are not stripped the way the client strips them';
  END IF;
  IF public.search_normalise('O''Connor') <> 'oconnor' THEN
    RAISE EXCEPTION 'apostrophes are not closed up the way the client closes them';
  END IF;
  IF public.search_normalise('5mg/dose') <> '5mg dose' THEN
    RAISE EXCEPTION 'punctuation is not split the way the client splits it';
  END IF;
  RAISE NOTICE 'normalisation matches src/lib/search.ts: t';

  -- ---------------------------------------------------------------
  -- Finding things
  -- ---------------------------------------------------------------
  SELECT name INTO v_name FROM public.search_medications('amlodipine', 5) LIMIT 1;
  IF v_name IS DISTINCT FROM 'Amlodipine' THEN
    RAISE EXCEPTION 'an exact name did not come first (got %)', v_name;
  END IF;

  SELECT name INTO v_name FROM public.search_medications('amlodipin', 5) LIMIT 1;
  IF v_name IS DISTINCT FROM 'Amlodipine' THEN
    RAISE EXCEPTION 'a one-letter typo found nothing (got %)', v_name;
  END IF;
  RAISE NOTICE 'a typo still finds the medicine: t';

  SELECT name INTO v_name FROM public.search_medications('cocodamol', 5) LIMIT 1;
  IF v_name IS DISTINCT FROM 'Co-codamol' THEN
    RAISE EXCEPTION 'a hyphenated name was not found without its hyphen (got %)', v_name;
  END IF;
  RAISE NOTICE 'a hyphenated name is found without the hyphen: t';

  SELECT name INTO v_name FROM public.search_medications('amlo', 5) LIMIT 1;
  IF v_name IS DISTINCT FROM 'Amlodipine' THEN
    RAISE EXCEPTION 'a prefix did not find the medicine (got %)', v_name;
  END IF;
  RAISE NOTICE 'the start of a name finds it: t';

  -- ---------------------------------------------------------------
  -- Not finding things
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v_count FROM public.search_medications('helicopter', 5);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'an unrelated word matched % medication(s)', v_count;
  END IF;
  RAISE NOTICE 'an unrelated word finds nothing: t';

  -- An empty query returns nothing rather than everything. Returning the whole
  -- table for a blank box is how a search box becomes an export button.
  SELECT count(*) INTO v_count FROM public.search_medications('', 100);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'an empty query returned % rows', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.search_medications('   ', 100);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a whitespace query returned % rows', v_count;
  END IF;
  RAISE NOTICE 'an empty query returns nothing, not everything: t';

  -- ---------------------------------------------------------------
  -- Limits are bounded whatever the caller asks for
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v_count FROM public.search_medications('m', 100000);
  IF v_count > 100 THEN
    RAISE EXCEPTION 'a caller asked for 100000 rows and got %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.search_medications('amlodipine', 0);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a limit of zero returned % rows rather than being floored at one', v_count;
  END IF;
  RAISE NOTICE 'the result limit is bounded at both ends: t';

  -- ---------------------------------------------------------------
  -- Did you mean
  -- ---------------------------------------------------------------
  -- Only when the search found nothing, and only ever a name that exists.
  IF public.suggest_medication_name('amlodipine') IS NOT NULL THEN
    RAISE EXCEPTION 'a correction was offered for a query that worked';
  END IF;

  v_name := public.suggest_medication_name('atorvstn');
  IF v_name IS DISTINCT FROM 'Atorvastatin' THEN
    RAISE EXCEPTION 'a recognisable typo was not corrected (got %)', coalesce(v_name, 'null');
  END IF;

  IF public.suggest_medication_name('xqzptv') IS NOT NULL THEN
    RAISE EXCEPTION 'something was suggested for a query nothing resembles';
  END IF;
  RAISE NOTICE 'a correction is offered only when it helps: t';

  -- ---------------------------------------------------------------
  -- The indexes exist, or none of this is usable at a hospital
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public' AND indexdef LIKE '%gin_trgm_ops%';
  IF v_count < 3 THEN
    RAISE EXCEPTION 'only % trigram index(es) exist — similarity over a whole patient list needs them', v_count;
  END IF;
  RAISE NOTICE 'the trigram indexes are in place: t';

  RAISE NOTICE 'ALL FUZZY SEARCH TESTS PASSED';
END $$;

ROLLBACK;
