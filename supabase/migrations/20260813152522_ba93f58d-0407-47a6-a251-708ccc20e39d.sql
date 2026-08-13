CREATE POLICY "Read tenant logos" ON storage.objects FOR SELECT USING (bucket_id = 'tenant-logos');

CREATE POLICY "Admins manage tenant logos" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'tenant-logos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'tenant-logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Practice managers upload own tenant logo" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-logos'
  AND public.can_manage_practice(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Practice managers update own tenant logo" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND public.can_manage_practice(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Practice managers delete own tenant logo" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-logos'
  AND public.can_manage_practice(((storage.foldername(name))[1])::uuid)
);