-- A status nobody recognises is not consent.
--
-- `clinician_patient_records.invitation_status` and `.data_sharing_model` are
-- both plain text with a default and no CHECK, so any value can land in them —
-- from an import, a later migration, a typo in a hook. The clinician's screen
-- rendered the invitation badge with a binary fallback: "Invited" for exactly
-- 'invited', and "Accepted" for everything else. An unrecognised value was
-- therefore shown to a clinician as consent the patient had given.
--
-- The client side of that is fixed in managed-record-labels.ts. This is the
-- other half: the column only accepts the words the application knows, so a
-- future write cannot reintroduce the state the badge had to guess about.

-- ---------------------------------------------------------------------------
-- 1. Anything outside the vocabulary becomes the state that claims the least.
-- ---------------------------------------------------------------------------
--
-- Not a silent correction: an unknown invitation status is, by definition, not
-- one we can present as agreement, and 'not_invited' is the only value that
-- asserts nothing about what the patient has done. The count is raised so a
-- deploy that touches rows says so.
DO $$
DECLARE moved integer;
BEGIN
  UPDATE public.clinician_patient_records
     SET invitation_status = 'not_invited'
   WHERE invitation_status IS NULL
      OR invitation_status NOT IN ('not_invited', 'invited', 'accepted', 'declined');
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved > 0 THEN
    RAISE NOTICE 'invitation_status: % row(s) held a value outside the vocabulary and were reset to not_invited', moved;
  END IF;

  UPDATE public.clinician_patient_records
     SET data_sharing_model = 'clinician_managed'
   WHERE data_sharing_model IS NULL
      OR data_sharing_model NOT IN ('clinician_managed', 'collaborative', 'view_only');
  GET DIAGNOSTICS moved = ROW_COUNT;
  IF moved > 0 THEN
    RAISE NOTICE 'data_sharing_model: % row(s) held a value outside the vocabulary and were reset to clinician_managed', moved;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The vocabulary, in the database.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinician_patient_records
  DROP CONSTRAINT IF EXISTS clinician_patient_records_invitation_status_check;
ALTER TABLE public.clinician_patient_records
  ADD CONSTRAINT clinician_patient_records_invitation_status_check
  CHECK (invitation_status IN ('not_invited', 'invited', 'accepted', 'declined'));

ALTER TABLE public.clinician_patient_records
  DROP CONSTRAINT IF EXISTS clinician_patient_records_data_sharing_model_check;
ALTER TABLE public.clinician_patient_records
  ADD CONSTRAINT clinician_patient_records_data_sharing_model_check
  CHECK (data_sharing_model IN ('clinician_managed', 'collaborative', 'view_only'));

COMMENT ON COLUMN public.clinician_patient_records.invitation_status IS
  'not_invited | invited | accepted | declined. Only accepted means the patient agreed.';
COMMENT ON COLUMN public.clinician_patient_records.data_sharing_model IS
  'clinician_managed | collaborative | view_only. Labels live in src/lib/managed-record-labels.ts.';
