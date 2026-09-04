-- Make suspending a patient work, and make it mean something.
--
-- Two failures, and the second is the one that matters.
--
-- **The suspend button could not work.** The practice admin's only UPDATE
-- policy on `practice_shares` is "can only end shares to their practice", whose
-- WITH CHECK requires `is_active = false`. Setting `practice_suspended_at`
-- leaves `is_active` true, so every suspend and every restore failed with
-- "new row violates row-level security policy". Invisible to a SQL test run as
-- superuser, which is why the suite for this now runs as `authenticated`.
--
-- **Suspension gated two of six access paths.** `practice_has_patient_access`
-- and `practice_has_clinical_access` honoured it. The four `institution_has_*`
-- helpers — which gate vitals, medications, documents, guidance, appointments,
-- invoices and care plans — did not. So a suspended patient's record stayed
-- fully visible to institution staff while the interface said access was
-- suspended. A false confirmation about who can see a medical record is worse
-- than not offering the switch at all.

-- ---------------------------------------------------------------------------
-- 1. A way for an admin to write exactly the two suspension columns
-- ---------------------------------------------------------------------------
--
-- A function rather than a new UPDATE policy, deliberately. A policy can say
-- which *rows* an admin may update but not which *columns*, so any policy
-- permissive enough to allow this would also let a practice write
-- `practice_shares.is_active` — which is the patient's own switch, and the one
-- thing a practice must never be able to touch. Column grants could express
-- that, but combining column-level grants with RLS is easy to get subtly
-- wrong and hard to read later. A definer function that writes two named
-- columns is unambiguous.
CREATE OR REPLACE FUNCTION public.set_practice_suspension(
  _practice_id uuid,
  _patient_user_id uuid,
  _suspended boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'You do not manage this practice';
  END IF;

  UPDATE public.practice_shares
     SET practice_suspended_at = CASE WHEN _suspended THEN now() ELSE NULL END,
         practice_suspended_by = CASE WHEN _suspended THEN auth.uid() ELSE NULL END
   WHERE practice_id = _practice_id
     AND user_id = _patient_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That patient is not shared with this practice';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_practice_suspension(uuid, uuid, boolean) IS
  'The practice''s own switch for pausing its staff''s access to a patient. Writes only the two '
  'suspension columns: practice_shares.is_active is the patient''s decision and a practice must '
  'never be able to write it, which a row-scoped UPDATE policy could not have prevented.';

REVOKE ALL ON FUNCTION public.set_practice_suspension(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practice_suspension(uuid, uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Every institution path honours the suspension
-- ---------------------------------------------------------------------------
--
-- The join is already per-practice — `practice_members` is matched on the same
-- `practice_id` as the share — so adding the check denies access only for the
-- practice that suspended. A patient sharing with two hospitals keeps the
-- other one, which is the intended behaviour: this is one practice's switch,
-- not a global one.
CREATE OR REPLACE FUNCTION public.institution_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.institution_has_patient_permission(patient_user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
      AND (
        ps.share_all = true
        OR public.share_grants(ps.permissions, permission_key)
      )
  ) END;
$$;

-- The clinical pair is the same query with a "does this member do clinical
-- work" check folded in, so it needs the suspension check written out too
-- rather than inheriting it. Written from the live definition rather than
-- guessed: the first attempt at this migration assumed it delegated, and
-- Postgres rejected the replacement because the helper it invented does not
-- exist.
CREATE OR REPLACE FUNCTION public.institution_has_clinical_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND ps.practice_suspended_at IS NULL
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient_in_practice(auth.uid(), patient_user_id, ps.practice_id)
      )
  ) END;
$$;

-- This one does delegate, so it inherits the check from both sides. Left
-- unchanged apart from being restated here, so the whole set is readable in
-- one place.
CREATE OR REPLACE FUNCTION public.institution_has_clinical_permission(patient_user_id uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.institution_has_patient_permission(patient_user_id, _category)
     AND public.institution_has_clinical_access(patient_user_id);
$$;
