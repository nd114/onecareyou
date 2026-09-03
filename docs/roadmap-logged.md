# Logged for the roadmap

Decisions taken in review that are not being built now. Each says what it is,
why it is deferred, and what would have to be true to start.

---

## Positioning: "a patient-controlled longitudinal record with a clinician workspace on top"

Marked for reuse. It is accurate, it explains the product in one line to
someone who knows healthcare software, and it avoids the EHR comparison we lose
— an RFP scored on feature count against Epic is not a contest worth entering.

It is also consistent with the homepage argument, which an "EHR" claim would
contradict: the whole case is that the record is the patient's, not the
institution's.

**Not scoped:** ONC certification. Explicitly out for now.

---

## Clinical operations we *do* intend to build

Reviewed and disagreed with the earlier framing. These are not hospital ERP and
the incumbents are not obviously ahead:

### Lab and radiology orders — **highest value of this group**

The argument is a patient one, not a hospital one. Today, someone who goes to a
lab for a test waits for the doctor to receive and interpret the result before
seeing it. If the order lives in OneCare, the result lands in the patient's
record when it is ready, and they have it whether or not the doctor has
looked yet.

That is the product's thesis applied to a workflow, not a feature-parity move.

FHIR resources: `ServiceRequest` for the order, `DiagnosticReport` +
`Observation` for the result. `ServiceRequest` was already on the adapter's
list.

**To start:** decide whether we integrate with labs directly or accept
results as documents first. The second is far cheaper and probably right.

### Claims

Worth doing, second. Depends on the merchant-of-record decision, which is
still open.

### Bed management — deferred, but the idea is worth keeping

The version described is more ambitious than bed management: a spatial view of
where every patient and every piece of equipment is, with equipment
provenance. That is a different product and probably a different company. Not
now — but recorded, because it is a genuinely distinctive idea rather than a
catch-up feature.

### Not building

Rota/scheduling of staff, inventory, payroll. Hospital ERP, low margin,
crowded.

---

## Hospital directory / storefront

Three separable things, deliberately sequenced.

### 1. Public hospital pages — **do first**

Services, locations, join code, branding. `practices` already carries branding,
contact and a hospital code, so most of the data exists. It is an acquisition
channel we control and it carries no regulatory weight.

### 2. Search by proximity and services — **do second, without prices**

Recommendation stands: launch with services and locations, **not prices**.
Posted prices that do not match the bill are a legal exposure in several
jurisdictions, and "appropriate cost" varies by insurer, procedure and
complication. Add price ranges only where the hospital publishes them itself
and owns the claim.

**To start:** geocoding for practices, and a services taxonomy. The taxonomy is
the hard part — resist inventing one, look for an existing standard.

### 3. Hospital broadcast to connected patients — **do third, gated**

The feature is reasonable; the naive version is not. A hospital messaging every
connected patient is one abuse report from being a spam channel, and it inverts
the consent story the product is built on.

Gates, all of them:

- Patients opt in **per institution**, not globally.
- Messages are typed: clinical / administrative / promotional.
- Promotional is **off by default** and separately opt-in.
- Every broadcast is in the audit trail with its recipient count.
- A visible unsubscribe that actually works.

Done that way it is a feature. Done naively it makes "you control your record"
ring hollow.

---

## Agents for onboarding — **worth doing, two sprints out**

See the separate section below for how they would work.

## MCP integration — **stalled, logged**

The idea: let an external AI client read a patient's record over MCP.

**Why it is stalled rather than rejected:** the capability is genuinely useful
and the protocol is the right shape. What is not settled is the consent model,
and that is the part that matters most here.

**The commentary worth keeping:**

An MCP connection is, functionally, *a share*. It gives a non-human party
standing access to a patient's record. If it is built as an "integration" in a
settings page, it becomes a back door that the product's own homepage says does
not exist.

So if it is built, it should be built as a share:

- It appears in Care Circle beside Dr Jane Evans, with the same category
  toggles.
- It is revoked with the same button.
- Every read goes through the same audit trail.
- It expires by default, rather than persisting silently.
- **Read-only to begin with.** Write actions through MCP wait until the
  in-product action-approval flow is proven.

Framed that way it is consistent with everything else. Framed any other way it
is the thing that undermines the argument.

**To start:** the in-app AI action-approval and audit work needs to land first.
It is the same consent machinery, and building it twice would guarantee they
disagree.

---

## Terms of Service and Privacy Policy — **needs a comprehensive review**

Flagged during the recording-consent discussion and correct. The platform has
changed substantially: FHIR export, whole-Vault sharing, an assistant that
reads the record, ambient scribe, institution access, billing, and soon
patient-initiated recording.

The current documents almost certainly do not describe any of that accurately.

This is a legal review, not an engineering task, but engineering owes it an
accurate account of what data is collected, where it goes, who can see it, and
what is retained. The RLS test suite is a good starting point — it is the only
document in the repository that states access rules precisely.
