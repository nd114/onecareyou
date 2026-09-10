-- Deletion follows the record rule
--
-- "Nothing is hard-deleted where there is a legal record" is the platform's
-- first rule, and four DELETE policies predated it. Each granted deletion on
-- ownership alone, which was reasonable when the tables were new and is wrong
-- now that other people rely on what is in them.
--
-- Found by sweeping every DELETE policy on a clinical table and testing each
-- one rather than reading it, which matters: all four looked unremarkable.

-- ---------------------------------------------------------------------------
-- 1. A clinician could delete advice they had given
-- ---------------------------------------------------------------------------
--
-- Guidance is an instruction sent to a patient who may have acted on it.
-- Deleting it removed the instruction and any trace that it was ever issued —
-- from the patient's view as well as the clinician's.
--
-- Narrowed to guidance the patient has never acknowledged. Once they have
-- confirmed it, it stands. Cancelling acknowledged guidance with a remnant in
-- its place belongs with the correction work and is not a delete.

DROP POLICY IF EXISTS "Clinicians can delete their guidance" ON public.clinician_guidance;
-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Clinicians delete only guidance never acknowledged" ON public.clinician_guidance;
CREATE POLICY "Clinicians delete only guidance never acknowledged"
  ON public.clinician_guidance FOR DELETE TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND acknowledged_at IS NULL
    AND completed_at IS NULL
  );

COMMENT ON POLICY "Clinicians delete only guidance never acknowledged" ON public.clinician_guidance IS
  'Advice a patient has confirmed is part of what happened between them. A '
  'clinician who no longer stands behind it issues new guidance; they do not '
  'remove the old.';

-- ---------------------------------------------------------------------------
-- 2. A patient could delete a medication the interface says they cannot touch
-- ---------------------------------------------------------------------------
--
-- `isMedicationEditable` refuses to change or remove a row that came from a
-- sending system, and `useMedications` explains why: that row is the system's
-- record of what it prescribed. The rule lived in the client and not in the
-- policy, so the refusal was a message rather than a boundary.
--
-- Stopping remains available on anything, through stop_medication(). Saying "I
-- am not taking this" is the patient's account of their own behaviour; deleting
-- the prescription is a claim about what was prescribed.

DROP POLICY IF EXISTS "Users can delete their own medications" ON public.medications;
-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Patients delete only medications they entered themselves" ON public.medications;
CREATE POLICY "Patients delete only medications they entered themselves"
  ON public.medications FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (source IS NULL OR source = 'manual')
  );

-- ---------------------------------------------------------------------------
-- 3. A patient could delete a missed dose
-- ---------------------------------------------------------------------------
--
-- Adherence is read by clinicians who change treatment on the strength of it,
-- and a record that can have its misses removed is one nobody can rely on.
-- stop_medication() already deletes only *pending future* entries, with a
-- comment explaining that erasing doses that were due would rewrite adherence
-- to look as though nothing was missed. The policy did not carry the same rule.
--
-- The patient keeps what they actually need: clearing reminders that have not
-- come round yet.

DROP POLICY IF EXISTS "Users can delete their own schedule entries" ON public.schedule_entries;
-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Patients delete only doses not yet due" ON public.schedule_entries;
CREATE POLICY "Patients delete only doses not yet due"
  ON public.schedule_entries FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND status = 'pending'
    AND scheduled_time >= now()
  );

COMMENT ON POLICY "Patients delete only doses not yet due" ON public.schedule_entries IS
  'A dose that has come round is history. Marking one taken late is honest; '
  'removing one that was missed is not, and a clinician reading the adherence '
  'has no way to tell the difference.';

-- ---------------------------------------------------------------------------
-- 4. A clinician could delete a record the patient had already claimed
-- ---------------------------------------------------------------------------
--
-- The UPDATE policy on this table already stops at the claim — "a claimed
-- record belongs to the patient" — and DELETE did not, so the whole row could
-- be removed instead of edited.
--
-- Worse than it looks. record_onboarding_provenance() stamps the profile from
-- this row when it is claimed, and `onboarded_via_practice_id` is what the
-- revenue share with institutions is calculated from. Deleting the claimed row
-- destroys the evidence of an attribution that is still being paid on.

DROP POLICY IF EXISTS "Clinicians can delete their own patient records" ON public.clinician_patient_records;
-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Clinicians delete only unclaimed patient records" ON public.clinician_patient_records;
CREATE POLICY "Clinicians delete only unclaimed patient records"
  ON public.clinician_patient_records FOR DELETE TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND linked_user_id IS NULL
  );

COMMENT ON POLICY "Clinicians delete only unclaimed patient records" ON public.clinician_patient_records IS
  'Matches the UPDATE policy rather than sitting beside it with a different '
  'rule. Once claimed the record is the patient''s, and it carries the '
  'onboarding attribution the institution is paid on.';

-- ---------------------------------------------------------------------------
-- 5. And the cascade that walked straight through rule 3
-- ---------------------------------------------------------------------------
--
-- `schedule_entries.medication_id` cascades on delete. So a patient blocked
-- from removing a missed dose could remove the medication instead and take the
-- whole adherence history with it — the protection above held for one statement
-- and not for the obvious second one.
--
-- Found only by testing the rule's neighbours rather than the rule.
--
-- A medication with history is stopped, not deleted. Stopping keeps every dose
-- and is available on anything, including imported rows. Deleting stays
-- available for the case it is actually for: something entered by mistake and
-- never taken.

DROP POLICY IF EXISTS "Patients delete only medications they entered themselves" ON public.medications;
-- Idempotent against a re-sync that already created this exact
-- policy name (Supabase re-exports applied migrations under its
-- own real timestamps, which can sort before this file).
DROP POLICY IF EXISTS "Patients delete only medications with no history" ON public.medications;
CREATE POLICY "Patients delete only medications with no history"
  ON public.medications FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (source IS NULL OR source = 'manual')
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_entries se
       WHERE se.medication_id = medications.id
         AND (se.status <> 'pending' OR se.scheduled_time < now())
    )
  );

COMMENT ON POLICY "Patients delete only medications with no history" ON public.medications IS
  'Deleting is for a medication added by mistake and never taken. Once a dose '
  'has come round there is an adherence record, and the cascade on '
  'schedule_entries would take it with the row — so the rule has to live here '
  'as well as on the doses themselves.';

-- ---------------------------------------------------------------------------
-- 6. Revoking a share erased the advice given through it
-- ---------------------------------------------------------------------------
--
-- `clinician_guidance.share_id` cascaded from `provider_shares`, and patients
-- held DELETE on their own shares. So revoking access removed every instruction
-- the clinician had issued through it — including advice the patient had
-- acknowledged and acted on — from both sides at once, with no trace.
--
-- Two things were wrong, and both are fixed rather than one.
--
-- Revocation is deactivation here. `is_active`, `revoked_at`, `revoke_reason`
-- and `reconnected_at` all exist for it, guard_provider_share_consent() polices
-- them, the patient is shown a sharing history built from them, and no client
-- code deletes a share. The DELETE policy was a leftover from before that
-- design and did nothing except make this reachable.

DROP POLICY IF EXISTS "Users can delete their own shares" ON public.provider_shares;

COMMENT ON TABLE public.provider_shares IS
  'Ending a share sets is_active false and stamps revoked_at. There is no delete: '
  'the sharing history is something the patient is shown, and a revocation that '
  'removes the row removes the evidence of the access as well as the access.';

-- And the cascade itself, because a policy is one route to a delete and the
-- service role is another. Guidance outlives the share it travelled through;
-- losing the link is right, losing the instruction is not.
ALTER TABLE public.clinician_guidance
  DROP CONSTRAINT IF EXISTS clinician_guidance_share_id_fkey;
ALTER TABLE public.clinician_guidance
  ADD CONSTRAINT clinician_guidance_share_id_fkey
  FOREIGN KEY (share_id) REFERENCES public.provider_shares(id) ON DELETE SET NULL;

-- Same shape: a proposal is the record of a change being asked for and
-- answered. A declined one is as much a part of the history as an accepted one,
-- and it was disappearing with the medication it referred to.
ALTER TABLE public.record_change_proposals
  DROP CONSTRAINT IF EXISTS record_change_proposals_medication_id_fkey;
ALTER TABLE public.record_change_proposals
  ADD CONSTRAINT record_change_proposals_medication_id_fkey
  FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 7. The guard that blocked the constraint's own repair
-- ---------------------------------------------------------------------------
--
-- `enforce_guidance_patient_update()` stops a patient rewriting guidance while
-- letting them acknowledge it, by restoring every clinical column from OLD.
-- `share_id` was in that list.
--
-- Which means when the FK above nulls `share_id` — its own ON DELETE SET NULL,
-- not an edit by anybody — the trigger puts the old value straight back, and
-- the delete then fails on the constraint it was satisfying. Any path that
-- removes a share while a patient's claim is in context raises instead of
-- unlinking cleanly.
--
-- `share_id` may now go to NULL and nowhere else. A patient still cannot point
-- guidance at a different share, which is what the guard was for; the
-- constraint can complete its own work, which it could not.

CREATE OR REPLACE FUNCTION public.enforce_guidance_patient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() = OLD.patient_user_id AND auth.uid() <> OLD.clinician_user_id THEN
    NEW.clinician_user_id    := OLD.clinician_user_id;
    NEW.patient_user_id      := OLD.patient_user_id;
    -- Only NULL is allowed through, and only that: the FK's SET NULL when its
    -- share is removed. Re-pointing guidance at another share is still refused.
    IF NEW.share_id IS NOT NULL THEN
      NEW.share_id           := OLD.share_id;
    END IF;
    NEW.title                := OLD.title;
    NEW.instruction          := OLD.instruction;
    NEW.category             := OLD.category;
    NEW.priority             := OLD.priority;
    NEW.due_date             := OLD.due_date;
    NEW.auto_resend_enabled  := OLD.auto_resend_enabled;
    NEW.resend_interval_hours:= OLD.resend_interval_hours;
    NEW.last_resent_at       := OLD.last_resent_at;
    NEW.created_at           := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. And the constraint that then refused the row it was meant to preserve
-- ---------------------------------------------------------------------------
--
-- `proposal_names_its_target` requires a change or a stop to name a medication.
-- Correct while the proposal is open — a change that names nothing cannot be
-- applied — and wrong the moment the FK above nulls the link because the
-- medication was removed: the row the SET NULL was protecting then fails the
-- check and the delete raises.
--
-- Scoped to what the rule was actually for. A proposal still open must name its
-- target; one already answered is history, and history is allowed to point at
-- something that no longer exists.

ALTER TABLE public.record_change_proposals
  DROP CONSTRAINT IF EXISTS proposal_names_its_target;
ALTER TABLE public.record_change_proposals
  ADD CONSTRAINT proposal_names_its_target CHECK (
    (kind = 'medication_start' AND medication_id IS NULL)
    OR (kind IN ('medication_change', 'medication_stop')
        AND (medication_id IS NOT NULL OR status <> 'pending'))
  );
