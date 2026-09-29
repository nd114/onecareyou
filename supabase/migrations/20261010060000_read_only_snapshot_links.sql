-- A patient can send a read-only snapshot of their record to somebody who has
-- no OneCare account.
--
-- This is deliberately not patient-to-patient sharing and not a provider
-- share. There is no relationship, no account and nothing the viewer can
-- claim or answer. The patient picks what goes in (vitals, medications,
-- conditions, allergies, and specific documents rather than the whole Vault)
-- and how long it lives (at most 30 days), and gets back a link.
--
-- The content is frozen when the link is made. A link is a copy of what the
-- patient chose to show on that day; if it read the live tables, a link sent
-- to a relative in March would still be publishing readings in April, to
-- whoever the relative forwarded it to. Documents are the one live part,
-- because the file is not copied: the link carries the chosen document ids,
-- and a file is only served while the link is live and the document is
-- neither retracted nor archived. When one stops being available the snapshot
-- says so in its place.
--
-- The token is 256 random bits, handed to the patient once and kept nowhere.
-- Only its SHA-256 is stored, so a leak of this table opens no link. The
-- anonymous role has no access to either table or to the function that reads
-- a link by its hash; that function is granted to the service role alone and
-- called from one edge function, view-snapshot-link, which is therefore the
-- only door. It checks the hash, expiry, revocation and the optional passcode
-- at the moment of each request, and logs every view with a coarse user agent
-- and no IP address.
--
-- Creation is an RPC rather than an edge function because the snapshot has to
-- be built from the caller's own rows, atomically, under their identity; doing
-- it in the database means the client cannot hand in a snapshot of its own
-- making, and the same code path is exercised by the SQL suite.
--
-- Nothing is deleted. Links are revoked, not removed, and the view log is
-- append-only, so the patient can always see who opened what they sent.
--
-- Tests: supabase/tests/read_only_snapshot_links.test.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.snapshot_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash        text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  label             text CHECK (label IS NULL OR char_length(label) <= 80),
  categories        text[] NOT NULL CHECK (
                      cardinality(categories) > 0
                      AND categories <@ ARRAY['vitals','medications','conditions','allergies','documents']
                    ),
  document_ids      uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(document_ids) <= 20),
  sharer_first_name text NOT NULL,
  snapshot          jsonb NOT NULL,
  passcode_hash     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  CONSTRAINT snapshot_links_expiry_within_30_days
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CONSTRAINT snapshot_links_documents_need_the_category
    CHECK (cardinality(document_ids) = 0 OR 'documents' = ANY (categories))
);

CREATE INDEX IF NOT EXISTS idx_snapshot_links_user ON public.snapshot_links (user_id, created_at DESC);

COMMENT ON TABLE public.snapshot_links IS
  'Read-only snapshot links a patient sends to someone without an account. The content is '
  'frozen in snapshot at creation; only the SHA-256 of the token is kept. Written only through '
  'create_snapshot_link / revoke_snapshot_link; read anonymously only through the '
  'view-snapshot-link edge function. See 20261010060000.';
COMMENT ON COLUMN public.snapshot_links.token_hash IS
  'SHA-256 (hex) of the link token. The token itself is returned once to the patient and never stored.';
COMMENT ON COLUMN public.snapshot_links.passcode_hash IS
  'bcrypt hash of the optional six-digit passcode the patient passes on separately.';

CREATE TABLE IF NOT EXISTS public.snapshot_link_views (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_id     uuid NOT NULL REFERENCES public.snapshot_links(id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL CHECK (kind IN ('snapshot', 'document', 'passcode_failed')),
  document_id uuid,
  user_agent  text CHECK (user_agent IS NULL OR char_length(user_agent) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_link_views_link ON public.snapshot_link_views (link_id, viewed_at DESC);

COMMENT ON TABLE public.snapshot_link_views IS
  'Append-only log of every time a snapshot link was opened, a document fetched through it, or '
  'a wrong passcode tried. Coarse user agent only; no IP address.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- A new table arrives with ALL granted to anon and authenticated by default
-- privileges. Revoke first, then grant only the read the owner needs. There is
-- no INSERT, UPDATE or DELETE grant for anyone but the definer functions: an
-- owner able to UPDATE their own row could push expires_at out a year or
-- clear revoked_at, and both rules would be conventions rather than rules.
ALTER TABLE public.snapshot_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshot_link_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.snapshot_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.snapshot_link_views FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.snapshot_links TO authenticated;
GRANT SELECT ON public.snapshot_link_views TO authenticated;

DROP POLICY IF EXISTS "Patients read their own snapshot links" ON public.snapshot_links;
CREATE POLICY "Patients read their own snapshot links"
  ON public.snapshot_links FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Patients read views of their own snapshot links" ON public.snapshot_link_views;
CREATE POLICY "Patients read views of their own snapshot links"
  ON public.snapshot_link_views FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.snapshot_links l
     WHERE l.id = snapshot_link_views.link_id AND l.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Create
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_snapshot_link(
  _categories       text[],
  _document_ids     uuid[],
  _expires_in_hours integer,
  _with_passcode    boolean DEFAULT false,
  _label            text DEFAULT NULL
)
RETURNS TABLE(link_id uuid, token text, passcode text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid      uuid := auth.uid();
  _cats     text[];
  _docs     uuid[] := COALESCE(_document_ids, '{}');
  _token    text;
  _pin      text;
  _snapshot jsonb := '{}'::jsonb;
  _first    text;
  _profile  public.profiles%ROWTYPE;
  _id       uuid;
  _exp      timestamptz;
  _owned    integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to share a link' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Same vocabulary as provider and practice shares, minus the two that make
  -- no sense to freeze for a stranger: 'profile' is the whole row (date of
  -- birth, contact details) and 'adherence' is a judgement about the patient.
  SELECT array_agg(DISTINCT c ORDER BY c) INTO _cats FROM unnest(_categories) c;
  IF _cats IS NULL OR cardinality(_cats) = 0
     OR NOT (_cats <@ ARRAY['vitals','medications','conditions','allergies','documents']) THEN
    RAISE EXCEPTION 'Choose at least one of vitals, medications, conditions, allergies or documents'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF _expires_in_hours IS NULL OR _expires_in_hours < 1 OR _expires_in_hours > 720 THEN
    RAISE EXCEPTION 'A link can last between one hour and 30 days'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF _label IS NOT NULL AND char_length(btrim(_label)) > 80 THEN
    RAISE EXCEPTION 'Keep the note to 80 characters' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT array_agg(DISTINCT d) INTO _docs FROM unnest(_docs) d WHERE d IS NOT NULL;
  _docs := COALESCE(_docs, '{}');

  IF cardinality(_docs) > 0 AND NOT ('documents' = ANY (_cats)) THEN
    RAISE EXCEPTION 'Documents are only included when documents are chosen'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF 'documents' = ANY (_cats) AND cardinality(_docs) = 0 THEN
    RAISE EXCEPTION 'Pick the documents to include' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF cardinality(_docs) > 20 THEN
    RAISE EXCEPTION 'A link can include at most 20 documents' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Every chosen document must be the caller's own, not a family member's,
  -- and currently shown to them. Without this a patient could name any
  -- document id and have the edge function sign a URL for it.
  SELECT count(*) INTO _owned
    FROM public.health_documents h
   WHERE h.id = ANY (_docs)
     AND h.user_id = _uid
     AND h.family_member_id IS NULL
     AND h.retracted_at IS NULL
     AND h.archived_at IS NULL;
  IF _owned <> cardinality(_docs) THEN
    RAISE EXCEPTION 'One of the chosen documents is not available to share'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.enforce_rate_limit(
    'snapshot_link_create', _uid::text, 30, interval '1 hour',
    'You have created a lot of links recently. Please wait before creating another.'
  );

  SELECT * INTO _profile FROM public.profiles p WHERE p.user_id = _uid;
  -- First name only: the viewer needs to know whose record this is, not the
  -- sharer's full name to search for.
  _first := NULLIF(split_part(btrim(COALESCE(_profile.name, '')), ' ', 1), '');
  _first := COALESCE(left(_first, 40), 'A OneCare user');

  -- The patient's own rows only (family_member_id IS NULL): readings a parent
  -- records for a child are the child's record, not the parent's.
  IF 'vitals' = ANY (_cats) THEN
    _snapshot := _snapshot || jsonb_build_object('vitals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'type', v.type, 'value', v.value, 'secondary_value', v.secondary_value,
               'unit', v.unit, 'recorded_at', v.recorded_at)
             ORDER BY v.recorded_at DESC)
        FROM (SELECT * FROM public.vitals v
               WHERE v.user_id = _uid AND v.family_member_id IS NULL
                 AND v.recorded_at > now() - interval '90 days'
               ORDER BY v.recorded_at DESC LIMIT 200) v
    ), '[]'::jsonb));
  END IF;

  IF 'medications' = ANY (_cats) THEN
    _snapshot := _snapshot || jsonb_build_object('medications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', m.name, 'dosage', m.dosage, 'frequency', m.frequency,
               'instructions', m.instructions, 'start_date', m.start_date,
               'prescriber', m.prescriber)
             ORDER BY lower(m.name))
        FROM public.medications m
       WHERE m.user_id = _uid AND m.family_member_id IS NULL
         AND COALESCE(m.is_active, true) AND m.discontinued_at IS NULL
    ), '[]'::jsonb));
  END IF;

  IF 'conditions' = ANY (_cats) THEN
    _snapshot := _snapshot || jsonb_build_object('conditions', COALESCE(_profile.health_conditions, '[]'::jsonb));
  END IF;

  IF 'allergies' = ANY (_cats) THEN
    _snapshot := _snapshot || jsonb_build_object('allergies', COALESCE(_profile.allergies, '[]'::jsonb));
  END IF;

  IF 'documents' = ANY (_cats) THEN
    -- Descriptions only. The file is fetched per view through the edge
    -- function, never from a path stored in the snapshot.
    _snapshot := _snapshot || jsonb_build_object('documents', (
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id, 'title', COALESCE(NULLIF(h.title, ''), h.file_name),
               'category', h.category, 'document_date', h.document_date,
               'mime_type', h.mime_type)
             ORDER BY h.document_date DESC NULLS LAST, h.created_at DESC)
        FROM public.health_documents h
       WHERE h.id = ANY (_docs)
    ));
  END IF;

  -- base64url of 32 random bytes: 256 bits, 43 characters, safe in a URL.
  _token := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  IF _with_passcode THEN
    _pin := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  END IF;
  _exp := now() + make_interval(hours => _expires_in_hours);

  INSERT INTO public.snapshot_links AS l
    (user_id, token_hash, label, categories, document_ids, sharer_first_name, snapshot,
     passcode_hash, expires_at)
  VALUES
    (_uid, encode(digest(_token, 'sha256'), 'hex'), NULLIF(btrim(_label), ''), _cats, _docs,
     _first, _snapshot,
     CASE WHEN _pin IS NULL THEN NULL ELSE crypt(_pin, gen_salt('bf', 8)) END,
     _exp)
  RETURNING l.id INTO _id;

  RETURN QUERY SELECT _id, _token, _pin, _exp;
END;
$$;

REVOKE ALL ON FUNCTION public.create_snapshot_link(text[], uuid[], integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_snapshot_link(text[], uuid[], integer, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.create_snapshot_link(text[], uuid[], integer, boolean, text) IS
  'Freezes the caller''s chosen categories and documents into a new read-only link and returns '
  'the token (and optional passcode) once. Only their hashes are stored. See 20261010060000.';

-- ---------------------------------------------------------------------------
-- Revoke
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_snapshot_link(_link_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.snapshot_links%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.snapshot_links l WHERE l.id = _link_id FOR UPDATE;
  -- Somebody else's link reads exactly like one that does not exist.
  IF NOT FOUND OR auth.uid() IS NULL OR _row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF _row.revoked_at IS NOT NULL THEN
    RETURN _row.revoked_at;
  END IF;
  UPDATE public.snapshot_links l SET revoked_at = now() WHERE l.id = _link_id;
  RETURN now();
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_snapshot_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_snapshot_link(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- The owner's list
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_snapshot_links()
RETURNS TABLE(
  id uuid, label text, categories text[], document_count integer,
  created_at timestamptz, expires_at timestamptz, revoked_at timestamptz,
  has_passcode boolean, locked boolean, view_count integer, last_viewed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.id, l.label, l.categories, cardinality(l.document_ids),
         l.created_at, l.expires_at, l.revoked_at,
         l.passcode_hash IS NOT NULL,
         (SELECT count(*) FROM public.snapshot_link_views f
           WHERE f.link_id = l.id AND f.kind = 'passcode_failed') >= 10,
         (SELECT count(*)::integer FROM public.snapshot_link_views v
           WHERE v.link_id = l.id AND v.kind = 'snapshot'),
         (SELECT max(v.viewed_at) FROM public.snapshot_link_views v
           WHERE v.link_id = l.id AND v.kind IN ('snapshot', 'document'))
    FROM public.snapshot_links l
   WHERE l.user_id = auth.uid()
   ORDER BY l.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_my_snapshot_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_snapshot_links() TO authenticated;

-- ---------------------------------------------------------------------------
-- Open: the only read by token, for the edge function alone
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_snapshot_link(
  _token_hash  text,
  _passcode    text DEFAULT NULL,
  _user_agent  text DEFAULT NULL,
  _document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _row    public.snapshot_links%ROWTYPE;
  _ua     text := left(NULLIF(btrim(_user_agent), ''), 80);
  _failed integer;
  _doc    record;
  _docs   jsonb;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Locked so that concurrent wrong passcodes are counted one after another.
  SELECT * INTO _row FROM public.snapshot_links l WHERE l.token_hash = _token_hash FOR UPDATE;
  IF NOT FOUND THEN
    -- A 256-bit token is not guessable, but a flood of lookups still costs
    -- the database; one shared ceiling on misses keeps that bounded without
    -- touching links that do exist.
    PERFORM public.enforce_rate_limit(
      'snapshot_link_miss', 'all', 1000, interval '1 hour',
      'Too many requests. Please try again later.');
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Checked on every request, not remembered from the first one.
  IF _row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;
  IF _row.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired', 'expires_at', _row.expires_at);
  END IF;

  PERFORM public.enforce_rate_limit(
    'snapshot_link_view', _row.id::text, 120, interval '1 hour',
    'This link has been opened many times in the last hour. Please try again later.');

  IF _row.passcode_hash IS NOT NULL THEN
    SELECT count(*) INTO _failed FROM public.snapshot_link_views v
     WHERE v.link_id = _row.id AND v.kind = 'passcode_failed';
    -- Ten wrong guesses in a million, over the link's whole life, then it
    -- stays shut even to the right passcode. The patient sees it locked and
    -- can make another.
    IF _failed >= 10 THEN
      RETURN jsonb_build_object('status', 'locked');
    END IF;
    IF _passcode IS NULL OR btrim(_passcode) = '' THEN
      -- Not even the sharer's name before the passcode: it is part of what
      -- the passcode protects.
      RETURN jsonb_build_object('status', 'passcode_required');
    END IF;
    IF length(_passcode) > 16 OR crypt(btrim(_passcode), _row.passcode_hash) <> _row.passcode_hash THEN
      INSERT INTO public.snapshot_link_views (link_id, kind, user_agent)
      VALUES (_row.id, 'passcode_failed', _ua);
      RETURN jsonb_build_object('status', 'passcode_wrong');
    END IF;
  END IF;

  -- One document, for a signed URL. Only one that was chosen, still the
  -- patient's, and neither retracted nor archived since.
  IF _document_id IS NOT NULL THEN
    SELECT h.id, h.file_path, h.file_name, h.mime_type INTO _doc
      FROM public.health_documents h
     WHERE h.id = _document_id
       AND h.id = ANY (_row.document_ids)
       AND h.user_id = _row.user_id
       AND h.retracted_at IS NULL
       AND h.archived_at IS NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'document_unavailable');
    END IF;
    INSERT INTO public.snapshot_link_views (link_id, kind, document_id, user_agent)
    VALUES (_row.id, 'document', _doc.id, _ua);
    RETURN jsonb_build_object('status', 'ok', 'file_path', _doc.file_path,
                              'file_name', _doc.file_name, 'mime_type', _doc.mime_type);
  END IF;

  -- The frozen descriptions, each marked with whether its file can still be
  -- fetched. Absence is shown in place rather than the entry vanishing.
  SELECT COALESCE(jsonb_agg(d || jsonb_build_object('available', EXISTS (
           SELECT 1 FROM public.health_documents h
            WHERE h.id = (d->>'id')::uuid AND h.user_id = _row.user_id
              AND h.retracted_at IS NULL AND h.archived_at IS NULL))), '[]'::jsonb)
    INTO _docs
    FROM jsonb_array_elements(COALESCE(_row.snapshot->'documents', '[]'::jsonb)) d;

  INSERT INTO public.snapshot_link_views (link_id, kind, user_agent)
  VALUES (_row.id, 'snapshot', _ua);

  RETURN jsonb_build_object(
    'status', 'ok',
    'sharer_first_name', _row.sharer_first_name,
    'created_at', _row.created_at,
    'expires_at', _row.expires_at,
    'categories', to_jsonb(_row.categories),
    'snapshot', _row.snapshot - 'documents',
    'documents', _docs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_snapshot_link(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_snapshot_link(text, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.open_snapshot_link(text, text, text, uuid) IS
  'Service role only (the view-snapshot-link edge function). Validates a link by token hash, '
  'expiry, revocation and passcode at the moment of the call, logs the view, and returns the '
  'frozen snapshot — or, with _document_id, the file path of one chosen, still-available '
  'document for a short-lived signed URL. See 20261010060000.';
