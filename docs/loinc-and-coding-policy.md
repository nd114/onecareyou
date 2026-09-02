# Coding Policy: LOINC, SNOMED, and What We Claim

**Status:** In force. Read this before demonstrating clinical data to a client.
**Owner:** Engineering + Clinical
**Relates to:** `docs/medplum-fhir-adapter.md`, `docs/qhin-integration-plan.md`

---

## 1. Read this before a client demo

If a prospect asks *"is your data coded?"*, the honest answer is:

> **Vital signs are coded to LOINC using the codes in the FHIR R4 specification.
> Laboratory results and clinical conditions carry the text the clinician or
> patient entered, and are explicitly marked unconfirmed. We do not assign codes
> we cannot verify.**

That is a stronger position than it sounds, and it should be presented as a
deliberate choice rather than an apology. A platform that guesses codes produces
records that look interoperable and are wrong — and in a clinical record, a
confidently wrong code is worse than an honest gap, because the receiving system
cannot tell the difference.

**Do not claim** full LOINC lab coding, SNOMED problem lists, or ICD-10 mapping.
None of those exist yet. Section 4 says what it would take.

## 2. What is coded today

| Data | Coded? | Source of the code |
| --- | --- | --- |
| Weight | LOINC `29463-7` | R4 `bodyweight` profile |
| Heart rate | LOINC `8867-4` | R4 `heartrate` profile |
| Body temperature | LOINC `8310-5` | R4 `bodytemp` profile |
| Oxygen saturation | LOINC `2708-6` | R4 `oxygensat` profile |
| Blood pressure | LOINC `85354-9`, components `8480-6` / `8462-4` | R4 `bp` profile |
| Units for the above | UCUM | R4 `ValueSet/ucum-vitals-common` |
| 14 laboratory results | **No** — `code.text` only | See §3 |
| Conditions | **No** — `code.text`, `unconfirmed` | See §3 |
| Allergies | **No** — `code.text`, `unconfirmed` | See §3 |

Every code above was extracted from the R4 specification bundle shipped in
`@medplum/definitions`, not recalled from memory. `src/test/fhir-observation.test.ts`
re-extracts them from that bundle on every test run, so if one is ever changed to
a code somebody remembered, the specification disagrees in CI rather than in an
exported patient record.

## 3. Why the rest is uncoded

**Laboratory results.** LOINC has codes for HbA1c, creatinine, LDL and the rest.
Those codes are not in the FHIR bundles — LOINC is a separate terminology with
its own licence and release cycle — so assigning them means typing them from
memory. That is the same failure as inventing a SNOMED code because a string
looked close. They are emitted as `category: laboratory` with `code.text`.

**Conditions and allergies.** These are free text a patient or a hurried
clinician typed. "Diabetes" is not a SNOMED concept; it is a word that could mean
type 1, type 2, gestational, or insipidus. Emitting `73211009` because the string
looked close would put a clinical claim into an exported record that no clinician
made. FHIR explicitly allows a `CodeableConcept` to carry `text` with no `coding`,
which is what this data honestly is, and everything is marked `unconfirmed`.

**Units we cannot verify.** `x10³/µL` is not valid UCUM. It is emitted as
`Quantity.unit` with no system, which is what FHIR intends for a human-readable
unit that is not coded.

## 4. What changes this, and when

Coding is not a code change; it is a sourcing and governance decision. Three
things have to be true before we claim it:

1. **A terminology source.** A LOINC release (free, registration required), a
   SNOMED CT licence (country-dependent — Nigeria's status needs checking before
   any commitment), or a terminology service that maps on request.
2. **A mapping owner.** Somebody clinical signs off that "HbA1c" in our field
   means the LOINC concept we assigned. This is not an engineering call.
3. **Enterprise process context.** Hospitals code differently. A tenant may
   already have local codes that must be preserved alongside, which FHIR supports
   — a `CodeableConcept` carries several codings, and the tenant's own is as
   legitimate as ours.

Until those exist, the architecture is deliberately ready and deliberately
silent: `code.text` is populated, `code.coding` is absent, and adding a coding
later changes nothing about how the data is stored or read.

## 5. The rule, stated once

**Never emit a code we cannot point at a source for.**

Uncoded data is a known gap that a receiving system handles correctly. A wrong
code is a false claim that it cannot detect. When in doubt, text.
