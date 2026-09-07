# Auth hardening — the settings that are not in this repository

Most of OneCare's limits are migrations, and a migration can be reviewed, tested
and replayed. The ones on this page cannot: they belong to Supabase Auth, they
live in the project dashboard, and nothing in the codebase can assert them.

That is the whole reason this page exists. `check_signin_allowed()` throttles the
sign-in **form**, which stops the ordinary case — a password list worked through
in the app, a script driving the real UI, a client stuck in a retry loop. It
cannot see a request that goes straight to `/auth/v1/token`, and there is no
version of a database function that can. **Everything below is what covers that,
and none of it is on by default at the level we want.**

## What to set

| Setting | Where | Target | Why |
|---|---|---|---|
| Sign-in / sign-up rate limit | Auth → Rate Limits | 30 per hour per IP | The endpoint an attacker actually hits. Our form limit is 50/15min per IP, so this is the tighter of the two and the one that matters. |
| Token refresh rate limit | Auth → Rate Limits | Default is usually fine | Raise only if legitimate clients are being refused. |
| Email OTP / magic link | Auth → Rate Limits | 10 per hour per address | Also a mail-cost control, not only a security one. |
| Password minimum length | Auth → Policies | 10 | Longer beats complex. The strength meter in `src/lib/password-strength.ts` already scores length heavily; this makes the floor real. |
| Leaked password protection | Auth → Policies | On | Checks against HaveIBeenPwned at sign-up. The single highest-value switch on this page. |
| Email confirmation required | Auth → Providers → Email | On | **Load-bearing.** `clinician_patient_records` releases a pending record to whoever proves the address. `supabase/tests/pending_records_confirmation.test.sql` covers the policy; the policy relies on `email_confirmed_at` being real. With confirmation off, signing up as somebody else's address is enough to read their record. |
| MFA | Auth → Providers | Enabled, enforced for clinician accounts | A clinician account reaches many patients' records. Not yet built into the app's sign-in flow — see the roadmap. |
| Session timebox | Auth → Sessions | 24h inactivity, 30d absolute | A shared ward workstation is the case this is for. |

## How to check it, rather than assume it

The dashboard shows what is configured; it does not show what happens. Two
checks worth running after any change:

1. **Rate limit.** From a machine that is not the office, post eleven wrong
   passwords for a test account to `/auth/v1/token?grant_type=password`. The
   eleventh should be refused by Supabase, not by us. If all eleven get a clean
   "invalid credentials", the dashboard limit is not doing what this page says.
2. **Email confirmation.** Create a clinician-managed record against an address
   you control but have not confirmed, then sign up with it and do not click the
   link. The pending record must not be readable. If it is, confirmation is off
   and `pending_records_confirmation` is passing against a shim rather than the
   live rule.

## Record of what is actually set

Nobody has been able to confirm these from inside a session — the environment
cannot reach the dashboard. **Fill this in from the project settings and date
it.** An empty table below means the limits are unverified, which is not the
same as absent, and should not be read as either.

| Setting | Value in production | Checked by | Date |
|---|---|---|---|
| Sign-in rate limit | | | |
| Leaked password protection | | | |
| Email confirmation required | | | |
| Password minimum length | | | |
| Session timebox | | | |
