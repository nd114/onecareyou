# Backup restore runbook

Turns "restore a backup into a scratch project" from a line on a roadmap
into a sequence someone can actually run. Written because
`docs/continuity/service-continuity.md` says plainly that this has never
been done — an untested backup is a hypothesis, not a guarantee, and this is
the test.

**This cannot be run from inside a Claude Code session.** It needs Supabase
dashboard or CLI access to the production project, which an agent working in
a repository checkout does not have and should not be given. What follows is
for whoever holds that access — a human, once, and then on the quarterly
cadence `service-continuity.md` §8 proposes.

---

## What this proves, and what it does not

**Proves:** a backup can actually be turned back into a working database, and
how long that takes — the real RTO, not the proposed one.

**Does not prove:** that RLS, edge functions, or storage come back configured
identically. A schema-only or data-only restore that "worked" while silently
losing a policy is worse than an honest failure, which is why step 4 below
checks policy counts, not just that tables exist.

## Before starting

- A **separate, scratch Supabase project** — never restore into anything
  serving traffic, staging included, in case the restore itself goes wrong.
- The production project's most recent backup, or PITR access to a specific
  timestamp (Dashboard → Database → Backups).
- Fifteen minutes where a slow step won't be mistaken for a stall — the
  first run of anything like this is always slower than it will be once
  practiced.

## Steps

### 1. Start the clock

Note the wall-clock time. Everything below is timed from here; the total is
the number that goes in `service-continuity.md` §3 in place of "proposed."

### 2. Take the restore point

**Point-in-time recovery** (the realistic production path): Dashboard →
Database → Backups → Point in Time Recovery, choose a timestamp within the
retention window, and restore *into a new project* if the option is
offered — check for it explicitly; some plans only offer in-place restore,
which is not what this test is for.

**Logical backup** (if PITR is not available on the current plan, or to
cross-check it): from a machine with the Supabase CLI and the project's
connection string,

```bash
supabase db dump --db-url "$PROD_DB_URL" -f backup.sql
```

then apply it to the fresh scratch project:

```bash
psql "$SCRATCH_DB_URL" -f backup.sql
```

### 3. Stop the clock

That elapsed time is the RTO this system can actually deliver today. Write
it down before doing anything else — it is easy to round it away once the
excitement of a working restore takes over.

### 4. Verify it is actually the database, not just a database

A restore that comes back empty, or with RLS disabled, has not restored
anything worth calling a backup. Check, against the scratch project:

```sql
-- Row-level security is not optional in this schema — if this count is
-- wrong, every other check below is meaningless.
SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
-- Compare to the same query against production. They should match.

-- A handful of tables that must have rows if this is real data, not an
-- empty schema.
SELECT
  (SELECT count(*) FROM public.profiles) AS profiles,
  (SELECT count(*) FROM public.health_documents) AS documents,
  (SELECT count(*) FROM public.vitals) AS vitals;

-- Every SECURITY DEFINER function actually came across, not just its table.
SELECT count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef;
```

Compare all three against the same queries run against production. A
mismatch is the finding — write down which one and by how much.

### 5. Confirm storage separately

A database restore does not bring back Storage objects — they are a
separate system. If Health Vault documents matter to the restore story (they
do), check whether the plan actually covers `storage.objects` and the
underlying buckets, or whether this is a second, undocumented gap sitting
behind the first one. This runbook does not attempt a storage restore; it
exists to surface whether one is needed.

### 6. Record the result

Update `docs/continuity/service-continuity.md`:

- §3: replace "TBD — proposed 4 hours" with the measured time from step 3,
  and change "Not agreed" only once someone with the authority to agree to
  it has actually seen this number.
- §6: remove "No verified backup restore" from the honest gaps, or narrow it
  to whatever step 4 or 5 actually found wrong.
- §8: date this run, and schedule the next one — a test performed once and
  never repeated degrades back into a hypothesis the moment the schema next
  changes.

### 7. Tear down

Delete the scratch project once the numbers are recorded. It held a real
copy of production data for however long this took.

## What this runbook deliberately does not decide

Whether 4 hours and 15 minutes (or whatever step 3 actually measures) is an
*acceptable* RTO/RPO for this product is a business decision with contractual
weight, not a technical one — see `service-continuity.md` §3's own note that
an RPO is a promise about how much data you are willing to lose, and needs a
named owner before it goes in front of a customer. This runbook produces the
number; it does not decide whether the number is good enough.
