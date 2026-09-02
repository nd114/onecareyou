-- A signed note is a record, not a draft.
--
-- encounters.signed_at existed and meant nothing: the update policy is
-- (clinician_user_id = auth.uid()) with no reference to it, so the author could
-- silently rewrite a signed assessment and leave nothing behind but a changed
-- updated_at. Verified by doing it before writing this.
--
-- That is the difference between a clinical record and a text field. A signed
-- note is what the clinician attests they found and decided; if it can be
-- changed afterwards without trace, it cannot be relied on by the next clinician
-- who reads it, by the patient, or by anyone reviewing care after the fact.
--
-- The correct answer is not "lock it and refuse corrections" — clinicians do
-- need to correct notes. It is the addendum: the original stands, the correction
-- is appended, and both are attributed and timestamped. That is how paper
-- records worked for a century and why.

-- ---------------------------------------------------------------------------
-- 1. Freeze the clinical content of a signed note
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_signed_encounter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.signed_at IS NULL THEN
    -- Still a draft. Signing it is the one transition that sets signed_at.
    RETURN NEW;
  END IF;

  -- Retracting a note is legitimate and FHIR has a status for it. The content
  -- still does not change: the note stands, marked as entered in error, so a
  -- reader can see what was retracted rather than finding a gap.
  IF NEW.status = 'entered-in-error' AND OLD.status <> 'entered-in-error' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Whether the patient can see it is a sharing decision, not a clinical claim,
  -- and a clinician may reasonably change their mind about it after signing.
  IF NEW.shared_with_patient IS DISTINCT FROM OLD.shared_with_patient
     AND ROW(NEW.chief_complaint, NEW.subjective, NEW.objective, NEW.assessment, NEW.plan,
             NEW.visit_type, NEW.occurred_at, NEW.signed_at, NEW.status)
       IS NOT DISTINCT FROM
         ROW(OLD.chief_complaint, OLD.subjective, OLD.objective, OLD.assessment, OLD.plan,
             OLD.visit_type, OLD.occurred_at, OLD.signed_at, OLD.status) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Follow-up linkage is bookkeeping the app does after signing.
  IF NEW.follow_up_task_id IS DISTINCT FROM OLD.follow_up_task_id
     AND ROW(NEW.chief_complaint, NEW.subjective, NEW.objective, NEW.assessment, NEW.plan,
             NEW.signed_at, NEW.status)
       IS NOT DISTINCT FROM
         ROW(OLD.chief_complaint, OLD.subjective, OLD.objective, OLD.assessment, OLD.plan,
             OLD.signed_at, OLD.status) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF ROW(NEW.chief_complaint, NEW.subjective, NEW.objective, NEW.assessment, NEW.plan,
         NEW.visit_type, NEW.occurred_at, NEW.cpt_codes, NEW.icd_codes, NEW.scribe_transcript)
     IS DISTINCT FROM
     ROW(OLD.chief_complaint, OLD.subjective, OLD.objective, OLD.assessment, OLD.plan,
         OLD.visit_type, OLD.occurred_at, OLD.cpt_codes, OLD.icd_codes, OLD.scribe_transcript) THEN
    RAISE EXCEPTION
      'This note was signed on %. Signed notes cannot be edited — add an addendum instead.',
      to_char(OLD.signed_at, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Un-signing would let the whole protection be stepped around.
  IF NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'A note cannot be un-signed'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_signed_encounter ON public.encounters;
CREATE TRIGGER trg_protect_signed_encounter
  BEFORE UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.protect_signed_encounter();

COMMENT ON COLUMN public.encounters.signed_at IS
  'When the clinician attested to this note. Once set, the clinical content is frozen by '
  'trg_protect_signed_encounter — corrections go in encounter_addenda. Retraction is a status '
  'change to entered-in-error, which keeps the note visible rather than leaving a gap.';

-- ---------------------------------------------------------------------------
-- 2. Addenda: how a signed note is corrected
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.encounter_addenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encounter_addenda_body_not_blank CHECK (btrim(body) <> '')
);

CREATE INDEX IF NOT EXISTS idx_encounter_addenda_encounter
  ON public.encounter_addenda (encounter_id, created_at);

COMMENT ON TABLE public.encounter_addenda IS
  'Corrections and additions to a signed note. Append-only by design: an addendum that was '
  'wrong is corrected by another addendum, never by editing the first. Each is attributed and '
  'timestamped, which is the whole point.';

ALTER TABLE public.encounter_addenda ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.encounter_addenda TO authenticated;

-- Supabase's default privileges hand out the full set on any new table in
-- public, so withholding UPDATE and DELETE takes an explicit revoke.
REVOKE UPDATE, DELETE, TRUNCATE ON public.encounter_addenda FROM anon, authenticated;
REVOKE ALL ON public.encounter_addenda FROM anon;

-- An addendum is readable by whoever can read the note it belongs to. The
-- subquery inherits the encounter policies, so that is one rule, not two.
DROP POLICY IF EXISTS "Read addenda of a readable note" ON public.encounter_addenda;
CREATE POLICY "Read addenda of a readable note"
  ON public.encounter_addenda FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.encounters e WHERE e.id = encounter_id));

DROP POLICY IF EXISTS "Clinicians add addenda to notes they can reach" ON public.encounter_addenda;
CREATE POLICY "Clinicians add addenda to notes they can reach"
  ON public.encounter_addenda FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.encounters e
       WHERE e.id = encounter_id
         AND (e.clinician_user_id = auth.uid()
              OR public.clinician_has_patient_access(e.patient_user_id)
              OR public.institution_has_patient_access(e.patient_user_id))
    )
  );

COMMENT ON POLICY "Read addenda of a readable note" ON public.encounter_addenda IS
  'Deliberately defers to the encounter policies rather than repeating them: a patient who can '
  'see a shared visit summary sees its addenda too, and one who cannot see the note sees '
  'nothing of it.';

-- ---------------------------------------------------------------------------
-- 3. The patient sees corrections to summaries they were given
--
-- Patients read visit summaries through my_visit_summaries(), a SECURITY
-- DEFINER function, because they have no direct SELECT on encounters — that
-- broad policy was removed deliberately, since it exposed drafts and raw
-- transcripts. The consequence, found by testing rather than reasoning: the
-- addendum policy defers to the encounter policies, so a patient saw the
-- summary and none of its corrections.
--
-- A patient reading "all well" on a note that has since been corrected is being
-- shown something the record no longer says. Same door as the summary itself.
CREATE OR REPLACE FUNCTION public.my_visit_summary_addenda()
RETURNS TABLE (
  id uuid,
  encounter_id uuid,
  body text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.encounter_id, a.body, a.created_at
  FROM public.encounter_addenda a
  JOIN public.encounters e ON e.id = a.encounter_id
  WHERE e.patient_user_id = auth.uid()
    AND e.signed_at IS NOT NULL
    AND e.shared_with_patient = true
    AND e.status <> 'entered-in-error'
    AND auth.uid() IS NOT NULL
  ORDER BY a.created_at;
$$;

REVOKE ALL ON FUNCTION public.my_visit_summary_addenda() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_visit_summary_addenda() TO authenticated;

COMMENT ON FUNCTION public.my_visit_summary_addenda() IS
  'Addenda on the visit summaries a patient can see. Mirrors my_visit_summaries() exactly — '
  'signed, shared, not retracted — so a correction reaches whoever was given the thing it '
  'corrects, and never reaches anyone else. Author is deliberately not returned: which '
  'clinician wrote a correction is staff detail the summary does not carry either.';
