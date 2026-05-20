# QHIN Integration Plan — OneCare ↔ TEFCA / Particle Health / Health Gorilla

**Status:** Scoping (not started)
**Owner:** Engineering + Compliance
**Target sequence:** P3 item #5 (after subscription polish, before ambient scribe)
**Estimated effort:** 2–3 sprints engineering + 4–8 weeks BAA/onboarding

---

## 1. Why QHIN, not per-EHR FHIR

We originally scoped per-EHR (Epic, Cerner, Athena) integrations via SMART on FHIR. That model:

- Requires a separate App Orchard / Code App Listing per EHR (4–12 weeks each, $0–$30k+ fees)
- Forces clinicians to ask their IT team to install us
- Yields fragmented coverage; long tail of small EHRs never reached

A **QHIN** (Qualified Health Information Network, under ONC's TEFCA framework, US, live since Dec 2023) gives us:

- **One integration** → query/retrieve documents from ~90% of US providers via a participating QHIN
- **Treatment, Individual Access, Healthcare Operations** exchange purposes covered under TEFCA's common agreement
- **Compliance umbrella** — TEFCA-compliant request handling, audit logging, identity matching

Two QHIN intermediaries we can layer on without becoming a QHIN ourselves:

| Provider | Strengths | Pricing (indicative) |
|---|---|---|
| **Particle Health** | Cleanest API, strong dev experience, fast onboarding, native FHIR R4 | ~$1.50–$3 per patient retrieval; volume discounts; setup $0–$10k |
| **Health Gorilla** | Designated QHIN itself, also covers labs (Quest/LabCorp), broader network | Custom enterprise pricing; longer sales cycle |
| Zus Health, Metriport | Smaller, lower price | Less mature, narrower network |

**Recommendation:** Start with Particle Health for the integration. Add Health Gorilla later if we need lab order routing or QHIN-direct status.

## 2. What the user gets

### Patient side
- During onboarding (and from Settings → "Import your records"), patient consents and Particle pulls their longitudinal record from any participating provider in the network.
- Vitals, medications, conditions, allergies, immunizations, encounters → mapped into our existing tables with `source = 'qhin_import'` and a `source_reference` pointing to the originating organization.
- New documents appear in the Health Vault with provenance ("Imported from Memorial Hospital via Particle, May 2026").
- "Refresh" button re-runs the query (rate-limited to 1×/day).

### Clinician side
- On the Patient Detail view, a new "Network records" tab shows everything Particle returned for that patient.
- Records can be promoted into the patient's primary timeline with one click (creates a duplicate-detection check first).
- Clinician sees provenance + a TEFCA disclosure footer.

## 3. Architecture

```text
Patient/Clinician UI
        │
        ▼
Edge Function:  qhin-search-patient      (demographic match → returns candidate patients)
Edge Function:  qhin-fetch-records       (pulls CCDA bundle for chosen match)
Edge Function:  qhin-normalize           (CCDA/FHIR → OneCare schema, dedup, store)
        │
        ▼
Postgres tables:
  qhin_imports             — request log (patient_id, requested_at, status, particle_request_id)
  qhin_source_organizations — cache of network providers seen
  qhin_record_provenance   — joins a OneCare row to its QHIN source (already-partial in `source`)
```

Auth: Particle uses OAuth2 client credentials at the QHIN level (our app is the client). Patient identity match uses demographics; we never expose patient-level credentials to Particle.

## 4. Secrets required (defer until ready to build)

- `PARTICLE_CLIENT_ID`
- `PARTICLE_CLIENT_SECRET`
- `PARTICLE_BASE_URL` (sandbox vs prod)

These will be added via `add_secret` only when the user signs the Particle BAA.

## 5. Database changes (sketch)

```sql
CREATE TABLE public.qhin_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,           -- patient who consented
  requested_by uuid NOT NULL,       -- patient or clinician who clicked Import
  particle_query_id text,
  status text NOT NULL,             -- pending|matched|fetching|complete|failed
  match_count int,
  record_count int,
  error text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.qhin_record_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES qhin_imports(id) ON DELETE CASCADE,
  target_table text NOT NULL,      -- 'vitals' | 'medications' | 'health_documents' | ...
  target_id uuid NOT NULL,
  source_organization text,
  source_document_id text,
  fhir_resource_type text,
  ingested_at timestamptz DEFAULT now()
);
```

Both tables get RLS: patients see only their own; clinicians see provenance only for patients they have access to (reuse `clinician_has_patient_access`).

## 6. Consent & compliance

- Patient must check an **explicit TEFCA disclosure** before the first import — separate from existing AI/Vault consent.
- Stored in `profiles.qhin_consent_at` + `qhin_disclosure_version`.
- Audit log entry on every import (we already have `useHipaaAuditLog`).
- BAA: Particle provides; we sign before sandbox-to-prod.

## 7. Rollout phases

| Phase | Scope | Duration |
|---|---|---|
| **0. Legal/onboarding** | Sign Particle BAA, get sandbox creds, designate compliance contact | 2–4 weeks (parallel) |
| **1. Backend MVP** | Tables, RLS, the 3 edge functions, normalize CCDA→schema for vitals + meds + conditions | 1 sprint |
| **2. Patient UI** | Settings → "Import your records" with consent dialog, progress, history of imports | 1 sprint |
| **3. Clinician UI** | "Network records" tab, promote-to-timeline, dedup UX | 1 sprint |
| **4. Documents + labs** | CCDA documents into Health Vault, structured lab values into vitals | 0.5 sprint |
| **5. Polish + monitoring** | Error retry, refresh throttle, edge-function logs dashboard | 0.5 sprint |

## 8. Open questions

1. Do we charge patients for QHIN imports (Particle is per-retrieval cost) or absorb on Premium?
2. Do we limit clinician-initiated imports to Pro/Enterprise tiers?
3. How do we surface conflicts (same medication appears from two source orgs with different doses)?
4. Health Gorilla vs Particle long-term — re-evaluate after 6 months of Particle data.

## 9. Non-goals for v1

- Writing data back to EHRs (no FHIR `POST`)
- Native lab orders
- Surescripts e-prescribing (separate workstream)
- Non-US networks (UK NHS, EHDS) — track but defer

## 10. Success metrics

- Time-to-first-import < 5 minutes from consent
- ≥ 60% of patients who consent successfully receive ≥ 1 record
- ≥ 1 imported document promoted into clinician timeline per active patient per month
- Zero TEFCA disclosure complaints
