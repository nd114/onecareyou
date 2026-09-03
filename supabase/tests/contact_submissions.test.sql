-- Contact form submissions: open to write, closed to read.
--
-- The form sits on a signed-out page, so anon must be able to insert. That is
-- the whole risk surface, and these assert the two halves of containing it:
-- a sender can leave a message, and nobody outside the service role can read
-- one back, edit one, or delete one.

BEGIN;

DO $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_someone_else uuid := '22222222-2222-2222-2222-222222222222';
  v_count int;
  v_failed boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_user, 'signed@example.com'),
    (v_someone_else, 'someone.else@example.com');

  -- A submission that came in earlier, so the read tests have something to
  -- fail to see. Written as the table owner, bypassing the client roles.
  INSERT INTO public.contact_submissions
    (id, contact_name, contact_email, inquiry_type, subject, message)
  VALUES
    (v_other, 'Amara Okafor', 'amara@example.com', 'support', 'Cannot sign in',
     'The reset link says it has expired.');

  -- ---------------------------------------------------------------
  -- A signed-out visitor can send a message
  -- ---------------------------------------------------------------
  SET LOCAL ROLE anon;

  INSERT INTO public.contact_submissions
    (id, contact_name, contact_email, inquiry_type, subject, message)
  VALUES
    (v_id, 'Tom Reyes', 'tom@example.com', 'general', 'Question about sharing',
     'Can I share only my medications with one clinic?');

  RAISE NOTICE 'anon can send a message: t';

  -- ---------------------------------------------------------------
  -- ...and cannot read any of them back, including its own
  -- ---------------------------------------------------------------
  BEGIN
    SELECT count(*) INTO v_count FROM public.contact_submissions;
    RAISE EXCEPTION 'anon could SELECT % contact submissions', v_count;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'anon cannot read submissions back: t';
  END;

  -- ---------------------------------------------------------------
  -- ...and cannot edit or delete someone else's
  -- ---------------------------------------------------------------
  BEGIN
    UPDATE public.contact_submissions SET status = 'closed' WHERE id = v_other;
    RAISE EXCEPTION 'anon could UPDATE a submission';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'anon cannot update a submission: t';
  END;

  BEGIN
    DELETE FROM public.contact_submissions WHERE id = v_other;
    RAISE EXCEPTION 'anon could DELETE a submission';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'anon cannot delete a submission: t';
  END;

  RESET ROLE;

  -- ---------------------------------------------------------------
  -- A signed-in sender is held to claiming only themselves
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  INSERT INTO public.contact_submissions
    (submitted_by, contact_name, contact_email, subject, message)
  VALUES
    (v_user, 'Signed in', 'signed@example.com', 'Hello', 'A message.');

  RAISE NOTICE 'a signed-in sender can attribute a message to themselves: t';

  -- v_someone_else is a real user, so the foreign key is satisfied and only the
  -- INSERT policy can refuse this. A random uuid would be rejected by the key
  -- first and would leave the policy untested.
  v_failed := false;
  BEGIN
    INSERT INTO public.contact_submissions
      (submitted_by, contact_name, contact_email, subject, message)
    VALUES
      (v_someone_else, 'Impostor', 'impostor@example.com', 'Hello', 'A message.');
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'a sender could attribute a message to another user';
  END IF;
  RAISE NOTICE 'a sender cannot attribute a message to someone else: t';

  -- The signed-in sender cannot read submissions either.
  BEGIN
    SELECT count(*) INTO v_count FROM public.contact_submissions;
    RAISE EXCEPTION 'authenticated could SELECT % contact submissions', v_count;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'a signed-in sender cannot read submissions back: t';
  END;

  RESET ROLE;

  -- ---------------------------------------------------------------
  -- The bounds that stop an open endpoint becoming storage
  -- ---------------------------------------------------------------
  v_failed := false;
  BEGIN
    INSERT INTO public.contact_submissions
      (contact_name, contact_email, subject, message)
    VALUES ('Spam', 'spam@example.com', 'Subject', repeat('x', 10001));
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'a 10001-character message was accepted'; END IF;
  RAISE NOTICE 'an oversized message is rejected: t';

  v_failed := false;
  BEGIN
    INSERT INTO public.contact_submissions
      (contact_name, contact_email, subject, message)
    VALUES ('Spam', 'not-an-email', 'Subject', 'Body');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an address with no @ was accepted'; END IF;
  RAISE NOTICE 'a malformed address is rejected: t';

  v_failed := false;
  BEGIN
    INSERT INTO public.contact_submissions
      (contact_name, contact_email, inquiry_type, subject, message)
    VALUES ('Spam', 'spam@example.com', 'not-a-type', 'Subject', 'Body');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown inquiry type was accepted'; END IF;
  RAISE NOTICE 'an inquiry type the form never offers is rejected: t';

  v_failed := false;
  BEGIN
    INSERT INTO public.contact_submissions
      (contact_name, contact_email, subject, message, status)
    VALUES ('Spam', 'spam@example.com', 'Subject', 'Body', 'archived');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'an unknown status was accepted'; END IF;
  RAISE NOTICE 'an unknown status is rejected: t';

  -- ---------------------------------------------------------------
  -- The service role, which is how the notify function reads them
  -- ---------------------------------------------------------------
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_count FROM public.contact_submissions;
  IF v_count < 3 THEN
    RAISE EXCEPTION 'service_role saw only % submissions', v_count;
  END IF;
  RAISE NOTICE 'service_role can read submissions to notify on them: t';
  RESET ROLE;

  RAISE NOTICE 'ALL CONTACT SUBMISSION TESTS PASSED';
END $$;

ROLLBACK;
