-- The AccessPolicy projection must not understate what a share opens.
--
-- `src/lib/fhir/access-policy.ts` generates a readable answer to "what can
-- this clinician see?" from a share's permissions. It is a projection and
-- never an authority — RLS decides, as it does for everything — but a
-- projection that omits a permission tells a patient they are safer than they
-- are, which is the one direction of error that matters here.
--
-- So this asserts the thing a TypeScript test cannot: the permission keys the
-- live database actually checks. Two places have to be read, not one:
--
--   * policy expressions in pg_policies, and
--   * the bodies of SECURITY DEFINER functions, because 'conditions' and
--     'allergies' are checked inside `get_patient_clinical_profile` and appear
--     in no policy at all. Reading only pg_policies finds six of the eight keys
--     and looks complete, which is how this test was wrong the first time.
--
-- Needs a fully-migrated database. Against a partial one the sets below will
-- legitimately differ, so a failure here means "check your migrations" before
-- it means "the projection is wrong".

BEGIN;

DO $$
DECLARE
  v_found     text[];
  v_expected  text[] := ARRAY[
    -- clinician pathway
    'adherence', 'documents', 'meds', 'profile', 'vitals',
    -- institution pathway
    'allergies', 'conditions', 'medications'
  ];
  v_extra     text[];
  v_missing   text[];
  v_tables    text;
BEGIN
  -- Every permission key any policy expression or function body passes to the
  -- permission helpers, from both pathways.
  SELECT array_agg(DISTINCT flag ORDER BY flag) INTO v_found
  FROM (
    SELECT m[1] AS flag
    FROM pg_policies,
         LATERAL regexp_matches(
           coalesce(qual, '') || ' ' || coalesce(with_check, ''),
           '_has_(?:patient|clinical)_permission\([^,]+,\s*''([a-z_]+)''',
           'g'
         ) m
    WHERE schemaname = 'public'

    UNION ALL

    SELECT m[1]
    FROM pg_proc p,
         LATERAL regexp_matches(
           p.prosrc,
           '_has_(?:patient|clinical)_permission\([^,]+,\s*''([a-z_]+)''',
           'g'
         ) m
    WHERE p.pronamespace = 'public'::regnamespace
      -- The helpers themselves take the key as a parameter; only their callers
      -- name a literal.
      AND p.proname NOT LIKE '%\_has\_%\_permission'
  ) f;

  IF v_found IS NULL THEN
    RAISE EXCEPTION
      'nothing checks a share permission at all — either the helpers were renamed or consent stopped being enforced';
  END IF;

  SELECT array_agg(f ORDER BY f) INTO v_extra
  FROM unnest(v_found) f WHERE f <> ALL (v_expected);

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'a share permission % is enforced but not described by the AccessPolicy projection — a patient reading it would be told they share less than they do',
      v_extra;
  END IF;
  RAISE NOTICE 'every permission the database enforces is described by the projection: t';

  SELECT array_agg(k ORDER BY k) INTO v_missing
  FROM unnest(v_expected) k WHERE k <> ALL (v_found);

  IF v_missing IS NOT NULL THEN
    -- Not a security problem, but a lie in the other direction: the projection
    -- would claim a share opens something nothing opens.
    RAISE EXCEPTION
      'the projection describes permission(s) % that nothing enforces', v_missing;
  END IF;
  RAISE NOTICE 'every permission the projection describes is one the database enforces: t';

  -- ---------------------------------------------------------------
  -- The two vocabularies are real, and the projection depends on it
  -- ---------------------------------------------------------------
  IF NOT ('meds' = ANY (v_found) AND 'medications' = ANY (v_found)) THEN
    RAISE EXCEPTION
      'the two share pathways no longer use different keys for medicines — the projection''s pathway split can be simplified';
  END IF;
  RAISE NOTICE 'medicines are still gated by two different keys, one per pathway: t';

  -- ---------------------------------------------------------------
  -- The tables each key opens, pinned so the descriptions stay true
  -- ---------------------------------------------------------------
  SELECT string_agg(DISTINCT tablename, ',' ORDER BY tablename) INTO v_tables
  FROM pg_policies
  WHERE schemaname = 'public' AND qual LIKE '%_permission(%''documents''%';
  IF v_tables IS DISTINCT FROM 'health_documents,qhin_record_provenance' THEN
    RAISE EXCEPTION
      '''documents'' now opens % — the projection describes the Vault and record provenance only',
      v_tables;
  END IF;
  RAISE NOTICE '''documents'' opens the Vault and record provenance, as described: t';

  SELECT string_agg(DISTINCT tablename, ',' ORDER BY tablename) INTO v_tables
  FROM pg_policies
  WHERE schemaname = 'public' AND qual LIKE '%_permission(%''adherence''%';
  IF v_tables IS DISTINCT FROM 'schedule_entries' THEN
    RAISE EXCEPTION '''adherence'' now opens %, not schedule_entries alone', v_tables;
  END IF;
  RAISE NOTICE '''adherence'' opens the dose history alone, as described: t';

  -- ---------------------------------------------------------------
  -- Silence is not consent, in the database as well as in the mapper
  -- ---------------------------------------------------------------
  -- `(permissions->>key)::boolean = true` yields NULL for a missing key, and
  -- NULL is not true, so an absent permission grants nothing. The projection's
  -- `=== true` rule is the same rule; this pins the database half of it.
  IF ('{"vitals": true}'::jsonb ->> 'documents') IS NOT NULL THEN
    RAISE EXCEPTION 'a missing permission key did not read as absent';
  END IF;
  IF coalesce(('{"vitals": true}'::jsonb ->> 'documents')::boolean, false) THEN
    RAISE EXCEPTION 'a share with no documents key granted the Vault';
  END IF;
  RAISE NOTICE 'a permission nobody granted reads as not granted: t';

  RAISE NOTICE 'ALL ACCESS POLICY PROJECTION TESTS PASSED';
END $$;

ROLLBACK;
