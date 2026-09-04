-- Stop the contact form being usable as an email relay.
--
-- As shipped, anyone could:
--
--   1. POST to /rest/v1/contact_submissions with the public anon key, naming
--      any `contact_email` and up to 10 kB of `message`;
--   2. POST that row's id to /functions/v1/notify-contact-submission;
--   3. have hello@onecare.you deliver their text to their chosen inbox;
--   4. repeat without limit, replaying each id as often as they liked inside
--      the fifteen-minute freshness window.
--
-- The function's own comment claimed "a caller cannot post arbitrary text
-- through this function by calling it directly. It can only name a row id."
-- True, and beside the point: they insert the row first. An open write to a
-- table whose rows cause email to be sent is an open mail relay with extra
-- steps, and the cost lands on the sending domain's reputation.
--
-- Three changes, of which the first is the one that matters.

-- ---------------------------------------------------------------------------
-- 1. Nobody outside writes here any more
-- ---------------------------------------------------------------------------
--
-- The edge function becomes the only writer, so validation and rate limiting
-- happen before anything is stored — which is impossible when the client
-- inserts directly, because the function never sees the insert.
DROP POLICY IF EXISTS "Anyone can send a contact message" ON public.contact_submissions;

REVOKE INSERT ON public.contact_submissions FROM anon, authenticated;
REVOKE ALL ON public.contact_submissions FROM anon, authenticated;
GRANT ALL ON public.contact_submissions TO service_role;

COMMENT ON TABLE public.contact_submissions IS
  'Messages from the public /contact form. Written only by notify-contact-submission with the '
  'service role, which validates and rate-limits first. Open insert made this table an email '
  'relay: anon could store any text addressed to any inbox and then ask us to send it.';

-- ---------------------------------------------------------------------------
-- 2. One email per submission, ever
-- ---------------------------------------------------------------------------
--
-- Claimed atomically by the function with
-- `UPDATE … SET notified_at = now() WHERE id = ? AND notified_at IS NULL
-- RETURNING id`, so two concurrent calls cannot both win. The freshness window
-- alone did not stop replay; it only bounded how long replay lasted.
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contact_submissions.notified_at IS
  'When the confirmation and notification were sent. Claimed atomically before sending, so a '
  'submission can never be emailed twice however many times the function is called.';

-- ---------------------------------------------------------------------------
-- 3. Something to rate-limit against
-- ---------------------------------------------------------------------------
--
-- A hash rather than the address itself: this is a health company's contact
-- form, and who wrote to it is not something worth keeping in the clear any
-- longer than the message needs. The salt rotates daily inside the function,
-- so a fingerprint stops being linkable after a day while still supporting an
-- hourly window.
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS sender_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS contact_submissions_fingerprint_idx
  ON public.contact_submissions (sender_fingerprint, created_at DESC)
  WHERE sender_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_submissions_email_recent_idx
  ON public.contact_submissions (lower(contact_email), created_at DESC);

COMMENT ON COLUMN public.contact_submissions.sender_fingerprint IS
  'Daily-salted hash of the sender IP, for rate limiting. Not the address itself: who wrote to a '
  'health company is not worth keeping in the clear.';
