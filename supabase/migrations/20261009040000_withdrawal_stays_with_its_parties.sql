-- A withdrawal record belongs to the people it is about: the sender, the
-- practice the document went out through, and the person it reached. Each of
-- them now sees only their part of it.
--
-- The event row carries the practice's internal incident note, and for a
-- misdirected document that note can name the patient it was meant for. It
-- reached people it should not have in three ways:
--
--   * withdraw_shared_file, asked about a document that was already
--     withdrawn, returned the stored event before checking who was asking.
--     Anybody who knew a document or message id could read the whole incident
--     record. The already-withdrawn answer now goes only to the sender, the
--     person who withdrew it, or a manager of the practice on the record;
--     everybody else gets the same refusal a first withdrawal would give them.
--   * The event was stamped with the sender's first active membership, not
--     the practice the document actually went out through. A clinician at two
--     hospitals withdrawing a hospital B patient's document put it in hospital
--     A's register, and gave hospital A's managers the co-signing and
--     emergency authority over it. The practice is now one the patient has a
--     share with (a live one first, a revoked one still counting, because the
--     document went out while it was live) and the sender is an active member
--     of. When there is no such practice the event names none, and the sender
--     alone answers for it, as for any clinician outside a practice.
--   * The recipient read document_retraction_events itself, through a policy
--     that chose rows and not columns, so a wrong-document recipient read the
--     note about the intended patient. That policy is gone. Recipients are
--     served by my_withdrawn_documents, which now runs as its owner, filters
--     to the caller, and carries only the patient-safe columns it always had.
--     object_to_withdrawal used to hand the recipient the whole event row back
--     too; it now returns their row of that view instead.
--
-- practice_withdrawal_register is unchanged. It runs as the caller, so it
-- shows only what the remaining base-table policy allows: the sender's own
-- withdrawals and, to the owners and admins of the practice on the record,
-- the practice's. With the practice now recorded correctly, that is the
-- practice that sent it.

-- ---------------------------------------------------------------------------
-- withdraw_shared_file
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_shared_file(
  _document_id uuid,
  _message_id uuid,
  _reason_code text,
  _internal_note text DEFAULT NULL::text,
  _incident_ref text DEFAULT NULL::text,
  _cosigned_by uuid DEFAULT NULL::uuid,
  _emergency_justification text DEFAULT NULL::text
)
RETURNS public.document_retraction_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_reason       public.retraction_reason_codes%ROWTYPE;
  v_doc          public.health_documents%ROWTYPE;
  v_msg          public.messages%ROWTYPE;
  v_sender       uuid;
  v_recipient    uuid;
  v_patient      uuid;
  v_sent_at      timestamptz;
  v_path         text;
  v_name         text;
  v_practice     uuid;
  v_already      boolean := false;
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
    v_already   := v_doc.retracted_at IS NOT NULL;
    v_sender    := v_doc.uploaded_by_user_id;
    v_recipient := v_doc.user_id;
    v_patient   := v_doc.user_id;
    v_sent_at   := v_doc.created_at;
    v_path      := v_doc.file_path;
    v_name      := v_doc.file_name;
  ELSE
    SELECT * INTO v_msg FROM public.messages WHERE id = _message_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;
    IF v_msg.attachment_path IS NULL THEN
      RAISE EXCEPTION 'That message has no attachment to withdraw';
    END IF;
    v_already   := v_msg.attachment_retracted_at IS NOT NULL;
    v_sender    := v_msg.sender_user_id;
    v_recipient := CASE WHEN v_msg.sender_user_id = v_msg.patient_user_id THEN v_msg.clinician_user_id ELSE v_msg.patient_user_id END;
    v_patient   := v_msg.patient_user_id;
    v_sent_at   := v_msg.created_at;
    v_path      := v_msg.attachment_path;
    v_name      := COALESCE(v_msg.attachment_name, 'Attachment');
  END IF;

  -- Withdrawing twice is not an error; it is somebody checking. But only the
  -- people answerable for the withdrawal get its record back.
  IF v_already THEN
    SELECT * INTO v_event FROM public.document_retraction_events
     WHERE (_document_id IS NOT NULL AND document_id = _document_id)
        OR (_message_id IS NOT NULL AND message_id = _message_id)
     ORDER BY retracted_at DESC LIMIT 1;
    IF v_actor IS DISTINCT FROM v_sender
       AND v_actor IS DISTINCT FROM v_event.initiated_by
       AND NOT (v_event.sending_practice_id IS NOT NULL
                AND public.can_manage_practice(v_event.sending_practice_id)) THEN
      RAISE EXCEPTION 'Only the person who sent a file can withdraw it';
    END IF;
    RETURN v_event;
  END IF;

  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'That file has no recorded sender, so there is nobody entitled to withdraw it';
  END IF;

  -- The practice the file went out through: one the patient shares with and
  -- the sender is an active member of. None, if there is no such practice.
  SELECT ps.practice_id INTO v_practice
    FROM public.practice_shares ps
    JOIN public.practice_members pm
      ON pm.practice_id = ps.practice_id
     AND pm.user_id = v_sender
     AND pm.status = 'active'
   WHERE ps.user_id = v_patient
   ORDER BY ps.is_active DESC, ps.connected_at DESC NULLS LAST, ps.created_at DESC
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

-- ---------------------------------------------------------------------------
-- The recipient's view of a withdrawal, and nothing more
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Recipients see withdrawals affecting them" ON public.document_retraction_events;

-- Runs as its owner, which owns the event table, so it no longer needs a
-- recipient policy on that table. Its own WHERE keeps it to the caller's rows,
-- and its column list is the whole of what a recipient learns.
ALTER VIEW public.my_withdrawn_documents RESET (security_invoker);

REVOKE ALL ON public.my_withdrawn_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.my_withdrawn_documents TO authenticated;

-- ---------------------------------------------------------------------------
-- object_to_withdrawal answers with the recipient's view, not the event row
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.object_to_withdrawal(uuid, text);

CREATE FUNCTION public.object_to_withdrawal(_event_id uuid, _note text)
RETURNS public.my_withdrawn_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event  public.document_retraction_events;
  v_result public.my_withdrawn_documents;
BEGIN
  SELECT * INTO v_event FROM public.document_retraction_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such withdrawal'; END IF;

  IF v_event.actual_recipient_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the person a file was withdrawn from can object to it';
  END IF;

  -- Not in the first 72 hours. That window is somebody fixing their own mistake
  -- immediately; an objection there would only slow the fix.
  IF v_event.retracted_at > now() - interval '72 hours' THEN
    RAISE EXCEPTION 'This was withdrawn in the last few days. If you think it was withdrawn wrongly, contact the provider who sent it.';
  END IF;

  IF v_event.objected_at IS NULL THEN
    UPDATE public.document_retraction_events
       SET objected_at = now(),
           objection_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _event_id;
  END IF;

  SELECT * INTO v_result FROM public.my_withdrawn_documents WHERE id = _event_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.object_to_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.object_to_withdrawal(uuid, text) TO authenticated;
