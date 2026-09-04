-- One vocabulary for what a share opens.
--
-- The two sharing pathways grew separately and ended up naming the same things
-- differently, which is not a cosmetic problem: a permissions object written
-- for one pathway grants nothing at all through the other, and one key was
-- quietly opening more than its name suggested.
--
-- What was live before this migration:
--
--   | Concept        | Table                  | Clinician key | Institution key |
--   | -------------- | ---------------------- | ------------- | --------------- |
--   | Readings       | vitals                 | vitals        | vitals          |
--   | Medicines      | medications            | meds          | medications     |
--   | Dose history   | schedule_entries       | adherence     | **medications** |
--   | Conditions     | profiles               | profile       | conditions      |
--   | Allergies      | profiles               | profile       | allergies       |
--   | The Vault      | health_documents       | documents     | documents       |
--   | Record origins | qhin_record_provenance | documents     | (none)          |
--
-- Two of those rows are bugs rather than naming differences.
--
-- **Dose history rode on 'medications' for institutions.** Whether somebody
-- has been taking their medicine is a different fact from what they have been
-- prescribed — it is a judgement about the patient rather than a record of
-- their care — and the clinician pathway has always asked for it separately.
-- A hospital granted 'medications' was getting both. That is narrowed here to
-- require 'adherence', which is the safe direction: a permission nobody
-- granted stops being honoured. Hospitals that need it will have to be granted
-- it, which is the point.
--
-- **'profile' was all-or-nothing on the clinician side.** The institution side
-- could already separate conditions from allergies, which is strictly better,
-- so the finer grain wins and 'profile' becomes an alias meaning both.
--
-- ## Nothing rewrites existing consent
--
-- Every live share keeps working, because the old keys are read as aliases
-- rather than migrated away. Rewriting rows that record what a person agreed
-- to is precisely the operation you do not want to get subtly wrong, and there
-- is no need: resolution is a function, and a function can accept both names.

-- ---------------------------------------------------------------------------
-- The one place that decides what a permissions object grants
-- ---------------------------------------------------------------------------
--
-- IMMUTABLE and taking only its arguments: it reads no tables and no session
-- state, so it is a pure question about a JSON document. That also lets the
-- planner treat it as a constant within a row.
--
-- ## Why this does not use `(permissions->>key)::boolean`
--
-- That is what both helpers did before, and it is wrong in a way nothing
-- surfaced. `->>` yields text, and Postgres accepts 'yes', 'on', 't' and '1'
-- as boolean literals — so `{"vitals": "yes"}` and `{"vitals": 1}` both
-- granted access, while the application's own `=== true` check showed the same
-- share as off. A share the interface calls closed and the database calls open
-- is the worst kind of disagreement to have about consent.
--
-- `jsonb_typeof` first, so only a real JSON `true` counts, which is exactly
-- what the TypeScript side means by granted.
CREATE OR REPLACE FUNCTION public.share_granted_flag(permissions jsonb, flag text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- COALESCE, not merely the conjunction: `jsonb_typeof` of a missing key is
  -- NULL, so without it an ungranted permission answers NULL rather than
  -- false. NULL is treated as false by a USING clause, which is why nothing
  -- surfaced this, but a three-valued permission function is a trap — the
  -- moment somebody writes NOT share_grants(...) it stops meaning what it
  -- reads as.
  SELECT COALESCE(
    permissions IS NOT NULL
      AND jsonb_typeof(permissions -> flag) = 'boolean'
      AND (permissions -> flag)::boolean,
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.share_grants(permissions jsonb, permission_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE((
  SELECT CASE
    -- Canonical names, and the older spellings that mean the same thing.
    WHEN permission_key = 'medications' THEN
      public.share_granted_flag(permissions, 'medications')
      OR public.share_granted_flag(permissions, 'meds')

    -- 'profile' was one grant covering both lists. It stays readable as such,
    -- so a share written before this migration keeps opening what it opened.
    WHEN permission_key IN ('conditions', 'allergies') THEN
      public.share_granted_flag(permissions, permission_key)
      OR public.share_granted_flag(permissions, 'profile')

    -- Asking for 'profile' itself means asking for both, so it is only granted
    -- when both are.
    WHEN permission_key = 'profile' THEN
      public.share_granted_flag(permissions, 'profile')
      OR (
        public.share_granted_flag(permissions, 'conditions')
        AND public.share_granted_flag(permissions, 'allergies')
      )

    ELSE public.share_granted_flag(permissions, permission_key)
  END), false);
$$;

REVOKE ALL ON FUNCTION public.share_granted_flag(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_granted_flag(jsonb, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.share_granted_flag(jsonb, text) IS
  'Whether one permission flag is literally JSON true. Not (x->>k)::boolean, which reads "yes", '
  '"on", "t" and 1 as true and so disagrees with the application''s === true.';

COMMENT ON FUNCTION public.share_grants(jsonb, text) IS
  'Whether a share''s permissions object grants a permission, resolving the older key names both '
  'pathways used before they were converged. The single place that decides; both permission '
  'helpers call it so they cannot answer differently.';

REVOKE ALL ON FUNCTION public.share_grants(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_grants(jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Both helpers now ask the same question
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinician_has_patient_permission(patient_user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.provider_shares ps
      WHERE ps.user_id = patient_user_id
        AND ps.is_active = true
        AND (ps.expires_at IS NULL OR ps.expires_at > now())
        AND (
          ps.clinician_user_id = auth.uid()
          OR ps.provider_email = public.get_current_user_email()
        )
        AND public.share_grants(ps.permissions, permission_key)
    )
    END
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

-- ---------------------------------------------------------------------------
-- Dose history is its own grant on both sides
-- ---------------------------------------------------------------------------
--
-- The institution policy asked for 'medications'. Whether somebody takes their
-- medicine is not what they were prescribed, and a share that named one should
-- never have opened the other.
DROP POLICY IF EXISTS "Institution team can view shared schedules" ON public.schedule_entries;
CREATE POLICY "Institution team can view shared schedules"
ON public.schedule_entries FOR SELECT TO authenticated
USING (public.institution_has_patient_permission(user_id, 'adherence'));

-- ---------------------------------------------------------------------------
-- Medications, under the canonical name on both sides
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinicians can view shared patient medications with permission" ON public.medications;
CREATE POLICY "Clinicians can view shared patient medications with permission"
ON public.medications FOR SELECT TO authenticated
USING (public.clinician_has_patient_permission(user_id, 'medications'));

DROP POLICY IF EXISTS "Institution team can view shared medications" ON public.medications;
CREATE POLICY "Institution team can view shared medications"
ON public.medications FOR SELECT TO authenticated
USING (public.institution_has_patient_permission(user_id, 'medications'));

-- ---------------------------------------------------------------------------
-- Conditions and allergies, separable on both sides
-- ---------------------------------------------------------------------------
--
-- Same shape as before, except a clinician share can now carry 'conditions'
-- without 'allergies' and the function honours it. 'profile' still means both.
CREATE OR REPLACE FUNCTION public.get_patient_clinical_profile(patient_ids uuid[])
RETURNS TABLE(
  user_id uuid,
  health_conditions jsonb,
  allergies jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    CASE
      WHEN p.user_id = auth.uid()
        OR public.clinician_has_patient_permission(p.user_id, 'conditions')
        OR public.institution_has_patient_permission(p.user_id, 'conditions')
      THEN p.health_conditions
      ELSE NULL
    END,
    CASE
      WHEN p.user_id = auth.uid()
        OR public.clinician_has_patient_permission(p.user_id, 'allergies')
        OR public.institution_has_patient_permission(p.user_id, 'allergies')
      THEN p.allergies
      ELSE NULL
    END
  FROM public.profiles p
  WHERE p.user_id = ANY(patient_ids)
    AND auth.uid() IS NOT NULL
    AND (
      p.user_id = auth.uid()
      OR public.clinician_has_patient_access(p.user_id)
      OR public.institution_has_patient_access(p.user_id)
    );
$$;

-- The profiles row itself still uses the coarse grant: the row carries more
-- than the two clinical lists, and RLS is row-level, so opening it on the
-- strength of 'conditions' alone would hand over everything else on it too.
-- The function above is how the two lists are read without that.
