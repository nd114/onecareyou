CREATE OR REPLACE FUNCTION public.person_ref(_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN NULL
    ELSE 'P-' || upper(left(replace(_user_id::text, '-', ''), 8))
  END;
$function$;

CREATE TABLE IF NOT EXISTS public.retraction_reason_codes (
  code text PRIMARY KEY,
  patient_message text NOT NULL,
  audit_description text NOT NULL,
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

CREATE OR REPLACE FUNCTION public.required_withdrawal_authority(_sent_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN _sent_at > now() - interval '72 hours' THEN 'sender'
    WHEN _sent_at > now() - interval '10 days' THEN 'sender_with_reason'
    ELSE 'privacy_incident'
  END;
$function$;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_retracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_retracted_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.document_retraction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.health_documents(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  storage_path text,
  file_name text,
  sending_practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  sending_clinician_id uuid REFERENCES auth.users(id),
  intended_patient_id uuid REFERENCES auth.users(id),
  intended_patient_ref text,
  actual_recipient_id uuid REFERENCES auth.users(id),
  actual_recipient_ref text,
  sent_at timestamptz,
  first_accessed_at timestamptz,
  last_accessed_at timestamptz,
  downloaded_at timestamptz,
  retracted_at timestamptz NOT NULL DEFAULT now(),
  initiated_by uuid REFERENCES auth.users(id),
  initiated_by_role text,
  authority_used text NOT NULL
    CHECK (authority_used IN ('sender', 'sender_with_reason', 'privacy_incident', 'emergency')),
  cosigned_by uuid REFERENCES auth.users(id),
  emergency_justification text,
  reason_code text NOT NULL REFERENCES public.retraction_reason_codes(code),
  internal_note text,
  was_opened boolean NOT NULL DEFAULT false,
  was_downloaded boolean NOT NULL DEFAULT false,
  access_count integer NOT NULL DEFAULT 0,
  days_visible integer,
  incident_ref text,
  subsequent_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX IF NOT EXISTS retraction_events_practice_idx
  ON public.document_retraction_events (sending_practice_id, retracted_at DESC);
CREATE INDEX IF NOT EXISTS retraction_events_clinician_idx
  ON public.document_retraction_events (sending_clinician_id, retracted_at DESC);
CREATE INDEX IF NOT EXISTS retraction_events_recipient_idx
  ON public.document_retraction_events (actual_recipient_id, retracted_at DESC);

ALTER TABLE public.document_retraction_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_retraction_events FROM authenticated;
GRANT SELECT ON public.document_retraction_events TO authenticated;
GRANT ALL ON public.document_retraction_events TO service_role;

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

CREATE OR REPLACE VIEW public.my_withdrawn_documents
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.document_id,
  e.message_id,
  e.file_name,
  e.retracted_at,
  e.sent_at,
  e.reason_code,
  c.patient_message,
  e.objected_at,
  e.objection_note,
  (e.retracted_at < now() - interval '72 hours' AND e.objected_at IS NULL) AS may_object
FROM public.document_retraction_events e
JOIN public.retraction_reason_codes c ON c.code = e.reason_code
WHERE e.actual_recipient_id = auth.uid();

GRANT SELECT ON public.my_withdrawn_documents TO authenticated;

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
  SELECT pm.practice_id INTO v_practice
    FROM public.practice_members pm
   WHERE pm.user_id = v_sender AND pm.status = 'active'
   ORDER BY pm.created_at
   LIMIT 1;
  v_required := public.required_withdrawal_authority(v_sent_at);
  IF _emergency_justification IS NOT NULL AND btrim(_emergency_justification) <> '' THEN
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
    IF NOT v_reason.is_privacy_incident THEN
      RAISE EXCEPTION
        'This was sent more than ten days ago, so it can no longer be withdrawn as an ordinary correction. Issue a corrected version, ask the patient to delete their copy, or report it as a privacy incident.';
    END IF;
    IF v_practice IS NULL THEN
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
  SELECT
    count(*),
    min(created_at),
    max(created_at),
    max(created_at) FILTER (WHERE action = 'download_document')
  INTO v_opens, v_first, v_last, v_downloaded
  FROM public.hipaa_audit_logs
  WHERE resource_id = COALESCE(_document_id, _message_id)::text
    AND action IN ('view_document', 'download_document');
  PERFORM set_config('onecare.withdrawal', 'on', true);
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
  PERFORM set_config('onecare.withdrawal', 'off', true);
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

DROP POLICY IF EXISTS "Chat participants can read attachments" ON storage.objects;
CREATE POLICY "Chat participants can read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND array_length(storage.foldername(name), 1) >= 2
  AND auth.uid()::text IN ((storage.foldername(name))[1], (storage.foldername(name))[2])
  AND NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE m.attachment_path = storage.objects.name
       AND m.attachment_retracted_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS messages_attachment_path_idx
  ON public.messages (attachment_path)
  WHERE attachment_path IS NOT NULL;

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

GRANT SELECT ON public.practice_withdrawal_register TO authenticated;