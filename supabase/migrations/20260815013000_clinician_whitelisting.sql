-- Clinician whitelisting, bulk onboarding and offboarding.
--
-- Today a clinician joins a hospital only by being invited one at a time, and
-- the "practice name" on their own sign-up is free text nobody checks. At
-- hospital scale neither works: a hospital needs to admit a hundred staff at
-- once, recognise its own people automatically, and cut someone off the day
-- they leave.
--
-- Two ways to be recognised, either of which is enough:
--   1. an approved email domain on the tenant (everyone @lmc.org)
--   2. an explicit allowlist the hospital manages, one email per row
--
-- Anything else lands in a pending state for a human to approve. Affiliation
-- never creates a second profile — it tags the account the clinician already
-- has — and never, by itself, gives the hospital access to that clinician's
-- private patients. Institution access still comes only from a patient's own
-- share (sharing model §2).

-- ---------------------------------------------------------------------------
-- 1. Approved domains on the tenant
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS allowed_email_domains text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.practices.allowed_email_domains IS
  'Email domains whose holders are recognised as staff automatically, lowercase and without the @ '
  '(e.g. {lmc.org}). Anyone else requesting affiliation lands in pending_approval.';

-- ---------------------------------------------------------------------------
-- 2. Explicit allowlist
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_clinician_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  intended_role public.practice_role NOT NULL DEFAULT 'clinician',
  department_id uuid REFERENCES public.practice_departments(id) ON DELETE SET NULL,
  note text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinician_allowlist_email
  ON public.practice_clinician_allowlist(practice_id, lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_clinician_allowlist TO authenticated;
GRANT ALL ON public.practice_clinician_allowlist TO service_role;
ALTER TABLE public.practice_clinician_allowlist ENABLE ROW LEVEL SECURITY;

-- The allowlist is a staff list: tenant admins manage it, and a clinician may
-- see their own entry so "why am I pending?" is answerable.
DROP POLICY IF EXISTS "Tenant admins manage the clinician allowlist" ON public.practice_clinician_allowlist;
CREATE POLICY "Tenant admins manage the clinician allowlist"
ON public.practice_clinician_allowlist FOR ALL TO authenticated
USING (public.can_manage_practice(practice_id))
WITH CHECK (public.can_manage_practice(practice_id));

DROP POLICY IF EXISTS "Clinicians see their own allowlist entry" ON public.practice_clinician_allowlist;
CREATE POLICY "Clinicians see their own allowlist entry"
ON public.practice_clinician_allowlist FOR SELECT TO authenticated
USING (lower(email) = lower(public.get_current_user_email()));

-- ---------------------------------------------------------------------------
-- 3. Requesting affiliation
-- ---------------------------------------------------------------------------

/**
 * A clinician asks to be affiliated with a hospital by its code.
 *
 * Recognised (domain or allowlist) -> active immediately.
 * Not recognised                   -> pending_approval, no access at all:
 *                                     every access helper requires status =
 *                                     'active', so a pending row grants nothing.
 *
 * Returns the resulting status so the UI can say which happened.
 */
CREATE OR REPLACE FUNCTION public.request_practice_affiliation(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _practice_id uuid;
  _email text;
  _domain text;
  _allowed boolean := false;
  _role public.practice_role := 'clinician';
  _department_id uuid;
  _existing text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT id INTO _practice_id
  FROM public.practices
  WHERE lower(slug) = lower(trim(_slug))
    AND COALESCE(is_active, true) = true;

  IF _practice_id IS NULL THEN
    RAISE EXCEPTION 'No hospital found with that code';
  END IF;

  SELECT status INTO _existing
  FROM public.practice_members
  WHERE practice_id = _practice_id AND user_id = auth.uid();

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  _email := lower(public.get_current_user_email());
  _domain := split_part(_email, '@', 2);

  -- Explicit allowlist wins, and carries the role and department the hospital
  -- intended for this person.
  SELECT true, a.intended_role, a.department_id
    INTO _allowed, _role, _department_id
  FROM public.practice_clinician_allowlist a
  WHERE a.practice_id = _practice_id
    AND lower(a.email) = _email
  LIMIT 1;

  -- COALESCE matters: a SELECT INTO that matches nothing leaves _allowed NULL,
  -- and `IF NOT NULL` is not true, so a bare `IF NOT _allowed` would skip the
  -- domain check entirely and send recognised staff to pending approval.
  IF NOT COALESCE(_allowed, false) THEN
    SELECT COALESCE(_domain = ANY(p.allowed_email_domains), false) INTO _allowed
    FROM public.practices p WHERE p.id = _practice_id;
  END IF;

  INSERT INTO public.practice_members (practice_id, user_id, role, status)
  VALUES (
    _practice_id,
    auth.uid(),
    COALESCE(_role, 'clinician'),
    CASE WHEN COALESCE(_allowed, false) THEN 'active' ELSE 'pending_approval' END
  );

  -- Slot them straight into the department the allowlist named, so an approved
  -- import does not need a second pass.
  IF COALESCE(_allowed, false) AND _department_id IS NOT NULL THEN
    INSERT INTO public.practice_department_members (department_id, practice_id, user_id, is_lead)
    VALUES (_department_id, _practice_id, auth.uid(), false)
    ON CONFLICT (department_id, user_id) DO NOTHING;
  END IF;

  RETURN CASE WHEN COALESCE(_allowed, false) THEN 'active' ELSE 'pending_approval' END;
END;
$$;

REVOKE ALL ON FUNCTION public.request_practice_affiliation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_practice_affiliation(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Approving, rejecting, offboarding
-- ---------------------------------------------------------------------------

/**
 * Tenant admin decides on a pending request, or ends an existing affiliation.
 *
 * Offboarding is a status change, never a delete:
 *   - the clinician keeps their OneCare account and their private Care Circle
 *     patients, which were never the hospital's to take;
 *   - their institution access ends immediately, because every access helper
 *     requires an active membership;
 *   - everything they authored stays attributed to them, and the hospital keeps
 *     that record (sharing model §5).
 */
CREATE OR REPLACE FUNCTION public.set_practice_affiliation_status(
  _practice_id uuid,
  _user_id uuid,
  _status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a hospital owner or admin can change affiliations';
  END IF;

  IF _status NOT IN ('active', 'pending_approval', 'rejected', 'revoked') THEN
    RAISE EXCEPTION 'Unknown affiliation status: %', _status;
  END IF;

  -- The last owner cannot be offboarded, or the tenant becomes unmanageable.
  IF _status IN ('rejected', 'revoked') THEN
    IF EXISTS (
      SELECT 1 FROM public.practice_members
      WHERE practice_id = _practice_id AND user_id = _user_id AND role = 'owner'
    ) AND (
      SELECT count(*) FROM public.practice_members
      WHERE practice_id = _practice_id AND role = 'owner' AND status = 'active'
    ) <= 1 THEN
      RAISE EXCEPTION 'This is the last owner of the hospital — appoint another owner first';
    END IF;
  END IF;

  UPDATE public.practice_members
     SET status = _status,
         updated_at = now()
   WHERE practice_id = _practice_id
     AND user_id = _user_id;

  -- Leaving the hospital ends department duties too, including any lead role.
  IF _status IN ('rejected', 'revoked') THEN
    DELETE FROM public.practice_department_members
     WHERE practice_id = _practice_id AND user_id = _user_id;

    -- End open patient assignments. Rows are closed, not deleted, so the record
    -- of who held the patient and when survives.
    UPDATE public.practice_patient_assignments
       SET effective_to = now()
     WHERE practice_id = _practice_id
       AND clinician_user_id = _user_id
       AND effective_to IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_practice_affiliation_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practice_affiliation_status(uuid, uuid, text) TO authenticated;

/**
 * Pending requests for a tenant admin to act on, with why each one is pending.
 */
CREATE OR REPLACE FUNCTION public.practice_pending_affiliations(_practice_id uuid)
RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  role public.practice_role,
  requested_at timestamptz,
  on_allowlist boolean,
  domain_matches boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pm.user_id,
    pr.name,
    pr.email,
    pm.role,
    pm.created_at,
    EXISTS (
      SELECT 1 FROM public.practice_clinician_allowlist a
      WHERE a.practice_id = _practice_id AND lower(a.email) = lower(pr.email)
    ),
    split_part(lower(pr.email), '@', 2) = ANY(
      SELECT unnest(p.allowed_email_domains) FROM public.practices p WHERE p.id = _practice_id
    )
  FROM public.practice_members pm
  LEFT JOIN public.profiles pr ON pr.user_id = pm.user_id
  WHERE pm.practice_id = _practice_id
    AND pm.status = 'pending_approval'
    AND public.can_manage_practice(_practice_id)
  ORDER BY pm.created_at;
$$;

REVOKE ALL ON FUNCTION public.practice_pending_affiliations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_pending_affiliations(uuid) TO authenticated;

/**
 * Bulk import: hand it rows parsed from the hospital's staff CSV.
 *
 * Adds allowlist entries only. It deliberately does not create accounts or
 * memberships — a clinician who already has a OneCare account must keep it, and
 * the affiliation attaches to that account when they request it. Returns how
 * many rows were added versus already present.
 */
CREATE OR REPLACE FUNCTION public.bulk_allowlist_clinicians(
  _practice_id uuid,
  _entries jsonb
)
RETURNS TABLE(added integer, skipped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _added integer := 0;
  _skipped integer := 0;
  _row jsonb;
  _email text;
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a hospital owner or admin can import staff';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(_entries)
  LOOP
    _email := lower(trim(_row->>'email'));
    CONTINUE WHEN _email IS NULL OR _email = '' OR position('@' in _email) = 0;

    INSERT INTO public.practice_clinician_allowlist
      (practice_id, email, full_name, intended_role, note, added_by)
    VALUES (
      _practice_id,
      _email,
      NULLIF(trim(COALESCE(_row->>'name', '')), ''),
      COALESCE(NULLIF(_row->>'role', ''), 'clinician')::public.practice_role,
      NULLIF(trim(COALESCE(_row->>'note', '')), ''),
      auth.uid()
    )
    ON CONFLICT (practice_id, lower(email)) DO NOTHING;

    IF FOUND THEN _added := _added + 1; ELSE _skipped := _skipped + 1; END IF;
  END LOOP;

  RETURN QUERY SELECT _added, _skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_allowlist_clinicians(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_allowlist_clinicians(uuid, jsonb) TO authenticated;
