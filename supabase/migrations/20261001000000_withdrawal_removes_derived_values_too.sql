-- The promise in docs/guide/notifications-and-privacy.md:
--
--   "If a clinician sends you information that belongs to another patient...
--    that information is removed from your record, along with anything added
--    to your record from it."
--
-- The second half was never built. `withdraw_shared_file()` stops access to
-- the document; nothing followed the values a patient had already approved
-- into `vitals` from it. docs/withdrawal-and-derived-data.md §2 and §10 say
-- so plainly — "the document link on derived values" is listed as designed,
-- not built — and until now that was true.
--
-- §2 also gives the rule this migration enforces, and it is narrower than
-- "the document was withdrawn": only the two reason codes that mean the
-- values were never this patient's at all —
--
--   Wrong patient. The values are removed. Not flagged, not restricted —
--   removed from the record, with the event kept in the audit trail...
--   A marker left in the clinical series would be a small ongoing disclosure
--   about a stranger, and a hole in a trend chart is a worse artefact than a
--   row in a document list.
--
-- Every other reason code (superseded, incorrect_content, sent_in_error,
-- unauthorised_disclosure) is still the patient's own data, just wrongly
-- handled in how or when it was shared — §3's "authorship does not create a
-- right to hold someone else's health data" does not apply, so those cascade
-- to nothing. This is the one place OneCare removes data from a patient's
-- record without the patient asking, and it stays that narrow on purpose.

-- ---------------------------------------------------------------------------
-- 1. The link a retraction needs to find what a document produced
-- ---------------------------------------------------------------------------

ALTER TABLE public.vitals
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.health_documents(id) ON DELETE SET NULL;

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.health_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vitals.source_document_id IS
  'The Vault document this reading was read from, when it was. Lets a wrong-patient retraction (withdraw_shared_file) find and remove what that document produced; ON DELETE SET NULL because losing the document itself is not a retraction and must not silently delete the reading.';

COMMENT ON COLUMN public.medications.source_document_id IS
  'The Vault document this medication was read from, when it was. Same purpose and same ON DELETE behaviour as vitals.source_document_id.';

CREATE INDEX IF NOT EXISTS idx_vitals_source_document
  ON public.vitals(source_document_id) WHERE source_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medications_source_document
  ON public.medications(source_document_id) WHERE source_document_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. withdraw_shared_file(): cascade for the two wrong-patient reason codes
-- ---------------------------------------------------------------------------
-- Same function, same signature, same authority checks as
-- 20260923100000_withdrawal_as_evidence.sql — only the body changes, adding
-- the cascade after access is stopped and before the event is recorded, so
-- the counts it removed can be named in that same event.

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
  v_removed_vitals integer := 0;
  v_removed_meds   integer := 0;
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

  -- --- The values this document produced, if it was never this patient's --
  --
  -- Narrow on purpose: `unauthorised_disclosure` and the non-privacy reason
  -- codes are still the recipient's own data, just wrongly shared — nothing
  -- here removes a patient's own reading because of how or when it arrived.
  IF _document_id IS NOT NULL AND _reason_code IN ('wrong_recipient', 'contains_other_patient_data') THEN
    WITH deleted AS (
      DELETE FROM public.vitals WHERE source_document_id = _document_id RETURNING 1
    )
    SELECT count(*) INTO v_removed_vitals FROM deleted;

    WITH deleted AS (
      DELETE FROM public.medications WHERE source_document_id = _document_id RETURNING 1
    )
    SELECT count(*) INTO v_removed_meds FROM deleted;

    IF v_removed_vitals > 0 OR v_removed_meds > 0 THEN
      INSERT INTO public.hipaa_audit_logs (
        user_id, action, resource_type, resource_id, patient_user_id, details
      ) VALUES (
        v_actor, 'derived_data_removed', 'health_document', _document_id::text, v_recipient,
        jsonb_build_object(
          'reason_code', _reason_code,
          'vitals_removed', v_removed_vitals,
          'medications_removed', v_removed_meds
        )
      );
    END IF;
  END IF;

  INSERT INTO public.document_retraction_events (
    document_id, message_id, storage_path, file_name,
    sending_practice_id, sending_clinician_id,
    intended_patient_id, intended_patient_ref,
    actual_recipient_id, actual_recipient_ref,
    sent_at, first_accessed_at, last_accessed_at, downloaded_at,
    initiated_by, initiated_by_role, authority_used, cosigned_by,
    emergency_justification, reason_code, internal_note,
    was_opened, was_downloaded, access_count, days_visible, incident_ref,
    subsequent_actions
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
    NULLIF(btrim(COALESCE(_incident_ref, '')), ''),
    CASE WHEN v_removed_vitals > 0 OR v_removed_meds > 0
      THEN jsonb_build_array(jsonb_build_object(
        'action', 'removed_derived_data',
        'vitals_removed', v_removed_vitals,
        'medications_removed', v_removed_meds,
        'at', now()
      ))
      ELSE '[]'::jsonb
    END
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
      'days_visible', v_event.days_visible,
      'vitals_removed', v_removed_vitals,
      'medications_removed', v_removed_meds
    )
  );

  RETURN v_event;
END;
$function$;

REVOKE ALL ON FUNCTION public.withdraw_shared_file(uuid, uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_shared_file(uuid, uuid, text, text, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.withdraw_shared_file(uuid, uuid, text, text, text, uuid, text) IS
  'Withdraws a document or message attachment. For document_id withdrawals reasoned as wrong_recipient or contains_other_patient_data, also removes any vitals/medications carrying that document as source_document_id — the "anything added to your record from it" half of the promise in notifications-and-privacy.md.';
