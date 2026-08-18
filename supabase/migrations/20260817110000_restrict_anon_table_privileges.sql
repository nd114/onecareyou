-- Take away anon's blanket table privileges; hand back only the anonymous
-- surfaces the product actually has.
--
-- Supabase's bootstrap runs
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
--
-- so every table created in `public` hands SELECT, INSERT, UPDATE and DELETE to
-- the anonymous role, and the row policies are the *only* thing standing between
-- the open internet and the data. Measured on a replay of this migration
-- history: 482 grants across 69 tables held by `anon` before this migration.
--
-- Today that is survivable, because every table has RLS enabled and the policies
-- key on auth.uid(), which is null for an anonymous caller — verified, anon
-- reads zero rows from profiles and vitals. But it means a single malformed
-- policy exposes a whole table to the internet, with nothing behind it. That is
-- not hypothetical here: job_applications shipped with
--
--   CREATE POLICY "Applicants can view their own applications"
--     ON public.job_applications FOR SELECT USING (true);
--
-- — no TO clause, so it covered anon, and `true` for every row. Every applicant's
-- name, email and phone was readable by anyone until it was narrowed in
-- 20260127152048. With the grant removed, that mistake would have been contained.
--
-- Three earlier migrations already revoked from anon piecemeal (practices_safe,
-- international_drug_mappings, and a set of definer functions). This does it once,
-- for the whole schema, and keeps it true for tables added later.
--
-- What anon legitimately needs, checked against every unguarded route in
-- src/App.tsx:
--
--   * job_postings  SELECT  — the public careers board
--   * job_applications INSERT — applying without an account (/careers/:jobId)
--   * beta_events   INSERT  — anonymous beta telemetry
--   * enterprise_inquiries INSERT — the "Anonymous visitors can submit inquiries"
--     policy added in 20260814013717. No unguarded page writes it today (the form
--     sits behind ClinicianRoute), but the policy was written deliberately for a
--     public form, so the grant is kept to match that intent rather than silently
--     dropping a surface someone is about to build.
--
-- Everything anonymous callers read for the branded hospital pages goes through
-- SECURITY DEFINER functions (public_institution_by_slug), which do not depend on
-- table grants at all — so tenant sign-up is unaffected.
--
-- `authenticated` deliberately keeps its default privileges: the whole app runs
-- as that role and RLS is what scopes it.

-- Revoke per relation so one owned by another role cannot abort the migration.
-- Views are included: public.clinician_profiles_public and public.patient_basic_info
-- both held the full default grant. They are `security_invoker = on`, so they do
-- respect the caller's RLS rather than the view owner's — but a view that is one
-- reloption away from bypassing RLS entirely should not also be readable by the
-- anonymous role.
DO $$
DECLARE
  _r record;
BEGIN
  FOR _r IN
    SELECT n.nspname AS schema_name, c.relname AS rel_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON %I.%I FROM anon', _r.schema_name, _r.rel_name);
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'skipped %.% (not owned by %)', _r.schema_name, _r.rel_name, current_user;
    END;
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Keep it true for tables added later. This applies to objects created by the
-- role running this migration, which is the role Supabase migrations run as.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- The four deliberate anonymous surfaces, restored explicitly.
GRANT SELECT ON public.job_postings          TO anon;
GRANT INSERT ON public.job_applications      TO anon;
GRANT INSERT ON public.beta_events           TO anon;
GRANT INSERT ON public.enterprise_inquiries  TO anon;

COMMENT ON TABLE public.job_applications IS
  'Anonymous INSERT is intentional (public job board). SELECT is restricted to the applicant''s own '
  'email and to admins. anon holds INSERT only — see 20260817110000.';
