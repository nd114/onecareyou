-- A patient's photo is shared on a confirmed email, like everything else.
--
-- "Clinicians can view shared patient avatars" (20260522174925) matched a
-- pending provider share by
--
--   ps.provider_email = public.get_current_user_email()
--
-- get_current_user_email() returns the caller's address whether or not they
-- ever proved they own it. Every share policy moved to confirmed_email() in
-- 20260904143406 and 20261003000000 for exactly this reason: anyone can sign
-- up with a clinician's address, never confirm it, and match the invitation
-- that was meant for them. This policy was missed.
--
-- It is not exploitable today, and only by luck: the EXISTS runs under the
-- caller's RLS on provider_shares, and that table's SELECT policy already
-- requires confirmed_email(), so an unconfirmed account never sees the pending
-- share row. The photo policy should not depend on another table's policy
-- staying strict, so it states the requirement itself.
--
-- confirmed_email() is lower-cased, so the share's address is compared
-- lower-cased too, the same way the share policies do it.

DROP POLICY IF EXISTS "Clinicians can view shared patient avatars" ON storage.objects;
CREATE POLICY "Clinicians can view shared patient avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-avatars'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.provider_shares ps ON ps.user_id = p.user_id
    WHERE p.avatar_shared_with_clinicians = true
      AND ps.is_active = true
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR lower(ps.provider_email) = public.confirmed_email()
      )
      AND (storage.foldername(storage.objects.name))[1] = (p.user_id)::text
  )
);
