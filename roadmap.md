# Roadmap

## In progress
- Role-by-role walkthrough: owner, admin, provider, nurse, front desk.
- Heidi-style scribe: live transcription + note styles with per-section apply.
- Design refresh: pick a direction, then apply across clinician then patient app.

## Next
- EHR phase 1: hospital-owned connections (`ehr_connections.practice_id`) and a confirmed patient-link review queue replacing free-form `patient_id_mapping`. Reading in and sending readings out already work; write-back into hospital systems stays out of scope.
- Patient assistant: aim a dictated reading at a family member (twins case) — tools and snapshot are still primary-account only.
- OnePharm prescription gateway (OneCare side only — the switch itself is a separate product, see `docs/plans/onepharm-specification.md`):
  - "Sign & send digital script" on the clinician chart and encounter, issuing through one adapter module so the switch can be swapped or self-hosted per country.
  - "Active prescriptions" card in the patient vault and visit summary showing the QR code and live status (not collected / collected at [pharmacy] / part collected).
  - Inbound dispense webhook that records collection as verified provenance (`source: onepharm_dispensed`) and updates medication status and adherence automatically.
  - Fallback when the switch is unreachable: keep today's medication summary, labelled "Clinical record copy — not a pharmacy prescription".

## Deferred
- Personal vs hospital workspace switching in a single account (removed for now; use a separate account for independent practice).
- Server-side paging for sharing history.
- Department-scoped compliance exports.

## Separate products
- **OnePharm** — neutral digital prescription switch: signed QR scripts, one-claim-only verification to stop double dispensing, zero-install pharmacy scanning page, till-software integrations, USSD/SMS fallback for grid outages. Full blueprint in `docs/plans/onepharm-specification.md`. OneCare is its first customer, not its owner.

