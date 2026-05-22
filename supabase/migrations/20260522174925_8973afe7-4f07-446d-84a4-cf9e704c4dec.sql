
-- 1) Realtime channel authorization (fixes realtime.messages no-RLS finding + health_documents broadcast finding)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe only to channels containing their uid" ON realtime.messages;
CREATE POLICY "Users subscribe only to channels containing their uid"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  position((auth.uid())::text in realtime.topic()) > 0
);

DROP POLICY IF EXISTS "Users broadcast only to channels containing their uid" ON realtime.messages;
CREATE POLICY "Users broadcast only to channels containing their uid"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  position((auth.uid())::text in realtime.topic()) > 0
);

-- 2) Stop broadcasting health_documents changes (nothing in the app subscribes to it)
ALTER PUBLICATION supabase_realtime DROP TABLE public.health_documents;

-- 3) Fix patient avatar sharing storage policy (was joining on profiles.name instead of objects.name)
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
        OR ps.provider_email = public.get_current_user_email()
      )
      AND (storage.foldername(storage.objects.name))[1] = (p.user_id)::text
  )
);

-- 4) Remove broad public listing on clinician-avatars (public URLs still work without RLS)
DROP POLICY IF EXISTS "Clinician avatars are publicly accessible" ON storage.objects;

-- 5) Lock down SECURITY DEFINER helpers from anon/public
REVOKE EXECUTE ON FUNCTION public.get_current_user_email() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_practice_role(uuid, public.practice_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_practice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_practice_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.practice_has_patient_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clinician_has_patient_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clinician_has_patient_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_practice_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deactivate_expired_medication() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_clinician_on_guidance_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_current_user_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_practice_role(uuid, public.practice_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_practice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_practice_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_has_patient_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinician_has_patient_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinician_has_patient_permission(uuid, text) TO authenticated;
