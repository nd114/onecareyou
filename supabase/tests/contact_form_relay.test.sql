-- The contact form must not be usable as an email relay.
--
-- As shipped, anyone could store any text addressed to any inbox and then ask
-- us to email it from hello@onecare.you, without limit. The fix is that anon
-- cannot write to this table at all — the edge function is the only writer, so
-- validation and rate limiting happen before anything is stored.
--
-- These assertions are about the privilege, not the policy. RLS filters rows;
-- it does not withhold a privilege that was granted, and it was the GRANT that
-- opened this.

BEGIN;

DO $$
DECLARE
  v_ok    boolean;
  v_count int;
  v_id    uuid;
BEGIN
  -- ---------------------------------------------------------------
  -- Nobody outside writes here
  -- ---------------------------------------------------------------
  IF has_table_privilege('anon', 'public.contact_submissions', 'INSERT') THEN
    RAISE EXCEPTION
      'anon can still insert a contact submission — that is an open mail relay, because a stored row is what causes an email to be sent';
  END IF;
  IF has_table_privilege('authenticated', 'public.contact_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'a signed-in user can insert a contact submission directly, bypassing the rate limit';
  END IF;
  RAISE NOTICE 'no client role can write a contact submission: t';

  -- ...and still cannot read one, which was already true and must stay true.
  IF has_table_privilege('anon', 'public.contact_submissions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.contact_submissions', 'SELECT') THEN
    RAISE EXCEPTION 'somebody other than the service role can read contact submissions';
  END IF;
  RAISE NOTICE 'nobody outside can read a contact submission: t';

  -- The insert policy is gone with the privilege. Leaving it would be a
  -- standing invitation to restore the grant "so the policy works".
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_submissions' AND cmd = 'INSERT'
  ) INTO v_ok;
  IF v_ok THEN
    RAISE EXCEPTION 'an INSERT policy still exists on contact_submissions';
  END IF;
  RAISE NOTICE 'the open insert policy is gone too: t';

  -- The service role still writes, or the form does not work at all.
  IF NOT has_table_privilege('service_role', 'public.contact_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'the service role cannot write, so the contact form cannot work';
  END IF;
  RAISE NOTICE 'the service role can still write: t';

  -- ---------------------------------------------------------------
  -- One email per submission, ever
  -- ---------------------------------------------------------------
  INSERT INTO public.contact_submissions (contact_name, contact_email, subject, message)
  VALUES ('Someone', 'someone@example.com', 'Hello', 'A message')
  RETURNING id INTO v_id;

  SELECT notified_at IS NULL INTO v_ok FROM public.contact_submissions WHERE id = v_id;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'a new submission was already marked as notified';
  END IF;

  -- The claim the function makes before sending. The first wins.
  UPDATE public.contact_submissions SET notified_at = now()
  WHERE id = v_id AND notified_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the first claim did not take';
  END IF;

  -- The second finds nothing, so a replay sends nothing.
  UPDATE public.contact_submissions SET notified_at = now()
  WHERE id = v_id AND notified_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'a submission could be claimed twice — replaying an id would send the email again';
  END IF;
  RAISE NOTICE 'a submission can be claimed for sending exactly once: t';

  -- ---------------------------------------------------------------
  -- Something to rate-limit against
  -- ---------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_submissions'
      AND column_name = 'sender_fingerprint'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'there is nothing to rate-limit a sender against';
  END IF;

  SELECT count(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'contact_submissions'
    AND (indexdef LIKE '%sender_fingerprint%' OR indexdef LIKE '%lower(contact_email)%');
  IF v_count < 2 THEN
    RAISE EXCEPTION
      'the rate-limit lookups are unindexed — a counting query on every submission is its own denial of service';
  END IF;
  RAISE NOTICE 'the rate-limit lookups are indexed: t';

  -- ---------------------------------------------------------------
  -- The bounds that were already there stay there
  -- ---------------------------------------------------------------
  BEGIN
    INSERT INTO public.contact_submissions (contact_name, contact_email, subject, message)
    VALUES ('Someone', 'not-an-email', 'Hello', 'A message');
    RAISE EXCEPTION 'an address that is not an address was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.contact_submissions (contact_name, contact_email, subject, message)
    VALUES ('Someone', 'someone@example.com', 'Hello', repeat('x', 10001));
    RAISE EXCEPTION 'a message past the length limit was accepted — the table is a blob store';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'the shape and length bounds still hold: t';

  RAISE NOTICE 'ALL CONTACT FORM TESTS PASSED';
END $$;

ROLLBACK;
