CREATE TABLE IF NOT EXISTS public.record_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL CHECK (kind IN ('medication_start', 'medication_change', 'medication_stop')),
  medication_id uuid REFERENCES public.medications(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  responded_at timestamptz,
  response_note text,
  applied_medication_id uuid REFERENCES public.medications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_is_not_self CHECK (patient_user_id <> proposed_by_user_id),
  CONSTRAINT proposal_names_its_target CHECK (
    (kind = 'medication_start' AND medication_id IS NULL)
    OR (kind IN ('medication_change', 'medication_stop') AND medication_id IS NOT NULL)
  ),
  CONSTRAINT proposal_has_content CHECK (
    kind = 'medication_stop' OR payload <> '{}'::jsonb
  ),
  CONSTRAINT proposal_answered_has_time CHECK (
    (status = 'pending' AND responded_at IS NULL)
    OR (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS record_change_proposals_patient_idx
  ON public.record_change_proposals (patient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS record_change_proposals_proposer_idx
  ON public.record_change_proposals (proposed_by_user_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS record_change_proposals_one_open_idx
  ON public.record_change_proposals (proposed_by_user_id, medication_id)
  WHERE status = 'pending' AND medication_id IS NOT NULL;

ALTER TABLE public.record_change_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.record_change_proposals FROM authenticated;
GRANT SELECT, INSERT ON public.record_change_proposals TO authenticated;
GRANT ALL ON public.record_change_proposals TO service_role;

DROP POLICY IF EXISTS "Both sides read a proposal" ON public.record_change_proposals;
CREATE POLICY "Both sides read a proposal"
  ON public.record_change_proposals FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR proposed_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Clinicians propose to patients who share with them" ON public.record_change_proposals;
CREATE POLICY "Clinicians propose to patients who share with them"
  ON public.record_change_proposals FOR INSERT TO authenticated
  WITH CHECK (
    proposed_by_user_id = auth.uid()
    AND patient_user_id <> auth.uid()
    AND status = 'pending'
    AND responded_at IS NULL
    AND applied_medication_id IS NULL
    AND (
      public.clinician_has_patient_permission(patient_user_id, 'medications')
      OR public.institution_has_patient_permission(patient_user_id, 'medications')
    )
    AND (
      medication_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.medications m
        WHERE m.id = medication_id AND m.user_id = patient_user_id
      )
    )
  );

CREATE OR REPLACE FUNCTION public.apply_medication_proposal(p_proposal public.record_change_proposals)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _payload jsonb := p_proposal.payload;
  _new_id  uuid;
BEGIN
  IF p_proposal.kind = 'medication_start' THEN
    INSERT INTO public.medications (
      user_id, name, dosage, frequency, type, instructions,
      start_date, end_date, refill_date, quantity, prescriber, pharmacy,
      times_of_day, source
    )
    VALUES (
      p_proposal.patient_user_id,
      COALESCE(_payload->>'name', 'Unnamed medication'),
      COALESCE(_payload->>'dosage', ''),
      COALESCE(_payload->>'frequency', ''),
      COALESCE(_payload->>'type', 'tablet'),
      _payload->>'instructions',
      COALESCE((_payload->>'start_date')::date, CURRENT_DATE),
      (_payload->>'end_date')::date,
      (_payload->>'refill_date')::date,
      (_payload->>'quantity')::integer,
      _payload->>'prescriber',
      _payload->>'pharmacy',
      COALESCE(_payload->'times_of_day', '[]'::jsonb),
      'manual'
    )
    RETURNING id INTO _new_id;

    RETURN _new_id;
  END IF;

  IF p_proposal.kind = 'medication_stop' THEN
    UPDATE public.medications
       SET is_active = false,
           end_date = COALESCE((_payload->>'end_date')::date, CURRENT_DATE),
           updated_at = now()
     WHERE id = p_proposal.medication_id
       AND user_id = p_proposal.patient_user_id;

    RETURN p_proposal.medication_id;
  END IF;

  UPDATE public.medications m
     SET name         = COALESCE(_payload->>'name', m.name),
         dosage       = COALESCE(_payload->>'dosage', m.dosage),
         frequency    = COALESCE(_payload->>'frequency', m.frequency),
         type         = COALESCE(_payload->>'type', m.type),
         instructions = COALESCE(_payload->>'instructions', m.instructions),
         start_date   = COALESCE((_payload->>'start_date')::date, m.start_date),
         end_date     = COALESCE((_payload->>'end_date')::date, m.end_date),
         refill_date  = COALESCE((_payload->>'refill_date')::date, m.refill_date),
         quantity     = COALESCE((_payload->>'quantity')::integer, m.quantity),
         prescriber   = COALESCE(_payload->>'prescriber', m.prescriber),
         pharmacy     = COALESCE(_payload->>'pharmacy', m.pharmacy),
         times_of_day = COALESCE(_payload->'times_of_day', m.times_of_day),
         updated_at   = now()
   WHERE m.id = p_proposal.medication_id
     AND m.user_id = p_proposal.patient_user_id;

  RETURN p_proposal.medication_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_medication_proposal(public.record_change_proposals)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_change_proposal(
  p_proposal_id uuid,
  p_accept boolean,
  p_note text DEFAULT NULL
)
RETURNS public.record_change_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _proposal public.record_change_proposals;
  _applied  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO _proposal
    FROM public.record_change_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such proposal';
  END IF;

  IF _proposal.patient_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the patient can answer a proposal about their record';
  END IF;

  IF _proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'That proposal was already %', _proposal.status;
  END IF;

  IF p_accept THEN
    _applied := public.apply_medication_proposal(_proposal);
  END IF;

  UPDATE public.record_change_proposals
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         responded_at = now(),
         response_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         applied_medication_id = _applied,
         updated_at = now()
   WHERE id = p_proposal_id
  RETURNING * INTO _proposal;

  INSERT INTO public.hipaa_audit_logs
    (user_id, action, resource_type, resource_id, patient_user_id, details)
  VALUES (
    _proposal.proposed_by_user_id,
    CASE WHEN p_accept THEN 'medication_proposal_accepted' ELSE 'medication_proposal_declined' END,
    'record_change_proposals',
    _proposal.id::text,
    _proposal.patient_user_id,
    jsonb_build_object(
      'kind', _proposal.kind,
      'answered_by', auth.uid(),
      'medication_id', _proposal.applied_medication_id
    )
  );

  RETURN _proposal;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.respond_to_change_proposal(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_change_proposal(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_change_proposal(
  p_proposal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.record_change_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _proposal public.record_change_proposals;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO _proposal
    FROM public.record_change_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such proposal';
  END IF;

  IF _proposal.proposed_by_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the clinician who proposed a change can withdraw it';
  END IF;

  IF _proposal.status <> 'pending' THEN
    RAISE EXCEPTION 'That proposal was already %', _proposal.status;
  END IF;

  UPDATE public.record_change_proposals
     SET status = 'withdrawn',
         responded_at = now(),
         response_note = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         updated_at = now()
   WHERE id = p_proposal_id
  RETURNING * INTO _proposal;

  RETURN _proposal;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.withdraw_change_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_change_proposal(uuid, text) TO authenticated;

DROP TRIGGER IF EXISTS trg_audit_change_proposal ON public.record_change_proposals;
CREATE TRIGGER trg_audit_change_proposal
AFTER INSERT ON public.record_change_proposals
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('change_proposed', 'patient_user_id');

ALTER VIEW public.my_retracted_documents SET (security_invoker = on);