-- =============================================================
-- SECURITY FIX 1: Clinician guidance INSERT must verify active provider_share
-- =============================================================

-- Drop and recreate the INSERT policy to require active provider_share
DROP POLICY IF EXISTS "Clinicians can create guidance" ON public.clinician_guidance;

CREATE POLICY "Clinicians can create guidance with valid share"
ON public.clinician_guidance
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND clinician_has_patient_access(patient_user_id)
);

-- =============================================================
-- SECURITY FIX 2: Clinician alert rules INSERT must verify active provider_share
-- =============================================================

DROP POLICY IF EXISTS "Clinicians can create alert rules" ON public.clinician_alert_rules;

CREATE POLICY "Clinicians can create alert rules with valid share"
ON public.clinician_alert_rules
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND clinician_has_patient_access(patient_user_id)
);

-- =============================================================
-- SECURITY FIX 3: Alert logs INSERT should only allow clinician to create
-- (system-level creation should use service role, not user auth)
-- =============================================================

DROP POLICY IF EXISTS "System can create alert logs" ON public.alert_logs;

CREATE POLICY "Clinicians can create alert logs for their patients"
ON public.alert_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = clinician_user_id
  AND clinician_has_patient_access(patient_user_id)
);

-- =============================================================
-- SECURITY FIX 4: Restrict provider_shares SELECT to prevent email enumeration
-- Users should only see shares they created OR are confirmed clinician for
-- =============================================================

DROP POLICY IF EXISTS "Clinicians can view shares assigned to them" ON public.provider_shares;
DROP POLICY IF EXISTS "Users can view their own shares" ON public.provider_shares;

-- Only show shares to the patient who created them
CREATE POLICY "Users can view their own provider shares"
ON public.provider_shares
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Clinicians can ONLY see shares where they're explicitly assigned (not just email match)
CREATE POLICY "Clinicians can view shares they are assigned to"
ON public.provider_shares
FOR SELECT
TO authenticated
USING (auth.uid() = clinician_user_id);