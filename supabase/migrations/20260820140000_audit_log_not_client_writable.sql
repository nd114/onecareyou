-- An audit log the audited party can write is not an audit log.
--
-- hipaa_audit_logs accepted INSERT straight from the browser under
--
--   CREATE POLICY "Users can insert own audit logs"
--     ON public.hipaa_audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
--
-- The only thing checked is that the actor names themselves. Everything else in
-- the row is whatever the client sent: the action, the resource type, the
-- resource id, the details, and — the part that matters — patient_user_id.
--
-- So a signed-in clinician could write an entry claiming an access they never
-- made, against a patient they have no relationship with; could label a real
-- access with a milder action than the one they performed; and could bury a
-- genuine entry under any volume of noise they liked. Nothing verified that the
-- access being recorded was one the caller could have made.
--
-- This is the compensating control for tenant visibility being deliberately
-- broad, and it is what a BAA conversation points at, so it has to be evidence
-- rather than testimony.
--
-- 20260819160000 already put the *write* side beyond the client's reach: six
-- AFTER INSERT OR UPDATE triggers record changes to guidance, encounters,
-- internal notes, managed records and both share tables, in the same statement
-- as the change. This closes the read side the same way — through a function
-- that checks the access before recording it — and takes the open door away.

-- ---------------------------------------------------------------------------
-- 1. The client may no longer author rows directly
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.hipaa_audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.hipaa_audit_logs FROM authenticated, anon;

COMMENT ON TABLE public.hipaa_audit_logs IS
  'Append-only access and change log. Written by SECURITY DEFINER paths only — the '
  'log_record_change() triggers and log_record_access() — never by the client, so an '
  'entry cannot be forged or omitted by the account it describes. Readable by the '
  'subject and by tenant admins for their own tenant.';

-- ---------------------------------------------------------------------------
-- 2. One way in, and it verifies before it writes
-- ---------------------------------------------------------------------------
-- The action is now the caller's to choose, but only from a fixed set. Free
-- text would hand back the ability to mislabel an access, which is most of what
-- the open policy allowed.
CREATE OR REPLACE FUNCTION public.log_record_access(
  _patient_user_id uuid,
  _resource_type   text,
  _resource_id     text,
  -- No default: with one, a three-argument call matches both this and the
  -- compatibility wrapper below, and Postgres refuses the call as ambiguous —
  -- which would have stopped the deployed client logging at all.
  _action          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _allowed constant text[] := ARRAY[
    'record_viewed',
    'vitals_viewed',
    'medications_viewed',
    'documents_viewed',
    'document_downloaded',
    'adherence_viewed',
    'report_exported'
  ];
BEGIN
  IF _actor IS NULL OR _patient_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Reading your own record is not an access event worth logging.
  IF _actor = _patient_user_id THEN
    RETURN;
  END IF;

  -- Only log an access the caller could actually have made. Without this the
  -- log records claims rather than events.
  IF NOT (
    public.clinician_has_patient_access(_patient_user_id)
    OR public.institution_has_patient_access(_patient_user_id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.hipaa_audit_logs
    (user_id, action, resource_type, resource_id, patient_user_id, details)
  VALUES (
    _actor,
    CASE WHEN _action = ANY(_allowed) THEN _action ELSE 'record_viewed' END,
    _resource_type,
    _resource_id,
    _patient_user_id,
    '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_record_access(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_record_access(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.log_record_access(uuid, text, text, text) IS
  'Records that a clinician opened part of a patient record. The actor is taken from '
  'auth.uid() rather than the payload, the access is verified before anything is written, '
  'and an unrecognised action falls back to record_viewed rather than being stored as '
  'given. The only route into hipaa_audit_logs for a read — see 20260820140000.';

-- The three-argument form is what the application called before this migration.
-- Kept so a client deployed against the previous schema keeps logging rather
-- than failing silently during a rollout.
CREATE OR REPLACE FUNCTION public.log_record_access(
  _patient_user_id uuid,
  _resource_type   text,
  _resource_id     text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.log_record_access(_patient_user_id, _resource_type, _resource_id, 'record_viewed');
$$;

REVOKE EXECUTE ON FUNCTION public.log_record_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_record_access(uuid, text, text) TO authenticated;
