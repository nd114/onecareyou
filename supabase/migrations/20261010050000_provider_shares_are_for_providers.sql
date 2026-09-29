-- A provider share is a patient sharing with a clinician, and until now the
-- database did not know that.
--
-- Every gate on a provider_shares row asked two things: is the share live, and
-- is the caller the account that claimed it or the holder of the confirmed
-- email it was addressed to. Neither asks whether the caller is a clinician.
-- So a patient account whose confirmed address happened to match a share (a
-- doctor who is also somebody's patient under the same address, a family
-- member entered by mistake, a typo that landed on a real person) read that
-- patient's vitals, documents and identity, and could claim the share for
-- itself; get-shared-patient-data claimed for any signed-in account at all.
-- The app sent those accounts away from /clinician/patient/:inviteCode, which
-- made it look closed while the rows stayed open. By the founder's decision,
-- provider shares are for providers.
--
-- "Clinician" means what the app means by it (useClinicianProfile.isClinician):
-- the account has a clinician profile, an active practice membership, or a
-- pending invitation to own a tenant. is_clinician_account() is that test, in
-- one place, and every provider-share path now asks it.
--
-- The same helper fixes a regression in vital alerts. A rule may be created on
-- an unclaimed share addressed to the clinician's confirmed email, because
-- clinician_has_patient_access allows it, but check-vital-alerts only honoured
-- claimed shares, so a doctor who had not yet opened the invite link silently
-- stopped receiving alerts they had set up. Background jobs now ask
-- clinician_can_see_patient_as(), which is the same test as
-- clinician_has_patient_permission() evaluated for a named account rather than
-- the caller. The interactive gates are rewritten on top of it, so the two
-- cannot drift apart.
--
-- A rule that genuinely cannot see its patient any more should not simply stop
-- firing. on_share_ended archives rules and tells the clinician when a share is
-- switched off, but a share that lapses by expires_at never changes a column,
-- so nothing fired. archive_alert_rules_without_access() does the same archive
-- and the same bell notice for every rule whose clinician has lost access by
-- any route, and check-vital-alerts runs it before each pass.
--
-- Not changed, by decision: a rule still needs a direct share. Hospital
-- (institution) access does not let a clinician create alert rules, and this
-- migration does not extend it.
--
-- Worth knowing: a clinician profile is self-created, so this stops a patient
-- account from inheriting a share by address, not a person determined to call
-- themselves a clinician. Verification is the separate is_verified question.

-- ---------------------------------------------------------------------------
-- 1. Who is a clinician
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_clinician_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.clinician_profiles cp WHERE cp.user_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.practice_members pm
       WHERE pm.user_id = _user_id AND pm.status = 'active'
    )
    -- Someone invited to own a hospital has no profile until they make one,
    -- and the app already treats them as clinician-side (my_tenant_owner_invitations).
    OR EXISTS (
      SELECT 1
        FROM public.tenant_owner_invitations i
        JOIN auth.users u ON u.id = _user_id
       WHERE i.status = 'pending'
         AND i.expires_at > now()
         AND u.email_confirmed_at IS NOT NULL
         AND lower(i.email) = lower(u.email)
    )
  );
$$;

-- Asked about somebody else, this says who is a clinician; only the server
-- needs that.
REVOKE ALL ON FUNCTION public.is_clinician_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_clinician_account(uuid) TO service_role;

-- The caller's own answer, for policies that run as the caller. Executable by
-- anon as well: several of those policies are written for every role, and a
-- missing grant would turn an empty answer into an error. With no session it
-- is simply false.
CREATE OR REPLACE FUNCTION public.caller_is_clinician()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_clinician_account(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.caller_is_clinician() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_is_clinician() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. One test for "does this share open this patient to this clinician"
-- ---------------------------------------------------------------------------

/**
 * clinician_has_patient_permission(), asked about a named account instead of
 * auth.uid(). A NULL permission asks what clinician_has_patient_access asks:
 * any live share at all. For background jobs acting for a clinician who is
 * not present; the interactive gates below are defined through it.
 */
CREATE OR REPLACE FUNCTION public.clinician_can_see_patient_as(
  _clinician uuid,
  _patient uuid,
  _permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _clinician IS NOT NULL
     AND _patient IS NOT NULL
     AND public.is_clinician_account(_clinician)
     AND EXISTS (
       SELECT 1
         FROM public.provider_shares ps
         LEFT JOIN auth.users u
                ON u.id = _clinician
               AND u.email_confirmed_at IS NOT NULL
        WHERE ps.user_id = _patient
          AND ps.is_active = true
          AND (ps.expires_at IS NULL OR ps.expires_at > now())
          AND (
            ps.clinician_user_id = _clinician
            OR (u.email IS NOT NULL AND lower(ps.provider_email) = lower(u.email))
          )
          AND (_permission IS NULL OR public.share_grants(ps.permissions, _permission))
     );
$$;

-- Asking on behalf of any account is the server's business only: a signed-in
-- user could otherwise probe who shares with whom.
REVOKE ALL ON FUNCTION public.clinician_can_see_patient_as(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinician_can_see_patient_as(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.clinician_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.clinician_can_see_patient_as(auth.uid(), patient_user_id, NULL);
$$;

CREATE OR REPLACE FUNCTION public.clinician_has_patient_permission(patient_user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- A NULL key must not mean "any access" here, as it does for the helper.
  SELECT auth.uid() IS NOT NULL
     AND permission_key IS NOT NULL
     AND public.clinician_can_see_patient_as(auth.uid(), patient_user_id, permission_key);
$$;

-- Alert rules are archived by exactly the test that lets them be created.
CREATE OR REPLACE FUNCTION public.clinician_still_reaches_patient(_clinician uuid, _patient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.clinician_can_see_patient_as(_clinician, _patient, NULL);
$$;

REVOKE ALL ON FUNCTION public.clinician_still_reaches_patient(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Historical reach (messages written while a share was live) is also a
-- clinician's, not a patient account's that once matched an address.
CREATE OR REPLACE FUNCTION public.clinician_had_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR NOT public.caller_is_clinician() THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR lower(ps.provider_email) = public.confirmed_email()
      )
  )
  END
$$;

CREATE OR REPLACE FUNCTION public.clinician_had_patient_access_at(patient_user_id uuid, at_time timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR NOT public.caller_is_clinician() THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR lower(ps.provider_email) = public.confirmed_email()
      )
      -- message must have been created after access started
      AND at_time >= ps.created_at
      -- and before access ended (or while still active)
      AND at_time <= COALESCE(
            ps.revoked_at,
            CASE WHEN ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > now())
                 THEN now() ELSE ps.expires_at END,
            ps.created_at
          )
      -- ended relationships keep a bounded 90-day wind-down for read access
      AND (
        (ps.is_active AND (ps.expires_at IS NULL OR ps.expires_at > now()))
        OR COALESCE(ps.revoked_at, ps.expires_at, ps.created_at) > now() - interval '90 days'
      )
  )
  END
$$;

-- ---------------------------------------------------------------------------
-- 3. Policies that match a share by address or claim directly
-- ---------------------------------------------------------------------------

-- provider_shares: the patient sees their own rows; the clinician side sees
-- the rows addressed to or claimed by them, and only a clinician may claim.
DROP POLICY IF EXISTS "Clinicians can view shares by email or user_id" ON public.provider_shares;
CREATE POLICY "Clinicians can view shares by email or user_id"
ON public.provider_shares
FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    public.caller_is_clinician()
    AND (auth.uid() = clinician_user_id OR lower(provider_email) = public.confirmed_email())
  )
);

DROP POLICY IF EXISTS "Clinicians can view shares they are assigned to" ON public.provider_shares;
CREATE POLICY "Clinicians can view shares they are assigned to"
ON public.provider_shares
FOR SELECT TO authenticated
USING (auth.uid() = clinician_user_id AND public.caller_is_clinician());

DROP POLICY IF EXISTS "Clinicians can claim shares matching their email" ON public.provider_shares;
CREATE POLICY "Clinicians can claim shares matching their email"
ON public.provider_shares
FOR UPDATE
USING (
  lower(provider_email) = public.confirmed_email()
  AND clinician_user_id IS NULL
  AND public.caller_is_clinician()
)
WITH CHECK (
  lower(provider_email) = public.confirmed_email()
  AND clinician_user_id = auth.uid()
  AND public.caller_is_clinician()
);

DROP POLICY IF EXISTS "Clinicians can update their patient shares" ON public.provider_shares;
CREATE POLICY "Clinicians can update their patient shares"
ON public.provider_shares
FOR UPDATE
USING (auth.uid() = clinician_user_id AND public.caller_is_clinician())
WITH CHECK (auth.uid() = clinician_user_id AND public.caller_is_clinician());

-- document_shares
DROP POLICY IF EXISTS "Clinicians can view active shares for their patients" ON public.document_shares;
CREATE POLICY "Clinicians can view active shares for their patients"
ON public.document_shares
FOR SELECT
USING (
  is_active = true
  AND public.caller_is_clinician()
  AND EXISTS (
    SELECT 1
      FROM public.provider_shares ps
     WHERE ps.id = document_shares.provider_share_id
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
  )
);

-- health_documents
DROP POLICY IF EXISTS "Users and shared clinicians can view documents" ON public.health_documents;
CREATE POLICY "Users and shared clinicians can view documents"
ON public.health_documents
FOR SELECT
USING (
  retracted_at IS NULL
  AND (
    auth.uid() = user_id
    OR (
      public.caller_is_clinician()
      AND EXISTS (
        SELECT 1
          FROM public.document_shares ds
          JOIN public.provider_shares ps ON ds.provider_share_id = ps.id
         WHERE ds.document_id = health_documents.id
           AND ds.is_active = true
           AND ps.is_active = true
           AND (ps.expires_at IS NULL OR ps.expires_at > now())
           AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
      )
    )
  )
);

-- share_events: a clinician's view of the relationship history, and the
-- right to append to it.
DROP POLICY IF EXISTS "Clinicians can view their own relationship history" ON public.share_events;
CREATE POLICY "Clinicians can view their own relationship history"
ON public.share_events
FOR SELECT
USING (
  public.caller_is_clinician()
  AND (
    auth.uid() = clinician_user_id
    OR EXISTS (
      SELECT 1
        FROM public.provider_shares ps
       WHERE ps.id = share_events.share_id
         AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
    )
  )
);

DROP POLICY IF EXISTS "Participants can append share history" ON public.share_events;
CREATE POLICY "Participants can append share history"
ON public.share_events
FOR INSERT
WITH CHECK (
  auth.uid() = actor_user_id
  AND EXISTS (
    SELECT 1
      FROM public.provider_shares ps
     WHERE ps.id = share_events.share_id
       AND (
         ps.user_id = auth.uid()
         OR (
           public.caller_is_clinician()
           AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
         )
       )
  )
);

-- Storage: the files behind shared documents and avatars.
DROP POLICY IF EXISTS "Clinicians can view shared health documents" ON storage.objects;
CREATE POLICY "Clinicians can view shared health documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'health-documents'
  AND public.caller_is_clinician()
  AND EXISTS (
    SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
     WHERE hd.file_path = objects.name
       AND hd.retracted_at IS NULL
       AND ds.is_active = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
  )
);

DROP POLICY IF EXISTS "Clinicians can view shared lab reports" ON storage.objects;
CREATE POLICY "Clinicians can view shared lab reports"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'lab-reports'
  AND public.caller_is_clinician()
  AND EXISTS (
    SELECT 1
      FROM public.health_documents hd
      JOIN public.document_shares ds ON ds.document_id = hd.id
      JOIN public.provider_shares ps ON ps.id = ds.provider_share_id
     WHERE hd.file_path = objects.name
       AND hd.retracted_at IS NULL
       AND ds.is_active = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
  )
);

DROP POLICY IF EXISTS "Clinicians can view shared patient avatars" ON storage.objects;
CREATE POLICY "Clinicians can view shared patient avatars"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-avatars'
  AND public.caller_is_clinician()
  AND EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.provider_shares ps ON ps.user_id = p.user_id
     WHERE p.avatar_shared_with_clinicians = true
       AND ps.is_active = true
       AND (ps.expires_at IS NULL OR ps.expires_at > now())
       AND (ps.clinician_user_id = auth.uid() OR lower(ps.provider_email) = public.confirmed_email())
       AND (storage.foldername(objects.name))[1] = p.user_id::text
  )
);

-- ---------------------------------------------------------------------------
-- 4. Alert rules whose clinician can no longer see the patient
-- ---------------------------------------------------------------------------

/**
 * Archives every live alert rule whose clinician no longer reaches its patient
 * through a direct share, and tells them, once per clinician and patient, in
 * the same bell and the same words on_share_ended uses. Covers what that
 * trigger cannot see: a share passing its expires_at, and an account that has
 * stopped being a clinician. Service role only; check-vital-alerts calls it.
 */
CREATE OR REPLACE FUNCTION public.archive_alert_rules_without_access()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair     record;
  v_archived integer;
  v_total    integer := 0;
  v_share    record;
  v_name     text;
  v_message  text;
BEGIN
  FOR v_pair IN
    SELECT DISTINCT r.clinician_user_id, r.patient_user_id
      FROM public.clinician_alert_rules r
     WHERE r.archived_at IS NULL
       AND NOT public.clinician_can_see_patient_as(r.clinician_user_id, r.patient_user_id, NULL)
  LOOP
    -- Re-checked under the row locks, so a share restored in the meantime
    -- does not lose its rules.
    WITH locked AS (
      SELECT r.id
        FROM public.clinician_alert_rules r
       WHERE r.clinician_user_id = v_pair.clinician_user_id
         AND r.patient_user_id = v_pair.patient_user_id
         AND r.archived_at IS NULL
         FOR UPDATE
    )
    UPDATE public.clinician_alert_rules r
       SET archived_at = now(), is_active = false
      FROM locked
     WHERE r.id = locked.id
       AND NOT public.clinician_can_see_patient_as(v_pair.clinician_user_id, v_pair.patient_user_id, NULL);
    GET DIAGNOSTICS v_archived = ROW_COUNT;
    CONTINUE WHEN v_archived = 0;
    v_total := v_total + v_archived;

    CONTINUE WHEN NOT public.notification_allowed(v_pair.clinician_user_id, 'sharing_ended', 'in_app');

    -- The share that was theirs most recently, to say how it ended.
    SELECT ps.id, ps.is_active, ps.expires_at
      INTO v_share
      FROM public.provider_shares ps
      LEFT JOIN auth.users u ON u.id = v_pair.clinician_user_id AND u.email_confirmed_at IS NOT NULL
     WHERE ps.user_id = v_pair.patient_user_id
       AND (ps.clinician_user_id = v_pair.clinician_user_id
            OR (u.email IS NOT NULL AND lower(ps.provider_email) = lower(u.email)))
     ORDER BY COALESCE(ps.revoked_at, ps.expires_at, ps.created_at) DESC
     LIMIT 1;

    v_name := public.notice_patient_name(v_pair.patient_user_id);
    v_message := CASE
      WHEN v_share.id IS NOT NULL AND v_share.is_active AND v_share.expires_at <= now() THEN
        format('%s''s share with you expired on %s, so no further updates will be transmitted.',
               v_name, to_char(v_share.expires_at, 'FMDD Mon YYYY'))
      ELSE
        format('Sharing between you and %s has ended, so no further updates will be transmitted.', v_name)
    END;
    v_message := v_message || CASE
      WHEN v_archived = 1 THEN ' 1 alert rule you set for them has been archived.'
      ELSE format(' %s alert rules you set for them have been archived.', v_archived)
    END;

    INSERT INTO public.clinician_guidance_notifications (
      clinician_user_id, patient_user_id, notification_type, message, related_id
    ) VALUES (
      v_pair.clinician_user_id, v_pair.patient_user_id, 'share_ended', v_message, v_share.id
    );
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_alert_rules_without_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_alert_rules_without_access() TO service_role;
