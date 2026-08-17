-- Simple Mode as a stored preference.
--
-- The simplified surface already exists at /assist, but it is a sub-tab inside
-- the Learn pillar — four taps in, and it does not persist. The people it is for
-- (recently discharged, elderly, low literacy, or a caregiver managing someone
-- else's care) are the least likely to go looking for it.
--
-- Making it a preference set at onboarding means it can be offered rather than
-- discovered, and it can change where the patient lands.
--
-- Deliberately just the flag for now. The deeper changes it should eventually
-- drive — pictures of the actual medication, time as icons rather than clock
-- values, read-aloud, one question per screen — are documented for a later pass
-- rather than built here.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS simple_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.simple_mode IS
  'Patient prefers the simplified surface: larger type, fewer choices per screen, and /assist as '
  'their home. Offered at onboarding and changeable in Settings. Set by the patient (or their '
  'caregiver) only — never inferred, and never set on their behalf by a clinician.';
