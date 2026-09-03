-- Contact form submissions.
--
-- The /contact form previously waited 1.5 seconds and told the sender their
-- message had been sent. Nothing was sent and nothing was stored. This gives
-- it somewhere real to land, following the same shape as enterprise_inquiries:
-- the row is written by the client, and an edge function reads it back with
-- the service role to send the notification.
--
-- Unlike enterprise_inquiries this form is on a signed-out page, so anon has
-- to be able to INSERT. That makes the table a spam target, so it is written
-- to be write-only from the outside: nobody but the service role can read a
-- submission back, and the length limits stop it being used as a blob store.

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Null for signed-out senders, which is the usual case on a public page.
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'closed', 'spam')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The inquiry types the form offers. A value outside the list means the
  -- request did not come from our form, which is worth rejecting outright.
  CONSTRAINT contact_submissions_inquiry_type_known CHECK (
    inquiry_type IN ('general', 'support', 'billing', 'partnership', 'feedback', 'other')
  ),

  -- Bounds, so an open endpoint cannot be used as storage. Generous enough
  -- that no genuine sender will meet them.
  CONSTRAINT contact_submissions_name_length CHECK (
    char_length(contact_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT contact_submissions_email_length CHECK (
    char_length(contact_email) BETWEEN 3 AND 320
  ),
  CONSTRAINT contact_submissions_email_shape CHECK (
    contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT contact_submissions_subject_length CHECK (
    char_length(subject) BETWEEN 1 AND 300
  ),
  CONSTRAINT contact_submissions_message_length CHECK (
    char_length(message) BETWEEN 1 AND 10000
  )
);

CREATE INDEX IF NOT EXISTS contact_submissions_created_at_idx
  ON public.contact_submissions (created_at DESC);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone may send a message. `submitted_by` must be honest: signed-out senders
-- leave it null, signed-in senders can only claim themselves.
DROP POLICY IF EXISTS "Anyone can send a contact message" ON public.contact_submissions;
CREATE POLICY "Anyone can send a contact message"
  ON public.contact_submissions
  FOR INSERT
  WITH CHECK (submitted_by IS NULL OR submitted_by = auth.uid());

-- Deliberately no SELECT, UPDATE or DELETE policy. Submissions are read by the
-- notify function with the service role, which bypasses RLS. Without a policy
-- every other statement returns nothing rather than someone else's message.

-- RLS filters rows; it does not withhold a privilege that was granted. Supabase
-- grants anon and authenticated the full set on every new table in `public` at
-- CREATE TABLE time, so these have to be taken back explicitly.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.contact_submissions FROM anon, authenticated;
GRANT INSERT ON public.contact_submissions TO anon, authenticated;

-- The notify function reads submissions back with the service role. That is a
-- load-bearing requirement, so it is granted here rather than left to the
-- ambient default — the table should carry its own access story.
GRANT ALL ON public.contact_submissions TO service_role;

DROP TRIGGER IF EXISTS update_contact_submissions_updated_at ON public.contact_submissions;
CREATE TRIGGER update_contact_submissions_updated_at
  BEFORE UPDATE ON public.contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.contact_submissions IS
  'Messages from the public /contact form. Write-only from the client: insert is open, every read goes through the service role.';
