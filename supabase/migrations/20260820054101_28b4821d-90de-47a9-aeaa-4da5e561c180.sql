-- Record what was actually done to a patient's record, in the database.
--
-- Two problems with the audit log as it stood, both found in review.
--
-- 1. It recorded almost nothing. useHipaaAuditLog exists and is called by no
--    production code at all — only by its own test. The single place anything
--    reached hipaa_audit_logs was a patient revoking a share. A compliance pack
--    built from it showed page views and empty patient columns, which tells a
--    reviewer nothing about who read or changed a record.
--
-- 2. What little it did record was written by the client, so the log described
--    whatever the client chose to report. The August security review raised this
--    three times running; it matters more since tenant visibility was
--    deliberately left broad, making the audit log the compensating control.
--
-- Writes are now logged by triggers. A clinician cannot decline to record that
-- they issued guidance, signed an encounter or edited a record, because the row
-- is written by the same statement that made the change. The actor comes from
-- auth.uid(), so it cannot be forged either.
--
-- Reads still have to be reported by the client — there is no way for the
-- database to know a page was rendered — but log_record_access() stamps the
-- actor server-side and refuses to log an access the caller could not actually
-- have made, so the worst a client can do is stay silent. Silence is visible in
-- a different way: a clinician with no read entries who issued guidance has an
-- inconsistency a reviewer can see.
--
-- Navigation is deliberately not logged. "Viewed the dashboard" is noise that
-- buries the entries that matter.

-- ---------------------------------------------------------------------------
-- Generic write logger.
--
-- TG_ARGV[0] — action label
-- TG_ARGV[1] — column on the row holding the patient's user id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor   uuid := auth.uid();
  _patient uuid;
  _action  text := TG_ARGV[0];
BEGIN
  -- Server-side callers (migrations, cron, the seed) have no actor to record
  -- and are not what an access log is for.
  IF _actor IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT ($1).%I', TG_ARGV[1]) INTO _patient USING NEW;

  INSERT INTO public.hipaa_audit_logs
    (user_id, action, resource_type, resource_id, patient_user_id, details)
  VALUES (
    _actor,
    CASE WHEN TG_OP = 'INSERT' THEN _action ELSE _action || '_updated' END,
    TG_TABLE_NAME,
    NEW.id::text,
    _patient,
    jsonb_build_object('operation', TG_OP)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_record_change() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The events worth recording: clinical content, and consent.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_guidance ON public.clinician_guidance;
CREATE TRIGGER trg_audit_guidance
AFTER INSERT OR UPDATE ON public.clinician_guidance
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('guidance_issued', 'patient_user_id');

DROP TRIGGER IF EXISTS trg_audit_encounter ON public.encounters;
CREATE TRIGGER trg_audit_encounter
AFTER INSERT OR UPDATE ON public.encounters
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('encounter_recorded', 'patient_user_id');

DROP TRIGGER IF EXISTS trg_audit_internal_note ON public.internal_notes;
CREATE TRIGGER trg_audit_internal_note
AFTER INSERT OR UPDATE ON public.internal_notes
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('internal_note_written', 'patient_user_id');

DROP TRIGGER IF EXISTS trg_audit_managed_record ON public.clinician_patient_records;
CREATE TRIGGER trg_audit_managed_record
AFTER INSERT OR UPDATE ON public.clinician_patient_records
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('managed_record_edited', 'linked_user_id');

DROP TRIGGER IF EXISTS trg_audit_provider_share ON public.provider_shares;
CREATE TRIGGER trg_audit_provider_share
AFTER INSERT OR UPDATE ON public.provider_shares
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('provider_share', 'user_id');

DROP TRIGGER IF EXISTS trg_audit_practice_share ON public.practice_shares;
CREATE TRIGGER trg_audit_practice_share
AFTER INSERT OR UPDATE ON public.practice_shares
FOR EACH ROW EXECUTE FUNCTION public.log_record_change('institution_share', 'user_id');

-- ---------------------------------------------------------------------------
-- Reads. Called by the client, but the actor is stamped here and the access is
-- verified before anything is written, so a caller cannot log a read of a
-- record they had no right to open — nor attribute one to somebody else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_record_access(
  _patient_user_id uuid,
  _resource_type   text,
  _resource_id     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL OR _patient_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Reading your own record is not an access event worth logging.
  IF _actor = _patient_user_id THEN
    RETURN;
  END IF;

  -- Only log an access the caller could actually have made.
  IF NOT (
    public.clinician_has_patient_access(_patient_user_id)
    OR public.institution_has_patient_access(_patient_user_id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.hipaa_audit_logs
    (user_id, action, resource_type, resource_id, patient_user_id, details)
  VALUES (_actor, 'record_viewed', _resource_type, _resource_id, _patient_user_id, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_record_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_record_access(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.log_record_change() IS
  'Writes an audit row for a change to clinical content or consent. Attached as a trigger so the '
  'entry is made by the same statement as the change and cannot be declined by the client.';

COMMENT ON FUNCTION public.log_record_access(uuid, text, text) IS
  'Records that a clinician opened a patient record. Actor is taken from auth.uid(), and the access '
  'is verified before writing, so a caller can neither forge who read a record nor log a read they '
  'were not entitled to make.';