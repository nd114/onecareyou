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
    (v_other, 'Sarah Mitchell', 'sarah@example.com', 'support', 'Cannot sign in',
     'The reset link says it has expired.');

  -- ---------------------------------------------------------------
  -- A signed-out visitor can no longer write here directly
  --
  -- This suite used to assert the opposite, and was correct when it was
  -- written. The contact-form relay made notify-contact-submission the only
  -- writer, so validation and rate limiting happen before anything is stored —
  -- which is impossible when the client inserts for itself, because the
  -- function never sees the insert. The revoke is the enforcement; this is the
  -- assertion that it holds.
  -- ---------------------------------------------------------------
  SET LOCAL ROLE anon;

  BEGIN
    INSERT INTO public.contact_submissions
      (id, contact_name, contact_email, inquiry_type, subject, message)
    VALUES
      (v_id, 'Tom Reyes', 'tom@example.com', 'general', 'Question about sharing',
       'Can I share only my medications with one clinic?');
    RAISE EXCEPTION 'anon inserted a contact submission directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'anon cannot write to the table directly: t';
  END;

  -- The relay writes it instead.
  RESET ROLE;
  INSERT INTO public.contact_submissions
    (id, contact_name, contact_email, inquiry_type, subject, message)
  VALUES
    (v_id, 'Tom Reyes', 'tom@example.com', 'general', 'Question about sharing',
     'Can I share only my medications with one clinic?');
  SET LOCAL ROLE anon;

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

  -- A signed-in sender cannot write here either. The relay is the only writer,
  -- so "who may attribute a message to whom" is now decided inside the edge
  -- function against the caller's own token rather than by an INSERT policy.
  -- This suite asserted the policy; the policy is gone because the door is.
  v_failed := false;
  BEGIN
    INSERT INTO public.contact_submissions
      (submitted_by, contact_name, contact_email, subject, message)
    VALUES
      (v_user, 'Signed in', 'signed@example.com', 'Hello', 'A message.');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'a signed-in sender wrote to the table directly';
  END IF;
  RAISE NOTICE 'a signed-in sender cannot write to the table directly: t';

  -- Nor read submissions back.
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
  IF v_count < 2 THEN
    RAISE EXCEPTION 'service_role saw only % submissions', v_count;
  END IF;
  RAISE NOTICE 'service_role can read submissions to notify on them: t';
  RESET ROLE;

  RAISE NOTICE 'ALL CONTACT SUBMISSION TESTS PASSED';
END $$;

ROLLBACK;
