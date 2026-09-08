-- A change the patient accepts
--
-- Until now the consent dialog offered "Accept & Collaborate — both you and
-- your provider can update records going forward" and wrote `meds_write: true`
-- into `data_sharing_agreements.permissions`. Nothing anywhere reads that
-- column, and `medications` has no clinician INSERT, UPDATE or DELETE policy
-- at all. The patient was consenting to something that could not happen, which
-- makes two of the dialog's three options the same option.
--
-- The fix is not to grant clinicians write access to somebody's medication
-- list. It is to give the write a shape: a clinician proposes, the patient
-- accepts, and both halves stay in the record. That is the difference between
-- co-authorship and a second author who can overwrite the first.
--
-- Deliberately narrow. Additive clinical events — an encounter, a note, a
-- reading the clinician took — do not come through here and should not: those
-- are the clinic's contemporaneous account of care, the patient sees them and
-- can dispute them, and a record a patient can veto is not one anybody can
-- rely on afterwards. This table is only for changes to data that is the
-- patient's own. See docs/record-corrections-plan.md.

CREATE TABLE IF NOT EXISTS public.record_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id),

  -- One column rather than one table per kind. Medication is what exists now;
  -- the next kind is a value here and a branch in the apply function, not a
  -- second review surface for the patient to learn.
  kind text NOT NULL CHECK (kind IN ('medication_start', 'medication_change', 'medication_stop')),

  -- Null for a start, required for anything that names an existing row.
  medication_id uuid REFERENCES public.medications(id) ON DELETE CASCADE,

  -- Only the fields being proposed. Not a row to swap in — see apply_medication_proposal,
  -- which reads a fixed list of keys and ignores everything else.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Why. A proposal without a reason is a change order, and the patient is
  -- being asked to make a decision, not to rubber-stamp one.
  rationale text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  responded_at timestamptz,
  response_note text,

  -- What the acceptance actually produced. For a start this is the new row;
  -- for a change or stop it is the row that changed. It makes the proposal
  -- resolvable to its outcome years later without re-deriving anything.
  applied_medication_id uuid REFERENCES public.medications(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A clinician proposing a change to their own record is not a proposal.
  CONSTRAINT proposal_is_not_self CHECK (patient_user_id <> proposed_by_user_id),

  -- A change or a stop must say what it is changing; a start must not, because
  -- a "start" that names an existing row is a change wearing the wrong label
  -- and would apply through the wrong branch.
  CONSTRAINT proposal_names_its_target CHECK (
    (kind = 'medication_start' AND medication_id IS NULL)
    OR (kind IN ('medication_change', 'medication_stop') AND medication_id IS NOT NULL)
  ),

  -- A start or a change with nothing in it is a prompt to click Accept on
  -- nothing at all.
  CONSTRAINT proposal_has_content CHECK (
    kind = 'medication_stop' OR payload <> '{}'::jsonb
  ),

  CONSTRAINT proposal_answered_has_time CHECK (
    (status = 'pending' AND responded_at IS NULL)
    OR (status <> 'pending' AND responded_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.record_change_proposals IS
  'A clinician''s proposed change to data that belongs to the patient. Nothing is '
  'written to the patient''s record until they accept, and the proposal survives '
  'either answer, so a declined change is as much a part of the history as an '
  'accepted one.';

COMMENT ON COLUMN public.record_change_proposals.payload IS
  'The proposed field values. Read through a fixed key list in '
  'apply_medication_proposal(); keys outside that list are ignored rather than '
  'applied, so a proposal cannot reach a column the design did not intend.';

CREATE INDEX IF NOT EXISTS record_change_proposals_patient_idx
  ON public.record_change_proposals (patient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS record_change_proposals_proposer_idx
  ON public.record_change_proposals (proposed_by_user_id, status, created_at DESC);

-- One open proposal per medication per clinician. Without it, a clinician who
-- clicks twice leaves the patient two identical decisions and no way to tell
-- whether answering one answers the other.
CREATE UNIQUE INDEX IF NOT EXISTS record_change_proposals_one_open_idx
  ON public.record_change_proposals (proposed_by_user_id, medication_id)
  WHERE status = 'pending' AND medication_id IS NOT NULL;

ALTER TABLE public.record_change_proposals ENABLE ROW LEVEL SECURITY;

-- SELECT and INSERT only. Every status transition goes through a function
-- below, because "the patient accepts" is an operation with consequences —
-- a row gets written, an audit entry gets made — and a client that can set
-- status directly can accept a proposal without any of that happening.
--
-- The REVOKE is not decoration. Supabase applies its default privileges at
-- CREATE TABLE time, so a new table arrives with ALL granted to `authenticated`
-- and a later GRANT of a narrower set adds nothing. Without the REVOKE the only
-- thing standing between a clinician and `SET status = 'accepted'` is the
-- absence of an UPDATE policy — which denies the write silently rather than
-- refusing it, and would go on doing so right up until somebody adds an UPDATE
-- policy for an unrelated reason.
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

-- The proposer must currently hold a medications share with this patient. Not
-- "held one when they last saw them": a clinician whose access the patient
-- revoked yesterday cannot put a decision in front of them today.
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
    -- A proposal that names a medication must name one of this patient's.
    AND (
      medication_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.medications m
        WHERE m.id = medication_id AND m.user_id = patient_user_id
      )
    )
  );

COMMENT ON POLICY "Clinicians propose to patients who share with them" ON public.record_change_proposals IS
  'Proposing requires a live medications share, checked at insert time rather than '
  'trusted from whenever the clinician''s patient list was last loaded.';

-- ---------------------------------------------------------------------------
-- Applying an accepted proposal
-- ---------------------------------------------------------------------------
--
-- The fixed key list is the whole point of this function. A clinician's
-- proposal can change a dose, a frequency, an instruction — the things a
-- prescriber decides. It cannot reach `user_id`, `id`, `source`,
-- `external_id` or `family_member_id`, so accepting cannot move a medication
-- to another person, launder an imported row into an editable one, or collide
-- with a sending system's identity.
--
-- `source` is deliberately left alone. A non-manual source locks the patient
-- out of editing their own row (useMedications.guardImported), and a change
-- the patient chose to accept is theirs. Where the suggestion came from lives
-- in the proposal, which is a better place for it: it holds the reason and the
-- answer too.

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

  -- medication_change. COALESCE against the existing value, so a payload that
  -- mentions only the dose changes only the dose. A proposal is a diff, not a
  -- replacement row.
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

COMMENT ON FUNCTION public.apply_medication_proposal(public.record_change_proposals) IS
  'Internal. Called only by respond_to_change_proposal() after it has established '
  'that the caller is the patient and the proposal is still open.';

-- ---------------------------------------------------------------------------
-- The patient's answer
-- ---------------------------------------------------------------------------

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

  -- FOR UPDATE, so two taps on a slow connection cannot both apply.
  SELECT * INTO _proposal
    FROM public.record_change_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such proposal';
  END IF;

  -- Only the patient. Not the proposer, not another clinician sharing the
  -- record: the entire value of this table is that one specific person's
  -- answer is what applies the change.
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

  -- Recorded against the clinician who proposed it, because the audit question
  -- is what the clinician did to this record, and the answer is "proposed a
  -- change that was accepted" or "...that was declined".
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

COMMENT ON FUNCTION public.respond_to_change_proposal(uuid, boolean, text) IS
  'The patient accepts or declines. Accepting is the only path by which a '
  'clinician''s proposed change reaches the medications table, and it runs as '
  'the patient, not as the clinician.';

-- ---------------------------------------------------------------------------
-- Withdrawing a proposal
-- ---------------------------------------------------------------------------
--
-- A clinician who proposed the wrong thing needs to take it back rather than
-- leave the patient holding a decision they should not be asked to make. The
-- proposal stays, marked withdrawn — the same rule the rest of the record
-- follows.

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

-- The proposal itself is an event in the record, the same as guidance or an
-- encounter. Logged on insert so "a change was proposed" survives even if
-- nobody ever answers it.
DROP TRIGGER IF EXISTS trg_audit_change_proposal ON public.record_change_proposals;
CREATE TRIGGER trg_audit_change_proposal
AFTER INSERT ON public.record_change_proposals
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('change_proposed', 'patient_user_id');
