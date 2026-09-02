# Adopting Medplum's Modules: What Lifts, What Doesn't

**Status:** Assessment complete, adapter built and proven. Awaiting a UI decision.
**Owner:** Engineering
**Relates to:** `docs/medplum-fhir-adapter.md`

---

## 1. The finding in one paragraph

Their **data layer lifts wholesale** — proven, not estimated: Medplum's own
`MedplumClient` now reads and searches against our Supabase in the test suite,
with no Medplum server, no second database and no second identity system. Their
**UI does not lift** without a decision, because their entire front end is built
on Mantine and ours is Tailwind + shadcn. That is not a small integration detail;
it is 128 of their 142 screen files.

## 2. What was measured

Cloned `github.com/medplum/medplum` at 5.1.36 and counted, rather than judging
from screenshots:

| | |
| --- | --- |
| `examples/medplum-provider` (the clinician app in the screenshots) | ~30,000 lines, 142 `.tsx` files |
| Of those, files importing Mantine | **128** |
| Of those, files calling the Medplum client | 68 |
| `@medplum/react` components available | 134 |
| Licence, every package | Apache-2.0 |

## 3. What is now built and proven

`src/lib/fhir/repository.ts` — a `FhirRepository` over our tables, plus
`createFhirFetch(supabase)`.

The mechanism: `FhirRouter.handleRequest(request, repo)` is a pure function, and
`MedplumClient` accepts a custom `fetch`. So a FHIR REST call made by any of
their code is served **in-process** against our Postgres. `src/test/fhir-repository.test.ts`
does exactly this with their real client:

```ts
const medplum = new MedplumClient({ baseUrl: 'https://local/', fetch: createFhirFetch(supabase) });
const appointment = await medplum.readResource('Appointment', 'appt-1');  // our row
```

**Authorisation does not move.** Every read and write goes through the ordinary
Supabase client carrying the user's JWT, so row policies decide what comes back
exactly as they do everywhere else. There is no service-role key in this path and
there must never be one — that would relocate authorisation from the database
into a TypeScript file, which is the thing we decided against when we rejected
self-hosted Medplum.

Three safety properties are asserted rather than assumed:

- **Filters reach Postgres.** A search parameter is translated to a column and
  pushed into the query. If it were applied in JavaScript after the rows
  returned, a bug in that file could show one patient another's list.
- **Unsupported parameters are refused, not ignored.** Silently dropping a filter
  returns everything the policy allows while the caller believes it is filtered.
- **Absent and not-yours give the same answer.** Otherwise the repository becomes
  an oracle for whether a record exists.

Scope is one resource type. Appointment is the one with a FHIR-shaped table, and
a repository that claims to serve resources it cannot is worse than one that says
so. Adding a type is now a table plus a mapper plus rows in `SUPPORTED`.

## 4. The UI decision, which is yours

Their look is genuinely better and worth taking. How to take it is a real choice
with real costs, and there is no free option.

**A — Adopt Mantine alongside shadcn.** Their screens come across with the least
rewriting; `@medplum/react`'s 134 components become available. Cost: two design
systems in one bundle, two theming stories, and every future component has an
ambiguous home. For a product whose users are in Nigeria on mobile data, the
bundle cost is not incidental.

**B — Rebuild the screens in shadcn, taking their information architecture.**
One design system, our brand, no second theme. Their layout decisions — the
three-pane patient view, the task rail, the resource-typed timeline — are the
valuable part and they are free to copy. Cost: we write the components.

**C — Mantine only behind the clinician portal.** The patient app stays shadcn;
the clinician EHR shell is a separate surface that can carry its own kit. Cost:
still two systems, but the seam is a route rather than a component tree, and the
patient bundle stays clean.

**Recommendation: C, then B opportunistically.** The clinician portal is where
the depth gap is, it is desktop-first, and its users are staff rather than
patients on metered data. It also gets a demonstrable EHR shell up fastest, which
is what the LMC conversation needs — while leaving the patient experience, which
is the actual product differentiator, untouched.

## 5. Module-by-module

From their feature grid, against what we have:

| Their module | Our position | Worth taking |
| --- | --- | --- |
| **Scheduling** | Shipped, FHIR Appointment | Their calendar/slot UI — we have a list |
| **Charting** (encounters, notes, orders) | We have encounters and dictation | Yes — their SOAP structure and note signing |
| **Care Coordination** (tasks, care plans, referrals) | We have tasks and referrals, thinner | Yes — CarePlan is a real gap |
| **Medications** | We have meds + interaction checking | Partly — their reconcile flow; our checker is better |
| **Diagnostic Orders** | Not present | Yes, but needs a lab integration to mean anything |
| **Intake & Registration** | We have onboarding | Their Questionnaire engine is strong |
| **Messaging** | Shipped, recently deepened | Little to take |
| **Billing & Payments** | Not present | **Flagged — see below** |

**Billing is flagged deliberately.** Earlier in this project the call was that
claims and payments are "getting close to EHR, which IS NOT what OneCare is
about". That reasoning has not been retracted and the screenshots do not retract
it — a feature grid is not a decision. Everything else here deepens the clinical
record; billing starts a different product with a different buyer and a different
compliance surface. Worth an explicit yes before anyone builds it.

## 6. Spaces

Their newest feature, and the closest thing to what we already have. It is an
LLM chat in the clinician's sidebar that can read and render FHIR resources
inline, with a model picker driven by project settings (their defaults are
OpenAI).

Two things about it are worth taking regardless of whether we copy the UI:

**Conversations are stored as FHIR `Communication` resources**, threaded by
topic. Ours are in a bespoke chat table. Theirs is exportable, auditable and
carries the patient reference natively — a clinician's questions about a patient
become part of that patient's record rather than a side channel.

**Resources render as cards inside the conversation**, so "show me her last three
HbA1c results" produces objects the clinician can act on rather than prose about
them. Our AI answers in text. This is the more valuable half, and it does not
depend on Mantine.

Our AI has depth theirs does not — the drug-interaction verdict, the risk engine,
adherence. The gap is not intelligence; it is that ours talks and theirs hands
things over.

## 7. What happens next depends on §4

The adapter is in and proven, so any of A, B or C can proceed from here. Nothing
below §4 should be built until that choice is made, because it decides whether we
are writing components or importing them.
