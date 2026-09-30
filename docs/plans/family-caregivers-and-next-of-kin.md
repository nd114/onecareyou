# Family, caregivers and next of kin

> **Proposed, not started — 29 September 2026.** Written at the founder's request
> to design three things that had been run together: managing the record of a
> dependent (a child, or a parent who does not use OneCare), helping care for
> someone who holds their own record, and naming a next of kin. Family-member
> targeting and caregiver writes are **paused by decision** (conventions skill;
> `caregiver-access-system.md` banner; `FAMILY_HEALTH_ENABLED = false`). This
> document proposes how they should work if restarted; building any of it except
> phase 0 needs the founder to lift the pause. Restart when: the open questions
> in §9 are answered. Phase 0 depends on none of them and closes defects that
> exist in the database today.
>
> This document describes an intention, not current work.

Companion to `docs/sharing-access-consent-model.md` (canonical),
`docs/plans/sharing-infrastructure-v2.md` (care relationships, data grants,
person and link audiences), `docs/plans/caregiver-access-system.md` (the earlier
caregiver plan this supersedes), `docs/pricing-roadmap.md` (the Family tier
draft) and `docs/independent-clinicians-and-hospitals.md`.

---

## 1. The short answer

The three are different relationships and each gets exactly one object:

| | Who they are | What they hold | Needs an account |
| --- | --- | --- | --- |
| **Guardian** | Someone who holds a dependent's powers because the dependent cannot use them: a parent for a child, a named person for an adult who cannot manage their own record | The patient's powers over the dependent's record: read it, record into it, share it with clinicians and hospitals | Yes |
| **Caregiver** | Someone helping a patient who holds (or whose guardian holds) the record | A grant the patient defines: which categories, read or also record, until when. Never sharing, never settings, never clinical powers | Yes |
| **Next of kin** | Someone the patient names to be contacted, and to act in the narrow emergency and death cases of sharing model §1.4 and §5 | Contact details and a verified status. **No access to the record by default** | No |

Four decisions carry the rest:

1. **A dependent is a patient of record in their own right**, with their own
   user id, not a sub-profile inside the guardian's account. Every existing
   consent helper, share row and audit trigger is keyed on the patient's user id
   and already does the right thing once the dependent has one. The current
   model — the child's readings stored as the parent's rows with a
   `family_member_id` tag — is the root of every defect in §2.
2. **Guardians and caregivers are one delegation object with two roles**, the
   evolution of the existing `caregiver_access` table, using the share
   vocabulary (`share_grants` keys) for scope. Not a second grant system.
3. **Next of kin, missed-dose alert contacts and the profile's emergency contact
   are one contact object** with roles and an email verification status. Three
   lists of the same people is how they come to disagree.
4. **The emergency path is a snapshot, not a read.** A next of kin or caregiver
   the patient designated can, in an emergency, issue a point-in-time snapshot
   link (the one built in `20261010060000`) of the categories the patient chose
   in advance. Nobody gains a live read, so P4 (no break-glass) holds.

## 2. What exists today

Checked in code on branch `fix/fam`, 29 September 2026. "From definitions" means
read from migrations and source, not exercised against a replayed database.

### 2.1 What is hidden, and why

`src/lib/feature-flags.ts` sets `FAMILY_HEALTH_ENABLED = false` (August 2026).
It hides the `/family` routes (`App.tsx`), the header switcher
(`Header.tsx`, `HeaderFamilySwitcher`), the Family nav entry (`nav-ia.ts`) and
the "recording for" pickers. `FamilyContext.tsx` clears any stored selection so
a leftover choice cannot send the account holder's own entries into a
relative's record. The flag's own comment gives the reasons: a medication added
for a family member did not appear in their list, a vital recorded for them
landed on the account holder's screen, and **nothing recorded who entered a
reading on someone else's behalf** — the blocking one. It names the intended
shape: each person holds their own record and grants access to a relative, with
every write attributed.

The flag hides entry points only. Tables, policies and hooks are live, which is
why the defects below exist now and not only when the flag is turned back on.

### 2.2 Family members

| Object | Where | What it does |
| --- | --- | --- |
| `family_members` | `20260117063816` | A sub-profile owned by one account: name, relationship, DOB, gender, blood type, height, allergies, conditions, `is_active`. RLS: owner only, including **DELETE** |
| `family_member_id` column | `medications`, `vitals`, `schedule_entries` (`20260117063816`, **ON DELETE CASCADE**); `care_alert_settings` (`20260117101528`, CASCADE); `health_documents` (`20260317042947`), `document_folders`, `personal_notes` (`20260910005902`), all **ON DELETE SET NULL** | A dependent's rows are stored with `user_id` = the account holder and a tag |
| `useFamilyMembers.ts` | `deleteMember` | Calls `.delete()` on `family_members`. Five-member limit (`MAX_FAMILY_MEMBERS`) is enforced in the client only |
| Assistant | `patient-ai-chat` filters `family_member_id IS NULL`; roadmap "Next up" 10 | Family-member targeting for the assistant is paused |

**Defects that exist now** (from definitions):

| # | Defect | Evidence | Severity |
| --- | --- | --- | --- |
| F1 | **Removing a family member hard-deletes their medical history.** The DELETE policy is open to the owner; the cascades then delete the member's medications, readings and dose history outright | `20260117063816` lines 36–38, 244–246 | **High** (conventions rule 1) |
| F2 | **…and silently moves their documents into the owner's own record.** `SET NULL` on `health_documents`, `document_folders` and `personal_notes` makes a child's discharge letter the parent's, with nothing saying so. Every read path treats `family_member_id IS NULL` as "the patient's own" | `20260317042947`, `20260910005902` | **High** (rule 3, and a wrong-patient record) |
| F3 | **A parent's clinician reads the child's record as the parent's.** Clinician and institution read policies ask `clinician_has_patient_permission(user_id, 'vitals')` / `institution_has_*_permission(user_id, …)` — keyed on `user_id`, which is the parent's for a child's row. `get-shared-patient-data` selects `vitals`, `medications` and `schedule_entries` by `user_id` alone (lines 249–280). Only the snapshot link (`20261010060000`, line 210) and the assistant filter the tag | From definitions | **High** (disclosure of a third person's data, clinically misleading) |
| F4 | **Missed-dose alerts count other people's doses.** `check-care-alerts` counts every pending `schedule_entries` row for `user_id` (lines 131–137) and never reads `setting.family_member_id` | From definitions | Medium |
| F5 | **"Family member profiles" is sold and hidden.** `PREMIUM_FEATURES` and `LANDING_PREMIUM_FEATURES` in `pricing-constants.ts`, the Pricing FAQ and SEO copy (`Pricing.tsx` lines 39, 134, 138, 174) all offer it | Code | Medium (rule 6: a promise in the UI with no capability behind it) |

F1–F4 are dormant only as far as no family rows exist. Rows created before
August 2026 may; phase 0 counts them first.

### 2.3 Caregivers

- `caregiver_access` (`20260117063816`): `family_member_id`,
  `caregiver_user_id`, `permissions` (`view`/`edit`/`manage_meds`),
  `granted_by`. Its INSERT and UPDATE policies were tightened in
  `20261009090000` so a granter must own the family member.
- **Nothing reads it.** No source file outside the generated `types.ts`
  mentions the table, and no policy on any data table consults it. It grants
  nothing. The roadmap's "Earlier 2026" shipped list says "caregiver delegated
  access"; that is not true and should be corrected (phase 0).
- The last commit (`9aed6fa`) stopped Care Circle offering the clinician invite
  link "for your doctor, pharmacist, or caregiver" (sharing v2 gap G6: a
  caregiver claiming it became a clinician to every policy) and sends caregivers
  to alert contacts instead. Every clinical INSERT now requires a clinician.
- **Missed-dose alert contacts** (`care_alert_settings`, `check-care-alerts`,
  notification category `care_circle_missed_doses`): a name and an email the
  patient types. Never verified — the function's own comment says a typo sends
  the alert to a stranger, which is why it sends a first name and no drug
  names. The email carries no way for the recipient to stop receiving it.

### 2.4 Next of kin

- **There are no next-of-kin fields.** `profiles` has `emergency_contact_name`
  and `emergency_number`, free text, from the first migration
  (`20260117033515`). They are edited in `Onboarding.tsx`,
  `EditProfileDialog.tsx` and `EmergencySettingsSection.tsx`, shown on
  `EmergencyInfoCard.tsx`, and released to a clinician under the `profile`
  grant (`get-shared-patient-data` line 230, shown in `ClinicianPortal.tsx`).
- Sharing model §5 says "Next-of-kin details (name, date of birth, email,
  relationship) are collected in the profile" and "a verified next of kin can
  request the full record". Neither the fields nor any verification exist. The
  canonical document and the code disagree; phase 0 corrects the document until
  phase 1 makes it true.
- P4 (§1.4) rests on a "next of kin or a Care Circle member the patient
  designated". Nothing can be designated today, so the emergency path P4 relies
  on does not exist.

### 2.5 Billing

- `pricing-roadmap.md` drafts a **Family tier** ($24.99/month, up to 5 family
  profiles, caregiver access controls) — a historical draft by that file's own
  preamble.
- `useSubscription.ts` types a `'family'` tier. The database's
  `profiles.subscription_tier` CHECK allows `free` and `premium` only; there is
  no Stripe price for a family plan. `billing-and-payments.md` does not mention
  one. No family plan exists.

## 3. What it rests on

| Rule | Source | What it forces here |
| --- | --- | --- |
| **P1** The patient holds the power | Sharing model §1.1 | A dependent's powers are held *for* them by a guardian and return to them when they can hold them. A caregiver holds only what the patient gave. §1.1's "(or their authorised caregiver)" should read "(or their guardian)" — a caregiver never creates or widens a share |
| **P2** Nothing deleted by default | §1.2, §7 | Removing a dependent archives; ending a guardianship or grant is a status change; the ledger survives. F1 and F2 are breaches |
| **P3** Hidden is not deleted | §1.3 | A guardian can put a dependent out of their switcher without ending anything |
| **P4** No break-glass | §1.4 | Nobody reads a record without a grant. Emergency help is a patient-designated snapshot, never a live read |
| Institution / patient boundary | §2, `independent-clinicians-and-hospitals.md` | A hospital treating a child shares with the child's record. Guardianship never gives a hospital anything, and a hospital's record of the child is the hospital's |
| Don't police what isn't ours | Retraction decision (roadmap "Agreed" §1: "We do not arbitrate") | OneCare records who claims to be a guardian and on what basis; it does not adjudicate custody, capacity or who is really next of kin. Disputes go where the law sends them |
| Consent at the moment of the act | Conventions rule 5 | Every delegated read and write asks the delegation at that moment; revocation and expiry take effect on the next read |
| Enforced at the row | Rule 4 | The "recording for" switcher is a suggestion; the row's subject and the actor's authority are checked in RLS |
| One vocabulary | Rule 7 | Delegation scope uses `share_grants` keys. One contact object. The caregiver grant *is* sharing v2's person-audience grant, not a second one |
| Absence is visible; say the uncertainty | Rules 3, 8 | "Verified" means an email was confirmed, not an identity proved, and says so |

## 4. Family: dependents and guardians

### 4.1 Who is the patient of record

The dependent. They get their own user id and `profiles` row at the moment the
guardian adds them, and every row about them is keyed on that id —
`vitals.user_id` is the child. Consequences, all for free:

- A paediatrician the parent shares with receives a `provider_shares` row whose
  `user_id` is the child. The clinician's list shows the child as the patient;
  every existing helper, policy and suite applies unchanged. F3 cannot happen.
- A hospital admitting the child gets a `practice_shares` row for the child,
  with the §2B default posture and disclosure shown to the guardian.
- The child's record is never inside the parent's, so there is nothing to
  untangle when the child takes it over (§4.6) and nothing to cascade when the
  parent closes their own account.

**How a dependent has an id without signing in.** The recommended mechanism is
an auth user created by an edge function with no password, no identity
provider and an undeliverable placeholder address, flagged
`profiles.account_kind = 'dependent'`, with sign-in refused while it is in that
state. Claiming (§4.6) attaches a real email and credentials to the same id, so
the history is already theirs and nothing is merged or moved. This needs an
engineering check against Supabase Auth's constraints before it is committed to
(open question 1). The alternative — keep `family_member_id` and teach every
helper, policy, edge function and export about it — is rejected: it is exactly
the "every caller must remember to filter" design that produced F2–F4, and the
list of callers only grows.

The existing `clinician_patient_records` claim (a record that exists before the
person has an account, `linked_user_id` on claim) is the precedent for the
experience; the dependent account differs in being a real patient record from
day one, so clinician sharing works before any claim.

### 4.2 Who manages: the guardian

A guardian is a row in the delegation table (§6.1) with `role = 'guardian'`
over the dependent's user id. What the role carries:

| Guardian may | Guardian may not |
| --- | --- |
| Read the whole record | Delete anything the patient could not delete |
| Record readings, medications, doses, documents, notes — each attributed | Hide their own authorship |
| Create, narrow, pause and end shares with clinicians and hospitals, and answer medication proposals | Transfer the record to another account |
| Add a caregiver for the dependent | Remove another guardian (§4.5) |
| Invite the dependent to claim (§4.6) | Keep the patient's powers after the dependent claims (§4.6) |

The basis is recorded, not verified: `parent`, `legal guardian`, `power of
attorney`, `court-appointed`, `other` with a free-text note, plus the guardian's
attestation and its date. Where an institution needs proof of authority (a
hospital consenting a child to surgery) it applies its own process; OneCare
shows the recorded basis and who attested it and does not claim more.

**Enforcement.** The patient-owner policies on patient tables change from
`auth.uid() = user_id` to `public.acts_for(user_id)` — true for the patient
themselves, or for an active guardian. `auth.uid()` stays the guardian's, so
the attribution triggers record the guardian as the actor with no extra
plumbing. (Impersonation by minting a session for the dependent was considered
and rejected: `auth.uid()` would be the child, and the August blocking defect —
no record of who entered it — would come back by design.) A structural test
asserts no patient-table owner policy uses the bare comparison once the
migration lands.

### 4.3 Sharing on the dependent's behalf

- The guardian uses the same Care Circle screens, in the dependent's context.
  The share row's `user_id` is the dependent; `share_events` records the
  guardian as the actor. The clinician sees "Ada Obi (managed by Chidi Obi,
  parent)".
- Messages in a dependent's thread are sent by the guardian, shown as "Chidi
  (Ada's parent)". With several guardians, each reads the thread; each message
  says who wrote it.
- A clinician's medication proposal for the dependent can be answered by any
  guardian; the answer is attributed.
- Whatever sharing v2 decides about care relationships applies to the
  dependent's record exactly as to anyone else's — no separate rules.

### 4.4 Age and capacity

**Minors.** Ages differ by market and by what is being decided, so no age is
written into code; a per-market table (`majority_age`, and optionally a
`claim_eligible_age` below it) is supplied by counsel (open question 2).

| Stage | What changes |
| --- | --- |
| Under claim-eligible age | Guardian holds the powers. No login for the child |
| Claim-eligible, under majority (where the market allows) | The young person may be invited to claim and sign in alongside the guardian. Whether some categories become confidential to them (sexual health, mental health) is a legal question; v1 builds **no** teen-confidential categories and says so on the invite |
| 90 days before majority | Guardian is prompted to invite the young person to claim |
| Majority reached, unclaimed | The guardianship **lapses**: the guardian keeps reading and recording so care does not stop, and may narrow or end shares, but may no longer create or widen one (P1: those are now the young adult's to give). The claim invite stays open and is re-offered |
| Claimed | §4.6 |

**Adults who cannot manage their own record** (an elderly parent with dementia,
say). The first answer is not guardianship: if the parent can hold an account
at all, they hold it and add their child as a caregiver (§5). Guardianship of
an adult is for when they cannot, and is set up the same way as for a child,
with the basis recorded, no age transitions, and the adult able to claim at any
time. An adult who holds credentials to their own record can always end a
guardianship over it; OneCare does not assess capacity (open question 3).

### 4.5 More than one guardian

- An existing guardian invites another by email; the invitee must hold an
  account and accept. The dependent's record lists every guardian, their basis
  and when they were added, to every guardian.
- All guardians are equal. Each act is attributed and every guardian is
  notified of shares created or ended and guardians added.
- **No guardian can remove another.** A guardian can end only their own
  guardianship. Separation and custody disputes are exactly where a platform
  that let one parent lock out the other would be deciding what a court
  decides. A removal happens through OneCare support on documented legal
  instruction (a court order), logged as such (open question 4). This is the
  "don't police what isn't ours" rule applied in both directions: we do not
  adjudicate, and we do not let the product adjudicate by default.
- A dependent with no remaining active guardian (the last one ended theirs) is
  frozen: existing shares continue as they were, nothing new can be created, and
  the claim invite remains possible through support.

### 4.6 A dependent claims their own record

1. A guardian (or support, for a frozen record) sends the claim invite to the
   dependent's email. The dependent confirms their date of birth against the
   record and sets credentials. `account_kind` becomes `'self'`. Same user id:
   the history is theirs already.
2. The first screen after claiming lists **everything that was done on their
   behalf**: every active share (with whom, which categories, set up by whom,
   when), every caregiver, every guardian. Each can be kept or ended in one
   place. Absence is visible: past shares and past guardians are listed as
   ended, not removed.
3. Every guardianship ends. A former guardian who should stay involved becomes
   a caregiver — only if the new owner grants it, on the screen in step 2.
4. If the dependent already has a separate OneCare account, `identity-match.ts`
   duplicate detection stops a second one being created at claim, and the case
   goes to merge, which is deliberately last (roadmap "Agreed" §6). v1 says so
   and routes to support.
5. Billing: the claimed account falls to Free unless they subscribe. Nothing is
   deleted for exceeding a Free limit; over-limit items stay readable.

### 4.7 Billing: the family plan

Recommendation: **no separate Family tier in v1.** A guardian's subscription
covers the dependents they guard — Premium features apply to a dependent's
record if any of its guardians is Premium. A cap on dependents per subscription
is enforced by a trigger on the delegation table, not in the client (today's
`MAX_FAMILY_MEMBERS` is client-only). A Family tier is a pricing decision, not
an architecture one, and can be a price on the same mechanism later (open
question 5). Caregivers never need to pay to help someone; the patient's plan
decides the patient's features.

Until this ships, the Pricing copy must stop selling "family profiles" (F5).

### 4.8 The switcher

- Lists **Me**, then **People I manage** (dependents, with the guardian basis),
  then **People I help care for** (caregiver grants, §5). The two groups are
  labelled differently because they are different powers.
- Every write screen in another person's context shows a persistent line —
  "Recording for Ada" — and the write sends Ada's user id explicitly. RLS
  decides whether that is allowed; the switcher only chooses what to ask
  (sharing v2 G10: the workspace choice is a suggestion, the row is the truth).
- The selection is not remembered across sign-ins. Starting in someone else's
  context by default is how entries land in the wrong record.
- Hiding a dependent from the switcher (P3) changes nothing about the record.

### 4.9 Audit

- Every write into a record by someone other than its patient is stamped with
  the actor by trigger (`recorded_by_user_id` where it exists, an
  `acted_by_user_id` column where it does not) and shown on the item: "Added by
  Chidi (parent)".
- Reads by guardians and caregivers go through `log_record_access()` like any
  other access, so the patient (or, after claiming, the dependent) can see who
  looked.
- Guardianship and caregiver lifecycle events — added, accepted, lapsed, ended,
  claimed — are written to the append-only ledger alongside `share_events`, so
  the claim screen in §4.6 is a read of the ledger rather than a reconstruction.

## 5. Caregivers

### 5.1 What a caregiver is

Someone helping a patient who holds their own record (or whose guardian does):
a daughter checking her father's blood pressure readings, a neighbour watching
a child for a week. The caregiver has an account, is invited by email, and
accepts. The grant belongs to the patient; for a dependent, the guardian grants
it.

### 5.2 The grant

The same row type as a guardian (§6.1), `role = 'caregiver'`, with:

- **Scope** in the existing vocabulary: `vitals`, `medications`, `adherence`,
  `conditions`, `allergies`, `documents`, `profile`, resolved by `share_grants`.
  Personal notes are never included, as for any share.
- **Read or also record**, per category, for the three add-only writes only:
  record a reading (`vitals`), mark a dose taken or missed (`adherence`), upload
  a document (`documents`). Each attributed and shown to the patient.
- **Duration**: an end date is required, with a default (open question 11 for
  the length) and a one-tap renewal the patient is reminded of. "Until I say
  so" is a deliberate choice, not a default.
- **Revocation**: immediate, on the next read.

A caregiver may never: create, change or end a share; answer a medication
proposal; edit or stop a medication; change settings; archive or hide anything;
add another caregiver; issue clinical content of any kind. The last is already
enforced (commit `9aed6fa`: every clinical INSERT requires a clinician). The
caregiver read helper is never ORed into a clinician or institution helper —
asserted structurally, as sharing v2 §9 asks for the relationship helper.

Whether a caregiver may message the patient's clinicians is open (question 6);
recommended no in v1, because a message from a caregiver in the patient's
thread is easily read as the patient's.

### 5.3 How it differs from guardianship

| | Guardian | Caregiver |
| --- | --- | --- |
| Whose powers | The patient's, held for them | Only what the patient granted |
| Scope | Whole record | Chosen categories |
| Sharing, proposals, settings | Yes | Never |
| Duration | Until claim, lapse or ended | Required end date |
| Who ends it | The guardian themselves; the patient on claim; support on legal instruction | The patient (or guardian) at any time; the caregiver themselves |

### 5.4 Alert contacts are not caregivers

Missed-dose alert contacts need no account and see nothing of the record; they
receive a first-name alert. They move onto the contact object (§7) and must
verify their email before any alert is sent, which removes the
typo-to-a-stranger risk the function's own comment names, and every alert gains
a working "stop these alerts" link.

### 5.5 Emergencies

A caregiver sees what their grant covers, and nothing more because it is an
emergency. If the patient has designated them as an emergency contact (§7.5),
they can issue the emergency snapshot on the same terms as a next of kin.

## 6. The shared machinery

### 6.1 One delegation table

`caregiver_access` is re-keyed rather than replaced (it has no readers and no
live grants, so this is a change of shape, not of anyone's consent):

| Column | Meaning |
| --- | --- |
| `subject_user_id` | The patient of record (replaces `family_member_id`) |
| `delegate_user_id` | The guardian or caregiver (renamed `caregiver_user_id`) |
| `role` | `guardian` \| `caregiver`, CHECK-constrained |
| `permissions` | Share vocabulary, read keys plus `record:<key>` for the three add-only writes; ignored for guardians |
| `basis`, `basis_note`, `attested_at` | Guardians only |
| `status` | `invited` \| `active` \| `lapsed` \| `ended` |
| `expires_at` | Required for caregivers |
| `granted_by`, `ended_by`, `ended_at`, `end_reason` | Who did what |

Helpers beside the existing two, each checked at the moment of the call:
`acts_for(subject)` (self or active guardian), `delegate_has_permission(subject,
key)` (guardian, or caregiver with the key), `delegate_can_record(subject,
key)`. Invitations reuse the hashed-token shape of `snapshot_links`.

This is the person-audience grant sharing v2 §4.7 describes. v2 should point at
it rather than add its own.

### 6.2 Notifications

New categories in the catalogue, each with a real producer: `delegate_invited`,
`delegate_activity` (a digest of what caregivers recorded), `guardian_change`,
`nok_status` (§7). Mandatory where they are security events (a guardian added,
a death reported).

## 7. Next of kin

### 7.1 The contact object

One table of the patient's people who are not account-holding delegates:
`care_contacts` — name, relationship, email, phone, and a set of roles:
`next_of_kin`, `emergency_contact`, `missed_dose_alerts`. The profile's
`emergency_contact_name`/`emergency_number` are copied in as an
`emergency_contact` and read from here; the columns are dropped once no reader
remains. `care_alert_settings` keeps its thresholds and points at a contact.
Clinicians granted `profile` continue to see the emergency contact's name,
relationship and phone — not the email, not the verification history.

### 7.2 The founder's flow

1. **The patient adds a next of kin**: name, relationship, email (required, it
   is how verification works), phone (optional). Screen copy says plainly what
   being next of kin does and does not mean (§7.4).
2. **OneCare emails the next of kin.** "Ada Obi has named you as her next of
   kin on OneCare. This doesn't give you access to her health records. [Confirm]
   [I'd rather not] [I don't know this person]". The link is a single-use
   hashed token, valid 14 days. **No account is needed**; confirming is one
   page.
3. **Confirming** records `verified_at` and the email as proven. The patient's
   profile shows **Verified** with the date. The badge's explanation says what
   it means: this person controls this email address and agreed to be named. It
   is not an identity check (rule 8).
4. **Not yet confirmed**: the patient sees **Waiting for confirmation** and is
   reminded at 3, 7 and 14 days — "Chidi hasn't confirmed yet. Ask them to
   check their email, resend, confirm in person, or choose someone else." The
   next of kin receives the invite and at most one reminder; OneCare does not
   keep emailing a person who has not signed up for anything.
5. **In person**: the patient can show a one-time code on their screen for the
   next of kin to enter on the confirm page, for someone who cannot find the
   email. Same result, same record.
6. **Expired**: the status reads **Not confirmed**, stays visible, and the
   patient can resend (capped per address per month so the feature cannot be
   used to pester someone).
7. **Changing the email** returns the status to unconfirmed.

### 7.3 Declining and withdrawing

- **"I'd rather not"** records a decline, tells the patient ("Chidi has
  declined to be your next of kin"), asks for no reason, and stops all mail to
  that address for this patient unless the patient re-adds them and they
  confirm in person.
- **"I don't know this person"** does the same and suppresses the address for
  that patient permanently, and flags the account if it recurs across
  addresses.
- Every email carries **"Stop being Ada's next of kin"**, available at any time
  after confirming. The patient is told.
- After a decline or withdrawal the contact's email is erased; a hash is kept
  for the suppression, and the ledger keeps "next of kin declined" with a date
  (P2 without keeping a non-user's details they asked us to drop).

### 7.4 What verification grants, and what it does not

| Verified next of kin | Does it get it? |
| --- | --- |
| Access to the record | **No**, never by default |
| Being contacted by OneCare in the cases below | Yes |
| Issuing the emergency snapshot | Only if the patient separately designated them (§7.5) |
| Reporting the patient's death and requesting the record afterwards | Yes, as a start to the process in §7.6 — not as an entitlement |
| Being shown to clinicians | Name, relationship, phone, under the `profile` grant, as now |

### 7.5 Emergencies (P4)

- The patient may **designate** a verified next of kin or a caregiver for
  emergencies, and choose in advance what an emergency snapshot contains
  (default suggestion: allergies, conditions, current medications, blood type).
  Off by default.
- A designated person, in an emergency, opens the page from any OneCare email
  (a fresh magic link to their verified address; no account needed) and issues
  a **snapshot link** to the treating team: point in time, the pre-chosen
  categories only, short expiry, every open logged — the existing
  `snapshot_links` machinery, with the issuer recorded.
- The patient is notified immediately on every channel and can revoke the link.
  The ledger records who issued it, when, and every view.
- Nobody gains a live read. That is what keeps this from being break-glass by
  proxy.

### 7.6 Death (§5)

- A verified next of kin reports a death. **Nothing is cut on the report
  alone** — a false report would lock a living patient out. The patient is told
  on every channel ("Someone reported that you have died. If this isn't true,
  tap here"), and OneCare support reviews documentary evidence.
- On confirmation: sign-in closes; every live data grant ends with the reason
  recorded (the patient can no longer consent to new reads; P1); care
  relationships close; disconnection snapshots are filed; guardianships the
  deceased held over dependents end, and those dependents' other guardians are
  told (a dependent with none left is frozen, §4.5).
- The next of kin may request the record export. Whether they are entitled to
  it depends on whether they are the personal representative in law, which
  OneCare does not decide; the request is fulfilled on the documented basis
  counsel sets per market (open question 10). Deletion then follows §7 of the
  sharing model: only the patient's own material, never an institution's.

### 7.7 Data minimisation

A next of kin is a third party whose details the patient supplied. OneCare
keeps name, relationship, email and phone; **no date of birth** until a death
request needs it for matching (sharing model §5 lists DOB; recommended to drop
it from collection). The next of kin's details are never used for marketing,
never shown to institutions beyond the emergency contact line, and erased on
decline, withdrawal or removal as in §7.3.

## 8. Phases

| Phase | What | Size | Closes |
| --- | --- | --- | --- |
| **0. Make the dormant model safe** | Count existing `family_members` and tagged rows. Replace the `family_members` DELETE policy with archive (`is_active`); change the CASCADE and SET NULL foreign keys to RESTRICT. Add `family_member_id IS NULL` to clinician and institution read policies on `vitals`, `medications`, `schedule_entries`, `health_documents`, and to `get-shared-patient-data`; make `check-care-alerts` honour the setting's `family_member_id`. Remove "family profiles" from the pricing lists and copy. Correct sharing model §5 (no NOK fields exist yet) and the roadmap's "caregiver delegated access" shipped claim. SQL suite for each, watched failing first | **S**, 2–3 days | F1–F5 |
| **1. Next of kin** | `care_contacts`; verify-by-email with confirm, decline and not-me pages (public, token-hashed); in-person code; reminders to the patient; Verified badge; migrate the profile's emergency contact; alert contacts must verify, with a stop link in every alert | **M**, about 1 week | §2.4, alert-contact typo risk |
| **2. Delegation core, caregivers first** | Re-key `caregiver_access` (§6.1); `acts_for`, `delegate_has_permission`, `delegate_can_record`; owner policies moved to `acts_for`; actor stamping by trigger; invite and accept; the "People I help care for" switcher group; activity digest. Ships caregivers for adult account holders — no dependent accounts needed yet | **M–L**, about 2 weeks | Caregiver plan, G6 follow-through |
| **3. Dependents as their own records** | Credential-less dependent accounts (after the Auth check in question 1); guardian role; "People I manage"; sharing on behalf; subscription coverage by guardian with a DB cap; migration of existing family rows onto dependent ids (counted in phase 0, owners told); `FAMILY_HEALTH_ENABLED` back on; assistant targeting falls out of the subject id | **L**, 2–3 weeks | §4.1–4.3, 4.7–4.9 |
| **4. Claiming and transitions** | Claim invite and screen; majority lapse by market table; adult claim ends guardianship; multiple guardians; frozen dependents | **M**, about 1.5 weeks | §4.4–4.6 |
| **5. Emergency and death** | Emergency designation; snapshot issued by a designated person; death report with patient alert and support review; post-death export. Gated on counsel for question 10 | **M**, about 1.5 weeks | P4 path, §5 death path |

**Recommended first: phase 0, then phase 1.** Phase 0 because it closes
defects in the live database whatever is decided about the rest. Phase 1
because it is exactly the founder's specification, depends on none of the
account-model decisions, turns a false sentence in the canonical document true,
and builds the verified-contact object that P4's emergency path and the death
path both need. Phase 2 before phase 3 because caregivers for adults deliver the
most common real case (an adult child helping a parent who uses OneCare) on the
delegation core without the Auth question.

Every phase lands with SQL suites in the existing style, each assertion watched
failing first: a caregiver without `vitals` reads no reading; a caregiver's
grant expires on the next read; a guardian's write names the guardian; a
caregiver cannot create a share; a lapsed guardian cannot widen one; a
dependent's rows never appear in the guardian's clinician's view; an
unverified contact receives no alert; a death report ends nothing until
confirmed.

## 9. Open questions for the founder

1. **Dependent accounts.** Is a credential-less auth user for each dependent
   acceptable, subject to an engineering check of Supabase Auth's constraints?
   (The alternative is a `family_member_id`-aware platform, recommended
   against.)
2. **Ages.** Majority and claim-eligible ages per market, from counsel; and
   whether any categories become confidential to a young person before
   majority. v1 builds none.
3. **Adult guardianship.** Is recorded attestation enough (recommended), or
   must a guardian of an adult upload a power of attorney or court order? And
   confirm that an adult who claims their record can always end a guardianship.
4. **Guardians in dispute.** Confirm that no guardian can remove another and
   that removal is by support on documented legal instruction.
5. **Family plan.** Premium covering a guardian's dependents up to a cap
   (recommended, and what cap), or a separate Family price?
6. **Caregiver messages.** May a caregiver message the patient's clinicians?
   Recommended no in v1.
7. **How many next of kin.** One, or a primary and a secondary?
8. **Existing alert contacts.** Require them to verify before the next alert
   (safest), or keep sending while a one-time confirmation email goes out?
9. **Emergency snapshot.** Default contents; maximum expiry (the snapshot link
   allows 30 days — an emergency one should be much shorter); passcode required?
10. **Death.** Who counts as entitled to the record per market (personal
    representative, executor); the waiting period after a report; and whether
    institutions' grants end on confirmation (recommended) or continue for a
    period.
11. **Caregiver default duration.** 30 days? And is "no end date" allowed at
    all?
12. **Existing family rows.** Once counted: migrate onto dependent accounts
    with the owner told, or ask each owner first?
13. **Sharing model wording.** Amend §1.1 "(or their authorised caregiver)" to
    "(or their guardian)", and §5's next-of-kin sentence to match §7 here.
14. **The pause.** Phase 0 fixes live defects and should not wait. Phases 1–5
    need the pause on family-member targeting and caregiver writes lifted.
