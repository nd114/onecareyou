-- Reconcile two columns where the repository and the live database disagree.
--
-- Found while chasing two "could not find the column in the schema cache"
-- errors reported from the live site. Comparing the generated Supabase types
-- (which reflect production) against a replay of every migration in this repo
-- turned up exactly two differences, in opposite directions.
--
-- 1. profiles.simple_mode — in the repo, NOT in production.
--
--    20260817090000_simple_mode_preference.sql was never applied. That is not
--    cosmetic: src/pages/Onboarding.tsx writes simple_mode in the same update
--    as everything else, and it serves both first-run onboarding and the "Edit
--    Your Health Profile" page. With the column missing, the whole update is
--    rejected, so a new patient cannot finish onboarding and an existing one
--    cannot edit their profile at all.
--
--    Re-issued here under a current timestamp rather than relying on the older
--    file being picked up: whatever the migration history believes about
--    20260817090000, this one has not run anywhere. Both are IF NOT EXISTS, so
--    applying either or both is safe.
--
-- 2. health_documents.folder — in production, NOT in the repo.
--
--    Added directly to the database when Vault folders were built. Production
--    is fine; a database rebuilt from this repository would not be, and Vault
--    folders would fail there. Added so the repo can reproduce production.
--
-- Nothing here changes behaviour on a database that already has both columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS simple_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.simple_mode IS
  'Patient prefers the simplified surface: larger type, fewer choices per screen. Offered at '
  'onboarding and changeable in Settings. Set by the patient (or their caregiver) only — never '
  'inferred, and never set on their behalf by a clinician.';

ALTER TABLE public.health_documents
  ADD COLUMN IF NOT EXISTS folder text;

COMMENT ON COLUMN public.health_documents.folder IS
  'Optional folder the patient filed this document under in their Vault. Null means unfiled.';
