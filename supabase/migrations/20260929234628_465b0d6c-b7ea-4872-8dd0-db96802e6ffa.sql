-- A practice_shares row is the patient's consent, so only the patient writes it.
--
-- The tenant functions trust any practice_shares row, revoked ones included,
-- because a revoked share is still the tenant's record of what its staff did
-- while it was live (20261008000000). That is only sound if the row cannot be
-- forged, and it could be. Anybody can create a practice and becomes its
-- owner; they share themselves with it; then, as its admin, they "end" that
-- share while rewriting user_id to a stranger. "Practice admins can only end
-- shares to their practice" pins is_active in its WITH CHECK and nothing else.
-- The stranger then appears as the forger's patient: name, email and phone
-- through get_patient_identity and practice_patient_overview, and their audit
-- trail at every other hospital through practice_audit_log.
--
-- provider_shares has had a guard for this since 20260817101000.
-- practice_shares never got one. It gets one here.
--
-- The same shape was open on staff rows. "Practice managers can add members"
-- let a manager insert an active membership for any user id, so the forger
-- could also enrol another hospital's clinician and read that clinician's
-- activity as their own staff's; the UPDATE policy let them rewrite a member
-- row's user_id to the same effect; and an owner could file a pending
-- membership for any uuid and read the name and email back out of the member
-- directory (P1-5 in the Sept 2026 audit). Joining a practice is now the
-- joiner's act: by affiliation request, or by accepting an invitation.
--
-- The invitation itself was writable by the invitee — the UPDATE policy
-- admitted the addressee to set any column — so role could be changed to
-- 'owner' before accepting. Accept and decline become functions that read
-- only what the manager wrote.

-- ---------------------------------------------------------------------------
-- 1. practice_shares: who may change which terms
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_practice_share_terms()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only a client's own statement is policed. Server-side callers (service
  -- role, cron, migrations) and definer functions, which carry their own
  -- authorisation, run as another role and may change anything.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Whose record and which practice are what the row *is*. Changing either is
  -- a different share, and the patient creates that one themselves.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.practice_id IS DISTINCT FROM OLD.practice_id THEN
    RAISE EXCEPTION 'A share belongs to one patient and one practice. End it and create another.'
      USING ERRCODE = '42501';
  END IF;
  NEW.created_at := OLD.created_at;

  -- The suspension is the practice's switch over its own staff, and moves only
  -- through set_practice_suspension(), which checks that the caller manages
  -- the practice. A direct write leaves it where it was — including the
  -- patient's, who has their own switch (is_active) and must not be able to
  -- flip the practice's.
  NEW.practice_suspended_at := OLD.practice_suspended_at;
  NEW.practice_suspended_by := OLD.practice_suspended_by;

  -- The patient may change the terms of their own consent.
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;

  -- Anyone else reached this row through a practice policy, and a practice
  -- never decides what the patient shares.
  IF NEW.share_all IS DISTINCT FROM OLD.share_all
     OR NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'Only the patient can change what they share'
      USING ERRCODE = '42501';
  END IF;
  NEW.connected_at := OLD.connected_at;

  IF OLD.is_active AND NOT NEW.is_active THEN
    -- Ending the share: the stamp names whoever actually ended it.
    NEW.revoked_by := auth.uid();
    NEW.revoked_at := COALESCE(NEW.revoked_at, now());
  ELSE
    NEW.is_active     := OLD.is_active;
    NEW.revoked_at    := OLD.revoked_at;
    NEW.revoked_by    := OLD.revoked_by;
    NEW.revoke_reason := OLD.revoke_reason;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_practice_share_terms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_practice_share_terms ON public.practice_shares;
CREATE TRIGGER trg_guard_practice_share_terms
  BEFORE UPDATE ON public.practice_shares
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_share_terms();

-- ---------------------------------------------------------------------------
-- 2. practice_members: nobody is enrolled without agreeing to it
-- ---------------------------------------------------------------------------
-- No client path needs a manager to insert someone else's row: affiliation
-- requests, owner invitations, tenant creation and the owner trigger are all
-- definer functions, and staff invitations are accepted below.
DROP POLICY IF EXISTS "Practice managers can add members" ON public.practice_members;

CREATE OR REPLACE FUNCTION public.guard_practice_member_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.id IS DISTINCT FROM OLD.id
          OR NEW.user_id IS DISTINCT FROM OLD.user_id
          OR NEW.practice_id IS DISTINCT FROM OLD.practice_id) THEN
    RAISE EXCEPTION 'A membership belongs to one person at one practice'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_practice_member_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_practice_member_identity ON public.practice_members;
CREATE TRIGGER trg_guard_practice_member_identity
  BEFORE UPDATE ON public.practice_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_practice_member_identity();

-- ---------------------------------------------------------------------------
-- 3. Staff invitations: accepted and declined on the manager's terms
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Practice managers can update invitations" ON public.practice_invitations;
CREATE POLICY "Practice managers can update invitations"
  ON public.practice_invitations
  FOR UPDATE TO authenticated
  USING (public.can_manage_practice(practice_id))
  WITH CHECK (public.can_manage_practice(practice_id));

CREATE OR REPLACE FUNCTION public.accept_practice_invitation(_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv public.practice_invitations;
  _confirmed text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT * INTO _inv FROM public.practice_invitations WHERE id = _invitation_id FOR UPDATE;

  -- Same answer for "no such invitation" and "not yours", so the function is
  -- not a way to learn which ids exist.
  _confirmed := public.confirmed_email();
  IF _inv.id IS NULL OR _confirmed IS NULL OR lower(_inv.email) <> _confirmed THEN
    RAISE EXCEPTION 'Invitation not found. It may have been sent to a different, or unconfirmed, email address.';
  END IF;

  IF _inv.status <> 'pending' OR _inv.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation is no longer valid';
  END IF;

  INSERT INTO public.practice_members (practice_id, user_id, role, invited_by, invited_at, status, accepted_at)
  VALUES (_inv.practice_id, auth.uid(), _inv.role, _inv.invited_by, _inv.created_at, 'active', now())
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        invited_by = EXCLUDED.invited_by,
        status = 'active',
        accepted_at = now(),
        updated_at = now();

  UPDATE public.practice_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = _invitation_id;

  RETURN _inv.practice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_practice_invitation(_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  UPDATE public.practice_invitations
     SET status = 'declined', declined_at = now()
   WHERE id = _invitation_id
     AND status = 'pending'
     AND lower(email) = public.confirmed_email();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_practice_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_practice_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_practice_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_practice_invitation(uuid) TO authenticated;