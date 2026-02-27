# Comprehensive Platform Review & AI Roadmap Plan

## Part 1: Bug Fixes (Critical)

### Bug 1: Clinician sees "Unknown Patient" names

**Root Cause**: The `profiles` table RLS policy only allows clinicians to view patient profiles if `profile` permission is `true` in `provider_shares.permissions`. Most shares default to `profile: false`. When `useClinicianPatients.ts` queries `profiles` at line 73, RLS blocks the result, causing fallback to "Unknown Patient".

**Fix**: Add a new RLS SELECT policy on `profiles` that allows clinicians to view basic patient info (name, email) if they have ANY active provider share with that patient — not just the `profile` permission:

```sql
CREATE POLICY "Clinicians can view basic patient info from shares"
ON profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM provider_shares ps
    WHERE ps.user_id = profiles.user_id
      AND ps.is_active = true
      AND (ps.expires_at IS NULL OR ps.expires_at > now())
      AND (
        ps.clinician_user_id = auth.uid()
        OR ps.provider_email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
  )
);
```

### Bug 2: Vital values with excessive decimal places (e.g., 143.965666756902)

**Root Cause**: The demo data seeder used `random()` to generate values without rounding, producing values like `26.2935170799518`. The display code in `VitalStatsCard.tsx` line 62 returns `converted.value` without rounding. The `VitalTrendChart.tsx` tooltip also displays raw values.

**Fix** (two-pronged):

1. **Database cleanup**: Run a migration to round all existing vitals values to 1 decimal place
2. **Display fix**: Add rounding in `VitalStatsCard.tsx` formatValue/formatAverage, and in `VitalTrendChart.tsx` chartData mapping

Files to modify:

- `src/components/vitals/VitalStatsCard.tsx` — round `formatValue()` and `formatAverage()` to 1 decimal
- `src/components/vitals/VitalTrendChart.tsx` — round chart values to 1 decimal
- `src/components/vitals/VitalHistoryLog.tsx` — verify rounding on history display
- Database migration to round existing data

### Bug 3: Clinician guidance/action errors

**Root Cause**: The `CreateGuidanceDialog` passes `share_id: selectedPatient?.id` — this is the `provider_shares.id`. The RLS INSERT policy on `clinician_guidance` requires `clinician_has_patient_access(patient_user_id)` which checks if the clinician has an active share. If the share's `clinician_user_id` is null (unclaimed), or if the clinician is matched by email but hasn't been claimed, this function returns false. The first provider share row (James Thompson, id `32830924...`) has `clinician_user_id: null` and no `provider_email` — this share is orphaned.

**Fix**:

1. Clean up the orphaned provider share (no clinician_user_id AND no provider_email)
2. Ensure `autoClaimShares` invalidates the correct query key (currently invalidates `clinician-patients` but the query uses `clinician-patients-v2`)

File to fix:

- `src/hooks/useClinicianPatients.ts` — fix query key mismatch at lines 109 and 145 (should be `clinician-patients-v2`)

### Bug 4: Empty analytics for certain metrics

**Root Cause**: The analytics view only shows the top 4 vital cards (blood_pressure, glucose, weight, heart_rate) in quick stats. Lab metrics (potassium, sodium, etc.) only appear in the tabbed "Lab Results Analytics" section. If the default `getVitalHistory` uses 30 days but demo data is older than 30 days, charts show empty. Need to verify the demo data timestamps.

**Fix**: The `getVitalHistory` default is 30 days. Lab data seeded in Dec 2025 is now ~2 months old. The analytics tab uses `getVitalHistory(type, 90)` for labs which should capture it. The overview page uses `getVitalStats(type)` which defaults to 30 days — this explains empty stats for older lab data. Update default days for lab metrics or show a "No recent data" message with the last known reading.

---

## Part 2: Query Key Consistency Fix

- `autoClaimShares.onSuccess` invalidates `['clinician-patients']` but the main query uses `['clinician-patients-v2']`. This means after claiming shares, the patient list doesn't refresh.
- Same issue in `updatePatientNotes.onSuccess`.

---

## Part 3: AI Features — Analysis & Roadmap

### For Patients

**1. AI Q&A Assistant (ask questions, get guidance/links)**

- Ease: Medium. Use Lovable AI gateway with a backend function.
- Implementation: Edge function `patient-ai-chat` that takes user question, uses system prompt restricting to navigation help and general health education (not medical advice), returns answer with links to relevant platform pages.
- Concern: Must include strong disclaimers that this is NOT medical advice. System prompt must explicitly refuse diagnosis/treatment recommendations.
- Limitation: Cannot access real patient data for privacy; answers are general only.

**2. Voice input for vitals and personal info**

- Ease: Medium-High. Use Web Speech API (browser-native, no API key needed) or ElevenLabs STT.
- Implementation: Add a microphone button to AddVitalDialog that captures speech, sends to AI for structured extraction (type + value parsing), pre-fills the form.
- Concern: Browser speech recognition accuracy varies. Need fallback for unsupported browsers.

### For Clinicians

**3. Meeting transcript/summary**

- Ease: High complexity. Requires audio recording, transcription, summarization.
- Implementation: Use ElevenLabs STT for real-time transcription + Lovable AI for summarization.
- **Major concern**: HIPAA compliance. Recording patient conversations requires explicit consent from both parties. Audio storage must be encrypted. This feature has significant legal liability.
- Recommendation per existing memory: This was explicitly rejected in the AI roadmap due to HIPAA concerns and competitive overlap. Consider a lighter approach: clinician manually pastes notes, AI extracts action items.

**4. Voice-driven vitals entry with patient identification**

- Ease: High complexity. Requires speech-to-text, NLU for entity extraction (patient name, vitals), patient matching, form population.
- Implementation: Edge function that receives transcribed text, uses AI tool-calling to extract structured data (patient name, DOB, vital type/values), matches against clinician's patient list, returns structured data for confirmation UI.
- Concern: Patient identification by name alone is unreliable (duplicates). DOB adds safety. Must always require clinician confirmation before saving.
- Limitation: Accuracy of speech recognition for medical values (e.g., "104 over 65" must be parsed as BP 104/65).

**5. AI as nurse/admin assistant (tracking, transcription, audio storage)**

- Ease: Very high complexity. This is essentially building a clinical documentation system.
- Concern: Audio storage of patient conversations is a regulatory minefield. HIPAA requires BAA with any audio storage provider, encryption at rest, access controls, retention policies.
- Recommendation: Phase this into post-launch. Start with text-based note-taking with AI summarization only.

### For All Users

**6. Voice-guided platform navigation**

- Ease: Low-Medium. Use browser Speech API for input, AI to interpret intent, route to correct page.
- Implementation: Floating "Ask AI" button that opens a chat/voice dialog. AI maps natural language to platform routes and features.

**7. AI consent form**

- Already implemented: `AIConsentDialog` component exists with checkbox acknowledgment. The `useAIConsent` hook manages consent state. `consent_logs` table tracks all changes.
- Enhancement needed: Extend consent dialog to cover new AI features (voice recording, transcription).

### Recommended Phasing

**Phase 1 (Pre-launch / Now)**:

- Patient AI Q&A chat (text-based, no medical advice)
- Voice-guided navigation for all users
- Extend existing AI consent dialog for new features

**Phase 2 (Post-launch)**:

- Voice input for vitals (patient + clinician)
- AI-assisted note extraction from pasted text

**Phase 3 (Future)**:

- Real-time meeting transcription (with full HIPAA audit)
- Audio storage with encryption
- Patient identification from speech

---

## Part 4: Implementation Steps

### Step 1: Database fixes

- Migration to round existing vitals values to 1 decimal
- New RLS policy on `profiles` for clinician basic access
- Clean up orphaned provider share

### Step 2: Frontend display fixes

- Round vital values in VitalStatsCard, VitalTrendChart, VitalHistoryLog
- Fix query key mismatch in useClinicianPatients
- Extend default time window for lab analytics display

### Step 3: AI foundation (not approved - include this as well as notes on "Part 3: AI Features - Analysis & Roadmap" in a .md that will document the AI implementation specifically and in much detail. Also include some areas that you think could be also included as well under a "Other A/B Consids Imp." section)

- Create `patient-ai-chat` edge function with Lovable AI
- Add chat UI component accessible from patient dashboard
- Update AI consent dialog to cover new features
- Add voice input button using Web Speech API to vitals entry