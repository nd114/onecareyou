# Driving the signed-in app in a browser

Four QA passes over this branch tested the database and the source. None of them
could say what a rule looks like from the other side of the screen — which is
where a correct refusal reads as nothing happening, a correct row gets labelled
with the wrong word, and a value in the wrong unit is just a number.

This is the instrument for that. It puts a real browser in front of the real
app, backed by the real migration history, with row policies enforced by
Postgres exactly as the hosted project would enforce them.

## What it is

`server.mjs` speaks enough of Supabase's HTTP surface for the app to run:

| Surface | What it does |
| --- | --- |
| `/auth/v1/*` | Signs in against a local credentials table, mints an HS256 JWT |
| `/rest/v1/*` | Translates PostgREST filters, embeds and RPCs into SQL |
| `/storage/v1/*` | Object rows in `storage.objects`, bytes on disk |
| `/functions/v1/*` | A visible refusal, so a screen that depends on one shows up |

Every request opens a transaction, `SET LOCAL ROLE authenticated`, and sets
`request.jwt.claims`. **Row policies are therefore enforced by the same Postgres
the SQL suites test, through the same client code, in a real browser.**

## What it is not

It is not Supabase. It does not run the edge functions, the real storage
service, or realtime, and it says nothing about the hosted project's own
configuration. Two subscription probes answer with a canned free tier because
they run on every screen and their noise buries everything else; every other
edge function answers 503 on purpose.

**When a finding depends on the instrument, test the instrument first.** Two
convincing bugs during the pass that produced this were faults in here, not in
the app — `numeric` returned as a string that a `reduce` concatenated, and
`timestamptz` filters compared as text so every ranged query came back empty.
Both are fixed and both are the reason this paragraph exists.

## Running it

```sh
npm i                                  # pg is a devDependency
npm i -D playwright && npx playwright install chromium   # only for drive.mjs
scripts/db-test.sh                     # replay the migrations somewhere
DBNAME=onecare_live scripts/db-test.sh happy_paths
psql -d onecare_live -f scripts/local-supabase/seed.sql

node scripts/local-supabase/server.mjs &          # 127.0.0.1:54321

cat > .env.local <<'ENV'
VITE_SUPABASE_URL="http://127.0.0.1:54321"
VITE_SUPABASE_PUBLISHABLE_KEY="shim-anon-key"
VITE_SUPABASE_PROJECT_ID="shim"
ENV
npm run dev -- --host 127.0.0.1 &

node scripts/local-supabase/drive.mjs patient /dashboard /medications /vitals
node scripts/local-supabase/drive.mjs clinician /clinician/today
node scripts/local-supabase/drive.mjs anon / /pricing /guide
```

`.env.local` is gitignored by the `*.local` rule. Delete it when you are done or
the app keeps pointing at the shim.

`drive.mjs` walks routes and reports console errors, page errors, failed
requests and blank pages as JSON, with a screenshot per route in `shots/`.
`probe.mjs` is the smaller helper for interaction tests — sign in, dismiss the
cookie banner, act, read the toast.

## The accounts

`seed.sql` creates `demo-patient-1@`, `demo-patient-2@` and
`demo-clinician-1@onecare.you`, all with `Demo123!`, plus a practice, a share
between the first patient and the clinician, medications with three different
provenances, readings in mmol/L and mmHg, one reading the clinician took during
a visit, two documents, and an instruction awaiting acknowledgement.

Every value it writes is one the application actually writes. That matters: an
invented status is how a fixture told us the patient's Instructions page said
"All caught up!" while a clinician's instruction sat in the table — which was
the fixture's fault, and led to the constraint that would have caught the real
version of it.
