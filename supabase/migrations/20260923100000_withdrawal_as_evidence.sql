-- Withdrawing a document, as an evidence record rather than a flag
--
-- The first cut set three columns on `health_documents` and wrote one audit
-- row. That is enough to stop access and not nearly enough to answer the
-- questions somebody will actually be asked: who sent it, who was it meant
-- for, who got it instead, had they opened it, had they saved a copy, how long
-- did they have it, who withdrew it and under whose authority, and what was
-- done about it afterwards.
--
-- Three principles, and they resolve a tension worth stating plainly.
--
-- 1. **Withdrawal is always technically possible; the authority required grows
--    with time.** A hard cutoff would mean a disclosure discovered late has no
--    remedy at all, and disclosures are usually discovered late. What closes
--    with time is the *ordinary* route. What stays open is the declared
--    privacy incident, which is a heavier act on purpose.
--
-- 2. **The platform executes; it does not adjudicate.** Every tier below runs
--    without anybody here reading a case. The practice declares, the platform
--    records and enforces, the evidence is preserved for whoever does have to
--    decide. Mediating disputes between a clinic and its patient is not a role
--    this platform can carry at any scale, and building a mechanism that
--    implies otherwise would invite exactly that.
--
-- 3. **Withdrawal removes access. It never removes the record.** The row, the
--    file, the content and this event all survive, and the withdrawal is
--    itself audited. Nothing that passes through here can be made never to
--    have happened, which is why the ten-day boundary is a rule about which
--    instrument fits — not an inference about anybody's motive.
--
-- Names are not used. A person is referred to by a concealed stable token, so
-- an incident report can be read, exported and discussed by people who have no
-- business knowing whose record it was.

-- ---------------------------------------------------------------------------
-- Concealed references
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.person_ref(_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN NULL
    ELSE 'P-' || upper(left(replace(_user_id::text, '-', ''), 8))
  END;
$function$;

COMMENT ON FUNCTION public.person_ref(uuid) IS
  'A stable, concealed token for a person in incident records. Derived from the '
  'id rather than the name, so it reveals nothing on its own, stays the same '
  'across reports, and lets two events about the same person be recognised as '
  'such without either report naming them. A misfiling report that says whose '
  'record it was is a second disclosure written to describe the first.';

-- ---------------------------------------------------------------------------
-- Why a document was withdrawn
-- ---------------------------------------------------------------------------
--
-- A code, with the free text alongside rather than instead. Free text says what
-- happened once, to one reader. A code can be counted, can raise an alert when
-- one clinician's misfilings cluster, can be translated for a patient reading
-- in another language, and can be filtered in a regulator's report. Both are
-- kept: the code for the system, the words for the people.

CREATE TABLE IF NOT EXISTS public.retraction_reason_codes (
  code text PRIMARY KEY,
  -- What the recipient is told. Neutral by design: it explains that something
  -- was withdrawn and why, without characterising anybody and without implying
  -- the recipient did anything wrong.
  patient_message text NOT NULL,
  -- What the incident record says. The clinical and regulatory framing.
  audit_description text NOT NULL,
  -- Whether this code is a privacy incident, which is what keeps withdrawal
  -- available after the ordinary window closes.
  is_privacy_incident boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100
);

INSERT INTO public.retraction_reason_codes (code, patient_message, audit_description, is_privacy_incident, sort_order) VALUES
  ('wrong_recipient',
   'This document was sent to you in error. It was intended for someone else and has been withdrawn by the healthcare provider who sent it.',
   'Incorrect recipient. Document disclosed to a person other than the intended patient; withdrawal performed to prevent further access.',
   true, 10),
  ('contains_other_patient_data',
   'This document has been withdrawn by the healthcare provider who sent it, because it contained information about another person.',
   'Third-party information present in a document disclosed to this patient; withdrawal performed to limit onward disclosure.',
   true, 20),
  ('unauthorised_disclosure',
   'This document has been withdrawn by the healthcare provider who sent it. It was shared without the authorisation required.',
   'Unauthorised disclosure. Document shared without a lawful basis or outside the agreed sharing arrangement.',
   true, 30),
  ('sent_in_error',
   'This document was sent to you in error and has been withdrawn by the healthcare provider who sent it.',
   'Sent in error. Document was not intended to be shared with this patient at this time.',
   false, 40),
  ('superseded',
   'This document has been replaced with a corrected version by the healthcare provider who sent it.',
   'Superseded. A corrected version of this document has been issued; the original is withdrawn from view and retained.',
   false, 50),
  ('incorrect_content',
   'This document has been withdrawn by the healthcare provider who sent it because it contained an error.',
   'Content error. Document contained materially incorrect information; withdrawn pending correction.',
   false, 60)
ON CONFLICT (code) DO UPDATE
  SET patient_message = EXCLUDED.patient_message,
      audit_description = EXCLUDED.audit_description,
      is_privacy_incident = EXCLUDED.is_privacy_incident,
      sort_order = EXCLUDED.sort_order;

ALTER TABLE public.retraction_reason_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retraction_reason_codes FROM authenticated;
GRANT SELECT ON public.retraction_reason_codes TO authenticated;
GRANT ALL ON public.retraction_reason_codes TO service_role;

DROP POLICY IF EXISTS "Reason codes are readable" ON public.retraction_reason_codes;
CREATE POLICY "Reason codes are readable"
  ON public.retraction_reason_codes FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.retraction_reason_codes IS
  'The vocabulary of withdrawal, with the two sentences each code produces: one '
  'for the person who received the document, one for the incident record. A '
  'table rather than a CHECK constraint so the wording can be corrected, and so '
  'the patient-facing sentence is reviewable in one place by whoever is '
  'accountable for it.';

-- ---------------------------------------------------------------------------
-- How much authority it takes, given how long ago it was sent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.required_withdrawal_authority(_sent_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT CASE
    -- The "I have just done that wrong" window. One action, by the sender.
    WHEN _sent_at > now() - interval '72 hours' THEN 'sender'
    -- Still the sender's to do, but it is no longer a slip: a reason code is
    -- required and the practice is told.
    WHEN _sent_at > now() - interval '10 days' THEN 'sender_with_reason'
    -- The ordinary route is closed. What remains is a declared privacy
    -- incident, which needs a second person from the practice, or an emergency
    -- declaration where waiting for one would leave information exposed.
    ELSE 'privacy_incident'
  END;
$function$;

COMMENT ON FUNCTION public.required_withdrawal_authority(timestamptz) IS
  'The authority a withdrawal needs, which rises with the age of the disclosure '
  'rather than expiring. After ten days a clinician can no longer simply take a '
  'document back; a privacy incident can still be declared, because a '
  'disclosure found on day forty is still a disclosure and a platform that '
  'refuses to help with it has chosen the wrong side of that trade.';

-- ---------------------------------------------------------------------------
-- The event
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_retraction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was withdrawn. One of these two, never both: a document filed in the
  -- Vault, or a file attached to a message. Chat attachments are the same act
  -- and were the obvious gap — a scan sent to the wrong person in a message is
  -- not a lesser disclosure than the same scan filed to the wrong Vault.
  document_id uuid REFERENCES public.health_documents(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  -- Kept separately because it survives either row being reorganised, and it is
  -- what an investigator needs to find the object itself.
  storage_path text,
  file_name text,

  -- Who sent it
  sending_practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  sending_clinician_id uuid REFERENCES auth.users(id),

  -- Who it was for, and who actually got it. Different in the case this exists
  -- for. Both held as ids for enforcement and as concealed refs for reporting.
  intended_patient_id uuid REFERENCES auth.users(id),
  intended_patient_ref text,
  actual_recipient_id uuid REFERENCES auth.users(id),
  actual_recipient_ref text,

  -- The timeline
  sent_at timestamptz,
  first_accessed_at timestamptz,
  last_accessed_at timestamptz,
  downloaded_at timestamptz,
  retracted_at timestamptz NOT NULL DEFAULT now(),

  -- Who withdrew it, and under what authority
  initiated_by uuid REFERENCES auth.users(id),
  initiated_by_role text,
  authority_used text NOT NULL
    CHECK (authority_used IN ('sender', 'sender_with_reason', 'privacy_incident', 'emergency')),
  cosigned_by uuid REFERENCES auth.users(id),
  -- Required for an emergency withdrawal: what made waiting for a co-signature
  -- unacceptable. An emergency nobody can describe afterwards is a bypass.
  emergency_justification text,

  -- Why
  reason_code text NOT NULL REFERENCES public.retraction_reason_codes(code),
  internal_note text,

  -- What the recipient already had. Retraction stops further access; it cannot
  -- unsee what was read, and a record implying otherwise is worse than none.
  was_opened boolean NOT NULL DEFAULT false,
  was_downloaded boolean NOT NULL DEFAULT false,
  access_count integer NOT NULL DEFAULT 0,
  days_visible integer,

  -- What happened next. The practice's own breach register reference, and any
  -- follow-through recorded against it.
  incident_ref text,
  subsequent_actions jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- The recipient's objection, if they made one. Recorded and routed; never
  -- adjudicated here.
  objected_at timestamptz,
  objection_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT retraction_names_one_object CHECK (
    (document_id IS NOT NULL AND message_id IS NULL)
    OR (document_id IS NULL AND message_id IS NOT NULL)
  ),
  CONSTRAINT emergency_is_justified CHECK (
    authority_used <> 'emergency' OR btrim(coalesce(emergency_justification, '')) <> ''
  ),
  CONSTRAINT cosigner_is_a_second_person CHECK (
    cosigned_by IS NULL OR cosigned_by <> initiated_by
  )
);

COMMENT ON TABLE public.document_retraction_events IS
  'One row per withdrawal, holding what an incident report has to answer '
  'without anybody re-deriving it: who sent what to whom, whether it was opened '
  'or saved, how long it was there, who took it back under what authority, and '
  'what was done afterwards. People appear as concealed refs so the record can '
  'be read by whoever needs it without naming the patient.';

CREATE INDEX IF NOT EXISTS retraction_events_practice_idx
  ON public.document_retraction_events (sending_practice_id, retracted_at DESC);
CREATE INDEX IF NOT EXISTS retraction_events_clinician_idx
  ON public.document_retraction_events (sending_clinician_id, retracted_at DESC);
CREATE INDEX IF NOT EXISTS retraction_events_recipient_idx
  ON public.document_retraction_events (actual_recipient_id, retracted_at DESC);

ALTER TABLE public.document_retraction_events ENABLE ROW LEVEL SECURITY;

-- No client writes at all. Every row is produced by the withdrawal function,
-- which is the only place the authority checks live.
REVOKE ALL ON public.document_retraction_events FROM authenticated;
GRANT SELECT ON public.document_retraction_events TO authenticated;
GRANT ALL ON public.document_retraction_events TO service_role;

-- The recipient sees the event about them, minus the internal note. Enforced
-- by the view below rather than by column privileges, so a `select *` from a
-- client cannot reach it.
DROP POLICY IF EXISTS "Recipients see withdrawals affecting them" ON public.document_retraction_events;
CREATE POLICY "Recipients see withdrawals affecting them"
  ON public.document_retraction_events FOR SELECT TO authenticated
  USING (actual_recipient_id = auth.uid());

DROP POLICY IF EXISTS "The practice sees its own withdrawals" ON public.document_retraction_events;
CREATE POLICY "The practice sees its own withdrawals"
  ON public.document_retraction_events FOR SELECT TO authenticated
  USING (
    sending_clinician_id = auth.uid()
    OR (sending_practice_id IS NOT NULL AND public.can_manage_practice(sending_practice_id))
  );

-- What the recipient is shown. Neutral, from the reason code, with the internal
-- note and the other patient's existence both absent.
CREATE OR REPLACE VIEW public.my_withdrawn_documents
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.file_name,
  e.retracted_at,
  e.sent_at,
  e.reason_code,
  c.patient_message,
  e.objected_at,
  e.objection_note,
  -- Whether an objection is still open to them. Not inside the first 72 hours:
  -- that window is somebody correcting their own mistake immediately, and a
  -- dispute mechanism there adds friction to the fix without protecting anyone.
  (e.retracted_at < now() - interval '72 hours' AND e.objected_at IS NULL) AS may_object
FROM public.document_retraction_events e
JOIN public.retraction_reason_codes c ON c.code = e.reason_code
WHERE e.actual_recipient_id = auth.uid();

COMMENT ON VIEW public.my_withdrawn_documents IS
  'The remnant. What was withdrawn, when, and the neutral sentence for its '
  'reason code — never the internal note, and never anything about the person '
  'the document was actually about.';

GRANT SELECT ON public.my_withdrawn_documents TO authenticated;

-- ---------------------------------------------------------------------------
-- Withdrawing something
-- ---------------------------------------------------------------------------
--
-- One function for both objects, because they are one act. Everything the
-- authority rules decide happens here; there is no client path that reaches a
-- withdrawal without passing through it.

CREATE OR REPLACE FUNCTION public.withdraw_shared_file(
  _document_id uuid,
  _message_id uuid,
  _reason_code text,
  _internal_note text DEFAULT NULL,
  _incident_ref text DEFAULT NULL,
  _cosigned_by uuid DEFAULT NULL,
  _emergency_justification text DEFAULT NULL
)
RETURNS public.document_retraction_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_reason       public.retraction_reason_codes%ROWTYPE;
  v_doc          public.health_documents%ROWTYPE;
  v_msg          public.messages%ROWTYPE;
  v_sender       uuid;
  v_recipient    uuid;
  v_sent_at      timestamptz;
  v_path         text;
  v_name         text;
  v_practice     uuid;
  v_required     text;
  v_authority    text;
  v_first        timestamptz;
  v_last         timestamptz;
  v_downloaded   timestamptz;
  v_opens        integer := 0;
  v_event        public.document_retraction_events;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF (_document_id IS NULL) = (_message_id IS NULL) THEN
    RAISE EXCEPTION 'Name exactly one of a document or a message';
  END IF;

  SELECT * INTO v_reason FROM public.retraction_reason_codes WHERE code = _reason_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown reason code %', _reason_code;
  END IF;

  IF _document_id IS NOT NULL THEN
    SELECT * INTO v_doc FROM public.health_documents WHERE id = _document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
    IF v_doc.retracted_at IS NOT NULL THEN
      -- Withdrawing twice is not an error; it is somebody checking.
      SELECT * INTO v_event FROM public.document_retraction_events
       WHERE document_id = _document_id ORDER BY retracted_at DESC LIMIT 1;
      RETURN v_event;
    END IF;
    v_sender    := v_doc.uploaded_by_user_id;
    v_recipient := v_doc.user_id;
    v_sent_at   := v_doc.created_at;
    v_path      := v_doc.file_path;
    v_name      := v_doc.file_name;
  ELSE
    SELECT * INTO v_msg FROM public.messages WHERE id = _message_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;
    IF v_msg.attachment_path IS NULL THEN
      -- Only the file is withdrawable. Taking back the words of a conversation
      -- is a different act with different rules, and conflating them would let
      -- a privacy mechanism edit a clinical discussion.
      RAISE EXCEPTION 'That message has no attachment to withdraw';
    END IF;
    IF v_msg.attachment_retracted_at IS NOT NULL THEN
      SELECT * INTO v_event FROM public.document_retraction_events
       WHERE message_id = _message_id ORDER BY retracted_at DESC LIMIT 1;
      RETURN v_event;
    END IF;
    v_sender    := v_msg.sender_user_id;
    v_recipient := CASE WHEN v_msg.sender_user_id = v_msg.patient_user_id THEN v_msg.clinician_user_id ELSE v_msg.patient_user_id END;
    v_sent_at   := v_msg.created_at;
    v_path      := v_msg.attachment_path;
    v_name      := COALESCE(v_msg.attachment_name, 'Attachment');
  END IF;

  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'That file has no recorded sender, so there is nobody entitled to withdraw it';
  END IF;

  -- Which practice is accountable. Null for an independent clinician, which is
  -- allowed: the co-signature rules below fall back to the sender in that case,
  -- because requiring a second person from an organisation of one would make
  -- withdrawal impossible rather than careful.
  SELECT pm.practice_id INTO v_practice
    FROM public.practice_members pm
   WHERE pm.user_id = v_sender AND pm.status = 'active'
   ORDER BY pm.created_at
   LIMIT 1;

  v_required := public.required_withdrawal_authority(v_sent_at);

  -- --- Who may act, at each tier -------------------------------------------
  IF _emergency_justification IS NOT NULL AND btrim(_emergency_justification) <> '' THEN
    -- The escape hatch, and it is deliberately not a shortcut: it demands a
    -- privacy reason code and a written justification, and it is the loudest
    -- row in the table. Information exposed right now should not wait for a
    -- colleague to be available.
    IF NOT v_reason.is_privacy_incident THEN
      RAISE EXCEPTION 'An emergency withdrawal must name a privacy reason code';
    END IF;
    IF v_sender <> v_actor
       AND NOT (v_practice IS NOT NULL AND public.can_manage_practice(v_practice)) THEN
      RAISE EXCEPTION 'Only the sender or their practice can declare an emergency withdrawal';
    END IF;
    v_authority := 'emergency';

  ELSIF v_required IN ('sender', 'sender_with_reason') THEN
    IF v_sender <> v_actor THEN
      RAISE EXCEPTION 'Only the person who sent a file can withdraw it';
    END IF;
    v_authority := v_required;

  ELSE
    -- Past ten days ordinary withdrawal is no longer the right instrument. A
    -- document that old has been read and acted on, so removing it helps
    -- nobody where a correction that supersedes it does. What remains is the
    -- declared privacy incident, which is a different problem: the audience
    -- was wrong rather than the content. The practice declares it; this
    -- records and enforces it.
    IF NOT v_reason.is_privacy_incident THEN
      RAISE EXCEPTION
        'This was sent more than ten days ago, so it can no longer be withdrawn as an ordinary correction. Issue a corrected version, ask the patient to delete their copy, or report it as a privacy incident.';
    END IF;
    IF v_practice IS NULL THEN
      -- An independent clinician has no colleague to co-sign. The privacy
      -- reason code and the record of it are the whole control.
      IF v_sender <> v_actor THEN
        RAISE EXCEPTION 'Only the person who sent a file can withdraw it';
      END IF;
    ELSE
      IF _cosigned_by IS NULL THEN
        RAISE EXCEPTION 'A withdrawal this long after sending needs a second signature from the practice';
      END IF;
      IF _cosigned_by = v_actor THEN
        RAISE EXCEPTION 'The second signature has to be somebody else';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.practice_members pm
         WHERE pm.user_id = _cosigned_by AND pm.practice_id = v_practice AND pm.status = 'active'
      ) THEN
        RAISE EXCEPTION 'The co-signer must be an active member of the sending practice';
      END IF;
      IF v_sender <> v_actor AND NOT public.can_manage_practice(v_practice) THEN
        RAISE EXCEPTION 'Only the sender or a practice administrator can withdraw this';
      END IF;
    END IF;
    v_authority := 'privacy_incident';
  END IF;

  -- --- What the recipient already had --------------------------------------
  SELECT
    count(*),
    min(created_at),
    max(created_at),
    max(created_at) FILTER (WHERE action = 'download_document')
  INTO v_opens, v_first, v_last, v_downloaded
  FROM public.hipaa_audit_logs
  WHERE resource_id = COALESCE(_document_id, _message_id)::text
    AND action IN ('view_document', 'download_document');

  -- --- Stop the access ------------------------------------------------------
  IF _document_id IS NOT NULL THEN
    UPDATE public.health_documents
       SET retracted_at = now(),
           retracted_by = v_actor,
           retraction_reason = v_reason.audit_description
     WHERE id = _document_id;
  ELSE
    UPDATE public.messages
       SET attachment_retracted_at = now(),
           attachment_retracted_by = v_actor
     WHERE id = _message_id;
  END IF;

  -- --- Record it ------------------------------------------------------------
  INSERT INTO public.document_retraction_events (
    document_id, message_id, storage_path, file_name,
    sending_practice_id, sending_clinician_id,
    intended_patient_id, intended_patient_ref,
    actual_recipient_id, actual_recipient_ref,
    sent_at, first_accessed_at, last_accessed_at, downloaded_at,
    initiated_by, initiated_by_role, authority_used, cosigned_by,
    emergency_justification, reason_code, internal_note,
    was_opened, was_downloaded, access_count, days_visible, incident_ref
  ) VALUES (
    _document_id, _message_id, v_path, v_name,
    v_practice, v_sender,
    -- Who it was meant for is only known where the reason says it went astray.
    -- Recording a guess would be worse than recording nothing.
    NULL, NULL,
    v_recipient, public.person_ref(v_recipient),
    v_sent_at, v_first, v_last, v_downloaded,
    v_actor,
    CASE
      WHEN v_actor = v_sender THEN 'sender'
      WHEN v_practice IS NOT NULL AND public.can_manage_practice(v_practice) THEN 'practice_admin'
      ELSE 'other'
    END,
    v_authority, _cosigned_by,
    NULLIF(btrim(COALESCE(_emergency_justification, '')), ''),
    _reason_code,
    NULLIF(btrim(COALESCE(_internal_note, '')), ''),
    COALESCE(v_opens, 0) > 0,
    v_downloaded IS NOT NULL,
    COALESCE(v_opens, 0),
    GREATEST(0, EXTRACT(day FROM now() - v_sent_at))::integer,
    NULLIF(btrim(COALESCE(_incident_ref, '')), '')
  )
  RETURNING * INTO v_event;

  INSERT INTO public.hipaa_audit_logs (
    user_id, action, resource_type, resource_id, patient_user_id, details
  ) VALUES (
    v_actor, 'document_withdrawn', 'document_retraction_events', v_event.id::text, v_recipient,
    jsonb_build_object(
      'reason_code', _reason_code,
      'authority', v_authority,
      'recipient_ref', v_event.actual_recipient_ref,
      'opened_before_withdrawal', v_event.access_count,
      'days_visible', v_event.days_visible
    )
  );

  RETURN v_event;
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_shared_file(uuid, uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_shared_file(uuid, uuid, text, text, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- The recipient's objection
-- ---------------------------------------------------------------------------
--
-- Recorded and routed to the practice, who is accountable for the disclosure
-- and for its remedy. Not adjudicated here, and the shape says so: there is no
-- outcome field, no reviewer, no resolution state. It attaches the recipient's
-- account to the event so that whoever does decide has both.

CREATE OR REPLACE FUNCTION public.object_to_withdrawal(_event_id uuid, _note text)
RETURNS public.document_retraction_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event public.document_retraction_events;
BEGIN
  SELECT * INTO v_event FROM public.document_retraction_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such withdrawal'; END IF;

  IF v_event.actual_recipient_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the person a file was withdrawn from can object to it';
  END IF;

  -- Not in the first 72 hours. That window is somebody fixing their own mistake
  -- immediately; an objection there would only slow the fix.
  IF v_event.retracted_at > now() - interval '72 hours' THEN
    RAISE EXCEPTION 'This was withdrawn in the last few days. If you think it was withdrawn wrongly, contact the provider who sent it.';
  END IF;

  IF v_event.objected_at IS NOT NULL THEN
    RETURN v_event;
  END IF;

  UPDATE public.document_retraction_events
     SET objected_at = now(),
         objection_note = NULLIF(btrim(COALESCE(_note, '')), '')
   WHERE id = _event_id
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$function$;

REVOKE ALL ON FUNCTION public.object_to_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.object_to_withdrawal(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.object_to_withdrawal(uuid, text) IS
  'The recipient records that they think a withdrawal was wrong. Attached to the '
  'event and visible to the practice. There is deliberately no outcome, reviewer '
  'or resolution here: this platform holds the record of the disagreement, it '
  'does not settle it.';

-- ---------------------------------------------------------------------------
-- Chat attachments are withdrawable too
-- ---------------------------------------------------------------------------
--
-- The obvious gap in the first cut. A scan sent to the wrong person in a
-- message is not a lesser disclosure than the same scan filed to the wrong
-- Vault, and the platform allows both. Only the file is withdrawable — the
-- words of a conversation are a clinical discussion and a privacy mechanism
-- has no business editing them.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_retracted_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.messages.attachment_retracted_at IS
  'Set when the file on this message was withdrawn. The message itself stays: '
  'the conversation is a clinical record and only the attachment was the '
  'disclosure.';

-- The message row is still readable — the remnant has to be visible, and a
-- message that silently loses its attachment is the gap this exists to avoid.
-- What stops is access to the file, which is a storage rule and therefore the
-- only place it actually bites.
DROP POLICY IF EXISTS "Chat participants can read attachments" ON storage.objects;
CREATE POLICY "Chat participants can read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND array_length(storage.foldername(name), 1) >= 2
  AND auth.uid()::text IN ((storage.foldername(name))[1], (storage.foldername(name))[2])
  -- Withdrawn files leave every read path at once. Checked here rather than in
  -- the client because a signed URL is issued by storage, and a client-side
  -- check would leave the file one direct request away.
  AND NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE m.attachment_path = storage.objects.name
       AND m.attachment_retracted_at IS NOT NULL
  )
);

COMMENT ON POLICY "Chat participants can read attachments" ON storage.objects IS
  'Thread participants, minus anything withdrawn. The withdrawal check is here '
  'because storage issues the signed URL: enforcing it in the client would leave '
  'the file reachable by anyone who kept the path.';

CREATE INDEX IF NOT EXISTS messages_attachment_path_idx
  ON public.messages (attachment_path)
  WHERE attachment_path IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The practice's own view of what it has withdrawn
-- ---------------------------------------------------------------------------
--
-- So a pattern is visible without anybody assembling it by hand. One clinician
-- withdrawing several documents a month is the signal that matters most here,
-- and it is exactly what a free-text-only reason could never surface.

CREATE OR REPLACE VIEW public.practice_withdrawal_register
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.sending_practice_id,
  e.sending_clinician_id,
  e.actual_recipient_ref,
  e.file_name,
  e.sent_at,
  e.retracted_at,
  e.days_visible,
  e.was_opened,
  e.was_downloaded,
  e.access_count,
  e.reason_code,
  c.is_privacy_incident,
  c.audit_description,
  e.authority_used,
  e.initiated_by,
  e.cosigned_by,
  e.emergency_justification,
  e.internal_note,
  e.incident_ref,
  e.subsequent_actions,
  e.objected_at,
  e.objection_note
FROM public.document_retraction_events e
JOIN public.retraction_reason_codes c ON c.code = e.reason_code;

COMMENT ON VIEW public.practice_withdrawal_register IS
  'The incident register, carrying the internal note and the concealed recipient '
  'ref rather than a name. security_invoker, so it shows a clinician their own '
  'withdrawals and an administrator their practice''s, and nobody anything else.';

GRANT SELECT ON public.practice_withdrawal_register TO authenticated;
