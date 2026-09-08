-- Authorized hospital staff can create patient records, and how someone came
-- onboard is recorded once.
--
-- Two problems, and they are the same problem.
--
-- 1. `clinician_patient_records` — the profiles staff create for people not yet
--    on OneCare — is scoped to the clinician who wrote the row. A hospital
--    administrator cannot see them at all, so the Coverage tab reports on
--    platform patients only, and a colleague covering a shift cannot open a
--    record their practice created.
--
-- 2. There is no durable answer to "how did this person come onboard". The
--    record carries `practice_id` until it is claimed; after claiming, the
--    patient is an ordinary OneCare account and the introduction is gone. That
--    matters commercially — the revenue split with an institution that brings a
--    paying patient rests on it — and it matters clinically, because "your
--    hospital set this up for you" is a different consent story from "you signed
--    up yourself".
--
-- THE IDENTITY RULE, stated because it is easy to get wrong:
--
--   A person has exactly ONE OneCare identity — their `auth.users.id`. The
--   pre-claim row in `clinician_patient_records` has an id of its own, but that
--   is the id OF A RECORD, not a second identity for the person. Nothing else
--   may mint one. A tenant wanting its own reference for a patient stores it as
--   an attribute (`external_mrn`), never as a competing key.
--
--   The alternative — a OneCare id and a tenant id for the same human — is how
--   a record ends up merged wrongly, or not merged at all, and how a person
--   ends up billed twice or attributed to nobody.

-- ---------------------------------------------------------------------------
-- 1. Provenance, written once
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_via_practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_source text
    CHECK (onboarding_source IN ('self', 'practice_record', 'practice_import', 'practice_invite')),
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

COMMENT ON COLUMN public.profiles.onboarded_via_practice_id IS
  'The practice that introduced this person to OneCare, if one did. Written once when a practice-created record is claimed and immutable thereafter — it is the basis of revenue attribution and of what the patient was told at sign-up.';

-- Immutable once set. An attribution that can be rewritten is not an
-- attribution; it is a claim by whoever edited last.
CREATE OR REPLACE FUNCTION public.freeze_onboarding_provenance()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.onboarded_via_practice_id IS NOT NULL
     AND NEW.onboarded_via_practice_id IS DISTINCT FROM OLD.onboarded_via_practice_id THEN
    RAISE EXCEPTION 'How a patient came onboard cannot be changed once recorded';
  END IF;
  IF OLD.onboarding_source IS NOT NULL
     AND NEW.onboarding_source IS DISTINCT FROM OLD.onboarding_source THEN
    RAISE EXCEPTION 'How a patient came onboard cannot be changed once recorded';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_freeze_onboarding_provenance ON public.profiles;
CREATE TRIGGER trg_freeze_onboarding_provenance
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.freeze_onboarding_provenance();

-- ---------------------------------------------------------------------------
-- 2. A tenant's own reference is an attribute, not a key
-- ---------------------------------------------------------------------------

ALTER TABLE public.clinician_patient_records
  ADD COLUMN IF NOT EXISTS external_mrn text;

COMMENT ON COLUMN public.clinician_patient_records.external_mrn IS
  'The hospital''s own medical record number for this person. An attribute for reconciliation, never a key: OneCare has one identity per person and this is not it.';

CREATE INDEX IF NOT EXISTS idx_clinician_patient_records_mrn
  ON public.clinician_patient_records(practice_id, external_mrn)
  WHERE external_mrn IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Authorized staff, not only the author
-- ---------------------------------------------------------------------------

-- Who at a practice may create and read records it made. Deliberately not
-- "any member": a receptionist books people in and a biller does not need a
-- clinical record. This mirrors practice_role_is_clinical plus the explicit
-- invite capability, which is what "authorized" has meant everywhere else here.
CREATE OR REPLACE FUNCTION public.may_manage_practice_patient_records(_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = _practice_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.role IN ('owner', 'admin', 'sub_admin')
        OR public.practice_role_is_clinical(pm.role)
        OR COALESCE(pm.can_invite_patients, false)
      )
  );
$function$;

DROP POLICY IF EXISTS "Practice staff read records their practice created" ON public.clinician_patient_records;
CREATE POLICY "Practice staff read records their practice created"
  ON public.clinician_patient_records FOR SELECT
  USING (
    practice_id IS NOT NULL
    AND public.may_manage_practice_patient_records(practice_id)
  );

DROP POLICY IF EXISTS "Practice staff create records for their practice" ON public.clinician_patient_records;
CREATE POLICY "Practice staff create records for their practice"
  ON public.clinician_patient_records FOR INSERT
  WITH CHECK (
    practice_id IS NOT NULL
    AND clinician_user_id = auth.uid()
    AND public.may_manage_practice_patient_records(practice_id)
  );

DROP POLICY IF EXISTS "Practice staff update records their practice created" ON public.clinician_patient_records;
CREATE POLICY "Practice staff update records their practice created"
  ON public.clinician_patient_records FOR UPDATE
  USING (
    practice_id IS NOT NULL
    AND public.may_manage_practice_patient_records(practice_id)
    -- A claimed record belongs to the patient. Staff may correct a record
    -- nobody has taken over; once it is linked, changes go through the
    -- patient's own record and their sharing choices.
    AND linked_user_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- 4. Claiming a record records how the person came onboard
-- ---------------------------------------------------------------------------
--
-- A trigger rather than a line in the consent dialog. The client already sets
-- `linked_user_id` and `invitation_status` when a patient accepts; adding a
-- third write there makes attribution depend on a client remembering, and a
-- client that forgets produces a patient the institution introduced and cannot
-- be shown to have introduced.

CREATE OR REPLACE FUNCTION public.record_onboarding_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.linked_user_id IS NULL OR OLD.linked_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.practice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only if nothing is recorded yet: the first institution to introduce
  -- somebody is the one that introduced them, and a second record claimed
  -- later does not rewrite that.
  UPDATE public.profiles p
     SET onboarded_via_practice_id = NEW.practice_id,
         onboarding_source = CASE
           WHEN NEW.data_sharing_model = 'imported' THEN 'practice_import'
           WHEN NEW.invitation_status = 'accepted' THEN 'practice_record'
           ELSE 'practice_record'
         END,
         onboarded_at = now()
   WHERE p.user_id = NEW.linked_user_id
     AND p.onboarded_via_practice_id IS NULL;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_record_onboarding_provenance ON public.clinician_patient_records;
CREATE TRIGGER trg_record_onboarding_provenance
  AFTER UPDATE ON public.clinician_patient_records
  FOR EACH ROW EXECUTE FUNCTION public.record_onboarding_provenance();

COMMENT ON FUNCTION public.record_onboarding_provenance() IS
  'Stamps profiles.onboarded_via_practice_id when a practice-created record is claimed. First introduction wins; the freeze trigger stops it being rewritten afterwards.';

-- ---------------------------------------------------------------------------
-- 5. A claimed record is the patient's, on every path
-- ---------------------------------------------------------------------------
--
-- Adding the policy above did not restrict anything: RLS policies are ORed, so
-- "Clinicians can update their own patient records" — written when the author
-- was the only actor — still let the creating clinician edit a record after the
-- patient had taken it over. Caught by the test asserting the opposite, which
-- is the whole reason for writing that assertion.
--
-- Once a record is claimed the patient owns it. Corrections after that go
-- through the clinical record and the patient's own sharing choices, which is
-- where a change to somebody's own data belongs.

DROP POLICY IF EXISTS "Clinicians can update their own patient records" ON public.clinician_patient_records;

CREATE POLICY "Clinicians update their own unclaimed patient records"
  ON public.clinician_patient_records FOR UPDATE
  USING (auth.uid() = clinician_user_id AND linked_user_id IS NULL)
  WITH CHECK (auth.uid() = clinician_user_id);
