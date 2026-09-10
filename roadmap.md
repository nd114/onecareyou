# Roadmap

## In progress
- Role-by-role walkthrough: owner, admin, provider, nurse, front desk.
- Heidi-style scribe: live transcription + note styles with per-section apply.
- Design refresh: pick a direction, then apply across clinician then patient app.

## Next
- EHR phase 1: hospital-owned connections (`ehr_connections.practice_id`) and a confirmed patient-link review queue replacing free-form `patient_id_mapping`. Reading in and sending readings out already work; write-back into hospital systems stays out of scope.
- Patient assistant: aim a dictated reading at a family member (twins case) — tools and snapshot are still primary-account only.

## Deferred
- Personal vs hospital workspace switching in a single account (removed for now; use a separate account for independent practice).
- Server-side paging for sharing history.
- Department-scoped compliance exports.
