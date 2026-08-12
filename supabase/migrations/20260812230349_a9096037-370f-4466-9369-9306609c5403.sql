-- 1. Lifecycle columns on provider_shares
ALTER TABLE public.provider_shares
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS reconnected_at timestamptz;

-- 2. Relationship ledger
CREATE TABLE IF NOT EXISTS public.share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.provider_shares(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL,
  clinician_user_id uuid,
  provider_label text,
  event_type text NOT NULL CHECK (event_type IN (
    'connected','claimed','permissions_changed','paused','resumed','revoked','reshared','expired'
  )),
  actor_user_id uuid,
  actor_role text NOT NULL DEFAULT 'patient' CHECK (actor_role IN ('patient','clinician','system')),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.share_events TO authenticated;
GRANT ALL ON public.share_events TO service_role;

ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view their share history"
  ON public.share_events FOR SELECT TO authenticated
  USING (auth.uid() = patient_user_id);

CREATE POLICY "Clinicians can view their own relationship history"
  ON public.share_events FOR SELECT TO authenticated
  USING (
    auth.uid() = clinician_user_id
    OR EXISTS (
      SELECT 1 FROM public.provider_shares ps
      WHERE ps.id = share_events.share_id
        AND (ps.clinician_user_id = auth.uid() OR ps.provider_email = public.get_current_user_email())
    )
  );

CREATE POLICY "Participants can append share history"
  ON public.share_events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_user_id
    AND EXISTS (
      SELECT 1 FROM public.provider_shares ps
      WHERE ps.id = share_events.share_id
        AND (
          ps.user_id = auth.uid()
          OR ps.clinician_user_id = auth.uid()
          OR ps.provider_email = public.get_current_user_email()
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_share_events_share ON public.share_events(share_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_events_patient ON public.share_events(patient_user_id, created_at DESC);

-- 3. Historical (post-revocation) access check: any share ever, active or not.
CREATE OR REPLACE FUNCTION public.clinician_had_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
  ELSE EXISTS (
    SELECT 1
    FROM public.provider_shares ps
    WHERE ps.user_id = patient_user_id
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = public.get_current_user_email()
      )
  )
  END
$$;

REVOKE ALL ON FUNCTION public.clinician_had_patient_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinician_had_patient_access(uuid) TO authenticated, service_role;

-- 4. Message history survives revocation (read-only, no new sends).
DROP POLICY IF EXISTS "Clinicians can read messages with shared patients" ON public.messages;
CREATE POLICY "Clinicians can read message history they took part in"
  ON public.messages FOR SELECT TO authenticated
  USING (auth.uid() = clinician_user_id AND public.clinician_had_patient_access(patient_user_id));

-- 5. Guidance history likewise remains readable to its author.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clinician_guidance'
      AND policyname = 'Clinicians can view guidance history they authored'
  ) THEN
    DROP POLICY "Clinicians can view guidance history they authored" ON public.clinician_guidance;
  END IF;
END $$;

CREATE POLICY "Clinicians can view guidance history they authored"
  ON public.clinician_guidance FOR SELECT TO authenticated
  USING (auth.uid() = clinician_user_id);
