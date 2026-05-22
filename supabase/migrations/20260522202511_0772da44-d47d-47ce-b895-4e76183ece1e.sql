
-- 1. care_alert_logs — explicit deny UPDATE/DELETE
DROP POLICY IF EXISTS "No updates to care alert logs" ON public.care_alert_logs;
DROP POLICY IF EXISTS "No deletes from care alert logs" ON public.care_alert_logs;
CREATE POLICY "No updates to care alert logs"
  ON public.care_alert_logs FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "No deletes from care alert logs"
  ON public.care_alert_logs FOR DELETE TO authenticated
  USING (false);

-- 2. provider_shares — add WITH CHECK to email-claim policy
DROP POLICY IF EXISTS "Clinicians can claim shares matching their email" ON public.provider_shares;
CREATE POLICY "Clinicians can claim shares matching their email"
  ON public.provider_shares FOR UPDATE TO authenticated
  USING (
    provider_email = public.get_current_user_email()
    AND clinician_user_id IS NULL
  )
  WITH CHECK (
    provider_email = public.get_current_user_email()
    AND clinician_user_id = auth.uid()
  );

-- 3. clinician_profiles — drop broad pending-records policy; add safe RPC
DROP POLICY IF EXISTS "Patients can view clinician profiles from pending records" ON public.clinician_profiles;

CREATE OR REPLACE FUNCTION public.get_clinician_basic_info(clinician_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  title text,
  practice_name text,
  avatar_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cp.user_id, cp.first_name, cp.last_name, cp.title, cp.practice_name, cp.avatar_url
  FROM public.clinician_profiles cp
  WHERE cp.user_id = ANY(clinician_ids)
    AND auth.uid() IS NOT NULL
    AND (
      cp.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.clinician_patient_records cpr
        WHERE cpr.clinician_user_id = cp.user_id
          AND cpr.patient_email = public.get_current_user_email()
          AND cpr.linked_user_id IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.provider_shares ps
        WHERE ps.clinician_user_id = cp.user_id
          AND ps.user_id = auth.uid()
          AND ps.is_active = true
      )
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_clinician_basic_info(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinician_basic_info(uuid[]) TO authenticated;

-- 4. practices — restrict full row to owner/admin; safe view for general members
DROP POLICY IF EXISTS "Practice members can view their practice" ON public.practices;
CREATE POLICY "Practice owners and admins view full practice"
  ON public.practices FOR SELECT TO authenticated
  USING (public.can_manage_practice(id));

DROP VIEW IF EXISTS public.practices_safe;
CREATE VIEW public.practices_safe
WITH (security_invoker=off) AS
SELECT
  p.id,
  p.name,
  p.address,
  p.city,
  p.state,
  p.zip_code,
  p.country,
  p.email,
  p.phone,
  p.logo_url,
  p.brand_logo_url,
  p.primary_color,
  p.brand_accent_color,
  p.is_active,
  p.member_limit,
  p.patient_limit,
  p.subscription_tier,
  p.subscription_status,
  p.created_by,
  p.created_at,
  p.updated_at
FROM public.practices p
WHERE public.is_practice_member(p.id);
REVOKE ALL ON public.practices_safe FROM PUBLIC, anon;
GRANT SELECT ON public.practices_safe TO authenticated;

-- 5. qhin_record_provenance — require 'documents' share permission for clinicians
DROP POLICY IF EXISTS "Clinicians view shared patient provenance" ON public.qhin_record_provenance;
CREATE POLICY "Clinicians view shared patient provenance with documents permission"
  ON public.qhin_record_provenance FOR SELECT TO authenticated
  USING (public.clinician_has_patient_permission(user_id, 'documents'));
