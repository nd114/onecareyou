# AI Implementation Roadmap — OneCare Platform

> Last updated: 2026-03-30

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Pre-Launch (Now)](#phase-1-pre-launch-now)
3. [Phase 2: Post-Launch](#phase-2-post-launch)
4. [Phase 3: Future](#phase-3-future)
5. [AI Consent Framework](#ai-consent-framework)
6. [Technical Architecture](#technical-architecture)
7. [Concerns, Limitations & Mitigations](#concerns-limitations--mitigations)
8. [Other A/B Considerations for Implementation](#other-ab-considerations-for-implementation)

---

## Overview

The OneCare platform will integrate AI capabilities to enhance both patient and clinician experiences. All AI features must:

- **Never provide medical advice** — only general health education, navigation help, and administrative assistance
- **Require explicit consent** — via the existing `AIConsentDialog` and `consent_logs` table
- **Be auditable** — all AI interactions should be logged for compliance
- **Use Lovable AI Gateway** — via backend edge functions, never direct client calls

**Default model**: `google/gemini-3-flash-preview` (balanced speed + capability)
**Complex reasoning**: `google/gemini-2.5-pro` or `openai/gpt-5`

---

## Phase 1: Pre-Launch (Now) ✅ IMPLEMENTED

### 1.1 Patient AI Q&A Assistant (Text-Based)

**Purpose**: Allow patients to ask general health education questions and get help navigating the platform.

**Implementation**:
- Edge function: `patient-ai-chat`
- System prompt restricts responses to:
  - General health education (e.g., "What is HbA1c?")
  - Platform navigation (e.g., "How do I add a vital?")
  - Links to relevant platform pages
- Explicitly refuses: diagnosis, treatment recommendations, medication advice
- Every response includes a disclaimer footer

**UI**: Floating "Ask AI" button on patient dashboard → opens chat drawer/sheet

**System Prompt Guidelines**:
```
You are OneCare Assistant, a helpful guide for the OneCare health platform.

RULES:
1. You are NOT a doctor. NEVER diagnose, prescribe, or recommend treatments.
2. For medical questions, always say: "Please consult your healthcare provider for personalized medical advice."
3. You CAN explain general health concepts (e.g., "What is blood pressure?")
4. You CAN help users navigate the platform (e.g., "To add a vital, go to Health Metrics > Record")
5. You CAN provide links to the Knowledge Base when relevant
6. Always be empathetic, clear, and concise
7. If unsure, say so honestly

DISCLAIMER (append to every response):
"This is general information only and not medical advice. Always consult your healthcare provider."
```

**Ease**: Medium | **Priority**: High | **Dependencies**: Lovable AI Gateway (ready)

---

### 1.2 Voice-Guided Platform Navigation (All Users)

**Purpose**: Users speak a question and the AI interprets intent and routes them to the correct page.

**Implementation**:
- Browser Web Speech API for voice capture (no API key needed)
- Transcribed text sent to same `patient-ai-chat` edge function
- AI returns structured response with optional `route` field for navigation
- Falls back to text input for unsupported browsers

**Platform Route Map** (for AI context):
| Intent | Route |
|--------|-------|
| "Add medication" | `/medications` → AddMedication dialog |
| "Check my vitals" | `/vitals` |
| "View my schedule" | `/schedule` |
| "Share with doctor" | `/care-circle` |
| "Change settings" | `/settings` |
| "View pricing" | `/pricing` |
| "Help" | `/help` |

**Ease**: Low-Medium | **Priority**: Medium

---

### 1.3 Extended AI Consent Dialog

**Purpose**: Update the existing `AIConsentDialog` to cover new AI features.

**Current State**: `AIConsentDialog` component exists with checkbox acknowledgment. `useAIConsent` hook manages state. `consent_logs` table tracks all changes.

**Enhancements**:
- Add granular consent options:
  - ☑ AI Q&A Assistant (text-based health education)
  - ☑ Voice Input (speech-to-text for data entry)
  - ☑ Voice Recording & Transcription (clinician meetings — Phase 3)
- Each consent type logged separately in `consent_logs`
- Revocable at any time from Settings

**Ease**: Low | **Priority**: High

---

## Phase 2: Post-Launch

### 2.1 Voice Input for Vitals (Patient + Clinician)

**Purpose**: Users speak vitals readings and the system auto-parses and pre-fills forms.

**Implementation**:
- Microphone button in `AddVitalDialog`
- Web Speech API captures speech → sends to edge function
- Edge function uses AI tool-calling to extract structured data:
  ```json
  {
    "vital_type": "blood_pressure",
    "value": 120,
    "secondary_value": 80,
    "notes": "taken after exercise"
  }
  ```
- Pre-fills form, user confirms before saving

**Speech Patterns to Handle**:
| Spoken | Parsed |
|--------|--------|
| "Blood pressure 120 over 80" | BP: 120/80 |
| "Heart rate 72 beats per minute" | HR: 72 |
| "Weight 185 pounds" | Weight: 185 lbs |
| "Sugar level 95" | Glucose: 95 |
| "Temperature 98.6" | Temp: 98.6°F |

**Concerns**:
- Browser Speech API accuracy varies by device/browser
- Medical terminology may be misrecognized
- Must always require user confirmation before saving

**Fallback**: Manual text input always available

**Ease**: Medium-High | **Priority**: Medium

---

### 2.2 AI-Assisted Note Extraction (Clinician)

**Purpose**: Clinician pastes meeting notes or types free-form text → AI extracts action items.

**Implementation**:
- Text area in clinician dashboard for pasting notes
- Edge function analyzes text and extracts:
  - Medications to prescribe/adjust
  - Vitals to monitor
  - Follow-up actions
  - Guidance to send to patient
- Returns structured suggestions, clinician reviews and confirms

**This is the safer alternative to meeting transcription** — avoids HIPAA audio recording concerns entirely.

**Ease**: Medium | **Priority**: Medium

---

### 2.3 Clinician Voice-Driven Vitals Entry with Patient ID

**Purpose**: Clinician speaks naturally: "For John James, born August 7 1986, heart rate 86, blood pressure 104 over 65, potassium 28..."

**Implementation**:
1. Voice captured via Web Speech API or ElevenLabs STT
2. Transcribed text sent to edge function
3. AI uses tool-calling to extract:
   ```json
   {
     "patient_name": "John James",
     "patient_dob": "1986-08-07",
     "vitals": [
       { "type": "heart_rate", "value": 86 },
       { "type": "blood_pressure", "value": 104, "secondary_value": 65 },
       { "type": "potassium", "value": 28 }
     ]
   }
   ```
4. System matches patient against clinician's patient list by name + DOB
5. Displays confirmation UI: "Found: John James (DOB: Aug 7, 1986). Enter these vitals?"
6. Clinician reviews, edits if needed, confirms

**Safety Requirements**:
- **Never auto-save** — always require explicit confirmation
- **DOB required** for patient matching (name alone unreliable)
- **Fuzzy matching** with confidence score — if < 90% match, show multiple candidates
- **Audit log** every voice-driven entry

**Concerns**:
- Speech recognition accuracy for numbers and medical terms
- Patient privacy — voice data must not be stored
- Multiple patients with similar names

**Ease**: High complexity | **Priority**: Low-Medium

---

## Phase 3: Future

### 3.1 Real-Time Meeting Transcription

**⚠️ HIGH RISK — Requires full HIPAA audit before implementation**

**Purpose**: Record and transcribe clinician-patient meetings in real-time.

**Implementation**: ElevenLabs STT (`scribe_v2_realtime`) via WebSocket + Lovable AI for summarization.

**HIPAA Requirements**:
- Explicit consent from BOTH parties (patient + clinician) before recording
- Audio encrypted at rest and in transit
- BAA with audio storage provider
- Retention policies (auto-delete after X days)
- Access controls (only the recording clinician can access)
- Right to delete (patient can request deletion)

**Recommendation**: Defer until legal review is complete. Start with text-based note extraction (Phase 2.2) as a safer alternative.

**Ease**: Very High | **Priority**: Low

---

### 3.2 AI Admin/Nurse Assistant

**Purpose**: AI tracks clinician verbal instructions, transcribes them, and stores audio.

**This is essentially building a clinical documentation system** — competing with established players like Nuance DAX, Abridge, and Health Bridge.

**Recommendation**: Not recommended for pre-launch or early post-launch. Consider partnerships with existing clinical documentation platforms instead of building from scratch.

**Ease**: Very High | **Priority**: Very Low

---

### 3.3 Patient Identification from Speech

**Purpose**: System automatically identifies patient from spoken name/DOB without manual selection.

**Depends on**: Phase 2.3 (voice-driven vitals) being stable and accurate.

**Ease**: High | **Priority**: Low

---

## AI Consent Framework

### Current Implementation
- `AIConsentDialog` component with required checkbox
- `useAIConsent` hook manages consent state in `profiles.ai_processing_consent`
- `consent_logs` table tracks all consent changes with timestamps, user agent, and action type

### Enhanced Consent Model (for new features)

```
consent_type: 'ai_processing' → General AI features (Q&A, navigation)
consent_type: 'ai_voice_input' → Voice-to-text for data entry
consent_type: 'ai_transcription' → Meeting recording & transcription (Phase 3)
consent_type: 'ai_audio_storage' → Storing audio recordings (Phase 3)
```

Each consent type independently revocable. UI shows clear descriptions of what data is collected and how it's used.

---

## Technical Architecture

### Edge Function Pattern

```
Client → supabase.functions.invoke('patient-ai-chat', { body: { messages } })
       → Edge Function validates auth + consent
       → Edge Function calls Lovable AI Gateway
       → Streams response back to client
```

### Security Requirements
- All AI calls go through edge functions (never direct from client)
- User must be authenticated
- AI consent must be granted before any AI feature is accessible
- No patient data sent to AI for Q&A (general knowledge only)
- For clinician features: patient data only sent with explicit consent and active share

### Rate Limiting
- Lovable AI has per-workspace rate limits
- Edge functions must handle 429 (rate limited) and 402 (payment required) errors
- Client must display user-friendly messages for rate limit scenarios

---

## Concerns, Limitations & Mitigations

### 1. Medical Liability
- **Concern**: AI provides health information that could be misinterpreted as medical advice
- **Mitigation**: Strong system prompt restrictions, mandatory disclaimers, clear UI labeling ("General Information Only")

### 2. HIPAA Compliance for Audio
- **Concern**: Recording patient conversations creates PHI that must be protected
- **Mitigation**: Defer audio features to Phase 3; use text-only in Phase 1-2; require legal review before Phase 3

### 3. Speech Recognition Accuracy
- **Concern**: Web Speech API varies in accuracy across browsers/devices
- **Mitigation**: Always require user confirmation; provide manual fallback; display confidence indicators

### 4. Data Privacy
- **Concern**: Sending patient data to AI models
- **Mitigation**: Phase 1 Q&A uses NO patient data (general knowledge only); Phase 2+ uses structured extraction with no data retention by AI provider

### 5. Browser Compatibility
- **Concern**: Web Speech API not supported in all browsers
- **Mitigation**: Feature detection with graceful fallback to text input; show "Voice input not supported in this browser" message

### 6. Cost Management
- **Concern**: AI API costs scale with usage
- **Mitigation**: Use `gemini-3-flash-preview` (cheapest capable model) for most features; rate limit per user; monitor usage via Lovable dashboard

---

## Other A/B Considerations for Implementation

### A. Smart Alert Presets (Pre-launch, non-AI)
- Pre-configured alert rule templates for common clinical thresholds (e.g., "Diabetic Monitoring" auto-creates glucose > 180, HbA1c > 7.0 rules)
- Low complexity, high value for clinician onboarding
- Could be presented as "AI-recommended" thresholds even though they're rule-based

### B. Natural Language Quick Actions
- User types "add metformin 500mg twice daily" → AI parses and pre-fills medication form
- Similar to voice input but text-based, lower complexity
- Good A/B test: compare form completion rates with vs. without NL input

### C. Vital Trend Insights (AI-generated)
- After accumulating 2+ weeks of data, AI generates plain-language trend summaries
- Example: "Your blood pressure has been trending upward over the past 2 weeks. Consider discussing with your provider."
- Must include strong disclaimer that this is observational, not diagnostic

### D. Medication Interaction Explainer
- When drug interactions are detected, AI provides plain-language explanation of why the interaction matters
- Source: existing interaction data + AI summarization
- Lower risk since it's explaining existing data, not generating new recommendations

### E. Clinician Dashboard Insights
- AI-generated daily briefing: "3 patients have vitals outside normal range today. 2 guidance items are overdue."
- Aggregated, non-diagnostic, purely administrative
- Good candidate for text-based AI with structured output

### F. Multilingual Support via AI
- Real-time translation of patient guidance and platform UI
- Particularly valuable for diverse patient populations
- Could use AI for dynamic translation of clinician-authored guidance

### G. Smart Scheduling Suggestions
- AI analyzes medication schedules and suggests optimal timing
- Example: "Consider taking your blood pressure medication in the morning for better adherence"
- Based on general pharmacological guidelines, not personalized medical advice

### H. Patient Onboarding Assistant
- Conversational AI guides new patients through setting up their profile, adding medications, and understanding the platform
- Reduces friction for non-tech-savvy users (especially elderly patients or caregivers)
- Natural extension of the Q&A assistant

### I. Clinician Referral Letter Generator
- AI drafts referral letters based on patient vitals, medications, and clinician notes
- Clinician reviews, edits, and signs before sending
- Saves significant admin time for clinicians

### J. Anomaly Detection (ML-based)
- Background analysis of vital trends to flag unusual patterns
- Not real-time alerts (those are rule-based) but periodic analysis
- Example: "Patient's glucose variability has increased 40% this month compared to baseline"
- Requires significant data history to be meaningful

---

## Implementation Priority Matrix

| Feature | Complexity | Value | Risk | Phase |
|---------|-----------|-------|------|-------|
| AI Q&A Assistant | Medium | High | Low | 1 |
| Voice Navigation | Low-Med | Medium | Low | 1 |
| Extended Consent | Low | High | Low | 1 |
| Voice Vitals Input | Med-High | High | Medium | 2 |
| Note Extraction | Medium | High | Low | 2 |
| Clinician Voice Entry | High | High | Medium | 2 |
| Smart Alert Presets | Low | High | Low | 1-2 |
| NL Quick Actions | Medium | Medium | Low | 2 |
| Vital Trend Insights | Medium | Medium | Medium | 2-3 |
| Meeting Transcription | Very High | High | Very High | 3 |
| Admin Assistant | Very High | Medium | Very High | 3+ |
| Multilingual Support | Medium | High | Low | 2-3 |

---

*This document is a living roadmap. Features should be re-evaluated after each phase launch based on user feedback, usage metrics, and regulatory developments.*
