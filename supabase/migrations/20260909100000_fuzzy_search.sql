-- Search that survives a typo.
--
-- Before this there were fifty-four `toLowerCase().includes(query)` filters in
-- the client and one server-side `ilike`. Substring matching is not search, and
-- its failures are not edge cases here: "Jose" does not find "José", "OConnor"
-- does not find "O'Connor", "amlodipin" finds nothing at all, and an exact
-- match sorts below a coincidental substring.
--
-- The client-side half is `src/lib/search.ts`, for lists already in memory.
-- This is the half that matters at a hospital, where the patient list is
-- thousands of rows and holding it client-side to filter is not an option.
--
-- ## These functions decide nothing about access
--
-- Every one is SECURITY INVOKER, so it runs as the caller and RLS answers.
-- That is the whole design: a SECURITY DEFINER search over patients would let
-- any clinician find any patient by name, which is a leak wearing a helpful
-- face. Search must never be able to see further than a read.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- Normalisation, matching what the client does
-- ---------------------------------------------------------------------------
--
-- The same three steps as `normaliseForSearch`: strip accents, close up
-- apostrophes and hyphens so "O'Connor" and "OConnor" are one word, and reduce
-- everything else to spaces. If these two ever diverge, a search run in the
-- browser and the same search run in Postgres return different things.
--
-- IMMUTABLE so it can be indexed. `unaccent` is not immutable by default —
-- it depends on a dictionary that could in principle be changed — so it is
-- called through this wrapper, which is the standard way of promising we will
-- not change it under an index.
CREATE OR REPLACE FUNCTION public.unaccent_immutable(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, value);
$$;

CREATE OR REPLACE FUNCTION public.search_normalise(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(public.unaccent_immutable(coalesce(value, ''))),
        '[''’‘\-]', '', 'g'
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$;

COMMENT ON FUNCTION public.search_normalise(text) IS
  'Strips a string to what somebody meant to type: accents removed, apostrophes and hyphens closed '
  'up, everything else reduced to spaces. Mirrors normaliseForSearch in src/lib/search.ts — if the '
  'two diverge, the same query answers differently in the browser and the database.';

-- ---------------------------------------------------------------------------
-- Indexes on the normalised text
-- ---------------------------------------------------------------------------
--
-- GIN over trigrams: this is what makes similarity() fast enough to run over a
-- hospital's whole patient list rather than a page of it.
CREATE INDEX IF NOT EXISTS clinician_patient_records_name_trgm_idx
  ON public.clinician_patient_records
  USING gin (public.search_normalise(patient_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS medications_name_trgm_idx
  ON public.medications
  USING gin (public.search_normalise(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS health_documents_title_trgm_idx
  ON public.health_documents
  USING gin (public.search_normalise(coalesce(title, file_name)) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Searching
-- ---------------------------------------------------------------------------
--
-- 0.3 is pg_trgm's own default threshold and it holds up: "amlodipin" scores
-- about 0.75 against "amlodipine", and an unrelated word rarely clears 0.2.
-- Passed as an argument rather than set on the session, because `set_limit` is
-- connection state and a pooled connection would carry one caller's threshold
-- into another's query.

CREATE OR REPLACE FUNCTION public.search_medications(query text, max_results int DEFAULT 25)
RETURNS TABLE (id uuid, name text, dosage text, score real)
LANGUAGE sql
STABLE
-- INVOKER, deliberately: the caller's own RLS decides which rows exist to be
-- searched. A definer function here would let anybody enumerate every
-- medication in the database by guessing names.
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (SELECT public.search_normalise(query) AS text)
  SELECT m.id, m.name, m.dosage,
         similarity(public.search_normalise(m.name), q.text) AS score
  FROM public.medications m, q
  WHERE q.text <> ''
    AND (
      public.search_normalise(m.name) % q.text
      OR public.search_normalise(m.name) LIKE '%' || q.text || '%'
    )
  ORDER BY
    -- An exact match, then a prefix, then everything else by closeness. Without
    -- this the thing you actually typed can sort below a coincidence.
    (public.search_normalise(m.name) = q.text) DESC,
    (public.search_normalise(m.name) LIKE q.text || '%') DESC,
    score DESC,
    m.name
  LIMIT greatest(1, least(max_results, 100));
$$;

CREATE OR REPLACE FUNCTION public.search_documents(query text, max_results int DEFAULT 25)
RETURNS TABLE (id uuid, title text, file_name text, category text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (SELECT public.search_normalise(query) AS text)
  SELECT d.id, d.title, d.file_name, d.category,
         similarity(public.search_normalise(coalesce(d.title, d.file_name)), q.text) AS score
  FROM public.health_documents d, q
  WHERE q.text <> ''
    AND d.archived_at IS NULL
    AND (
      public.search_normalise(coalesce(d.title, d.file_name)) % q.text
      OR public.search_normalise(coalesce(d.title, d.file_name)) LIKE '%' || q.text || '%'
      OR public.search_normalise(coalesce(d.notes, '')) LIKE '%' || q.text || '%'
    )
  ORDER BY score DESC, coalesce(d.title, d.file_name)
  LIMIT greatest(1, least(max_results, 100));
$$;

CREATE OR REPLACE FUNCTION public.search_patient_records(query text, max_results int DEFAULT 25)
RETURNS TABLE (id uuid, patient_name text, patient_email text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (SELECT public.search_normalise(query) AS text)
  SELECT r.id, r.patient_name, r.patient_email,
         similarity(public.search_normalise(r.patient_name), q.text) AS score
  FROM public.clinician_patient_records r, q
  WHERE q.text <> ''
    AND (
      public.search_normalise(r.patient_name) % q.text
      OR public.search_normalise(r.patient_name) LIKE '%' || q.text || '%'
      -- An email is looked up whole, not fuzzily: half an address is not a
      -- near miss, it is a different person.
      OR lower(coalesce(r.patient_email, '')) = lower(btrim(query))
    )
  ORDER BY
    (public.search_normalise(r.patient_name) = q.text) DESC,
    score DESC,
    r.patient_name
  LIMIT greatest(1, least(max_results, 100));
$$;

-- ---------------------------------------------------------------------------
-- "Did you mean …?"
-- ---------------------------------------------------------------------------
--
-- Same rule as the client: only when the search found nothing, and only ever a
-- whole value that exists. A reconstructed phrase would send somebody hunting
-- for a thing that was never there.
--
-- The band sits *below* the matching threshold. Above it, a suggestion could
-- never fire, because anything that close has already been returned as a
-- result — which is exactly the mistake the client-side version made first.
CREATE OR REPLACE FUNCTION public.suggest_medication_name(query text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (SELECT public.search_normalise(query) AS text)
  SELECT m.name
  FROM public.medications m, q
  WHERE q.text <> ''
    AND NOT EXISTS (SELECT 1 FROM public.search_medications(query, 1))
    AND similarity(public.search_normalise(m.name), q.text) >= 0.17
  ORDER BY similarity(public.search_normalise(m.name), q.text) DESC
  LIMIT 1;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC, so every one of these
-- has to be revoked explicitly or a signed-out visitor can run it. RLS would
-- return them nothing, so it is not a data leak — but an unauthenticated
-- endpoint that runs trigram similarity over a table is not something to leave
-- open by default.
REVOKE ALL ON FUNCTION public.search_normalise(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unaccent_immutable(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_medications(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_documents(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_patient_records(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.suggest_medication_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_normalise(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unaccent_immutable(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_medications(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_patient_records(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_medication_name(text) TO authenticated;
