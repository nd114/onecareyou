#!/usr/bin/env bash
#
# Replay the migration history into a throwaway database and run every SQL test.
#
# Thirty-nine test files existed before this and there was no way to run them as
# a set — the README told you how to run one, so in practice they ran one at a
# time, when somebody remembered, against whatever state their local Supabase
# happened to be in. Tests nobody runs together drift apart together.
#
# Usage:
#   scripts/db-test.sh                 # replay and run everything
#   scripts/db-test.sh institution     # only files whose name matches
#   DB=postgres://...  scripts/db-test.sh   # against an existing database
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILTER="${1:-}"
DBNAME="${DBNAME:-onecare_test}"

if [[ -n "${DB:-}" ]]; then
  PSQL=(psql "$DB")
else
  export PGUSER="${PGUSER:-postgres}"
  echo "→ recreating $DBNAME"
  psql -q -c "DROP DATABASE IF EXISTS $DBNAME" -c "CREATE DATABASE $DBNAME" postgres >/dev/null || {
    echo "Could not reach Postgres. Start one, or set DB=postgres://..." >&2
    exit 2
  }
  PSQL=(psql -d "$DBNAME")
fi

run_sql() { "${PSQL[@]}" -q -v ON_ERROR_STOP=1 "$@"; }

# ---------------------------------------------------------------------------
# The shim, before the migrations.
#
# Order matters and the README says why: Supabase applies its default grants at
# CREATE TABLE time, so a REVOKE later in the history wins. Granting everything
# after the replay would silently undo every one of those revokes and make four
# suites fail against code that is correct.
# ---------------------------------------------------------------------------
echo "→ applying compatibility shim"
run_sql <<'SQL' >/dev/null
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- service_role carries BYPASSRLS on a hosted project: it is the role the edge
-- functions run as, and they are expected to see past row policies. Without it
-- a suite asserting "the notify function can read these" fails on RLS and reads
-- as a missing grant.
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER ROLE service_role BYPASSRLS;
DO $$ BEGIN
  CREATE ROLE supabase_auth_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[], owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text, name text, owner uuid, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Storage path helpers. Ten migrations use foldername() in their bucket
-- policies; without it they fail to replay and take a dozen test files down
-- with them, which reads as a dozen bugs.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE parts text[];
BEGIN
  parts := string_to_array(name, '/');
  RETURN parts[1:array_length(parts, 1) - 1];
END $fn$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE parts text[];
BEGIN
  parts := string_to_array(name, '/');
  RETURN parts[array_length(parts, 1)];
END $fn$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE parts text[];
BEGIN
  parts := string_to_array(storage.filename(name), '.');
  RETURN parts[array_length(parts, 1)];
END $fn$;

-- Realtime and cron exist on a hosted project and not in a plain Postgres.
-- Stubbed so that a migration mentioning them replays; nothing asserts them.
CREATE TABLE IF NOT EXISTS realtime.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text, extension text, inserted_at timestamptz DEFAULT now()
);
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS cron;
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text) RETURNS bigint
  LANGUAGE sql AS $fn$ SELECT 1::bigint $fn$;
CREATE OR REPLACE FUNCTION cron.unschedule(text) RETURNS boolean
  LANGUAGE sql AS $fn$ SELECT true $fn$;

-- Schema usage. Without it a test that SET ROLEs to authenticated gets
-- "permission denied for schema auth" and reads as a policy failure.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
-- Supabase grants these, and without them every storage policy is untestable:
-- a probe fails with "permission denied for table objects" long before any
-- policy is consulted, so a bucket wide open to the wrong reader looks exactly
-- like one that is locked down.
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT ALL ON storage.objects TO service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.buckets TO service_role;
GRANT SELECT ON auth.users TO anon, authenticated, service_role;

-- Supabase's own defaults, applied here so that a later REVOKE in the history
-- is the thing that decides.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL

echo "→ replaying migrations"
applied=0; skipped=0
for m in "$ROOT"/supabase/migrations/*.sql; do
  if out=$(run_sql -f "$m" 2>&1); then
    applied=$((applied + 1))
  else
    skipped=$((skipped + 1))
    echo "  ! ${m##*/}"
    echo "$out" | grep -m2 '^psql.*ERROR' | sed 's/^/      /'
  fi
done
echo "   $applied applied, $skipped could not be replayed"

echo "→ running tests"
pass=0; fail=0; failed_files=()
for t in "$ROOT"/supabase/tests/*.test.sql; do
  name="${t##*/}"
  [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && continue
  if out=$(run_sql -f "$t" 2>&1); then
    pass=$((pass + 1))
    printf '  ok   %s\n' "$name"
  else
    fail=$((fail + 1)); failed_files+=("$name")
    printf '  FAIL %s\n' "$name"
    echo "$out" | grep -m3 -E 'ERROR|FAIL' | sed 's/^/         /'
  fi
done

echo
echo "$pass passed, $fail failed"
if ((fail > 0)); then
  printf '  %s\n' "${failed_files[@]}"
  exit 1
fi
