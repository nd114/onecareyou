-- AI conversations about a patient are part of that patient's record.
--
-- Two gaps, both found by looking rather than assuming:
--
--   1. The assistant reads patient data and logs nothing. A clinician can ask
--      it to show a patient's readings and no entry appears in the access log,
--      while opening the same patient's record page produces one. The audit log
--      was rebuilt to record access rather than navigation; this was a hole in
--      it, and the show_records tool widened the hole.
--
--   2. ai_conversations has no patient reference at all. A conversation about
--      somebody's care sat in a side channel — not exportable with their
--      record, not reviewable alongside it.
--
-- The reference goes on the message, not the conversation. A clinician working
-- through a morning list asks about several patients in one thread, and
-- stamping the whole conversation with one of them would be a claim that is
-- false for most of it.

ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS patient_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_ai_messages_patient
  ON public.ai_messages (patient_user_id, created_at DESC)
  WHERE patient_user_id IS NOT NULL;

COMMENT ON COLUMN public.ai_messages.patient_user_id IS
  'The patient this message was about, when it was about one. Per-message rather than '
  'per-conversation because a clinician asks about several patients in one thread, and '
  'stamping the thread with one of them would be false for the rest. Null is the normal case '
  'for a general question.';

-- ---------------------------------------------------------------------------
-- What a clinician asked the assistant about a patient, for that patient's file
--
-- SECURITY DEFINER because the caller needs the messages of conversations they
-- own, filtered to one patient, and the ownership check is the point. It
-- returns nothing for a patient the caller cannot reach, so it cannot be used
-- to read around the access rules.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_messages_about_patient(_patient_user_id uuid)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  role text,
  content text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
  FROM public.ai_messages m
  WHERE m.patient_user_id = _patient_user_id
    AND m.user_id = auth.uid()
    AND auth.uid() IS NOT NULL
    AND (
      public.clinician_has_patient_access(_patient_user_id)
      OR public.institution_has_patient_access(_patient_user_id)
      OR _patient_user_id = auth.uid()
    )
  ORDER BY m.created_at;
$$;

REVOKE ALL ON FUNCTION public.ai_messages_about_patient(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ai_messages_about_patient(uuid) TO authenticated;

COMMENT ON FUNCTION public.ai_messages_about_patient(uuid) IS
  'The caller''s own assistant messages about one patient. Deliberately scoped to the caller: '
  'a clinician''s working notes are theirs, and one clinician reading another''s questions '
  'about a shared patient is a different feature with a different consent conversation. '
  'Returns nothing for a patient the caller cannot reach.';
