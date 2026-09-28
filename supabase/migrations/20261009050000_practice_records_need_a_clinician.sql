-- Two places that showed people to staff who had no reason to see them.
--
-- Practice-created patient records (P1-8 in the Sept 2026 audit).
--
-- A record a practice files in clinician_patient_records carries the
-- patient's conditions, medications and notes. "Practice staff read records
-- their practice created" asked may_manage_practice_patient_records(), which
-- is the right question for filing and inviting and the wrong one for
-- reading: it admits anyone holding can_invite_patients, and that defaults to
-- true for every member. Billing and front desk read every clinical record
-- the practice had created. And the policy never looked at the patient's
-- share, so once a patient had claimed the record and later revoked the
-- practice, the whole practice went on reading it.
--
-- Reading now asks may_read_practice_patient_record(): an active member of the
-- record's practice in a clinical role. While nobody has claimed the record
-- there is no patient consent to consult, and the practice's clinicians keep
-- it as they keep their own charts. Once linked_user_id is set, the record is
-- the patient's, and it is read on the same terms as the rest of what the
-- practice holds for them: a live, unsuspended share with this practice, and
-- the reader either sees all patients or is assigned to this one. That is
-- institution_has_clinical_access(), asked of the record's own practice
-- rather than of any practice the reader and patient happen to share, so a
-- share with one hospital does not open another hospital's record.
--
-- Filing and inviting are unchanged. Front desk still creates records for the
-- practice (the INSERT policy from 20261009010000 stays as it is) and reads
-- back the rows it filed itself, through "Clinicians can view their own
-- patient records". may_manage_practice_patient_records() keeps its
-- can_invite_patients branch for exactly that.
--
-- Platform-admin people lists (P2-10).
--
-- 20261006000000 set the rule for the founder command centre: individual
-- people surface only once searched for, by at least two characters. Three
-- functions it did not touch still listed people with no search at all:
--
--   * admin_recent_signups named every account on the platform, newest first.
--   * admin_access_log_search(NULL) listed who opened whose record, across
--     every tenant. A search on the action ("share_opened") did the same by
--     another name, so the search now matches people only: the actor's or
--     the subject's email or name.
--   * admin_audit_export exported the same pairs for any date range. It takes
--     a person to search for now, and the action filter narrows within that
--     rather than standing in for it.
--
-- Like 20261006000000, a short or missing search is not an error. Each
-- function answers with nothing, so the console's empty state reads as
-- "search to begin". admin_recent_signups and admin_audit_export gain a
-- _search parameter, so their old signatures are dropped rather than left
-- beside the new ones.

-- ---------------------------------------------------------------------------
-- P1-8
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.may_read_practice_patient_record(
  _practice_id uuid,
  _linked_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR _practice_id IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id = _practice_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND public.practice_role_is_clinical(pm.role)
      AND (
        _linked_user_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.practice_shares ps
          WHERE ps.practice_id = _practice_id
            AND ps.user_id = _linked_user_id
            AND ps.is_active = true
            AND ps.practice_suspended_at IS NULL
            AND (
              pm.can_view_all_patients = true
              OR public.is_assigned_to_patient_in_practice(auth.uid(), _linked_user_id, _practice_id)
            )
        )
      )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.may_read_practice_patient_record(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_read_practice_patient_record(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Practice staff read records their practice created" ON public.clinician_patient_records;
CREATE POLICY "Practice staff read records their practice created"
  ON public.clinician_patient_records
  FOR SELECT TO authenticated
  USING (
    practice_id IS NOT NULL
    AND public.may_read_practice_patient_record(practice_id, linked_user_id)
  );

-- ---------------------------------------------------------------------------
-- P2-10
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_recent_signups(integer);

CREATE OR REPLACE FUNCTION public.admin_recent_signups(
  _search text DEFAULT NULL,
  _limit integer DEFAULT 20
)
RETURNS TABLE(user_id uuid, email text, name text, is_clinician boolean, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _q text := nullif(trim(coalesce(_search, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN;
  END IF;

  IF _q IS NULL OR length(_q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         p.email::text,
         p.name,
         EXISTS (SELECT 1 FROM public.clinician_profiles cp WHERE cp.user_id = p.user_id),
         p.created_at
  FROM public.profiles p
  WHERE p.name ILIKE '%' || _q || '%'
     OR p.email ILIKE '%' || _q || '%'
  ORDER BY p.created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 20), 200));
END $$;

REVOKE ALL ON FUNCTION public.admin_recent_signups(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_signups(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_access_log_search(
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100
)
RETURNS TABLE(id uuid, action text, actor_email text, target_email text,
              resource_type text, resource_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _q text := nullif(trim(coalesce(_search, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN;
  END IF;

  IF _q IS NULL OR length(_q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id,
         l.action,
         actor.email::text,
         target.email::text,
         l.resource_type,
         l.resource_id,
         l.created_at
  FROM public.access_audit_logs l
  LEFT JOIN public.profiles actor ON actor.user_id = l.actor_user_id
  LEFT JOIN public.profiles target ON target.user_id = l.target_user_id
  WHERE actor.email ILIKE '%' || _q || '%'
     OR actor.name ILIKE '%' || _q || '%'
     OR target.email ILIKE '%' || _q || '%'
     OR target.name ILIKE '%' || _q || '%'
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 100), 200));
END $$;

REVOKE ALL ON FUNCTION public.admin_access_log_search(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_access_log_search(text, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_audit_export(timestamptz, timestamptz, text, integer);

CREATE OR REPLACE FUNCTION public.admin_audit_export(
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _action text DEFAULT NULL,
  _limit integer DEFAULT 1000,
  _search text DEFAULT NULL
)
RETURNS TABLE(id uuid, action text, resource_type text, actor_email text,
              patient_email text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _lim integer := greatest(1, least(coalesce(_limit, 1000), 5000));
  _start timestamptz := coalesce(_from, now() - interval '30 days');
  _end timestamptz := coalesce(_to, now());
  _act text := nullif(trim(coalesce(_action, '')), '');
  _q text := nullif(trim(coalesce(_search, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _q IS NULL OR length(_q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.action,
    l.resource_type,
    actor.email,
    subject.email,
    l.created_at
  FROM public.hipaa_audit_logs l
  LEFT JOIN auth.users actor ON actor.id = l.user_id
  LEFT JOIN auth.users subject ON subject.id = l.patient_user_id
  WHERE l.created_at >= _start
    AND l.created_at <= _end
    AND (_act IS NULL OR l.action ILIKE '%' || _act || '%')
    AND (actor.email ILIKE '%' || _q || '%' OR subject.email ILIKE '%' || _q || '%')
  ORDER BY l.created_at DESC
  LIMIT _lim;
END $$;

REVOKE ALL ON FUNCTION public.admin_audit_export(timestamptz, timestamptz, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_export(timestamptz, timestamptz, text, integer, text) TO authenticated, service_role;
