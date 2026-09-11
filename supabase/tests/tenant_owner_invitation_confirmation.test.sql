-- A tenant-owner invitation must not be claimable on an unconfirmed email.
--
-- Before this fix, `accept_tenant_owner_invitation()` matched only the raw
-- email string. An attacker who registered the invited address — before its
-- real owner confirmed it — could call the function and become the tenant's
-- Owner. This asserts the three outcomes: unconfirmed fails, a different
-- address fails, and the genuine confirmed invitee succeeds.

BEGIN;

DO $$
DECLARE
  v_admin      uuid := '44444444-4444-4444-4444-444444444444';
  v_owner      uuid := '11111111-1111-1111-1111-111111111111';
  v_impostor   uuid := '33333333-3333-3333-3333-333333333333';
  v_stranger   uuid := '55555555-5555-5555-5555-555555555555';
  v_practice   uuid := gen_random_uuid();
  v_invitation uuid;
  v_count      int;
  v_failed     boolean;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    (v_admin,    'admin@onecare.you',    now()),
    -- The real invitee, but has not clicked the confirmation link yet.
    (v_owner,    'cmo@hospital.org',     NULL),
    -- Registered the same address ahead of the real owner. Also unconfirmed.
    (v_impostor, 'cmo@hospital.org',     NULL),
    -- A confirmed account, but the invitation was never sent to it.
    (v_stranger, 'someone-else@x.com',   now());

  INSERT INTO public.practices (id, name, created_by)
  VALUES (v_practice, 'Test Hospital', v_admin);

  INSERT INTO public.tenant_owner_invitations (practice_id, email, invited_by)
  VALUES (v_practice, 'cmo@hospital.org', v_admin)
  RETURNING id INTO v_invitation;

  -- ---------------------------------------------------------------
  -- The real invitee, unconfirmed: refused, not silently ignored
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  v_failed := false;
  BEGIN
    PERFORM public.accept_tenant_owner_invitation(v_invitation);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    IF SQLERRM NOT ILIKE '%confirm%' THEN
      RAISE EXCEPTION 'refused for the wrong reason: %', SQLERRM;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'an unconfirmed invitee accepted tenant ownership';
  END IF;
  RAISE NOTICE 'an unconfirmed invitee cannot accept: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- The impostor: same unconfirmed address, still refused
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_impostor::text, true);

  v_failed := false;
  BEGIN
    PERFORM public.accept_tenant_owner_invitation(v_invitation);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'an attacker holding the invited address, unconfirmed, seized the tenant';
  END IF;
  RAISE NOTICE 'an unconfirmed impostor cannot seize the tenant: t';

  SELECT count(*) INTO v_count FROM public.practice_members
   WHERE practice_id = v_practice AND user_id = v_impostor;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'the impostor was added to practice_members despite the refusal';
  END IF;
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- A confirmed account, wrong address entirely: refused
  -- ---------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);

  v_failed := false;
  BEGIN
    PERFORM public.accept_tenant_owner_invitation(v_invitation);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    IF SQLERRM NOT ILIKE '%different email%' THEN
      RAISE EXCEPTION 'refused for the wrong reason: %', SQLERRM;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'a confirmed but uninvited address accepted tenant ownership';
  END IF;
  RAISE NOTICE 'a confirmed but uninvited address is still refused: t';
  RESET ROLE;

  -- ---------------------------------------------------------------
  -- The real invitee, once confirmed: succeeds
  -- ---------------------------------------------------------------
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_owner;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);

  PERFORM public.accept_tenant_owner_invitation(v_invitation);

  SELECT count(*) INTO v_count FROM public.practice_members
   WHERE practice_id = v_practice AND user_id = v_owner AND role = 'owner' AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the confirmed, genuine invitee was not made owner';
  END IF;
  RAISE NOTICE 'the confirmed genuine invitee becomes owner: t';

  SELECT count(*) INTO v_count FROM public.tenant_owner_invitations
   WHERE id = v_invitation AND status = 'accepted' AND accepted_by = v_owner;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the invitation was not marked accepted';
  END IF;
  RESET ROLE;

  RAISE NOTICE 'ALL TENANT OWNER INVITATION CONFIRMATION TESTS PASSED';
END $$;

ROLLBACK;
