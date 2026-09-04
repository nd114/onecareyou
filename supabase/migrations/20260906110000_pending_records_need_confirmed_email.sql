-- A pending record must not show its contents to someone who has not proved
-- the address is theirs.
--
-- "Patients can view pending records by email" granted SELECT on the whole row
-- to any signed-in user whose auth email matched patient_email — including
-- allergies, health_conditions, medications and the clinician's notes.
--
-- Two things wrong with that:
--
--   1. **RLS is row-level.** Once the row is readable, every column is. The
--      interface can choose not to render the clinical fields, but they have
--      already been sent to the browser, so choosing is not a control.
--
--   2. **It never checked the address was confirmed.** Whether Supabase
--      demands confirmation is a project setting the application cannot read.
--      If it is off, signing up as someone else's address is enough to read
--      their conditions and medications. The whole "your record, your call"
--      argument fails at that point.
--
-- Fixed at both ends: the policy now requires a confirmed address, and what a
-- patient sees before accepting comes from a function that returns only the
-- fields needed to recognise the record — never its clinical content.

-- ---------------------------------------------------------------------------
-- 0. The caller's confirmed address
-- ---------------------------------------------------------------------------
--
-- A policy expression runs with the privileges of the role doing the query,
-- and `authenticated` has no SELECT on auth.users — correctly, since that
-- table holds every account. So the check goes through a definer function
-- that returns one thing about the caller and nothing about anybody else.
CREATE OR REPLACE FUNCTION public.confirmed_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(u.email)
    FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.email_confirmed_at IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.confirmed_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmed_email() TO authenticated;

COMMENT ON FUNCTION public.confirmed_email() IS
  'The caller''s email address, only if they have confirmed it. Null otherwise. Exists because an '
  'RLS policy cannot read auth.users directly, and because whether confirmation is enforced at all '
  'is a project setting the application cannot see.';

-- ---------------------------------------------------------------------------
-- 1. The row is not readable until the address is proved
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Patients can view pending records by email" ON public.clinician_patient_records;
CREATE POLICY "Patients can view pending records by email"
  ON public.clinician_patient_records FOR SELECT
  TO authenticated
  USING (
    patient_email IS NOT NULL
    AND linked_user_id IS NULL
    AND lower(patient_email) = public.confirmed_email()
  );

COMMENT ON POLICY "Patients can view pending records by email" ON public.clinician_patient_records IS
  'A pending record is readable by the person whose CONFIRMED email it names. Without the '
  'confirmation check, signing up as somebody else''s address would be enough to read their record.';

-- Accepting or declining needs the same proof.
DROP POLICY IF EXISTS "Patients can accept or decline pending records" ON public.clinician_patient_records;
CREATE POLICY "Patients can accept or decline pending records"
  ON public.clinician_patient_records FOR UPDATE
  TO authenticated
  USING (
    patient_email IS NOT NULL
    AND lower(patient_email) = public.confirmed_email()
  );

-- ---------------------------------------------------------------------------
-- 2. What a person sees before they accept
-- ---------------------------------------------------------------------------
--
-- Only enough to recognise the record: who holds it, the name they have, and
-- masked contact details. If the answer turns out to be "that is not me",
-- everything returned here has already been shown to the wrong person, so
-- there must be nothing in it worth protecting.
CREATE OR REPLACE FUNCTION public.my_pending_clinician_records()
RETURNS TABLE (
  id uuid,
  clinician_user_id uuid,
  practice_id uuid,
  patient_name text,
  masked_email text,
  masked_phone text,
  data_sharing_model text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.clinician_user_id,
    r.practice_id,
    r.patient_name,
    -- First character, then the domain. Enough to confirm, not enough to learn.
    CASE WHEN r.patient_email IS NULL THEN NULL
         ELSE left(r.patient_email, 1)
              || repeat('•', greatest(length(split_part(r.patient_email, '@', 1)) - 1, 1))
              || '@' || split_part(r.patient_email, '@', 2)
    END,
    CASE WHEN r.patient_phone IS NULL
           OR length(regexp_replace(r.patient_phone, '\D', '', 'g')) < 4 THEN NULL
         ELSE repeat('•', greatest(length(regexp_replace(r.patient_phone, '\D', '', 'g')) - 4, 0))
              || right(regexp_replace(r.patient_phone, '\D', '', 'g'), 4)
    END,
    r.data_sharing_model,
    r.created_at
  FROM public.clinician_patient_records r
  WHERE r.linked_user_id IS NULL
    AND r.patient_email IS NOT NULL
    AND lower(r.patient_email) = public.confirmed_email()
$$;

REVOKE ALL ON FUNCTION public.my_pending_clinician_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_clinician_records() TO authenticated;

COMMENT ON FUNCTION public.my_pending_clinician_records() IS
  'Records waiting to be claimed by the caller, carrying only what is needed to recognise them. '
  'No clinical content: if the answer is "that is not me", everything returned has already been '
  'shown to the wrong person.';
