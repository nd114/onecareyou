-- ============ STORAGE METERING ============
CREATE TABLE public.storage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  practice_id uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id)
);

GRANT SELECT ON public.storage_ledger TO authenticated;
GRANT ALL ON public.storage_ledger TO service_role;
ALTER TABLE public.storage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own storage rows"
ON public.storage_ledger FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Practice admins view practice storage rows"
ON public.storage_ledger FOR SELECT TO authenticated
USING (practice_id IS NOT NULL AND public.can_manage_practice(practice_id));

CREATE INDEX idx_storage_ledger_user ON public.storage_ledger(user_id);
CREATE INDEX idx_storage_ledger_practice ON public.storage_ledger(practice_id);

CREATE TRIGGER storage_ledger_updated_at
BEFORE UPDATE ON public.storage_ledger
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ledger sync from health_documents
CREATE OR REPLACE FUNCTION public.sync_storage_ledger_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_ledger
     WHERE resource_type = 'document' AND resource_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.storage_ledger (user_id, resource_type, resource_id, bytes)
  VALUES (NEW.user_id, 'document', NEW.id, COALESCE(NEW.file_size, 0))
  ON CONFLICT (resource_type, resource_id)
  DO UPDATE SET bytes = COALESCE(EXCLUDED.bytes, 0), user_id = EXCLUDED.user_id, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_storage_ledger_document
AFTER INSERT OR UPDATE OR DELETE ON public.health_documents
FOR EACH ROW EXECUTE FUNCTION public.sync_storage_ledger_document();

-- Ledger sync from clinician_dictations (audio estimated at 32 kB/s, billed to the clinician's practice)
CREATE OR REPLACE FUNCTION public.sync_storage_ledger_dictation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _practice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.storage_ledger
     WHERE resource_type = 'dictation' AND resource_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT pm.practice_id INTO _practice_id
  FROM public.practice_members pm
  WHERE pm.user_id = NEW.clinician_user_id AND pm.status = 'active'
  LIMIT 1;

  INSERT INTO public.storage_ledger (user_id, practice_id, resource_type, resource_id, bytes)
  VALUES (NEW.clinician_user_id, _practice_id, 'dictation', NEW.id,
          COALESCE(NEW.duration_seconds, 0) * 32000)
  ON CONFLICT (resource_type, resource_id)
  DO UPDATE SET bytes = EXCLUDED.bytes, practice_id = EXCLUDED.practice_id, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_storage_ledger_dictation
AFTER INSERT OR UPDATE OR DELETE ON public.clinician_dictations
FOR EACH ROW EXECUTE FUNCTION public.sync_storage_ledger_dictation();

-- Backfill existing rows
INSERT INTO public.storage_ledger (user_id, resource_type, resource_id, bytes)
SELECT hd.user_id, 'document', hd.id, COALESCE(hd.file_size, 0)
FROM public.health_documents hd
ON CONFLICT (resource_type, resource_id) DO NOTHING;

INSERT INTO public.storage_ledger (user_id, resource_type, resource_id, bytes)
SELECT cd.clinician_user_id, 'dictation', cd.id, COALESCE(cd.duration_seconds, 0) * 32000
FROM public.clinician_dictations cd
ON CONFLICT (resource_type, resource_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_user_storage_bytes(_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() = _user_id
    THEN COALESCE((SELECT SUM(bytes) FROM public.storage_ledger WHERE user_id = _user_id), 0)
    ELSE 0 END;
$$;

REVOKE ALL ON FUNCTION public.get_user_storage_bytes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_storage_bytes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_practice_storage_bytes(_practice_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_practice_member(_practice_id)
    THEN COALESCE((SELECT SUM(bytes) FROM public.storage_ledger WHERE practice_id = _practice_id), 0)
    ELSE 0 END;
$$;

REVOKE ALL ON FUNCTION public.get_practice_storage_bytes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_practice_storage_bytes(uuid) TO authenticated;

-- ============ HOSPITAL / ENTERPRISE TENANCY ============
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS tenant_type text NOT NULL DEFAULT 'practice',
  ADD COLUMN IF NOT EXISTS storage_limit_gb numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS revenue_share_pct numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practices_slug ON public.practices(lower(slug)) WHERE slug IS NOT NULL;

CREATE TABLE public.practice_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  share_all boolean NOT NULL DEFAULT true,
  permissions jsonb NOT NULL DEFAULT '{"vitals":true,"medications":true,"documents":true,"conditions":true,"allergies":true}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.practice_shares TO authenticated;
GRANT ALL ON public.practice_shares TO service_role;
ALTER TABLE public.practice_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients manage own institution shares"
ON public.practice_shares FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Patients create own institution shares"
ON public.practice_shares FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Patients update own institution shares"
ON public.practice_shares FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Practice members view shares to their practice"
ON public.practice_shares FOR SELECT TO authenticated
USING (public.is_practice_member(practice_id));

CREATE POLICY "Practice admins pause shares to their practice"
ON public.practice_shares FOR UPDATE TO authenticated
USING (public.can_manage_practice(practice_id))
WITH CHECK (public.can_manage_practice(practice_id));

CREATE INDEX idx_practice_shares_practice ON public.practice_shares(practice_id);
CREATE INDEX idx_practice_shares_user ON public.practice_shares(user_id);

CREATE TRIGGER practice_shares_updated_at
BEFORE UPDATE ON public.practice_shares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Access helper: institution share + assignment (or practice-wide view rights)
CREATE OR REPLACE FUNCTION public.institution_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.practice_shares ps
    JOIN public.practice_members pm ON pm.practice_id = ps.practice_id
    WHERE ps.user_id = patient_user_id
      AND ps.is_active = true
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
      AND (
        pm.can_view_all_patients = true
        OR public.is_assigned_to_patient(auth.uid(), patient_user_id)
      )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.institution_has_patient_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_has_patient_access(uuid) TO authenticated;

CREATE POLICY "Institution team can view shared vitals"
ON public.vitals FOR SELECT TO authenticated
USING (public.institution_has_patient_access(user_id));

CREATE POLICY "Institution team can view shared medications"
ON public.medications FOR SELECT TO authenticated
USING (public.institution_has_patient_access(user_id));

CREATE POLICY "Institution team can view shared documents"
ON public.health_documents FOR SELECT TO authenticated
USING (public.institution_has_patient_access(user_id));

CREATE POLICY "Institution team can view guidance for shared patients"
ON public.clinician_guidance FOR SELECT TO authenticated
USING (public.institution_has_patient_access(patient_user_id));