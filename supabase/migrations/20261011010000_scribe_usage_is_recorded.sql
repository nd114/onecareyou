-- Scribe minutes are counted (log only).
--
-- Pricing copy says the ambient scribe is "Metered" but nothing counted a
-- minute (pricing-and-tier-gating gap 2; voice-memos-and-scribe-access Part 2).
-- This is the ledger and nothing else: it records, it does not limit. No
-- function here reads a subscription tier, blocks a caller, or returns an
-- allowance. Limits are the founder's decision and come later, on top of this.
--
-- No PHI: no patient id, no encounter id, no transcript. A row says who spent
-- how much audio, when, on which kind of session.
--
-- Written only by the service role (edge functions) through record_scribe_usage.
-- A signed-in client has SELECT on its own rows and no write policy at all.

CREATE TABLE IF NOT EXISTS public.scribe_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  practice_id    uuid REFERENCES public.practices(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN ('encounter', 'memo', 'dictation')),
  audio_seconds  integer NOT NULL CHECK (audio_seconds BETWEEN 0 AND 86400),
  billed_minutes integer GENERATED ALWAYS AS ((audio_seconds + 59) / 60) STORED,
  -- Idempotency key. Edge functions namespace it per session so a retry of the
  -- same request cannot be counted twice.
  request_id     text NOT NULL UNIQUE CHECK (length(request_id) BETWEEN 1 AND 200),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scribe_usage_user_month_idx ON public.scribe_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS scribe_usage_practice_month_idx ON public.scribe_usage (practice_id, created_at)
  WHERE practice_id IS NOT NULL;

ALTER TABLE public.scribe_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own scribe usage" ON public.scribe_usage;
CREATE POLICY "Users read their own scribe usage"
  ON public.scribe_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policy, and no table privilege either.
REVOKE ALL ON public.scribe_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scribe_usage TO authenticated;

-- Record one session's usage. Idempotent on request_id: a repeat returns the
-- row already stored (inserted = false) and writes nothing.
CREATE OR REPLACE FUNCTION public.record_scribe_usage(
  _user_id uuid,
  _practice_id uuid,
  _kind text,
  _audio_seconds integer,
  _request_id text
)
RETURNS TABLE (id uuid, audio_seconds integer, billed_minutes integer, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.scribe_usage%ROWTYPE;
BEGIN
  -- Service role (or a migration / superuser) only. A client cannot reach this
  -- even if a grant were widened by mistake.
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'record_scribe_usage is for the service role only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.scribe_usage AS s (user_id, practice_id, kind, audio_seconds, request_id)
  VALUES (_user_id, _practice_id, _kind, GREATEST(0, LEAST(COALESCE(_audio_seconds, 0), 86400)), _request_id)
  ON CONFLICT (request_id) DO NOTHING
  RETURNING * INTO _row;

  IF FOUND THEN
    RETURN QUERY SELECT _row.id, _row.audio_seconds, _row.billed_minutes, true;
  ELSE
    SELECT * INTO _row FROM public.scribe_usage s WHERE s.request_id = _request_id;
    RETURN QUERY SELECT _row.id, _row.audio_seconds, _row.billed_minutes, false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_scribe_usage(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_scribe_usage(uuid, uuid, text, integer, text) TO service_role;

-- A practice owner or admin sees counts only: per kind, sessions and minutes
-- for one calendar month (UTC). No user, patient or content in the result.
CREATE OR REPLACE FUNCTION public.scribe_usage_summary(_practice_id uuid, _month date)
RETURNS TABLE (kind text, sessions bigint, audio_seconds bigint, billed_minutes bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_practice(_practice_id) THEN
    RAISE EXCEPTION 'Only a practice owner or admin can read scribe usage' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.kind,
         count(*)::bigint,
         COALESCE(sum(s.audio_seconds), 0)::bigint,
         COALESCE(sum(s.billed_minutes), 0)::bigint
    FROM public.scribe_usage s
   WHERE s.practice_id = _practice_id
     AND s.created_at >= date_trunc('month', _month::timestamp) AT TIME ZONE 'UTC'
     AND s.created_at <  (date_trunc('month', _month::timestamp) + interval '1 month') AT TIME ZONE 'UTC'
   GROUP BY s.kind
   ORDER BY s.kind;
END;
$$;

REVOKE ALL ON FUNCTION public.scribe_usage_summary(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scribe_usage_summary(uuid, date) TO authenticated;
