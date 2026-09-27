# Continue locally — 27 September 2026

Where the cloud session stopped, what is confirmed but unfixed, and what to do next, in order.

## Where things are

- **`claude/product-direction-sep-2026`** — the fork. Eight commits on top of
  `claude/medplum-fhir-adapter` at `6d4db16`, all pushed. **Not merged yet.**
- **`claude/medplum-fhir-adapter`** — the first branch. Lovable also pushes here, so pull
  before merging into it.
- Plan: fix P0-1 to P0-4 below on the fork, merge it into `claude/medplum-fhir-adapter`,
  then delete the fork. Details are under **Merge** at the end.

### Done on the fork

| Commit | What |
| --- | --- |
| `1890df3` | Capabilities resolve against the chosen workspace, not `memberships[0]`. `activeMembership` in `lib/staff-roles.ts`. |
| `7650016` | Search everywhere: ⌘K, plus a header button on phones, for clinicians and patients. |
| `4148347` | The tenant audit log is scoped on the patient side too. Migration `20261008000000` plus a test. |
| `955fead` | Search fetches nothing until it is opened, and only the searcher's own data. The shortcut is tested. |
| `84c5e90` | One store holds the workspace choice for every reader. Fixes `1890df3` after an in-session switch. |
| `c046b7f` | The workspace selector is in the header. Rail flash and jump fixed, duplicate logo removed, rail fails closed, tab-row selector scoped, correct icon, and the doc now says 49px. |

Verification at `c046b7f`:
- typecheck is clean
- vitest: 80 files, 1104 tests
- SQL suite: 59/59 at `4148347`. Later commits are front-end only.
- Browser-checked against the local shim: the search access boundary, the in-session workspace switch moving permissions, 0 frames of rail jump, and phone layout.

## PHI leaks confirmed but not fixed — do these first

Each finding comes from a read-only audit and has a repro in `docs/security/phi-audit-2026-09/`. Every repro is `BEGIN … ROLLBACK`, runs as `authenticated` where RLS matters, and stores its output next to it (`rN.out`).

**Those scripts are working exploits for holes that are still open in production.**
- As each fix lands, turn its repro into a `supabase/tests/*.test.sql` regression test that fails before the fix and passes after.
- Delete the folder once all are converted.

### P0 — cross-tenant or cross-patient disclosure

**P0-1. A forged `practice_shares` row reads any patient** (`phi-p1a/r2`)
- **How it works:**
  - Anyone can create a practice and becomes its owner.
  - They share themselves with it, then UPDATE that share's `user_id` to any victim. The policy "Practice admins can only end shares…" has a WITH CHECK that pins `is_active = false` but not `user_id`.
  - `provider_shares` has a guard trigger against this; `practice_shares` has none.
- **What leaks:**
  - `practice_patient_overview`, `practice_audit_log` and `get_patient_identity` return the victim's name, email and phone.
  - They also return the victim's audit trail from other hospitals.
  - The attack repeats for each victim.
- **This bypasses the `20261008` fix**, which trusts `practice_shares` rows.
- **Related:** "Practice managers can add members" enrols any clinician as active without their consent.
- **Fix:**
  - Add a BEFORE UPDATE guard on `practice_shares` that pins `user_id`, `practice_id`, `permissions` and `share_all` for anyone but the patient. Mirror the `provider_shares` guard.
  - Make adding a member an invitation the invitee accepts.

**P0-2. `get_patient_identity(uuid[])` returns name, email and phone for any uuid** (`phi-p1a/r1`, `r8`)
- **The main hole:** the `clinician_patient_records` INSERT policy only checks `clinician_user_id = auth.uid()`. The caller can therefore set `linked_user_id` to anyone, and the function trusts that arm.
- **Also:**
  - The clinician-share arm ignores `expires_at`.
  - The practice arm ignores `is_active` and suspension.
- **Fix:**
  - Gate every id on `clinician_has_patient_access OR institution_has_patient_access`.
  - Drop the staging-record arm.
  - Stop clients writing `linked_user_id`.

**P0-3. Non-clinical staff (front desk, billing, read-only, staff) read clinical data** (`phi-p2/repro1` T1, `phi-p2/repro2`, `phi-p1a/r5`)
- **Where:** the `medications`, `schedule_entries` (adherence) and `health_documents` policies use `institution_has_patient_permission`, which has no role check. So does `get_patient_clinical_profile`, which returns diagnoses and allergies.
- **For comparison:** `vitals` correctly uses `institution_has_clinical_permission`.
- **Regression:** migration `20260904213723` undid `20260904044932` for medications.
- **Fix:**
  - Switch all four to `institution_has_clinical_permission`.
  - Extend `non_clinical_staff.test.sql`, which today checks only encounters, notes and vitals.

**P0-4. Removed members, and non-clinical staff with an assignment, read and write encounters** (`phi-p2/repro1` T2, `repro2`)
- **Where:** the `encounters` SELECT and INSERT policies and the `encounter_addenda` SELECT policy include `is_assigned_to_patient()`.
- **Missing checks:** that helper checks the practice share but not the member's status or role.
- **Why removal doesn't help:** `removeMember` sets `status = 'revoked'` and never ends the person's assignments.
- **Fix:**
  - Use `institution_has_clinical_access(p)` in those three policies.
  - End-date assignments when a member is revoked or moved to a non-clinical role.

### P1

**P1-5. Member-directory functions leak the name and email of any uuid** (`phi-p1a/r7`)
- `practice_member_directory`, `practice_staff_overview` and `practice_pending_affiliations` are all affected.
- An owner can insert a `pending_approval` membership for any uuid.
- **Fix:** the same invitation change as P0-1.

**P1-6. `withdraw_shared_file` shows an existing retraction record to anyone** (`phi-p1a/r3`)
- It returns early, before the authority check.
- **Fix:** move the check before the early return.

**P1-7. `withdraw_shared_file` records the wrong hospital** (`phi-p1a/r4`)
- It uses the sender's first active membership as `sending_practice_id`. Hospital A then sees hospital B's withdrawal.
- **Fix:** use the practice the recipient shares with, or NULL if there is none.

**P1-8. Billing and front desk read practice-created patient records, even after revocation** (`phi-p2/repro2`)
- `may_manage_practice_patient_records` admits `can_invite_patients`, which defaults to true for everyone.
- **Fix:**
  - Drop that branch from the read path.
  - Once `linked_user_id` is set, require a live share.

**P1-9. A wrong-document recipient reads the practice's internal incident note** (`phi-p2/repro1` T3)
- That note can name the intended patient.
- **How:** `document_retraction_events` has a table-wide SELECT grant, and the recipient's policy filters rows, not columns.
- **Fix:** serve recipients through a definer view with only the safe columns, and remove the recipient policy from the base table.

### P2 and unverified

**P2-10.** `admin_recent_signups`, `admin_audit_export` and `admin_access_log_search(NULL)` browse people without a search term. They are platform-admin only, but break the "search, don't browse" rule from `20261006`. **Fix:** the same two-character floor.

**Unverified:**
- The avatar policy matches an unconfirmed email: `get_current_user_email()` where every other share policy uses `confirmed_email()`.
- The typing indicator uses a public broadcast channel, which reveals who is messaging whom.

## Audits that did not finish — re-run locally

These were stopped when the session wound down.
- Point each at the replayed database: `onecare_test` after `./scripts/db-test.sh`.
- Keep each read-only with `BEGIN … ROLLBACK` repros.
- Run everything as `authenticated` (`SET LOCAL ROLE authenticated`), because superuser bypasses RLS.

1. **Access gates and action functions.**
   - For every boolean gate used in RLS (`clinician_has_patient_permission`, `institution_has_patient_permission`, `share_grants`, `is_assigned_to_patient`, …), check that it enforces at call time:
     - active, `revoked_at`, expiry, and share- and practice-level suspension
     - non-clinical roles excluded
     - `assignment_first_access`, with assignment never counting as consent
     - department scope
     - `share_grants` failing closed on unknown keys
   - List the policies that inherit each gate.
   - For every void/id-returning definer function that writes shares, assignments, memberships, roles or invitations: can a caller use it to gain access they should not have?
   - Also cover Care Circle and caregiver paths.
2. **Edge functions and the browser.**
   - Any of the 43 functions that uses the service role must authenticate the JWT and authorise for that specific patient. Look for ids taken from the request body (IDOR).
   - Record what PHI goes to third parties: AI, email, SMS, WhatsApp, push.
   - PHI left in localStorage or the TanStack cache after sign-out, and a second account on the same browser seeing the first's cache.
   - PHI in URLs, `document.title` or `console.*`.
3. **An independent review of the fork's commits.** Hunt for defects in:
   - `activeMembership`, `useWorkspaceSelection` and the capability query key
   - the search access paths:
     - Does `useClinicianPatients` follow the selected workspace?
     - Do institution patients' `inst-<id>` routes resolve?
   - the `20261008` predicate. Note that P0-1 already undermines it.

## Harness gap worth fixing early

Migration `20260522174925` fails locally at its first `realtime.topic()` policy, because the replay shim doesn't define that function. Nothing after that statement in that migration runs locally, including:
- dropping `health_documents` from `supabase_realtime`
- the fixed patient-avatar policy
- dropping the clinician-avatar listing policy
- several REVOKEs

So local storage and realtime state is not what hosted runs. Stub `realtime.topic()` in the pre-migration shim that `scripts/db-test.sh` loads.

## Defect list — still open

- **Realtime is dead in production.** The websocket answers 500 at handshake, on every page and every account, so anything that updates live is silently stale. Check the hosted project's Realtime settings in the Supabase dashboard first; it is probably configuration, not code.
- **Phone overflow.** At 390px, `/clinician/audit` (timestamps) and `/health-vault` ("Upload Document") overflow by about 50px.
- **Misleading audit heading.** `ClinicianAudit.tsx:167` says "Last 500 events across your team" to a solo clinician who sees only their own rows.
- **Empty IP column.** It is empty in 0 of 95 rows, yet shown and exported as if it held data. Either populate it (the triggers can read request headers) or remove it.
- **`previewAuthStorage.ts:81-86`.** Bot commit `0245f1a` edited a generated file. `setItem` can delete the session on an empty broker reply, which only matters in the Lovable preview iframe. Let Lovable regenerate the file rather than editing it.
- **Department descriptions.** Nobody can write them (`createDepartment` only sends `{name}`) and nothing shows them.
- **`practices.is_active = false`.** Something sets it, though the column defaults to `true`. `usePractice` hides inactive practices, and the workspace switcher disappears with them. Find what sets it: likely the demo seeder or a trial lapse.
- **Clinician document results in search.** Held back until `search_documents` returns an owning patient, which needs a DROP and CREATE of the function.
- **Department leads.** They see every actor in the tenant audit log. This was deferred as a product call.

## Product direction — still to build

From `docs/strategy/product-direction-sep-2026.md`:
- **A5.3** At-a-glance patient summary (Next).
- **A5.4** The scribe keeps recording when the screen locks, and a clinician voice memo (Next).
- **A4** A medication summary copy in the Vault, labelled "Clinical record copy — not a pharmacy prescription". Not built.
- **A1** Pick the default look and layout. The side panel frees 49px, not 130–140px.
- **A5.5–8** WhatsApp, voice logging, telehealth and escalation are blocked on providers or marked Later.

## Running it locally

```sh
npm install
./scripts/db-test.sh               # replays all migrations + every SQL suite (Postgres 16,
                                   # pg_hba TCP loopback must be `trust`)
npm run typecheck                  # NOT `npx tsc --noEmit`, which is a no-op here
npx vitest run
npm run build
```

The signed-in app runs against a local shim; see `scripts/local-supabase/README.md`. The shim listens on port 54321 by default (`SHIM_PORT` changes it), and `.env.local` points the app at it. For browser checks, run `npm i -D playwright && npx playwright install chromium`.

## Merge

Do this once P0-1 to P0-4 are fixed and all four verification commands are green:

```sh
git checkout claude/medplum-fhir-adapter && git pull
git merge claude/product-direction-sep-2026
git push origin claude/medplum-fhir-adapter
git branch -d claude/product-direction-sep-2026
git push origin --delete claude/product-direction-sep-2026
```
