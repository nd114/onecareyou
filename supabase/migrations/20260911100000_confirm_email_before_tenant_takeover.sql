-- A tenant-owner invitation is claimed on an unconfirmed email
--
-- `accept_tenant_owner_invitation()` compares the invitation's address to
-- `get_current_user_email()`, which returns whatever `auth.users.email` holds
-- with no check that anybody proved they can read mail there. Signing up with
-- an address is not confirming it, and Supabase issues a session on sign-up
-- either way.
--
-- So: invite `cmo@hospital.org`, and before the real CMO opens their inbox, an
-- attacker registers that address, hits `/clinician/practice`, and calls this
-- function. The email string matches, the function has no other check, and
-- the attacker is now the tenant's Owner — clinician roster, patient routing,
-- institutional settings, all of it.
--
-- `confirmed_email()` (20260904143406) already exists for exactly this: it
-- returns the address only once `email_confirmed_at` is set, NULL otherwise.
-- It already gates claiming a pre-existing patient chart in
-- `clinician_patient_records`. Tenant ownership is a bigger prize than a
-- single chart and was never given the same gate — fixed here rather than by
-- changing `get_current_user_email()` itself, which other, lower-stakes reads
-- still use deliberately.

CREATE OR REPLACE FUNCTION public.accept_tenant_owner_invitation(_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.tenant_owner_invitations;
  _confirmed text;
BEGIN
  SELECT * INTO _inv FROM public.tenant_owner_invitations WHERE id = _invitation_id;

  IF _inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF _inv.status <> 'pending' OR _inv.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation is no longer valid';
  END IF;

  _confirmed := public.confirmed_email();
  IF _confirmed IS NULL THEN
    RAISE EXCEPTION 'Confirm your email address before accepting this invitation. Check your inbox for the confirmation link.';
  END IF;

  IF lower(_inv.email) <> _confirmed THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  INSERT INTO public.practice_members (
    practice_id, user_id, role, can_invite_patients, can_invite_members,
    can_manage_billing, can_view_all_patients, can_manage_settings, status, accepted_at
  ) VALUES (
    _inv.practice_id, auth.uid(), 'owner', true, true, true, true, true, 'active', now()
  )
  ON CONFLICT (practice_id, user_id) DO UPDATE
    SET role = 'owner', status = 'active', accepted_at = now();

  UPDATE public.tenant_owner_invitations
     SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), updated_at = now()
   WHERE id = _invitation_id;

  RETURN _inv.practice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tenant_owner_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_owner_invitation(uuid) TO authenticated;
