## Tester Pack Document

### What I'll Create

A comprehensive `docs/beta-tester-pack.md` file containing:

**Section 1: Welcome & Context** — What OneCare is, what stage we're at, what we're asking of them, and the 5 goals (bug discovery, design/UX feedback, nomenclature validation, trust/credibility assessment, regional/market fit).

**Section 2: Role-Specific Test Scenarios** — Stacked sequentially:

1. **Patient Testers** — Sign up, onboarding, add medications, set schedule, log vitals, upload to Health Vault, share with clinician, manage Care Circle, explore Knowledge Base, First impressions, trust signals, pricing page clarity and sensitivity, landing page effectiveness, regional relevance <---put in an appropriate order.
2. **Clinician Testers** (Doctors, Nurses, Pharmacists) — Clinician sign-up, dashboard, receive patient shares, review vitals/meds/documents, send guidance, set alert thresholds, First impressions, trust signals, pricing page clarity and sensitivity, landing page effectiveness, regional relevance <---put in an appropriate order.
3. **Specialist Reviewers** (Radiologists, Pharmacists) — Medication interaction checker, drug info pages, document upload/AI summary accuracy, nomenclature review, clinician/patient relationship, and clinician/patient pricing
4. **QA/Technical Testers** — Edge cases, browser/device matrix, accessibility, error handling, offline behavior, performance

Each role section includes: context brief, step-by-step scenarios, and what to look for.

**Section 3: Google Forms Feedback Questions** — Structured sections covering task completion, bugs, design, nomenclature, trust, and open-ended feedback. Ready to copy into Google Forms.

### On the Account Question

**Recommendation: Hybrid approach.** Have each tester sign up fresh with their own email (this tests the real onboarding flow and gives you organic first-impression data). Then provide a shared pre-populated demo account (e.g., `demo-patient@onecare.you` / `demo-clinician@onecare.you`) with sample medications, vitals history, documents, and care circle connections so they can also explore the full depth of the platform without spending 30 minutes populating data. This gives you both perspectives without compromise.

### Implementation

- Create `docs/beta-tester-pack.md` with all sections above