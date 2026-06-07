
-- Internal practice notes (per patient, visible only to clinicians with access)
CREATE TABLE public.internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL,
  author_user_id UUID NOT NULL,
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_internal_notes_patient ON public.internal_notes(patient_user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_notes TO authenticated;
GRANT ALL ON public.internal_notes TO service_role;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinicians read internal notes for accessible patients"
  ON public.internal_notes FOR SELECT TO authenticated
  USING (public.clinician_has_patient_access(patient_user_id));
CREATE POLICY "Clinicians create internal notes"
  ON public.internal_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_user_id AND public.clinician_has_patient_access(patient_user_id));
CREATE POLICY "Authors update their internal notes"
  ON public.internal_notes FOR UPDATE TO authenticated
  USING (auth.uid() = author_user_id) WITH CHECK (auth.uid() = author_user_id);
CREATE POLICY "Authors delete their internal notes"
  ON public.internal_notes FOR DELETE TO authenticated
  USING (auth.uid() = author_user_id);
CREATE TRIGGER trg_internal_notes_updated BEFORE UPDATE ON public.internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Referrals between clinicians (intra-OneCare or external email)
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL,
  from_clinician_user_id UUID NOT NULL,
  to_clinician_user_id UUID,
  to_email TEXT,
  to_name TEXT,
  specialty TEXT,
  reason TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'routine',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_referrals_patient ON public.referrals(patient_user_id, created_at DESC);
CREATE INDEX idx_referrals_to ON public.referrals(to_clinician_user_id) WHERE to_clinician_user_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrals visible to from/to clinicians"
  ON public.referrals FOR SELECT TO authenticated
  USING (
    auth.uid() = from_clinician_user_id
    OR auth.uid() = to_clinician_user_id
    OR to_email = public.get_current_user_email()
  );
CREATE POLICY "Clinicians create referrals for accessible patients"
  ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_clinician_user_id AND public.clinician_has_patient_access(patient_user_id));
CREATE POLICY "Referrals updatable by parties"
  ON public.referrals FOR UPDATE TO authenticated
  USING (auth.uid() = from_clinician_user_id OR auth.uid() = to_clinician_user_id)
  WITH CHECK (auth.uid() = from_clinician_user_id OR auth.uid() = to_clinician_user_id);
CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
