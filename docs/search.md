# Search

## What was there

Fifty-four `toLowerCase().includes(query)` filters in the client, one
server-side `ilike`, and no fuzzy matching anywhere. Substring matching is not
search, and its failures are not edge cases on a health platform used across
countries:

| Somebody types | The row says | Substring filter |
| --- | --- | --- |
| `jose` | José Álvarez | nothing |
| `muller` | Anne Müller | nothing |
| `oconnor` | Síobhán O'Connor | nothing |
| `cocodamol` | Co-codamol | nothing |
| `pressure blood` | For blood pressure | nothing |
| `amlodipin` | Amlodipine | nothing |
| `metformin` | *(a note mentioning metformin sorts first)* | wrong order |

The last one is the failure people actually hit, because drug names are long
and unfamiliar. An empty list reads as "that isn't here", not "you mistyped".

## Two halves

**`src/lib/search.ts`** — for lists already in memory, where a round trip would
be absurd. Normalises (accents decomposed, apostrophes and hyphens closed up,
everything else split), matches every term (so two words narrow rather than
widen), ranks exact above prefix above substring above fuzzy, and weights
earlier fields above later ones so a name match beats a passing mention in a
note.

**`supabase/migrations/20260909100000_fuzzy_search.sql`** — `pg_trgm` with GIN
indexes, for lists too large to hold client-side. This is the half that matters
at a hospital, where the patient list is thousands of rows.

`search_normalise` in SQL mirrors `normaliseForSearch` in TypeScript step for
step, and the SQL suite asserts three cases against the exact strings the unit
tests use. If they diverge, the same query answers differently in the browser
and the database, which is worse than either behaviour alone.

## Search may never see further than a read

Every search function is `SECURITY INVOKER`, so RLS answers. A `SECURITY
DEFINER` search over patients would let any clinician find any patient by name
— a leak wearing a helpful face — and it is a tempting shortcut because it
makes the query simpler and faster. The SQL suite checks the security
declaration of every `search_*` and `suggest_*` function rather than trusting
the migration to have got it right.

Related, and caught by that suite: Postgres grants `EXECUTE` on a new function
to `PUBLIC`, so each one needs an explicit `REVOKE` or a signed-out visitor can
call it. The first version of the migration revoked two of six.

## Why trigrams and not edit distance

Levenshtein says "cat"/"cot" are as close as "hat"/"hot", and says almost
nothing useful about two long drug names sharing a stem. Trigram overlap is
also what `pg_trgm` uses, so a result ranked in the browser and one ranked in
Postgres are ranked comparably.

Words are padded the way `pg_trgm` pads them, so the start of a word counts —
without it "amlo" scores poorly against the drug it opens.

## "Did you mean …?"

Offered only when the search found nothing and something was close. Offering a
correction beside results teaches people to distrust the results.

**The suggestion threshold has to be below the matching one.** The first
version used a higher bar for suggesting than for matching, reasoning that a
wrong suggestion is worse than none. That makes the band empty by construction:
anything scoring above the matching threshold has already been returned, so the
suggestion can never fire. A test expecting a suggestion for a typo the matcher
was in fact finding is what surfaced it.

Measured, the usable band is narrow but real. Matching sits at 0.3, suggesting
at 0.17:

| Query | Score against "Atorvastatin" | Outcome |
| --- | --- | --- |
| `atorvastine` | 0.56 | found |
| `atorvstn` | 0.29 | suggested |
| `xqzptv` | ~0 | nothing, honestly |

Dropping vowels from a long drug name is what lands in the band, which is a
fair description of how people mistype drug names.

A suggestion is always a whole value some row actually carries, never a
reconstructed phrase — sending somebody hunting for a thing that was never
there is worse than an empty list.

## Wired so far

`Medications`, `HealthVault` (both with the correction offered on an empty
result, clickable so it runs the search rather than only telling somebody what
they should have typed), and `ClinicianPatients` for both the shared-patient
list and managed records.

The remaining in-memory filters — admin panels, help topics, message threads —
still use `includes()`. They are small lists where the cost of a bad match is
low, and `search()` is a drop-in replacement when each is next touched.
