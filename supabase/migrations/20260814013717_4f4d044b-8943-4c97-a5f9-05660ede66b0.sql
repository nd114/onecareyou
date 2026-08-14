-- 1. Enterprise inquiries: authenticated users must own their inquiry
DROP POLICY IF EXISTS "Users can create enterprise inquiries" ON public.enterprise_inquiries;
CREATE POLICY "Anonymous visitors can submit inquiries"
  ON public.enterprise_inquiries FOR INSERT TO anon
  WITH CHECK (clinician_user_id IS NULL);
CREATE POLICY "Signed-in users submit their own inquiries"
  ON public.enterprise_inquiries FOR INSERT TO authenticated
  WITH CHECK (clinician_user_id = auth.uid());

-- 2. Drug mappings: authenticated read only
DROP POLICY IF EXISTS "Anyone can read drug mappings" ON public.international_drug_mappings;
CREATE POLICY "Signed-in users can read drug mappings"
  ON public.international_drug_mappings FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.international_drug_mappings FROM anon;

-- 3. Revoke anon EXECUTE on SECURITY DEFINER functions that are not public surfaces
REVOKE EXECUTE ON FUNCTION public.admin_access_log_search(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_tenant(text, text, text, text, text, numeric, numeric, text, integer, integer, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_recent_signups(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_tenant_branding(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_tenant_contact(uuid, text, text, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_tenant_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_tenant_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_tenant_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clinician_had_patient_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_institution_basic_info(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_practice_storage_bytes(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_practice_tenant_info(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_storage_bytes(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.institution_has_patient_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_institution_slug_available(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_institution_slug(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_storage_ledger_dictation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_storage_ledger_document() FROM anon, authenticated;