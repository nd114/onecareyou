-- Assignment-first access, as something a hospital turns on when it is ready.
--
-- `practice_members.can_view_all_patients` has defaulted to true since the
-- single-practice days, which at a hospital tenant means every clinician can
-- read every institution-shared patient without an assignment. The August 2026
-- review called that broader than the sharing model describes, and the decision
-- then was to keep it until department sub-admins — the people who would route
-- access — were live. They are now.
--
-- What this does NOT do is flip the default globally. At a hospital with
-- assignments not yet made, that would cut every clinician down to an empty
-- panel in one deploy: patients they are treating would disappear, and the only
-- way back is administrative work nobody has been told to do. Restricting access
-- before anyone can route it blocks care, which is the same objection that
-- deferred it the first time.
--
-- So it is a tenant switch, off by default, with the flip applied to existing
-- members at the moment a chief admin turns it on — deliberately, with the
-- consequences visible on the Coverage tab, which already counts the patients
-- nobody is assigned to.

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS assignment_first_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.practices.assignment_first_access IS
  'When true, a clinician at this practice sees only patients assigned to them; the tenant-wide view becomes an owner/admin right. Off by default: turning it on before assignments exist empties clinicians'' panels.';

-- ---------------------------------------------------------------------------
-- New members follow the tenant's choice
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.practice_member_default_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Owners and administrators keep the wide view: it is the administrative
  -- right the plan describes, and somebody has to be able to see the whole
  -- hospital to route it.
  IF NEW.role IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.practices p
     WHERE p.id = NEW.practice_id
       AND p.assignment_first_access
  ) THEN
    NEW.can_view_all_patients := false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_practice_member_default_scope ON public.practice_members;
CREATE TRIGGER trg_practice_member_default_scope
  BEFORE INSERT ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.practice_member_default_scope();

-- ---------------------------------------------------------------------------
-- Turning it on, and off
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.practice_set_assignment_first(
  _practice_id uuid,
  _enabled boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_changed integer;
BEGIN
  IF NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only the practice owner or an admin can change how access is scoped';
  END IF;

  UPDATE public.practices
     SET assignment_first_access = _enabled
   WHERE id = _practice_id;

  -- Apply it to the people already here. Leaving existing members on the old
  -- setting would make the switch mean "from now on", which is not what an
  -- administrator turning it on believes they have done.
  UPDATE public.practice_members
     SET can_view_all_patients = NOT _enabled
   WHERE practice_id = _practice_id
     AND role NOT IN ('owner', 'admin')
     AND can_view_all_patients IS DISTINCT FROM (NOT _enabled);

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  INSERT INTO public.hipaa_audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN _enabled THEN 'assignment_first_enabled' ELSE 'assignment_first_disabled' END,
    'practice',
    _practice_id::text,
    jsonb_build_object('members_changed', v_changed)
  );

  RETURN v_changed;
END;
$function$;

REVOKE ALL ON FUNCTION public.practice_set_assignment_first(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_set_assignment_first(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.practice_set_assignment_first(uuid, boolean) IS
  'Owner/admin only. Sets the tenant switch and applies it to existing non-admin members, returning how many changed. Audited both ways.';
