-- Hospital clinicians can message their patients, and the inbox stops lying.
--
-- =============================================================================
-- 1. A hospital clinician could not send or read a single message
-- =============================================================================
-- Both message policies resolved the relationship through provider_shares only:
--
--   "Clinicians can send messages"  WITH CHECK (... clinician_has_patient_access(patient_user_id))
--   "Clinicians can read message history they took part in"
--                                   USING (... clinician_had_patient_access_at(patient_user_id, created_at))
--
-- A clinician assigned to a patient through a hospital has no provider_shares
-- row — that is the whole point of the second pathway — so both refused. And
-- the Messages page builds its list from the merged patient panel, which does
-- include institution patients: the patient appeared in the sidebar, the
-- clinician typed, and the insert was refused. Reproduced against a replay of
-- this migration history before it was fixed.
--
-- The institution branch reads current access rather than access-at-the-time.
-- provider_shares carries created_at, revoked_at and expires_at, so a private
-- share can be asked what was true in the past and gets a deliberate 90-day
-- wind-down. An assignment does not carry that history, so an institution
-- clinician reads the thread while the relationship stands and loses it when
-- it ends. Stricter than the private path, in the safe direction.

DROP POLICY IF EXISTS "Clinicians can send messages" ON public.messages;
CREATE POLICY "Clinicians can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = clinician_user_id
    AND auth.uid() = sender_user_id
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
  );

DROP POLICY IF EXISTS "Clinicians can read message history they took part in" ON public.messages;
CREATE POLICY "Clinicians can read message history they took part in"
  ON public.messages FOR SELECT TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND (
      public.clinician_had_patient_access_at(patient_user_id, created_at)
      OR public.institution_has_patient_access(patient_user_id)
    )
  );

DROP POLICY IF EXISTS "Recipient can update read status (clinician)" ON public.messages;
CREATE POLICY "Recipient can update read status (clinician)"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    auth.uid() = clinician_user_id
    AND sender_user_id <> auth.uid()
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
  )
  WITH CHECK (
    auth.uid() = clinician_user_id
    AND sender_user_id <> auth.uid()
    AND (
      public.clinician_has_patient_access(patient_user_id)
      OR public.institution_has_patient_access(patient_user_id)
    )
  );

-- =============================================================================
-- 2. An inbox that counts every message, not the most recent five hundred
-- =============================================================================
-- The thread list was built by fetching the 500 newest messages and grouping
-- them in the browser. Past that ceiling a conversation simply vanished from
-- the sidebar and its unread badge read zero — quietly, and worst for the
-- busiest clinician, who needs it most. The list also had no idea which
-- conversation was most recent: it was ordered by the patient roster, so
-- whoever just messaged you sat wherever the alphabet put them.
--
-- Deliberately SECURITY INVOKER: the row policies above decide what is
-- countable, so this function cannot widen anyone's reach. It only stops the
-- counting happening over a truncated window.

CREATE OR REPLACE FUNCTION public.my_message_threads(_role text)
RETURNS TABLE(
  counterparty_id uuid,
  last_body text,
  last_at timestamptz,
  last_sender_user_id uuid,
  last_has_attachment boolean,
  unread integer,
  total integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH mine AS (
    SELECT m.*,
           CASE WHEN _role = 'patient' THEN m.clinician_user_id ELSE m.patient_user_id END AS other_id
      FROM public.messages m
     WHERE auth.uid() IS NOT NULL
       AND CASE WHEN _role = 'patient'
                THEN m.patient_user_id = auth.uid()
                ELSE m.clinician_user_id = auth.uid()
           END
  ),
  ranked AS (
    SELECT mine.*,
           row_number() OVER (PARTITION BY other_id ORDER BY created_at DESC) AS rn
      FROM mine
  )
  SELECT r.other_id,
         r.body,
         r.created_at,
         r.sender_user_id,
         r.attachment_path IS NOT NULL,
         (SELECT count(*)::integer FROM mine u
           WHERE u.other_id = r.other_id
             AND u.sender_user_id <> auth.uid()
             AND u.read_at IS NULL),
         (SELECT count(*)::integer FROM mine t WHERE t.other_id = r.other_id)
    FROM ranked r
   WHERE r.rn = 1
   ORDER BY r.created_at DESC;
$$;

COMMENT ON FUNCTION public.my_message_threads(text) IS
  'One row per conversation for the calling user, newest first, with the last '
  'message and a true unread count over the whole thread. SECURITY INVOKER on '
  'purpose — the messages row policies decide what is visible and countable. '
  'Replaces a client-side grouping of the 500 newest messages, past which '
  'conversations disappeared from the inbox — see 20260820120000.';

REVOKE ALL ON FUNCTION public.my_message_threads(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_message_threads(text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_messages_clinician_recent
  ON public.messages(clinician_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_patient_recent
  ON public.messages(patient_user_id, created_at DESC);
