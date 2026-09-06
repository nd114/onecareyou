-- Somewhere to remember that a patient has put the getting-started card away.
--
-- The clinician side has had a checklist since launch — four steps on Today,
-- dismissable, backed by clinician_profiles.onboarding_dismissed_at. Patients
-- had nothing: /onboarding collects a profile and then drops you on a
-- dashboard with no indication of what the app is for or what to do first.
--
-- profiles already carries onboarding_completed, onboarding_last_step and
-- onboarding_skipped, and all three belong to that profile wizard. Reusing one
-- of them would conflate "I finished the sign-up questions" with "I have
-- learned my way around", which are different facts about different moments.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS getting_started_dismissed_at timestamptz;

COMMENT ON COLUMN public.profiles.getting_started_dismissed_at IS
  'When the patient put the getting-started checklist away. Null means show it, '
  'subject to the steps not already being complete. Distinct from onboarding_*, '
  'which track the sign-up profile wizard.';
