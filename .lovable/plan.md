# Bulk Patient Onboarding & Data Ownership Framework

## The Core Problem

Currently, OneCare requires each patient to: (1) have an email, (2) create an account, (3) accept a clinician's invitation, and (4) create a provider share. A clinician with 5,000 patients on paper or Excel cannot onboard anyone without each patient individually signing up. This is a complete blocker for clinician-driven mass adoption.

---

## Part 1: Bulk Patient Import System

### New Database Infrastructure

**Table: `clinician_patient_records**` (clinician-owned patient data)

```
id, clinician_user_id, practice_id,
-- Patient identity (clinician's records)
patient_name, patient_email, patient_phone, date_of_birth, gender,
-- Clinical data the clinician brought in
allergies (JSONB), health_conditions (JSONB), blood_type,
medications (JSONB), vitals_history (JSONB), notes,
-- Linking
linked_user_id (nullable - NULL until patient joins OneCare),
provider_share_id (nullable),
invitation_status ('not_invited' | 'invited' | 'accepted' | 'declined'),
data_sharing_model ('clinician_managed' | 'patient_managed' | 'collaborative' | 'view_only'),
-- Consent
clinician_data_consent_given_at, patient_data_consent_given_at,
import_source ('manual' | 'csv' | 'excel' | 'ehr'),
created_at, updated_at
```

**Table: `data_sharing_agreements**` (formal record of what model applies)

```
id, clinician_user_id, patient_user_id, clinician_record_id,
sharing_model ('clinician_managed' | 'patient_managed' | 'collaborative' | 'view_only'),
agreed_at, agreed_by ('clinician' | 'patient' | 'both'),
terms_version, is_active, revoked_at, revoked_by,
permissions (JSONB: {vitals_read, vitals_write, meds_read, meds_write, profile_read, profile_write, notes_read}),
created_at
```

### Frontend: Bulk Import UI

New page: `/clinician/patients/import` accessible from ClinicianPatients page.

**Step 1: Upload**

- Accept CSV/Excel file or manual entry form
- Template download with expected columns: Name, Email (optional), Phone (optional), DOB, Gender, Allergies, Conditions, Current Medications, Recent Vitals
- Parse and preview data in a table with validation indicators

**Step 2: Review & Clean**

- Show parsed rows with error highlighting (missing required fields, invalid formats)
- Allow inline editing of individual cells
- Duplicate detection against existing `clinician_patient_records`

**Step 3: Choose Data Model**

- Select default sharing model for this batch (can be changed per-patient later)
- Show clear explanation of each model (see Part 2)

**Step 4: Import**

- Edge function `import-patient-records` processes batches of 100
- Uses service_role to insert into `clinician_patient_records`
- Returns success/failure counts
- Auto-sends invitations if email addresses are provided and clinician opts in

**Step 5: Management**

- Clinician can mass manage patient list and perform CRUD functions
- Clinician can search and filter patients according to background, and other metrics like maybe prescription given
- Clinician can add tags per patient for organisation and ease of filter - see feasibility of this.

### Edge Function: `import-patient-records`

- Validates data server-side
- Inserts into `clinician_patient_records` (NOT into `profiles` - patients don't exist yet)
- Optionally creates `patient_invitations` for rows with email addresses
- Logs action in `access_audit_logs`

---

## Part 2: Four Data Sharing Models

This is the critical design decision. Four models cover all scenarios:

### Model 1: Clinician-Managed

**When**: Patient has no tech access, never joins OneCare. Clinician manages everything.

- Clinician owns all data in `clinician_patient_records`
- No `profiles` row exists for the patient
- Clinician can record vitals, medications, notes on their behalf
- Data lives entirely in clinician's domain
- If patient later joins, transitions to Collaborative (Model 3)

**Who benefits**: Clinicians with paper-based patients in rural Nigeria, elderly patients, patients who refuse tech.

### Model 2: Patient-Managed (Current Default)

**When**: Patient signs up independently, shares data with clinician.

- Patient owns all data in `profiles`, `vitals`, `medications`
- Clinician gets read access via `provider_shares` with permission toggles and may 'copy' the info to their side and retain it once patient agrees. 
- Patient can revoke at any time, but already 'copied' [we could use a different term for this] will remain for legal reasons, but not any info the patient uploads after revocation.
- Clinician retains their own notes (hybrid model already documented)

**Who benefits**: Tech-savvy patients, privacy-conscious users, the current user base.

### Model 3: Collaborative

**When**: Clinician imported patient data, patient later joined and accepted.

- Both parties can read and write to shared data sets
- Patient's `profiles` data is authoritative for personal info
- Clinician's imported vitals/meds get merged into patient's record with `source: 'clinician_import'`
- Either party can add new vitals/medications
- Conflict resolution: patient's self-reported data tagged differently from clinician-entered data; clinician can also retain confirmed reported patient data (for legal reasons  and liability, records are important)
- Revocation: patient can downgrade to Model 2 (read-only for clinician) or fully revoke but the clinician can retain the information already shared (for legal and liability reasons) especially when a consultation or prescription was based on that information.

**Who benefits**: Active doctor-patient relationships, chronic disease management.

### Model 4: View-Only

**When**: Specialist or pharmacist needs to see data but not modify it.

- Clinician/provider gets read-only access to patient data
- Cannot add vitals, medications, or guidance
- Time-limited by default (30 days, renewable)
- Useful for second opinions, pharmacy verification, insurance review

**Who benefits**: Specialists, pharmacists, insurance reviewers, clinical trial monitors.

### How the Models Connect to Existing Infrastructure

```text
Current System:                    New System:
                                   
provider_shares ─── permissions    clinician_patient_records (Model 1)
    │                                  │
    └── {vitals, meds,                 ├── linked_user_id ─── profiles (when patient joins)
         adherence, profile}           │
                                       └── data_sharing_agreements
                                           └── sharing_model + permissions
```

The existing `provider_shares` table continues to work for Model 2. Models 1, 3, and 4 use `clinician_patient_records` + `data_sharing_agreements` as the new layer.

---

## Part 3: Patient Activation Flow (Clinician-Imported Patient Joins)

When a clinician has imported a patient (Model 1) and wants them to start using OneCare:

1. **Clinician clicks "Invite to OneCare"** on the patient record
2. System sends invitation email/SMS with a unique link
3. **Patient receives link**, creates account (or logs in)
4. **Matching logic**: System matches by email OR phone OR name+DOB combination
5. **Patient sees a consent screen**:
  - "Dr. [Name] has been managing your health records. They have the following data about you: [summary]"
  - "Choose how you'd like to proceed:"
    - **Accept & Collaborate**: Merge clinician's data into your profile, both can update (Model 3)
    - **Accept & Take Ownership**: Import clinician's data but switch to patient-managed (Model 2)
    - **View Only**: Let clinician see your data but they can't modify (Model 4)
    - **Decline**: Don't connect with this clinician (no data shared)
6. If accepted, `clinician_patient_records.linked_user_id` is set, `data_sharing_agreements` is created, and imported data (vitals, meds) gets copied into the patient's actual tables with `source: 'clinician_import'`

### What Happens If Patient Declines?

- Clinician retains their own records in `clinician_patient_records` (they brought this data in, it's theirs for professional record-keeping)
- No `provider_share` is created
- Patient's OneCare account has no connection to that clinician
- Clinician sees status as "Declined" but keeps their clinical notes

---

## Part 4: Multi-Perspective Analysis

### Patient Perspective

- **Concern**: "A doctor uploaded my data without my consent"
- **Mitigation**: Clinician-imported data is clearly labeled. Patient always has final say on whether to connect. Patient can see what data clinician has and choose to accept/reject/modify the relationship. GDPR/POPIA right to be forgotten applies to patient-owned data.
- **Benefit**: If patient accepts, their history is already there. No manual re-entry.

### Clinician Perspective

- **Concern**: "I imported 5,000 patients and now one revokes access. Do I lose my notes?"
- **Mitigation**: Hybrid ownership model. Clinician's notes, guidance, and their original imported data remain in `clinician_patient_records`. Only the live data feed (new vitals/meds from patient) stops.
- **Benefit**: Instant patient panel. Can manage patients who never use tech. Can transition paper patients to digital gradually.

### Founder/Creator Perspective

- **Concern**: Bulk import creates thousands of "ghost" accounts that inflate metrics
- **Mitigation**: `clinician_patient_records` are NOT user accounts. They don't count toward "registered patients." Only activated patients count. Clear distinction in analytics.
- **Benefit**: Each clinician with 5,000 patients is a potential 5,000-user pipeline. Even 10% activation = 500 real users per clinician onboarded.

### Investor (Angel/VC) Perspective

- **Concern**: "Are those real users or inflated numbers?"
- **Mitigation**: Report two metrics separately: "Clinician-Managed Records" (pipeline) vs "Active Patient Users" (real). Investors appreciate honesty and the conversion funnel story.
- **Benefit**: The bulk import model shows a scalable acquisition channel. One enterprise deal = thousands of potential users. CAC drops dramatically.
- **Why "be careful who you take money from" matters here**: An aggressive growth investor might push to count clinician-imported records as "users" to inflate valuation. A mission-aligned investor understands the pipeline distinction.

### Regulator Perspective (GDPR/POPIA/HIPAA)

- **Concern**: Clinician uploading patient data to a third-party platform
- **Mitigation**: 
  - Clinician has existing legal basis (legitimate interest / treatment relationship) to maintain patient records
  - OneCare acts as a data processor for the clinician (covered by Data Processing Agreement already in place)
  - Patient data in `clinician_patient_records` is not publicly accessible; only the uploading clinician can see it
  - When patient joins, explicit consent is obtained before any data merging
  - Audit trail via `data_sharing_agreements` and `access_audit_logs`
- **HIPAA**: BAA covers this for US clinicians. The clinician is the covered entity; OneCare is the business associate.

### Competitor Perspective

- **Concern**: "OneCare lets doctors bulk-upload patient data"
- **Reality**: This is standard practice. Epic, Cerner, and every EHR allows data import. The difference is OneCare then gives patients control.
- **Advantage**: Competitors (MyChart, Veradigm) are institution-owned. OneCare is patient-owned. The bulk import is just an onramp.

### Independent Observer / Ethics Perspective

- **Concern**: Power imbalance. Clinician uploads data, patient feels pressured to accept.
- **Mitigation**: 
  - Patient can decline with zero consequences
  - No features are gated behind accepting a clinician connection
  - Consent screen clearly states "You are not required to connect"
  - Patient can revoke at any time after accepting
  - Data sharing agreement is logged with timestamps for accountability

---

## Part 5: Implementation Plan

### Step 1: Database migration

- Create `clinician_patient_records` table with RLS (clinician can only see their own records)
- Create `data_sharing_agreements` table with RLS
- Add appropriate indexes

### Step 2: Edge function `import-patient-records`

- Accepts CSV-parsed array of patient records
- Validates, deduplicates, inserts into `clinician_patient_records`
- Optionally triggers invitations

### Step 3: Bulk Import UI

- New page `/clinician/patients/import` with CSV upload, preview table, data model selector
- Link from ClinicianPatients page header

### Step 4: Patient activation consent screen

- New component shown when a patient signs up/logs in and has pending clinician-imported records matched to their email
- Shows data summary, model choices, accept/decline

### Step 5: Update clinician patient list

- Show both `provider_shares` patients (current) AND `clinician_patient_records` (imported but not yet on platform)
- Visual distinction between "Active on OneCare" vs "Clinician-Managed Record"

### Step 6: Update docs

- Add data ownership framework to `docs/comprehensive-platform-review.md`
- Update `docs/future-roadmap.md` with bulk import as implemented feature