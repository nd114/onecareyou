-- A pending record must not open to an address nobody has proved.
--
-- The policy this replaces granted SELECT on the whole row — allergies,
-- conditions, medications, the clinician's notes — to any signed-in user whose
-- auth email matched, with no check that the address had been confirmed. If
-- Supabase's confirmation setting is off, signing up as somebody else's
-- address was enough to read their record.
--
-- Note for anyone replaying this locally: real auth.users carries
-- email_confirmed_at; the test shim is minimal and needs it added first.

BEGIN;

DO $$
DECLARE
  v_clinician  uuid := '22222222-2222-2222-2222-222222222222';
  v_owner      uuid := '11111111-1111-1111-1111-111111111111';
  v_impostor   uuid := '33333333-3333-3333-3333-333333333333';
  v_record     uuid := gen_random_uuid();
  v_count      int;
  v_cols       int;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_clinician, 'jane.evans@example.com', now()),
    -- The real owner, address confirmed.
    (v_owner,     'patient@example.com',    now()),
    -- Same address, never confirmed. Before the fix this user read everything.
    (v_impostor,  'patient@example.com',    NULL);

  INSERT INTO public.clinician_patient_records
    (id, clinician_user_id, patient_name, patient_email, patient_phone,
     health_conditions, allergies, notes, linked_user_id)
  VALUES
    (v_record, v_clinician, 'Amara Okafor', 'patient@example.com', '+234 801 234 5678',
     '["Type 2 diabetes"]'::jsonb, '["Penicillin"]'::jsonb,
     'Discussed insulin titration.', NULL);

  -- ---------------------------------------------------------------
  -- Unconfirmed: nothing
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_impostor::text, true);

  SELECT count(*) INTO v_count FROM public.clinician_patient_records WHERE id = v_record;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'an unconfirmed address read a pending record';
  END IF;
  RAISE NOTICE 'an unconfirmed address sees no pending record: t';

  SELECT count(*) INTO v_count FROM public.my_pending_clinician_records();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'an unconfirmed address was offered a record to claim';
  END IF;
  RAISE NOTICE 'and is offered nothing to claim: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- Confirmed: the record, but only what identifies it
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  SELECT count(*) INTO v_count FROM public.my_pending_clinician_records();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a confirmed owner was offered % records, expected 1', v_count;
  END IF;
  RAISE NOTICE 'a confirmed address is offered the record: t';

  -- The whole point: nothing clinical comes back from the claim view.
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'my_pending_clinician_records';
  -- (a function, so check its declared output instead)
  IF EXISTS (
    SELECT 1 FROM unnest(string_to_array(
      pg_get_function_result(to_regprocedure('public.my_pending_clinician_records()')), ','
    )) col
    WHERE col ILIKE '%allerg%' OR col ILIKE '%condition%'
       OR col ILIKE '%medication%' OR col ILIKE '%note%'
  ) THEN
    RAISE EXCEPTION 'the claim view returns clinical content';
  END IF;
  RAISE NOTICE 'the claim view carries no clinical content at all: t';

  -- Contact details are masked, so the screen confirms rather than reveals.
  IF EXISTS (
    SELECT 1 FROM public.my_pending_clinician_records()
     WHERE masked_email = 'patient@example.com'
        OR masked_phone LIKE '%801234%'
  ) THEN
    RAISE EXCEPTION 'contact details were returned unmasked';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.my_pending_clinician_records()
     WHERE masked_email LIKE 'p%@example.com' AND masked_phone LIKE '%5678'
  ) THEN
    RAISE EXCEPTION 'masking removed too much to recognise the record';
  END IF;
  RAISE NOTICE 'contact details are masked but still recognisable: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- Somebody else's address entirely
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_clinician::text, true);
  SELECT count(*) INTO v_count FROM public.my_pending_clinician_records();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a different address was offered the record';
  END IF;
  RAISE NOTICE 'a different address is offered nothing: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- Once claimed, it stops being pending
  -- ---------------------------------------------------------------
  UPDATE public.clinician_patient_records SET linked_user_id = v_owner WHERE id = v_record;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  SELECT count(*) INTO v_count FROM public.my_pending_clinician_records();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a claimed record was still offered for claiming';
  END IF;
  RAISE NOTICE 'a claimed record is no longer pending: t';
  RESET ROLE;

  RAISE NOTICE 'ALL PENDING RECORD CONFIRMATION TESTS PASSED';
END $$;

ROLLBACK;
