-- Fix the overly permissive INSERT policy - restrict to inserts from trigger (clinician_user_id must match auth.uid() OR from trigger context)
DROP POLICY IF EXISTS "System can insert notifications" ON public.clinician_guidance_notifications;

-- Patients can insert notifications for their clinicians (when they update guidance status)
CREATE POLICY "Patients can insert notifications for clinicians"
ON public.clinician_guidance_notifications
FOR INSERT
WITH CHECK (auth.uid() = patient_user_id);

-- Revoke public execute on the new trigger function and grant only to authenticated
REVOKE ALL ON FUNCTION public.notify_clinician_on_guidance_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_clinician_on_guidance_change() TO authenticated;