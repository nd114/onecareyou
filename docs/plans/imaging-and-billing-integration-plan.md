# Imaging (PACS) and Billing Transparency — scoping

> **Status:** Scoping (not started). Read alongside `docs/ehr-integration-plan.md` (the
> architecture this extends), `docs/plans/qhin-integration-plan.md` (the closest prior
> exercise in shape), and `docs/archive/oc-lmc-review-aug-2026.md` (OC-LMC context).
> **Owner:** Engineering, with Compliance on Part B (financial PHI adjacent) and a named
> contact on the hospital side for both — neither part can be scoped further without
> answers only OC-LMC's radiology and finance teams have.
> **Target sequence:** Not yet weighed against the live roadmap. Recorded here so the
> next prioritization conversation has real numbers instead of "how hard would this be."
> **This document describes an intention, not current work.** Nothing below is a
> commitment, and no code or schema here exists yet.

Two hospital systems OC-LMC likely runs today that OneCare does not yet reach: the PACS
that holds their imaging, and Sage for accounting. Both are asked about together because
they are the same shape of problem — *a hospital's own system holds something about the
patient's care that the patient and their clinician should not have to chase down in
person* — which is exactly the sentence `docs/ehr-integration-plan.md` opens with for labs
and vitals. That architecture (tenant-owned connection, consent-gated, provenance on every
row, narrow and never-automatic write-back, credentials in Vault, refuse rather than guess)
is not re-derived here. It is reused. The two parts below are two more instances of it, not
two new frameworks.

They are **not** the same size of problem, though, and the research this document is built
on found a real asymmetry: imaging turns out to plug into infrastructure already planned;
billing turns out to probably be aimed at the wrong system entirely. Both findings changed
what's recommended below from what a first guess would have produced.

---

# Part A — Imaging (PACS / DICOM)

## A1. What PACS actually is

A PACS is the hospital's image *store* — X-ray, CT, MRI, ultrasound, mammography, nuclear
medicine — not the ordering or reporting workflow around it. That's usually a RIS
(Radiology Information System), increasingly bundled with PACS as "enterprise imaging."
The workflow: a clinician orders imaging → the order reaches the RIS → the RIS schedules it
and publishes a DICOM worklist entry → the scanner acquires images and pushes them to PACS
→ a radiologist reads on a PACS workstation and dictates a report → the finalized report
(and a reference to the images) flows back out, historically over HL7v2, increasingly as a
FHIR `DiagnosticReport`.

Two things follow from that shape. First, OneCare is not trying to become any part of this
— not the order, not the worklist, not the read. It is trying to receive what comes out the
other end: the report, and enough of the images that a patient or their treating clinician
can see what was actually looked at, the same relationship the EHR integration already has
to vitals and medications. Second, the actual pixels and the finalized report are two
different retrievals with two different weights, which matters for what "v1" should mean
(§A4).

## A2. DICOM the format vs. DICOMweb the API

Classic DICOM networking predates HTTP entirely — TCP, historically port 104, nodes
identified by an "Application Entity" title rather than a credential, no built-in
authentication. Access control on a real hospital network is IP/AE-Title allowlisting, not
a login. The core operations are **C-STORE** (push an image), **C-FIND** (query metadata),
**C-MOVE** (tell one node to send a study to another). This is what a scanner speaks to a
PACS, and it is not something an outside web app can call.

**DICOMweb** (DICOM standard Part 18) is the REST/HTTP equivalent, and the only realistic
integration target for anything outside the hospital's own network:

- **QIDO-RS** — query studies/series/instances (by patient, date, modality…), returns JSON
  metadata only. *This* is "list a patient's imaging studies."
- **WADO-RS** — retrieve the objects: either the full native DICOM instance/pixel data, or a
  server-rendered JPEG/PNG. The rendered form is what a thumbnail or web preview calls; the
  native form is what a real diagnostic viewer needs.
- **STOW-RS** — HTTP POST to store an instance. Not needed for a read-only integration.
- **WADO-URI** — the older, simpler predecessor to WADO-RS (one rendered image via a GET and
  query params). Still supported for compatibility; WADO-RS is current.

DICOMweb runs over plain HTTPS, so a modern gateway puts OAuth2/bearer-token auth in front
of it (this is exactly what Google's Cloud Healthcare API DICOM store and similar products
do). Classic DIMSE has no equivalent, which is precisely why a hospital whose PACS only
speaks DIMSE needs a **gateway** translating inward-DIMSE to outward-DICOMweb-plus-OAuth2 —
this is a named, common component (a Vendor Neutral Archive, or a product built for exactly
this bridge), not something to build from scratch. See §A3.

## A3. The finding that changes the design: this can ride on Medplum

`docs/ehr-integration-plan.md` already designates Medplum as the platform's FHIR layer for
the EHR work. Medplum has its own (beta) DICOM/DICOMweb support, on the same server, under
the same project and auth model as the rest of the FHIR data:

- Standard QIDO-RS / WADO-RS / STOW-RS endpoints, so a hospital's imaging can be queried and
  retrieved through the same authenticated surface OneCare would already be calling for
  observations and medications.
- A **Medplum Agent** — a small process that runs *inside* the hospital's network, listens
  for classic DIMSE C-STORE from modalities/PACS, and forwards over outbound HTTPS to
  Medplum. This is the DIMSE→DICOMweb gateway §A2 says is needed, already built by the same
  vendor as the FHIR layer, rather than a second vendor relationship to stand up.
- FHIR `ImagingStudy` is a *manifest*, not a pixel carrier — it names the study, the modality,
  series/instance counts, and an `Endpoint` reference pointing at the DICOMweb service that
  actually holds the bytes. `DiagnosticReport.imagingStudy` links a radiologist's finalized
  report back to the study it's about. Medplum keeps its own `DicomStudy`/`DicomSeries`/
  `DicomInstance` resource types internally (rather than flattening into a generic
  `ImagingStudy`) because that translation would drop attributes a viewer needs — but these
  stay first-class, access-controlled resources in the same project as everything else.
- Medplum's own docs describe the OHIF viewer (§A4) working against their DICOMweb output
  directly, which matters if diagnostic-grade viewing is ever pursued.

**Caveat, stated plainly because it affects how much to trust this section:** medplum.com
and hl7.org were unreachable from this session's network egress, so the above is built on
search-engine-retrieved excerpts of those exact pages, cross-checked across independent
queries rather than one direct read. It is a strong lead, not a confirmed spec — **read
medplum.com/docs/dicom directly before this is designed for real**, the same way any
integration here would start with reading the hospital's own documentation first.

If this holds up, imaging is not a new integration category. It's the EHR integration's
existing tenant-owned connection, pointed at one more Medplum-backed endpoint, with its own
consent category and provenance rule — smaller than the QHIN build, not bigger.

## A4. What "v1" should actually mean

Two very different asks hide inside "let the patient see their imaging":

- **Report-first (the realistic v1).** Pull the radiologist's `DiagnosticReport` — the
  narrative, the conclusion, often a PDF — plus *one rendered preview image per series* via
  a WADO-RS rendered-resource call. No DICOM viewer needed; a PDF renderer and an `<img>`
  tag suffice, and this reuses the Health Vault's existing document pattern almost exactly
  (a document, an AI-friendly summary, a source badge).
- **Full diagnostic-grade viewing** — multi-slice scroll, windowing/leveling, zoom, MPR —
  needs a real DICOM renderer against native pixel data, real bandwidth for a full series,
  and is genuinely a different feature. The standard build-vs-buy answer here is embedding
  **OHIF Viewer** (MIT-licensed, browser-based) on **Cornerstone.js/Cornerstone3D**, which
  targets DICOMweb sources directly — not writing a renderer from nothing. But: OneCare is
  not a radiology workstation, and the clinicians using it already have one. The case for
  shipping a full diagnostic viewer in v1 is weak; the case for a patient and their treating
  (non-radiologist) clinician being able to read the report and see what was imaged is
  strong. **Recommend report-first only for v1**, with the viewer noted as a real,
  buildable v2 rather than promised now.

## A5. What it would touch (sketch, not a commitment)

Mirrors `ehr_connections` / `ehr_sync_logs` / provenance columns almost exactly, because
that pattern is exactly right here too — the addition is a consent category and a
lightweight local index so listing a patient's studies doesn't round-trip to Medplum on
every page load. Medplum stays the source of truth for the DICOM data itself; nothing here
duplicates pixel data into OneCare's own Postgres.

```sql
-- one more row shape alongside ehr_connections, not a parallel system
imaging_connections   -- practice_id, medplum_endpoint_id, gateway type (agent | direct DICOMweb),
                       -- sync_status, credentials_vault_id (never a plaintext column — see §B, and
                       -- the "credentials_encrypted is not encrypted" lesson in ehr-integration-plan.md)

imaging_studies        -- patient user_id, medplum reference, modality, study_date, accession_number,
                       -- report_status, source = 'imaging_import', connection_id  (a local index;
                       -- the manifest, not the pixels)
```

Consent: imaging becomes one more category on the existing share model, same as vitals or
documents — no share, no import, no exception. Same no-break-glass rule the rest of the
platform holds to.

## A6. Gotcha worth flagging now, not after it's shipped

DICOM files carry extensive PHI *in their metadata tags* — patient name, DOB, MRN, accession
number, institution — independent of the filename. This is irrelevant to real patient/
clinician *viewing* (they're supposed to see their own data), but it matters the moment
imaging touches anything that isn't that: demo/seed data, any future AI-on-imaging feature,
or an export. Real de-identification means walking DICOM tags against a defined profile
*and* separately checking for PHI burned into the pixel data itself (common on ultrasound,
where a sonographer types the patient's name onto the image) — tag-stripping alone doesn't
touch that. File sizes also matter operationally: a CT series commonly runs 100–500MB, and
multi-series studies can exceed 1–1.5GB, which is why WADO-RS's per-frame/per-instance
retrieval (not whole-study download) is the right default.

## A7. Open questions for OC-LMC's radiology/IT team

None of these are answerable from here, same discipline as the EHR plan's own §4:

1. What PACS/RIS do they actually run, and does it speak DICOMweb natively, or would it need
   the Medplum Agent (or an equivalent gateway) bridging classic DIMSE?
2. Is the imaging endpoint reachable from outside the hospital network at all, or does
   everything have to go through an inside-the-network agent?
3. Do finalized reports already exist as structured `DiagnosticReport` data anywhere, or
   only as dictated text/PDF in the RIS?
4. Who can authorize an outbound connection from their imaging systems, and what's their own
   policy on image data leaving their network (even to a HIPAA-covered destination)?

## A8. Non-goals for v1

Ordering imaging, worklist integration, writing anything back to the PACS, AI interpretation
of images, and — per §A4 — a full diagnostic viewer. All plausible later, none needed to
close the "patient shouldn't have to ask for their own scan" gap.

**Sources (imaging):** DICOM PS3.8 (NEMA) and PS3.18 (DICOMweb) standard text; dicomstandard.org's
WADO-RS/WADO-URI comparison; Google Cloud Healthcare API DICOM docs (OAuth2 pattern);
Medplum's DICOM, DICOM data-model, agent-DIMSE and OHIF-viewer docs (via search excerpt,
flagged above for direct re-verification); OHIF Viewer and Cornerstone3D GitHub repos; PMC
literature on DICOM de-identification; Orthanc and dcm4che DICOMweb gateway docs.

---

# Part B — Billing transparency

## B1. The premise, and the finding that complicates it

The ask: a patient sees an itemized breakdown of what they were billed for and why, the
hospital manages billing on their side, and the integration point is Sage, which OC-LMC is
known to use for accounting. The research this document is built on turned up a real problem
with that plan as stated: **itemized, patient-level billing detail very likely does not live
in Sage at all.**

The evidence is consistent across three angles:

- **athenahealth says so about itself.** Its own materials state it doesn't function as an
  accounting system and doesn't maintain a general ledger — practices using it for billing
  pair it with a separate accounting product (QuickBooks, NetSuite, or Sage Intacct
  specifically) for the books.
- **Epic MyChart's billing statements come from Epic's own Resolute billing module**, unified
  across professional and hospital balances by Epic's Single Billing Office layer — not from
  a downstream accounting/ERP system.
- **The likely compliance reason**: a general ledger typically holds summarized financial
  totals, not patient-level PHI, partly because pushing patient-level detail into an
  accounting system would pull that system's vendor into BAA obligations it usually isn't
  built for. (Single-sourced in the research — worth confirming with OC-LMC's own compliance
  contact, not treated as settled here.)

The pattern across healthcare billing generally: a **Practice Management (PM) / Revenue
Cycle Management (RCM) system** — separate software — owns scheduling, charge capture,
coding (CPT/ICD), claims, and patient statements. It posts *summarized, already-reconciled*
journal entries to the accounting system. Sage, in other words, is probably the ledger that
says "$X came in this month," not the record that says "this $180 was for the September 4th
consultation and this $40 was the lab fee." **The itemized, per-visit detail a patient
actually wants to see almost certainly lives in whatever PM/RCM/billing system OC-LMC's
billing staff use day to day — not yet identified — with Sage downstream of it.**

This is the single most important thing for the product owner to read out of this document:
**the first real question is not "how do we call the Sage API," it's "what system do OC-LMC's
billing staff actually use to generate a patient's bill."** Sage may still matter — for
payment/balance status, or if OC-LMC turns out to be small enough to bill directly out of
their accounting software without a separate PM layer — but it's very unlikely to be the
whole answer, and designing only for Sage risks building against the wrong system.

## B2. What's actually true about Sage's API, by product

"Sage" names several genuinely different products with different API realities. Which one
OC-LMC runs has to be confirmed before anything below is more than a menu of possibilities.

| Product | API reality | Auth | Verdict |
| --- | --- | --- | --- |
| **Sage Intacct** | Real REST API (developer.intacct.com), plus an older XML web-services API. AR Invoice, Customer, AP Bill, and Payments appear as distinct documented objects — structurally, invoice headers and line items are reachable. | OAuth2 `client_credentials`, company-scoped. Legacy API requires the company to explicitly authorize a Sage-issued Sender ID. | Common in US mid-market/healthcare accounting. Sandbox appears to require an existing paying-customer relationship — not a free outside signup. |
| **Sage Business Cloud Accounting** (formerly Sage One) | Cleanest of the four: REST/JSON, current v3.1, `sales_invoices` + `invoice_lines` entities map directly to "itemized bill." | OAuth2 authorization-code — a hospital admin logs in and authorizes one specific "business" (tenant); every call carries an `X-Business` header. | Best-shaped API of the four *if* this is the product in use, and if invoice-level detail actually lives here rather than upstream in a PM system (§B1). A separate, similarly-shaped "Sage Active" product surfaced in research too — don't assume it's identical; confirm the exact product name on OC-LMC's account. |
| **Sage 50cloud / Sage 50** | On-prem Windows desktop software ("cloud" refers only to bolt-on Office 365 features). **No modern REST/OAuth2 API.** Access is a paid Windows COM SDK (Sage Developers Programme membership, quoted around £2,500–3,100+VAT/year) or an unsupported read-only ODBC driver. | N/A | If this is what OC-LMC actually runs, a standard hosted integration is not available — this becomes a materially harder project needing a licensed SDK and an on-prem bridge process. **Worth ruling in or out early**, since it changes the whole feasibility picture. |
| **Sage X3** | REST web services (SData 2.0) plus SOAP; X3 Online (cloud) documents OAuth2. | OAuth2 (cloud SKU) | Only plausible if OC-LMC runs full multi-entity ERP, not just accounting — unlikely for a single hospital, flagged for completeness. |

## B3. Two branches, because the answer to B1 changes the design

**Branch 1 — a PM/RCM/billing system exists and holds the itemized detail (expected).**
The integration target is that system, not Sage. This document can't design it yet because
it isn't named — the recommendation is to find out what it is (§B5, question 1) before
scoping further. Sage, in this branch, is used only for **balance/payment status**
reconciliation if even that turns out to be useful — "is this invoice paid" is exactly the
kind of summarized fact a GL is built to answer, unlike "why was I charged this."

**Branch 2 — OC-LMC bills directly out of Sage, no separate PM layer.** Plausible for a
smaller operation. If confirmed, and if it's Intacct or Business Cloud Accounting (not
50cloud), the integration is a straightforward read: pull `sales_invoices`/AR-invoice
objects with their line items, map to a patient by whatever customer-matching field Sage
uses (a real identity-matching problem, same discipline as `ehr_patient_links` in the EHR
plan — never auto-link on name alone), and surface line item description, amount, date, and
paid/outstanding status.

Both branches produce the same patient-facing shape once the source system is confirmed —
what changes is which API is called and how deep the CPT/ICD-level detail goes.

## B4. What this should and shouldn't try to be

**Should:** a read-only transparency layer. A patient sees a list of charges, each with a
plain-language description, an amount, a date, and — where OneCare already has the
corresponding visit or encounter on file — a link from the charge to what that visit
actually was, which is the genuinely differentiating idea here: not just "$180 — Office
Visit" but "$180 — your September 4th visit with Dr. Adeyemi," tying the bill back to care
the patient can actually recognize. An org/tenant admin gets a read-only reconciliation
view: which invoices are visible to which patients, sync status, nothing more.

**Should not:** become a billing system. Not claims, not coding, not collecting payment (that
stays the hospital's PM system's and Sage's job, or a much later, separately-scoped
patient-bill-pay feature with its own PCI-DSS obligations — not bundled into this). Not a
replacement for whatever the hospital's finance team already uses. This mirrors
`ehr-integration-plan.md`'s own discipline exactly: "we are not building an EHR," here
restated as *we are not building a billing system* — the point is closing the gap where a
patient can't see what they were charged for, not re-platforming revenue cycle management.

## B5. Open questions for OC-LMC's finance/billing team

In priority order — question 1 gates everything else:

1. **What system generates a patient's actual itemized bill?** Name of the PM/billing/RCM
   software, if any, separate from Sage.
2. **Which Sage product**, specifically — Intacct, Business Cloud Accounting, 50cloud, or
   something else? (If 50cloud: flag immediately, since §B2 means this is a different, much
   harder project.)
3. Does Sage (or the PM system, once named) expose a developer/API program OC-LMC can
   request credentials for, and who authorizes that on their side?
4. Is patient-level billing detail (not just totals) held in either system today, or does it
   only exist as PDF statements/printouts?
5. Does OC-LMC's own compliance posture treat billing data as within the same BAA as clinical
   data, or as a separate agreement? This decides whether the existing sharing/consent model
   extends cleanly or needs its own disclosure step (the same kind of decision the QHIN plan
   made explicit for TEFCA).

## B6. One thing this is not: OneCare's own billing

Worth stating plainly so it's never conflated in a later conversation the way clinician and
enterprise pricing were (`docs/pricing-roadmap.md`, decision C4 in the OC-LMC review): OneCare
already bills tenants, clinicians and patients for the *platform* — Stripe-based, via
`create-checkout` / `create-clinician-checkout` / `customer-portal`, unrelated code, unrelated
data. This document is about the opposite direction: OC-LMC billing *its own patients* for
*care it rendered*, which OneCare would only ever be showing, never processing. The two
billing relationships must stay structurally separate — a hospital's clinical billing
integration should never be able to touch OneCare's own subscription/payment tables, and
vice versa.

## B7. Non-goals for v1

Payment collection, claims submission, CPT/ICD coding, editing any charge, and — until
branch 1 vs. branch 2 (§B3) is resolved — any Sage-specific code at all. The only v1-safe
first step is the discovery conversation in §B5.

**Sources (billing):** Sage Intacct developer docs (developer.intacct.com, mirrored under
developer.sage.com/intacct); Sage Business Cloud Accounting developer portal
(developer.sage.com/accounting) and a third-party open-source SDK README (fetched directly);
Sage 50cloud SDK/Developers Programme references; Sage X3 SData/REST documentation; athenahealth's
own product materials on athenaCollector vs. accounting systems; Epic MyChart/Resolute Single
Billing Office descriptions (osplabs.com, folio3.com); "Practice Management System" and
"Revenue Cycle Management" definitions (athenahealth resources, Wikipedia). Most primary
vendor domains were unreachable from this session's network and are represented here via
cross-checked search excerpts rather than a direct fetch — treat specifics (exact rate
limits, exact scope names, the "Sage Active" product question) as strong leads requiring
direct verification against developer.sage.com before being relied on.

---

## What ties both parts together

Same reason to do either: a patient shouldn't have to be the courier for information a
hospital system already has about them, and a clinician shouldn't have to ask a patient to
relay it. Same discipline for both: tenant-owned connections, Vault-stored credentials from
day one (not the plaintext-column mistake the EHR integration is still paying down), consent
gates before any import, provenance on everything that lands in a patient's record, and
refusing rather than guessing whenever identity-matching or mapping is ambiguous. And the
same honest note the QHIN plan opens with applies here even more: **this document describes
an intention, not current work** — Part A rests on one unverified (though well-corroborated)
claim about Medplum, and Part B's entire shape depends on a discovery conversation that
hasn't happened yet. Both are worth having before either is scoped into sprints.
