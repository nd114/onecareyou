DROP POLICY IF EXISTS "Anyone can send a contact message" ON public.contact_submissions;

REVOKE INSERT ON public.contact_submissions FROM anon, authenticated;
REVOKE ALL ON public.contact_submissions FROM anon, authenticated;
GRANT ALL ON public.contact_submissions TO service_role;

COMMENT ON TABLE public.contact_submissions IS
  'Messages from the public /contact form. Written only by notify-contact-submission with the '
  'service role, which validates and rate-limits first. Open insert made this table an email '
  'relay: anon could store any text addressed to any inbox and then ask us to send it.';

ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contact_submissions.notified_at IS
  'When the confirmation and notification were sent. Claimed atomically before sending, so a '
  'submission can never be emailed twice however many times the function is called.';

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