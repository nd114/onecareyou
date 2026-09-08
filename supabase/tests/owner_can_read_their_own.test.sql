-- Everybody can read their own rows.
--
-- This exists because `medications` silently stopped satisfying it. The owner's
-- SELECT access had been written as an OR branch inside the clinician sharing
-- policy; a later migration rewrote that policy for an unrelated reason and the
-- branch went with it. No error, no failing test, an empty medication list.
--
-- Asserted against the catalogue rather than by inserting rows, because the
-- point is the shape of the policy set, not one table's behaviour: a table
-- whose owner-read is a clause inside a policy about somebody else is one
-- rewrite away from this bug, whether or not it has it today.
BEGIN;

DO $$
DECLARE
  r record;
  v_missing text := '';
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      -- Tables where `user_id` is not the owner, or where owner access is
      -- reached another way. Every entry needs the reason written down; an
      -- unexplained exemption is how this bug comes back.
      AND c.relname NOT IN (
        -- Staff rosters. `user_id` is a staff member, and they read their own
        -- row through is_practice_member(practice_id) — membership of the
        -- practice is the access, not ownership of the row.
        'practice_members',
        'practice_department_members',
        -- Audit trails. `user_id` is the actor, not the subject, and these are
        -- read through their own patient-facing policies.
        'hipaa_audit_logs',
        'access_audit_logs'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
          AND p.cmd IN ('SELECT', 'ALL')
          AND (p.qual LIKE '%auth.uid() = user_id%' OR p.qual LIKE '%user_id = auth.uid()%')
      )
    ORDER BY 1
  LOOP
    v_missing := v_missing || r.tbl || ' ';
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'FAIL: % table(s) whose owner cannot read their own rows: %. Either add a '
      'SELECT policy on auth.uid() = user_id, or add the table to the exception '
      'list above with the reason.', v_count, btrim(v_missing);
  END IF;
END $$;

-- And the concrete case, end to end, because a catalogue assertion proves a
-- policy exists and not that it works.
DO $$
DECLARE
  v_patient uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_med     uuid := gen_random_uuid();
  v_count   int;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    (v_patient,'p@example.com',now()),
    (v_other,'other@example.com',now());
  INSERT INTO public.medications (id, user_id, name, dosage, frequency)
  VALUES (v_med, v_patient, 'Metformin', '500 mg', 'twice daily');

  PERFORM set_config('request.jwt.claim.sub', v_patient::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: a patient cannot read their own medication';
  END IF;

  -- Restoring the owner's access must not have widened anyone else's.
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.medications WHERE id = v_med;
  RESET ROLE;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: a stranger can read somebody else''s medication';
  END IF;

  RAISE NOTICE 'owner_can_read_their_own: all assertions passed';
END $$;

ROLLBACK;
