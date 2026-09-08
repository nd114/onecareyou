---
name: verify-before-claiming
description: Use before reporting that a check passed, a test covers something, a fix works, or a suite is green — and when writing any new test. Guards against the failure where the verification tool silently checked nothing: a no-op typecheck, a zero-row UPDATE that returns success, a fixture a trigger reverted, a mock that hides every branch. Trigger on "typecheck passes", "tests pass", "verified", "confirmed working", "all green", or before any commit message that states a result.
---

# Verify before claiming

A green check that checked nothing is worse than no check, because it stops
anybody looking again. Before reporting a result, establish that the thing
producing it could have failed.

## The rule

**Every verification claim needs a demonstration that the verifier can fail.**

Not "I ran it and it passed" — "I ran it, then broke the code, watched the
right assertion fail, and put it back."

## Run this before saying a test is good

For each new or changed test:

1. Break the specific behaviour it names — invert a condition, delete a guard,
   let a forbidden value through.
2. Run only that test file.
3. Confirm **the assertion you expected** failed, not a different one.
4. Restore, re-run, confirm green.

If breaking the code does not fail the test, the test is decoration. Fix it
before moving on. If a *different* assertion fails, your test is coupled to
something other than what its name claims.

## Known ways a check silently checks nothing

Verify the tool itself before trusting its output.

**A solution-style tsconfig makes `tsc --noEmit` a no-op.** A root
`tsconfig.json` with `"files": []` and `references` checks nothing without
`--build`. Look for a `typecheck` script and run that. Cheap test: introduce a
deliberate type error and confirm the command reports it.

**An UPDATE or DELETE matching zero rows is a clean success.** PostgREST and
most ORMs return no error. The UI says "Saved" and nothing changed. Add
`.select('id')` and check the returned array is non-empty, or assert on the row
afterwards.

**A permissive policy you did not remove is still in force.** Row-level
security policies are OR'd. Adding a restrictive one widens, never narrows.
Drop the old policy by name.

**A mock that returns `{data: null, error: null}` hides every branch written
for the error case.** If the real client throws on zero rows, the mock must
too.

**Default privileges are applied at CREATE TABLE, so a later GRANT of a
narrower set adds nothing.** `REVOKE ALL` first, then grant what you mean.

**A trigger can silently revert your test fixture.** A guard trigger that
resets a column for unauthorised writers will quietly undo setup performed
under the wrong identity, and the assertion then passes or fails for a reason
unrelated to its name. After any fixture write that matters, read it back and
assert it took.

**An absent policy denies silently; a revoked privilege raises.** A test that
asserts on the exception passes only while the grants happen to be what stops
it. Assert on the resulting state — the row did not change — not on the error.

**Timers.** `waitFor` polls on real timers and hangs under fake ones.

## When you report

State what ran and what it covered. If something was skipped or is unverified,
say which. Never carry forward a "passing" claim from an earlier run of a
command you have since learned was a no-op — correct it explicitly.
