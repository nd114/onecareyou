# Independent Clinicians, Hospitals, and People Who Are Both

**Status:** In force and asserted. Read before changing anything about access.
**Owner:** Engineering
**Relates to:** `docs/sharing-access-consent-model.md`, `docs/enterprise-hospital-tenancy-plan.md`

---

## 1. Three kinds of user, one model

OneCare has to work for a doctor with their own patients, for a hospital with a
roster, and — the case that actually breaks things — for a doctor who has both:
their own list, and a post at a hospital that has its own.

Two functions grant clinical access, and **they never merge**:

| Pathway | Granted by | Means |
| --- | --- | --- |
| `clinician_has_patient_access` | `provider_shares` | The patient invited *this person* |
| `institution_has_patient_access` | `practice_shares` + active `practice_members` | The patient shared with a *practice*, and this person works there |

Everything else follows from keeping those apart.

## 2. What that guarantees

Each of these is an assertion in `supabase/tests/independent_vs_institution.test.sql`,
not a description of intent:

- **A hospital never inherits a doctor's private list.** A doctor taking a post
  does not hand their own patients to their employer — not to a colleague, not
  to the hospital owner. The patient shared with a person, not a place.
- **A doctor never gains the hospital's list personally.** Working somewhere
  does not make its patients yours in the sense a patient meant when they
  invited a clinician directly.
- **Leaving the job does not take your own patients with it.** This one decides
  whether an independent clinician can safely adopt the platform at all: if a
  hospital could end their personal relationships by ending their employment,
  the patient's invitation would mean nothing.
- **Another hospital's membership grants nothing here.** An assignment made in
  one tenant is scoped to that tenant.
- **Ending one relationship never ends the other.** A patient with both can
  leave either without silently leaving the other.
- **Only the patient changes the terms of a personal share.**
  `guard_provider_share_consent` reverts any change to `is_active`,
  `permissions`, `expires_at` or the revocation fields made by anyone other than
  the patient who owns it. A clinician can neither end their own share nor
  restore one the patient ended.

That last one was found by writing the test: a draft tried to end a share while
carrying a colleague's identity and the change was silently reverted. That is the
guard working, and it is now asserted rather than assumed.

## 3. How to keep it true

**Never write a helper that ORs the two pathways into one "can this person see
this patient" check without saying which one answered.** The RLS policies do use
both — `clinician_has_patient_access(x) OR institution_has_patient_access(x)` —
and that is correct for *reading clinical data*, because either relationship is a
real basis for it. What must not happen is a feature deciding that one pathway
implies the other.

Concretely, when adding a feature, ask which of these it is:

| The feature is about… | Use |
| --- | --- |
| Reading a patient's clinical record | Both pathways, as the existing policies do |
| A clinician's own patient list, their own notes, their own assistant history | `clinician_has_patient_access` alone |
| A hospital's roster, its departments, its billing, its staff admin | `institution_has_patient_access` alone |
| Anything a tenant administrator does | Membership of *that* practice, never the personal pathway |

## 4. The independent clinician is not a degraded hospital

A solo clinician has no `practices` row, no departments, no staff roster, and no
tenant admin. Features written as "hospital features with the hospital bits
hidden" fail them: an empty department picker, a billing page that asks which
practice, a settings screen full of things they do not have.

The rule is that a practice is **optional context**, never a prerequisite.
`fhir_appointments`, `fhir_invoices` and `fhir_care_plans` all take
`practice_id` as nullable for this reason — a solo clinician's appointment
belongs to them and to their patient, and to nobody else.

## 5. What is not built

**A clinician's own patients are not visible to their employer, and there is no
mechanism to make them so.** If a hospital ever needs that — a locum's caseload
during cover, say — it is a new consent conversation with the patient, not a
policy change. Nothing should be added that lets an employer opt a clinician's
patients in on their behalf.

**There is no "refer into the hospital" flow yet.** A doctor who wants their own
patient seen by their hospital colleagues has to ask the patient to share with
the practice. That is the correct default; a smoother version of it still has to
end with the patient agreeing.
