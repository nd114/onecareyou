-- One vocabulary, and the shares written before it.
--
-- The risk in converging permission keys is not that the new ones fail — it is
-- that a share somebody agreed to months ago silently stops meaning what it
-- meant. So most of these assertions are about the old spellings.
--
-- The one deliberate narrowing is dose history: institutions used to get it
-- with 'medications', and now need 'adherence'. That direction is safe, and it
-- is asserted here rather than left as a footnote.

BEGIN;

DO $$
DECLARE
  v_ok boolean;
BEGIN
  -- ---------------------------------------------------------------
  -- The old clinician spelling still opens medicines
  -- ---------------------------------------------------------------
  IF NOT public.share_grants('{"meds": true}'::jsonb, 'medications') THEN
    RAISE EXCEPTION 'a live clinician share carrying "meds" stopped opening medications';
  END IF;
  RAISE NOTICE 'a share written with "meds" still opens medications: t';

  IF NOT public.share_grants('{"medications": true}'::jsonb, 'medications') THEN
    RAISE EXCEPTION 'the canonical name does not work';
  END IF;
  RAISE NOTICE 'so does the canonical name: t';

  -- ---------------------------------------------------------------
  -- 'profile' still means both lists
  -- ---------------------------------------------------------------
  IF NOT public.share_grants('{"profile": true}'::jsonb, 'conditions')
     OR NOT public.share_grants('{"profile": true}'::jsonb, 'allergies') THEN
    RAISE EXCEPTION 'a live share carrying "profile" stopped opening the clinical lists';
  END IF;
  RAISE NOTICE 'a share written with "profile" still opens conditions and allergies: t';

  -- ...and the finer grain now works on either pathway.
  IF NOT public.share_grants('{"conditions": true}'::jsonb, 'conditions') THEN
    RAISE EXCEPTION 'the separate conditions grant does not work';
  END IF;
  IF public.share_grants('{"conditions": true}'::jsonb, 'allergies') THEN
    RAISE EXCEPTION 'granting conditions also granted allergies — the whole point was that they separate';
  END IF;
  RAISE NOTICE 'conditions can be granted without allergies: t';

  -- Asking for 'profile' means asking for both, so half of it is not enough.
  IF public.share_grants('{"conditions": true}'::jsonb, 'profile') THEN
    RAISE EXCEPTION '"profile" was granted by conditions alone';
  END IF;
  IF NOT public.share_grants('{"conditions": true, "allergies": true}'::jsonb, 'profile') THEN
    RAISE EXCEPTION 'both lists granted separately did not add up to "profile"';
  END IF;
  RAISE NOTICE '"profile" needs both lists, and both lists make it: t';

  -- ---------------------------------------------------------------
  -- Silence is still not consent
  -- ---------------------------------------------------------------
  IF public.share_grants('{}'::jsonb, 'medications')
     OR public.share_grants('{"vitals": true}'::jsonb, 'documents')
     OR public.share_grants(NULL, 'vitals') THEN
    RAISE EXCEPTION 'a permission nobody granted was honoured';
  END IF;
  -- And a value that is not literally true is not consent either.
  IF public.share_grants('{"vitals": "yes"}'::jsonb, 'vitals')
     OR public.share_grants('{"vitals": 1}'::jsonb, 'vitals')
     OR public.share_grants('{"vitals": false}'::jsonb, 'vitals') THEN
    RAISE EXCEPTION 'something other than true was read as consent';
  END IF;
  RAISE NOTICE 'only an explicit true grants anything: t';

  -- An alias must not leak the other way: 'meds' is an old name for
  -- medications, not a skeleton key.
  IF public.share_grants('{"meds": true}'::jsonb, 'documents')
     OR public.share_grants('{"meds": true}'::jsonb, 'adherence')
     OR public.share_grants('{"profile": true}'::jsonb, 'vitals') THEN
    RAISE EXCEPTION 'an alias opened something it does not name';
  END IF;
  RAISE NOTICE 'an alias opens only what it is an alias for: t';

  -- ---------------------------------------------------------------
  -- Dose history is its own grant, on both sides
  -- ---------------------------------------------------------------
  -- This is the narrowing. Whether somebody takes their medicine is a
  -- judgement about them, not a record of their care, and a share naming
  -- medications should never have carried it.
  IF public.share_grants('{"medications": true}'::jsonb, 'adherence') THEN
    RAISE EXCEPTION 'granting medications still opens the dose history';
  END IF;
  IF NOT public.share_grants('{"adherence": true}'::jsonb, 'adherence') THEN
    RAISE EXCEPTION 'the adherence grant does not work';
  END IF;
  RAISE NOTICE 'dose history needs its own grant, on both pathways: t';

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schedule_entries'
      AND qual LIKE '%institution_has_patient_permission%'
      AND qual LIKE '%adherence%'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'the institution policy on schedule_entries does not ask for adherence';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'schedule_entries'
      AND qual LIKE '%institution_has_patient_permission%'
      AND qual LIKE '%''medications''%'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE EXCEPTION 'the dose history is still reachable with a medications grant';
  END IF;
  RAISE NOTICE 'the institution policy on dose history asks for adherence, not medications: t';

  -- ---------------------------------------------------------------
  -- One vocabulary in the policies
  -- ---------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND coalesce(qual, '') LIKE '%_permission(%''meds''%'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE EXCEPTION 'a policy still asks for the old "meds" key rather than the canonical one';
  END IF;
  RAISE NOTICE 'no policy asks for an old key name any more: t';

  -- Both pathways ask about medications by the same name now.
  SELECT count(DISTINCT substring(qual from '_permission\(user_id, ''([a-z_]+)''')) = 1
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'medications' AND qual LIKE '%_permission(%'
  INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'the two pathways still name the medications permission differently';
  END IF;
  RAISE NOTICE 'both pathways name the medications permission identically: t';

  -- ---------------------------------------------------------------
  -- Two-valued, not three
  -- ---------------------------------------------------------------
  -- jsonb_typeof of a missing key is NULL, so without a COALESCE an ungranted
  -- permission answered NULL. A USING clause treats that as false, which is
  -- why nothing surfaced it — but NOT share_grants(...) would then be NULL
  -- rather than true, and a three-valued permission function is a trap.
  IF public.share_grants('{}'::jsonb, 'vitals') IS NULL
     OR public.share_grants(NULL, 'vitals') IS NULL
     OR public.share_granted_flag('{}'::jsonb, 'vitals') IS NULL THEN
    RAISE EXCEPTION 'an ungranted permission answered NULL rather than false';
  END IF;
  RAISE NOTICE 'an ungranted permission answers false, not null: t';

  RAISE NOTICE 'ALL SHARE VOCABULARY TESTS PASSED';
END $$;

ROLLBACK;
