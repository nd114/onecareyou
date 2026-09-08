---
name: supabase-guardrails
description: Use when writing or reviewing Supabase migrations, RLS policies, SECURITY DEFINER functions, storage bucket policies, or any client code that writes through PostgREST. Also when a write "succeeds" but nothing changed, a policy tightening had no effect, or a local Postgres test harness disagrees with hosted Supabase. Trigger on RLS, row level security, policy, GRANT, auth.uid, service_role, storage.foldername, or supabase/migrations.
---

# Supabase guardrails

Traps that produce no error and no failing test. Each one below cost a real
bug.

## Row-level security

**Policies are OR'd.** Adding a restrictive policy widens access, it never
narrows it. To tighten, `DROP POLICY IF EXISTS "<exact old name>"` and replace
it. After any tightening, prove the previously-allowed case is now denied —
otherwise you have added a policy and changed nothing.

**An absent policy denies silently.** With RLS on and no policy for an
operation, that operation affects zero rows and returns success. It does not
raise. So:
- In client code, a "successful" update may have done nothing.
- In tests, asserting on a raised exception tests the *grants*, not the
  policy. Assert the row did not change.

**`WITH CHECK` gates the new row; `USING` gates which rows are visible to the
statement.** An UPDATE policy needs both, and they are frequently different.

**Check consent at the moment of the act.** A policy that asks "does an
assignment row exist" is not asking "is the share still live". Include the
active/suspended/expiry conditions in the policy itself, not in the caller.

## Grants

**Default privileges apply at CREATE TABLE.** A new table arrives with `ALL`
granted to `authenticated`, so a later `GRANT SELECT, INSERT` adds nothing and
removes nothing. Write:

```sql
REVOKE ALL ON public.<table> FROM authenticated;
GRANT SELECT, INSERT ON public.<table> TO authenticated;
```

Then RLS is your second line rather than your only one.

**`service_role` carries `BYPASSRLS` on hosted Supabase.** A local shim without
it turns "the notify function can read these" into a missing-grant failure that
looks like a policy bug.

## SECURITY DEFINER

- Always `SET search_path = public`.
- `REVOKE EXECUTE ... FROM PUBLIC, anon` and grant only the role that should
  call it. An internal helper should be revoked from `authenticated` too.
- Re-check the caller's identity *inside* the function. Definer rights mean the
  function's own checks are the only ones left.
- `SELECT ... FOR UPDATE` before a state transition, or two taps on a slow
  connection both apply.

## Writing through PostgREST

**A zero-row UPDATE or DELETE is a clean success.** Add `.select('id')` and
throw when the array is empty, or the toast says "Saved" and nothing did.

**`.single()` raises PGRST116 on zero rows; `.maybeSingle()` does not.** A mock
returning `{data: null, error: null}` for `.single()` hides every branch you
wrote for the error.

## Applying a payload from an untrusted caller

Never spread a client-supplied object into an UPDATE. Read a **fixed key list**
and `COALESCE` each column against its existing value. That gives you two
properties at once: the write cannot reach a column the design did not intend
(`user_id`, `id`, provenance columns), and a partial payload behaves as a diff
rather than blanking everything it omitted.

## Triggers that quietly rewrite your write

A `BEFORE UPDATE` guard trigger may reset columns for anyone who is not the
row's owner, returning `NEW` unchanged in every other respect. No error. In
tests this silently undoes fixture setup performed under a leftover
`request.jwt.claim.sub`. Set the claim to the right identity before fixture
writes, and read the value back to confirm it took.

## Local test harness parity

To replay migration history into a throwaway database, the shim must run
**before** the migrations and provide: `anon`/`authenticated`/`service_role`
roles (service_role with `BYPASSRLS`), `auth.uid()` reading
`request.jwt.claim.sub`, `storage.foldername/filename/extension`,
`realtime.messages` and the `supabase_realtime` publication, `cron` stubs,
schema grants, and `ALTER DEFAULT PRIVILEGES`. Do not follow it with a blanket
`GRANT ALL` — that erases every deliberate `REVOKE` in the migrations.

A harness whose failures are mostly its own gaps is worse than no harness. Fix
the shim before reporting any result from it.
