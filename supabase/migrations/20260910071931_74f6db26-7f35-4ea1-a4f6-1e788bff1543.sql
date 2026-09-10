CREATE POLICY "Clinicians can acknowledge their own alert logs"
ON public.alert_logs
FOR UPDATE
TO authenticated
USING (auth.uid() = clinician_user_id)
WITH CHECK (auth.uid() = clinician_user_id);

GRANT UPDATE ON public.alert_logs TO authenticated;