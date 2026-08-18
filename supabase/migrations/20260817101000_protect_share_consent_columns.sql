-- A clinician cannot rewrite the consent a patient gave them.
--
-- Found by red-teaming the private sharing pathway. The policy "Clinicians can
-- update their patient shares" exists so a clinician can write their own notes
-- and access timestamp onto the share row — but RLS is row-level, so it handed
-- them every column, including the ones that define the consent itself.
--
-- Confirmed, in one API call from an ordinary clinician session:
--
--   * set is_active = true on a share the patient had revoked, restoring their
--     own access to a record they had been cut off from;
--   * widen permissions from {vitals} to {vitals, meds, adherence, profile},
--     granting themselves categories the patient never shared.
--
-- This is the private-pathway twin of the hospital-admin defect fixed in
-- 20260814233000, and it contradicts the first line of the consent model: every
-- sharing relationship is created, narrowed and ended by the patient.
--
-- Same technique as the commercial-column guard: pin the consent-bearing
-- columns unless the writer is the patient themselves (or a trusted server-side
-- caller). Clinician notes and last_accessed_at stay writable, so the reason the
-- policy exists still works.

CREATE OR REPLACE FUNCTION public.guard_provider_share_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side callers (cron, service role, migrations) and the patient who
  -- owns the share may change anything about it.
  IF auth.uid() IS NULL OR auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Anyone else — in practice the clinician on the share — may not touch the
  -- terms of the relationship.
  NEW.user_id        := OLD.user_id;
  NEW.is_active      := OLD.is_active;
  NEW.permissions    := OLD.permissions;
  NEW.expires_at     := OLD.expires_at;
  NEW.invite_code    := OLD.invite_code;
  NEW.revoked_at     := OLD.revoked_at;
  NEW.revoked_by     := OLD.revoked_by;
  NEW.revoke_reason  := OLD.revoke_reason;
  NEW.reconnected_at := OLD.reconnected_at;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_provider_share_consent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_provider_share_consent ON public.provider_shares;
CREATE TRIGGER trg_guard_provider_share_consent
BEFORE UPDATE ON public.provider_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_share_consent();

COMMENT ON FUNCTION public.guard_provider_share_consent() IS
  'Pins the consent-bearing columns of a private share against writes by anyone but the patient. '
  'The clinician-update policy exists for notes and access timestamps; without this it also let a '
  'clinician re-activate a revoked share and widen their own permissions.';
