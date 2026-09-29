-- An alert rule watches a patient's vitals, so it needs a share that grants
-- vitals.
--
-- Creating a rule asked only clinician_has_patient_access(), which is true for
-- any live share whatever it grants. A clinician whose patient shared
-- medications but not vitals could set "tell me if systolic goes over 160" and
-- be told it was saved; check-vital-alerts then skipped the rule on every run,
-- because the share never granted vitals, and never archived it either,
-- because access had not gone. A rule that can never fire, with nothing saying
-- so, is worse than no rule: the clinician believes someone is watching.
--
-- Switching a rule back on asks the same question, for the same reason.

DROP POLICY IF EXISTS "Clinicians can create alert rules with valid share" ON public.clinician_alert_rules;
CREATE POLICY "Clinicians can create alert rules with valid share"
  ON public.clinician_alert_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = clinician_user_id
    AND public.clinician_has_patient_permission(patient_user_id, 'vitals')
  );

DROP POLICY IF EXISTS "Clinicians can update their alert rules" ON public.clinician_alert_rules;
CREATE POLICY "Clinicians can update their alert rules"
  ON public.clinician_alert_rules
  FOR UPDATE TO authenticated
  USING (auth.uid() = clinician_user_id)
  WITH CHECK (
    auth.uid() = clinician_user_id
    AND (is_active IS NOT TRUE OR public.clinician_has_patient_permission(patient_user_id, 'vitals'))
  );
