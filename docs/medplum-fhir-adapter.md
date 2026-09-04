# Medplum as a Library, Not a Backend

**Status:** Appointment shipped; search semantics and the AccessPolicy projection added; remaining resources scoped below
**Owner:** Engineering
**Relates to:** `docs/loinc-and-coding-policy.md`, `docs/ehr-integration-plan.md`, `docs/qhin-integration-plan.md`, `docs/sharing-access-consent-model.md`

---

## 1. The question this answers

The clinician side needs more depth than it has, and Medplum has a great deal of
it built already. The options were to stand up self-hosted Medplum beside our
Supabase, or to take the parts of Medplum that are genuinely ready and run them
against our own database.

We took the second. This document says why, what that actually means in code,
and what it cost.

## 2. Why not self-hosted Medplum

Not a licensing problem — `@medplum/core`, `@medplum/fhirtypes`, `@medplum/react`,
`@medplum/fhir-router` and `@medplum/definitions` are all Apache-2.0, and we are
free to use them commercially. Two other things decided it.

**`@medplum/server` is not published to npm.** Adopting it means running their
server from source: a second Postgres, a second identity system, a second
authorisation model, and a Redis. Verified rather than assumed.

**Authorisation is the whole product.** Consent lives in Postgres RLS, and there
are now 198 assertions across sixteen SQL suites proving what each pathway can
reach. A second backend means either replicating those rules in Medplum's
AccessPolicies — the same rules, expressed twice, drifting — or letting a system
that does not know about `practice_shares` decide who sees what. Neither is
acceptable for a product whose claim is that the patient controls access.

So: their libraries, our database, one authorisation model.

## 3. What that looks like

`public.fhir_appointments` is a real FHIR R4 Appointment. The columns a clinician
filters and sorts on are promoted to real columns; the complete resource lives in
`resource` as jsonb.

The columns are **projections of the resource**, never the other way round.
`src/lib/fhir/appointment.ts` is the only place that writes both, because a
projection maintained in two places is a projection that quietly stops matching
what it projects. That is not hypothetical: the first version of the status
change updated the column and left the resource saying `booked` on a cancelled
appointment, and since readers trust the stored resource, the cancellation would
not have been visible to anything reading FHIR. `toStatusPatch` exists to stop
that, and a test holds it there.

### What each layer is actually for

| Layer | Enforces | Notes |
| --- | --- | --- |
| `@medplum/core` validator | FHIR structure and FHIRPath invariants | Catches app-3 — a booked appointment needs a start and an end — which is a rule we would otherwise have had to think of ourselves |
| DB `CHECK` on `status` | The value set | The validator **passes** `status: "rescheduled"`. Value-set binding needs terminology the structure-definition bundles do not carry. Verified, and pinned by a test in both suites |
| `validate_fhir_appointment` trigger | app-3 and time ordering, server-side | Client validation is validation a client can skip |
| RLS policies | Who may read, write and amend | The same helpers that decide everything else: `clinician_has_patient_access`, `institution_has_patient_access` |

The validator and the CHECK constraint are complementary, not redundant. That is
the single most useful thing we learned building this, and it came from running
the validator rather than reading about it.

### Validation does not ship to the browser

`@medplum/definitions` reads its bundles from disk with `fs.readFileSync`, so the
production build fails outright on it — and `profiles-resources.json` alone is
34 MB. It lives in `devDependencies` and is imported only by
`src/lib/fhir/validate.ts`, which is server- and test-only.

This is the right shape anyway. The full FHIR check runs where something is
being accepted from outside — an extraction feed, an edge function — and in the
tests that hold the mapper to the specification. In the browser, the mapper is
pure and the database is the enforcement.

## 4. What it cost

| | Before | After |
| --- | --- | --- |
| Main bundle | 3,441.31 kB | 3,451.89 kB |
| Gzipped | 953.83 kB | 956.23 kB |

**+2.4 kB gzipped.** `@medplum/fhirtypes` is types-only and erases at compile
time; `@medplum/core` tree-shakes out of the browser path because the only thing
importing it there is nothing. Measured against a clean build of `main`, not
estimated.

## 5. Deliberate omissions

**No DELETE, at either layer.** Cancelling is a status change — a cancelled or
missed appointment is part of the record, and FHIR has statuses for both. The
table has no DELETE policy, and the privilege is revoked as well.

Worth knowing: Supabase's default privileges grant `anon` and `authenticated`
the full set on every new table in `public`, so a `GRANT` line that omits DELETE
does not withhold it. The RLS suite asserts the delete refusal *with the
privilege deliberately granted*, so the refusal has to come from the absence of
a policy rather than from a grant that a later migration could restore.

**Patients read, they do not write.** Requesting an appointment is a different
feature with a different flow — a request is not a booking. Until that exists, a
patient editing the clinic's calendar is not a thing.

**No coded `appointmentType`.** FHIR wants a code; without a code system agreed
with the tenant, display text is the honest representation rather than a code we
invented.

## 6. What comes next

Appointment was chosen first because it is small, it is visible on both sides of
the product, and it exercises every layer — resource shape, validator,
constraint, trigger, and both access pathways. It is the pattern the rest follow.

In rough order of value:

| Resource | Status | Notes |
| --- | --- | --- |
| `Condition` | **Done** — mapping only, see §6.1 | No table. Free text on `profiles`, mapped for export |
| `AllergyIntolerance` | **Done** — mapping only, see §6.1 | Same |
| `Observation` | **Done** — mapping plus export, see §6.3 | Vitals is a real table. LOINC coding resolved without a decision needed |
| `CarePlan` / `Goal` | **Done** — table plus mapper | Goals score against readings the patient already takes |
| `Invoice` | **Done** — table plus mapper | Minor units, per-tenant currency; see docs/billing-and-payments.md |
| `Communication` | **Done** — mapping only | Assistant messages filed as `sender.display`, never a Practitioner reference |
| `MedicationStatement` | **Done** — mapping plus export, see §6.5 | *Not* `MedicationRequest`; see below |
| `DocumentReference` | Next | Natural fit for QHIN retrieval, and the last thing the Vault cannot export |
| `AccessPolicy` | **Done** — projection only, see §10.2 | Generated from a share's permissions. Never consulted for enforcement |
| `Subscription` | Declined for now, see §10.3 | Needs the search planner to cover Observation before criteria can be validated |

The tables these added are now in the generated Supabase types: the migrations
have been applied and the file regenerated, so the hand-written
`types-extra.ts` shim that stood in for them is gone.

Each one carries a mapper with the projection rule, a unit suite, and rows in
`supabase/tests/README.md`. A migration too, where there is a table to migrate.

### 6.1 Condition and AllergyIntolerance: mapping, not tables

This document previously said these two would replace "the existing conditions
table" and that the mapping was "mostly mechanical". Both were wrong, written
before looking at how the data is actually stored.

There is no conditions table and no allergies table. They are free-text jsonb
lists on `profiles`, `clinician_patient_records` and `family_members`, read in
about twenty files. Giving them FHIR-shaped tables would mean migrating dirty
free text and rewriting all of those, for no clinical gain — the fields are not
queried, ranked or joined; they are shown.

What is worth having is the mapping, and that is what shipped:
`src/lib/fhir/clinical.ts` turns the stored lists into real `Condition` and
`AllergyIntolerance` resources, validated against R4. Export, QHIN and
write-back get what they need; storage does not move.

**No invented codes.** "Diabetes" in a text box is not a SNOMED concept, and
emitting `73211009` because the string looked close would put a clinical claim
nobody made into an exported record. FHIR lets a CodeableConcept carry `text`
with no `coding`, which is precisely what this data is. Everything comes back
`unconfirmed`, and `criticality`, `type` and `reaction` are omitted rather than
guessed — an absent field reads as unknown, a populated one reads as assessed.
Coding arrives when a terminology service does the mapping and a clinician
confirms it.

### 6.2 What the mapping turned up

The columns are plain jsonb with no constraint, so a bare string was storable
where the app reads an array. Three consequences, all verified rather than
imagined:

- `ClinicianDataConsentDialog` counted the characters of the string and offered
  the patient **"22 health condition(s)"** to consent to
- `ManagedRecordFilters` called `.map` on it, which throws
- `useFamilyMembers` guarded with `Array.isArray(...) ? ... : []`, which does not
  crash but silently discards the list — a member whose conditions were stored
  as `"Diabetes, Hypertension"` showed none at all

Fixed in both directions. `normalise_clinical_list` converts what is already
stored and a CHECK constraint stops it recurring, on all three tables;
`toClinicalList` normalises at the hook boundary so every reader downstream gets
a real array. NULL is deliberately still allowed and still means *withheld*,
which is not the same as an empty list meaning *none recorded* — a clinician
reading "no known allergies" when the truth is "you were not told" is the
failure that distinction exists to prevent.

`@medplum/fhir-router` and a `FhirRepository` implementation over these tables
become worthwhile once there are three or four resources — `FhirRepository` is an
abstract class with fourteen methods and `MemoryRepository` as a worked
reference, so it is a real extension point rather than a hope. One resource does
not justify it yet.

### 6.3 Observation: the first resource we could code honestly

Vitals is a real table with typed numeric values, so this maps a row rather than
parsing free text — and it is the first place coding was possible without
guessing.

**Every LOINC code was read out of the R4 bundle**, not recalled. What is and
is not coded, and what to say about it to a client, is in
`docs/loinc-and-coding-policy.md` — read that before any demo. The codes come
from `ValueSet/observation-vitalsignresult`; which code belongs to which
measurement comes from the vital-sign profiles (`bodyweight` → 29463-7,
`heartrate` → 8867-4, `bodytemp` → 8310-5, `oxygensat` → 2708-6, `bp` → 85354-9
with components 8480-6 and 8462-4). The test suite re-extracts them from the
bundle, so the claim stays checkable rather than becoming folklore. UCUM units
are the spec's spellings from `ValueSet/ucum-vitals-common`, which is why `bpm`
becomes `/min` and `°C` becomes `Cel`.

The other fourteen types we store are **laboratory results, not vital signs**,
and get `category: laboratory`. LOINC has codes for them, but those codes are
not in the FHIR bundles and would have to be typed from memory — the same
failure as inventing SNOMED for "Diabetes" in different clothes. They carry
`code.text` and no coding until a terminology source provides one. Units we
cannot code honestly (`x10³/µL` is not valid UCUM) are emitted as
`Quantity.unit` with no system, which is what FHIR intends for an uncoded unit.

Blood pressure is a panel with two components, not a number with a spare. `128`
in `valueQuantity` and `82` in a secondary column is our storage shape, not a
clinical fact, and it does not survive the mapping.

**Patients can now download their readings as a FHIR bundle** from the vitals
export dialog, alongside CSV and PDF. That is the first thing on this platform
another system can read without a bespoke mapping written for us.

### 6.4 What building the export turned up

The bundle was built inline at the download site, where no test could reach it,
and it carried a `total` field. FHIR's `bdl-1` invariant allows `total` only on
a `searchset` or `history` bundle — a `collection` is neither. Every Observation
inside it validated; the file a receiver got did not, and a strict one would have
rejected the lot.

Found by generating a real bundle and validating it, not by review. The fix was
to move bundle construction into `src/lib/fhir/observation.ts` where a test
reaches it, and the lesson generalises: **validate the envelope, not only what
is in it.** Three tests now fail if the `total` comes back.

## 7. What this does not change

Extraction, QHIN retrieval and EHR write-back still need the work described in
their own plans. What this gives them is something real to map to and from,
rather than an approximation of FHIR we would have had to reconcile later.


### 6.5 The plan named the wrong resource

This table said `MedicationRequest`. Mapping to it would have put a claim into
every exported record that nobody made.

A `MedicationRequest` is an **order**: somebody with prescribing authority
asked for this to be dispensed. Our `medications` table is a list of what a
person takes — prescriptions alongside paracetamol, vitamin D and a herbal
remedy, most of it typed in by the patient. `prescriber` is a name in a text
box, not a reference to an order we hold.

FHIR draws exactly this distinction, and the resource for a record of what a
patient is actually consuming is `MedicationStatement`, which the specification
describes as explicitly not a request. That is what `src/lib/fhir/medication.ts`
emits.

The same honesty rules as §6.1 apply, and one more that only appeared when the
validator ran: FHIR's `time` primitive requires seconds, so the `08:00` we
store is not a valid FHIR time. `structuredTimes` pads it. Nothing but running
the real validator would have found that — the resource looked correct.

What is deliberately *not* claimed:

| Field | Why it is absent |
| --- | --- |
| `medicationCodeableConcept.coding` | "Metformin 500mg" in a text box is not an RxNorm concept, and a wrong code reaching an interaction checker is worse than none |
| `informationSource` | We do not record who added a row, so we cannot say whether the patient or a clinician asserted it |
| `category` | The value set distinguishes inpatient, outpatient, community and patient-specified; we cannot tell which without knowing who asserted it |
| structured `timing.repeat.frequency` | "twice daily" is free text. Only `times_of_day`, which is already structured, becomes structured timing |

Type, prescriber and pharmacy have no structured home on MedicationStatement
and are carried as notes rather than dropped — that a remedy is herbal matters
to whoever checks interactions next.

### 6.6 The record can now leave

`src/lib/fhir/record-bundle.ts` assembles readings, medications, conditions and
allergies into one R4 collection bundle, exposed to the patient under Settings
→ Privacy & data. Before this, the only thing that could leave was vitals.

The counts are shown before the download rather than after, so nobody opens a
JSON file to find out whether it holds what they expected, and the action is
placed below the contents for the same reason.

Documents in the Health Vault are still downloaded separately — that is what
`DocumentReference` is for, and it is now the next resource worth doing.


## 8. FHIR coming in

Everything above goes one way: our rows become resources. That is the easy
direction, because we know what we hold. `src/lib/fhir/inbound.ts` does the
hard one.

### The rule is refuse rather than guess

A resource we cannot map confidently is **rejected with a reason**, not filed
under a nearest-fit category. A partially-mapped one carries **warnings**
naming what was dropped. Silence is the only outcome that is never acceptable,
because an import that quietly loses half a record looks exactly like one that
worked.

Concretely, an Observation is refused when it carries no LOINC code we know
(`"Serum rhubarb" is not a reading we store`), when it has no date, when it has
no number, when the sender marked it entered-in-error, or when it is a blood
pressure missing one of its two components — half a blood pressure is not a
blood pressure.

Units are **kept as sent, never converted**. A weight in pounds stays in pounds
with a warning, because silently converting is how a number changes without
anyone deciding to.

### Provenance is mandatory

Every inbound row carries where it came from. Without it an imported record and
one the patient typed are indistinguishable, and a bad import can never be
unwound — you would have to ask a person which rows they recognised. `vitals`
already had `source`/`external_id`/`ehr_connection_id`; `medications` does not
and will need them before medication import ships.

### Nothing here writes

These are pure functions producing candidate rows, so a person can be shown
what is about to happen before it does — the same shape as the assistant's
proposed actions, for the same reason. `summariseImport` deduplicates reasons
with counts, so five hundred identical failures read as one line and a number.

### The two maps are kept in step by test

`inbound.ts` writes its own code table rather than reversing the outbound one,
because a reversed lookup would change meaning silently if two vital types ever
shared a code. The suite round-trips every code and every unit the outbound
mapper emits, so a code we can write but not read fails there.

## 9. Identity: which of our users is this?

`src/lib/identity-match.ts`. Two ways someone ends up with records waiting for
them — the clinic added them before they joined, or they joined first and a
clinic they already attend added them afterwards. Same problem, opposite order.

Before this, matching was an exact email comparison and nothing else, which
fails on a typo, an old address, or a record that only ever had a phone number.

### The asymmetry that shapes the whole module

A missed match is an inconvenience: somebody does not see their records and
asks why. **A false match hands one person's medical history to another.**
Those are not comparable costs, so the module is deliberately reluctant.

| Strength | What it takes | What happens |
| --- | --- | --- |
| `exact` | The email matches | Links automatically — but only if it is the *only* exact match |
| `strong` | Phone, plus name or date of birth | Proposed. Never automatic |
| `weak` | One non-email signal | Proposed, clearly marked |
| `none` | — | Not shown |

Name alone is never more than weak. Families share surnames and "John Smith" is
not an identifier.

Two records sharing an email is a data problem at the clinic, and resolving it
by picking one would resolve it in the worst possible direction — so neither is
linked and the person chooses.

### A proposal may not be the leak

The screen that asks "is this you?" shows only what that person supplied —
name, masked email, masked phone — and nothing clinical. If the answer turns
out to be no, everything shown has already been shown to the wrong person.

### Deliberately not clever

Normalisation stops short of provider-specific rules. Gmail ignores dots in
addresses; most domains do not, and applying that everywhere would make
`a.b@example.com` and `ab@example.com` the same person at a domain where they
are two people.

### Still to do

Wiring this into the claim flow, and provenance columns on `medications`. The
matching itself is done and tested, including against two deliberate
regressions: auto-linking on a strong match, and stripping dots from emails.

---

## 10. The five remaining Medplum questions

Each of these was asked as "should we take this from Medplum too?". Two are
now built, one was built and is the subject of §11, and two are declined with
reasons. Declining is a decision, not a gap, so the reasons are here rather
than in a backlog.

| | Verdict |
| --- | --- |
| **Search parameter semantics** | Built. See §11 — it was also a bug fix |
| **`@medplum/react-hooks`** | Adopted, narrowly. §10.1 |
| **AccessPolicy** | Built as a projection, never an authority. §10.2 |
| **Subscriptions** | Declined for now, with what would change it. §10.3 |
| **Bots** | Declined. §10.4 |

### 10.1 `@medplum/react-hooks`, not `@medplum/react`

Checked rather than assumed, by reading the published manifests:

- `@medplum/react-hooks` peer-depends on `react` and `@medplum/core`. Nothing
  else.
- `@medplum/react` peer-depends on `@mantine/core`, `@mantine/hooks`,
  `@mantine/notifications`, `@mantine/spotlight`, `jsqr`, `signature_pad`,
  `react-dom` and `@medplum/react-hooks`.

So the components bring a second design system beside the panel language this
product deliberately built, and the hooks bring nothing. The hooks are the
part worth having.

`src/lib/fhir/client.tsx` supplies a `MedplumClient` whose `fetch` is
`createFhirFetch`, so `useResource`, `useSearchResources` and `useMedplum`
read our Supabase tables through Medplum's router — no Medplum server, no
second identity system, and RLS still deciding every row.
`src/test/fhir-hooks.test.tsx` proves it, including that a refused search
surfaces as an OperationOutcome rather than an empty list. An empty list reads
as "no appointments", which is the one answer a refused search must never
give.

**The cost, measured rather than estimated.** Wiring the provider around the
whole app takes the main bundle from 3,562 kB to 3,922 kB — **+359 kB raw,
+94 kB gzipped**. Left unimported it costs nothing measurable, because the
build tree-shakes it out.

So the rule is: available, costed, not yet spent. Nothing in the app reads
Appointment as FHIR today, and paying 94 kB for zero current benefit would be
a bad trade. When a screen does, mount `FhirProvider` on that route and lazy-
load it, rather than globally.

**And the boundary that keeps two caches from lying to each other.** These
hooks keep their own cache; the rest of the app is on react-query. A resource
read through both could show two different answers on one screen. So:
Medplum's hooks are for resources the FHIR repository actually serves —
Appointment today. Anything read straight from a Supabase table stays on
react-query.

### 10.2 AccessPolicy: a projection, never an authority

Medplum's `AccessPolicy` describes what a user may read and write. §2 rejected
adopting it as an authority and that has not changed: consent lives in RLS,
and a second copy of a rule is a copy that eventually disagrees with the first
— except here the first copy is the one that actually stops anybody reading
anything.

But there is a real question the database cannot answer and the product's
central claim invites: **"what, exactly, can this clinician see?"** RLS can
enforce that; it cannot state it.

`src/lib/fhir/access-policy.ts` generates the statement from the same
`permissions` object RLS reads. Every entry is `readonly: true` — a share
grants sight, never authorship — and every entry is scoped to the one patient,
because an entry without a patient scope reads as "every patient", which is the
opposite of what a share is. The document tags itself `projection` and says in
its own text that access is enforced by database policy, so anyone reading it
knows editing it changes nothing.

`describeAccessPolicy` says the same thing in a sentence for the patient. The
empty case is the one worth getting right: "Dr Evans can see nothing" has to be
said out loud, because a list with no items reads as a screen that failed to
load.

#### What building it turned up: the two pathways speak different languages

Read out of the live policies and function bodies, not assumed:

| Concept | Clinician share | Institution share |
| --- | --- | --- |
| Readings | `vitals` | `vitals` |
| Medicines | `meds` | `medications` |
| Conditions and allergies | `profile` — both together | `conditions`, `allergies` — separately |
| Dose history | `adherence` | *not offered* |
| The Vault | `documents` | `documents` |

A patient who grants a hospital `conditions` and a clinician `profile` has
granted the same thing under two names. A permissions object written for one
pathway grants nothing at all through the other. And `profile` is
all-or-nothing where the institution side lets conditions and allergies be
separated.

This is worth fixing in the schema. It is **not** something the projection
should paper over: a policy document whose job is to say what somebody can see
has to describe the model as it is, or it is wrong about half the shares in
the product. So `toAccessPolicy` takes a required `pathway` — required rather
than defaulted, because guessing would produce a policy describing a share the
patient never made.

#### The guard that keeps it honest

`supabase/tests/access_policy_projection.test.sql` reads the permission keys
the live database actually checks and fails if they differ from the ones the
projection describes. Both directions matter: an enforced key the projection
omits tells a patient they share less than they do; a described key nothing
enforces is a different lie.

It has to read two places, not one. `conditions` and `allergies` are checked
only inside `get_patient_clinical_profile`, a SECURITY DEFINER function, and
appear in no policy expression at all. Scanning `pg_policies` alone finds six
of the eight keys and looks complete — which is exactly how the first version
of this test was wrong.

Verified by breaking it three ways: adding a policy that checks an undescribed
key, dropping the definer function, and widening `documents` to a third table.
Each fails with the reason.

### 10.3 Subscriptions: declined for now

FHIR `Subscription` is a good fit on paper — an alert rule really is "tell me
when a resource matching this criteria changes", and `alert_rules` is that
idea written informally.

Two things stop it being worth building today.

`useSubscription` in `@medplum/react-hooks` talks to Medplum's own WebSocket
subscription service. There is no such service here and standing one up is
§2's question again with a different name. Supabase Realtime already delivers
change notification, so the transport is solved by something we run.

And the valuable half — expressing the criteria as a FHIR search string —
depends on that string being *evaluated*, not merely stored. The search
planner added in §11 can express a subset of FHIR search; an alert rule whose
criteria falls outside that subset would be one that silently never fires. A
Subscription resource we can write but not evaluate is documentation wearing a
resource's clothes.

**What would change this:** the planner covering Observation and
MedicationRequest as well as Appointment, at which point criteria could be
validated at configuration time — an alert rule the planner cannot express is
an alert rule that will never fire, and saying so when it is written is worth
more than the resource shape is.

### 10.4 Bots: declined

Medplum Bots are user-authored JavaScript executed server-side on resource
events. The capability is real and the use cases are ones this product has:
transform an inbound record, fan out a notification, enforce a house rule on
write.

It is still the wrong thing to adopt here. Executing code somebody wrote in a
form, inside a process holding every patient's record, is a large security
surface for a health platform — and the surface is not the sandbox, it is the
authorisation question underneath it: which patients' rows may that code
touch, decided by what. RLS answers that for a signed-in user. It cannot
answer it for a script running as a service.

Edge functions already cover the same ground with the properties that matter:
they are reviewed, they are deployed deliberately rather than saved from a
form, they run with a scope chosen at deploy time, and `supabase/functions`
is in version control where a change to one shows up in a diff.

The one thing Bots have that edge functions do not is the trigger — "run this
when a resource of this type changes". That is worth wanting, and it is the
same want as §10.3. It is a Subscription question, not a Bot question.

---

## 11. Search: the semantics, and the bug they exposed

The repository applied `.eq()` for every filter it was handed, whatever
operator the filter actually carried. `date=ge2026-09-01` became
`start_time = '2026-09-01'`. Not an error — just the wrong appointments,
returned confidently. Which is precisely the failure the file's own comment
said it existed to prevent: *"a search that silently ignores the filter it was
given is how a clinician ends up looking at another patient's list believing
it is filtered."*

Planning is now separate from executing. `src/lib/fhir/search.ts` turns a
`SearchRequest` into concrete clauses and refuses what it cannot express;
`SupabaseFhirRepository.search` only turns a plan into PostgREST calls. The
planner touches no network, so the semantics are tested against the
specification rather than against a live table.

### Parameters are typed, and the type decides the operators

`date=ge2026-09-01` is a real query. `status=ge2026-01-01` is not, and
coercing it to equality answers a question nobody asked. Each parameter
declares its type — `reference`, `token`, `string`, `date-period` — and each
type declares the operators it can carry.

### Dates over a period are not dates over an instant

An Appointment occupies a stretch of time, so FHIR gives `date` interval
semantics, and the intuitive reading is wrong in the cases that matter most:

| Query | Compares | Why |
| --- | --- | --- |
| `date=ge…` | the **end** | an appointment that began yesterday and runs into today is on today |
| `date=le…` | the **start** | the same rule in reverse |
| `date=sa…` | the start | "starts after" is about the period, not an intersection |
| `date=eb…` | the end | likewise |
| `date=2026-09-10` | both ends of that day | otherwise it matches only an appointment beginning at exactly midnight, which is no appointment at all |

### What else the planner gained

`service-type` as a string parameter with FHIR's starts-with default and
`:contains` / `:exact` as distinct questions; `:missing`; `_sort` with
direction; `_offset`; and LIKE-wildcard escaping, so searching for `100%` does
not run a query the user did not write. The repository's supported-resource
table is now derived from the search config — two lists of "resources we
serve" is one list that eventually lies.

### What running it turned up

`parseSearchRequest` behaves differently depending on whether the FHIR
definitions have been loaded into the global schema:

| | `status=ge2026-01-01` parses as |
| --- | --- |
| without `@medplum/definitions` | `{ operator: 'ge', value: '2026-01-01' }` — the prefix rule applied blindly, because nothing says `status` is a token |
| with them | `{ operator: 'eq', value: 'ge2026-01-01' }` — correct |

`@medplum/definitions` is a devDependency and never ships to the browser (§3),
so **production runs in the first mode**. That is exactly why the planner's
type guard has to exist rather than being belt-and-braces. Both halves are
asserted: the guard in `fhir-search.test.ts`, where no definitions are loaded,
and the correct parse in `fhir-repository.test.ts`, where they are loaded on
purpose.

The repository suite's fake Supabase builder now records every comparison verb
rather than only `eq`, so a test can assert that `gte` reached the query
builder. A comparison evaluated in JavaScript after the rows come back is one
RLS never saw.
