# Test strategy — flows, devices, and attack

Status: **written September 2026. Phase 1 partly built, Phase 3's runner built.**

## What exists now

| Piece | State |
|---|---|
| `scripts/db-test.sh` | **New.** Replays the migration history into a throwaway database and runs every SQL test. 157 of 159 migrations replay; 35 of 39 suites pass. |
| `src/test/pages-smoke.test.tsx` | **New.** All 82 page components mount in the real providers. |
| `src/test/support/supabase-mock.ts` | **New.** A chainable client fixture the journey tests will use. |
| Unit / logic | 988 assertions. |
| Device rendering | Playwright harness, used ad hoc; not yet a matrix. |
| Journeys P1–P5, C1–C5, E1–E2 | **Not built.** Next. |

### What the runner found on its first full run

Sixteen suites failed. Eleven were the harness, not the product — the shim was
missing `storage.foldername()`, which ten migrations use in their bucket
policies, so a dozen suites were failing against a schema that had not finished
building. Worth stating plainly: **a runner whose failures are mostly noise is
worse than no runner**, because people learn to skim it.

Two were real, and both are the same shape as the bugs this codebase keeps
producing:

- **A test asserting a widening of consent.** `institution_access` demanded that
  a *medications* grant open the patient's dose history. That was true when
  adherence rode along with medications; the share-vocabulary convergence made
  adherence a category the patient grants separately, and the test was never
  updated. Had it been "fixed" by changing the code, it would have reopened
  consent the patient had not given. Fixture corrected instead.
- **Two suites referencing a table that no longer exists.**
  `public.practice_patient_access` was removed by the one-access-table
  migration; `non_clinical_staff` and `practice_access_consent` still query it.
  They have not run since, and nobody noticed, which is the argument for the
  runner in one sentence.

### Still failing, triaged rather than hidden

| Suite | Why | Verdict |
|---|---|---|
| `non_clinical_staff` | Queries `practice_patient_access`, dropped in the convergence | Stale test — rewrite against `practice_shares` |
| `practice_access_consent` | Same | Stale test — same fix |
| `contact_submissions` | `permission denied for table contact_submissions` when acting as `anon` | Needs a look: either the revoke went too far or the test predates it |
| `pending_records_confirmation` | "masking removed too much to recognise the record" | Needs a look — the masking assertion may have drifted from `maskPhone`/`maskEmail` |

None of these is claimed as fixed.

## Where we actually are

906 assertions, and almost all of them are about *logic*: does this function
grade this reading correctly, does this parser handle this label, does this
policy refuse this caller. That is good coverage of the parts that are easy to
get wrong quietly, and it has found real bugs — a diastolic scored as normal, a
Fahrenheit temperature read as Celsius, a recording dropped at sixty seconds.

What it does not cover is **anything that spans more than one screen**. Nothing
exercises sign-up → onboarding → first reading. Nothing exercises invite → accept
→ see patient. A person could break the join between two working parts and every
test would pass. That is where the remaining bugs are, because that is the only
place left they can hide.

Three gaps, in the order they should be closed:

1. **Journeys.** Multi-step, multi-page, one user type at a time.
2. **Devices.** The same journeys at phone width, with the chrome that only
   exists there — bottom tab bar, sticky sub-tabs, safe-area insets.
3. **Adversarial.** What a person can reach who should not, and what a
   determined one can do to the parts that accept input.

## Why not simply "write E2E tests"

Because the environment cannot reach the live backend — the network policy
refuses CONNECT to the Supabase host — so a test that signs in cannot run here.
Pretending otherwise produces a suite that is green because it never ran.

So the strategy splits by what can be *executed* versus what must be *scripted
for someone with backend access*:

| Layer | Runs where | Real today |
|---|---|---|
| Unit / pure logic | `npx vitest run` | Yes — 906 |
| Database rules | `psql` against local Postgres | Yes — the `supabase/tests/*.sql` suite |
| Component journeys | vitest + Testing Library, Supabase mocked at the client boundary | **This is the gap Phase 1 fills** |
| Rendered device checks | Playwright against a local Vite build with mocked data | Yes, and already used for the rail and coverage work |
| Live end-to-end | Needs backend access | Scripted here, run by whoever has it |

The third row is the important one. A journey test does not need a real
database — it needs the *client* to behave as it would, with the network
answering the way the real one does, including the ways it fails.

---

## Phase 1 — Journeys

One file per journey, Supabase mocked at `@/integrations/supabase/client`, real
components, real routing, real hooks.

**Patient**
- P1. Sign up → onboarding → dashboard, with the getting-started card showing the right next step.
- P2. Log a reading → it appears → the risk badge and its explanation move.
- P3. Add a medication → today's schedule shows the dose → mark it taken.
- P4. Share with a clinician → revoke → the clinician's access ends and the history shows both.
- P5. Ask the assistant a medication question → the reply carries its source and the disclosure.

**Clinician**
- C1. Invite → accept → the new member appears on the roster with the right role.
- C2. Open a patient → the rail follows down the chart → an action opens the right tab.
- C3. Record a dictation → transcribe → edit → approve → file into the record.
- C4. Set an alert rule → a breaching reading raises it → acknowledge clears it.
- C5. Create a department → staff it → archive it → (owner) delete it.

**Enterprise**
- E1. Owner turns on assignment-first → a clinician's panel narrows → an admin's does not.
- E2. Coverage tab reports the right gaps for a known roster.

**Cross-cutting**
- X1. Every route renders signed-out without crashing, and redirects where it should.
- X2. Every route renders signed-in as a patient, and as a clinician, without a console error.

X1 and X2 are worth more than they look: a crash on an unvisited route is the
commonest thing a manual pass misses, and they are cheap.

## Phase 2 — Devices

The Playwright harness already used in this repo, extended to a matrix:

| Width | Stands for | Watch for |
|---|---|---|
| 390×844 | Phone | Bottom nav overlap, sticky sub-tab collision, safe-area insets, tap targets |
| 768×1024 | Tablet | The awkward middle — sidebars that appear before there is room |
| 1280×800 | Laptop | The default nobody checks because it always looks fine |

Per screen: no horizontal overflow, no console error, focus visible on tab, and
the primary action reachable without scrolling.

## Phase 3 — Adversarial

Two kinds, and they need different methods.

**Authorization** — run as SQL against local Postgres with the migration history
replayed, because that is where the rules live:
- A1. Patient A reads patient B's record by every path that returns rows.
- A2. Clinician without a share reads a patient. Then with a *revoked* share.
- A3. A non-owner admin calls every owner-only function.
- A4. A suspended practice member reads what they could yesterday.
- A5. A patient escalates their own subscription tier, role, or share permissions.
- A6. Cross-tenant: hospital A's admin reads hospital B's roster, audit, patients.

A1–A6 restate the August security review as standing tests rather than a
document. Three of those findings were real and are now fixed; nothing stops
them coming back.

**Input** — unit level, against the parsers:
- B1. CSV import: quotes, embedded newlines, a formula in a cell, 50k rows.
- B2. Drug names: injection through the openFDA query, a 10 kB name.
- B3. Vitals: negative, zero, absurd, wrong unit, non-numeric.
- B4. AI: prompt injection in a document the assistant summarises; a patient
      asking it to change a dose; a patient asking it to act on someone else.
- B5. File upload: wrong type renamed, oversized, zero-byte.

**B4 deserves emphasis.** The assistant reads documents a clinician uploaded and
labels retrieved from the internet. Both are places a hostile instruction can be
planted, and the assistant can propose changes to a medication list.

## What "done" means

- Phase 1: every journey above has a test, and each one has been verified by
  breaking the code and watching it fail. A journey test that has never failed
  has not been shown to test anything.
- Phase 2: the matrix runs on one command and reports overflow, console errors
  and focus visibility per screen.
- Phase 3: A1–A6 run in CI against a replayed migration history; B1–B5 sit
  alongside the existing unit tests.
- The live end-to-end script is written down for whoever has backend access,
  with the demo credentials and expected results, so it is a checklist rather
  than an exploration.
