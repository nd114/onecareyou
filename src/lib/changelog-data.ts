// OneCare internal changelog.
// Surfaced at /admin/changelog (not linked from public nav).
// Newest entries first. Keep entries short, audience: investors + internal team.

export type ChangelogTag = 'patient' | 'clinician' | 'platform' | 'security' | 'ai' | 'infrastructure';

export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  version?: string;
  title: string;
  tags: ChangelogTag[];
  bullets: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-05-21',
    version: '0.9.8',
    title: 'Simple Mode v1.1 + Clinician Dictation + signed-in UI fixes',
    tags: ['patient', 'clinician', 'ai', 'platform'],
    bullets: [
      'Fix — Auth profile fetched twice on every page load (AuthContext ran both onAuthStateChange and getSession). Now once. Removes the visible double-render flash.',
      'Fix — Nav bar disappeared between 768–1024px (hamburger was md:hidden, full nav was lg:flex). Hamburger now covers the full sub-lg range; right-side cluster sits flush with ml-auto.',
      'Simple Mode v1.1 — Gradient transition overlay on /assist enter, full conversation logging (ai_conversations + ai_messages with RLS, 3 modalities), voice input (60s cap, Gemini transcription via media-extract edge function), photo OCR (paperclip → med/vital extraction → confirm prompt), and Settings → AI Conversation History with per-row + bulk delete and retention-policy notice.',
      'Clinician Dictations — New /clinician/dictations page. Record up to 60s, audio stored in private clinician-dictations bucket, clinician-dictation-process edge function transcribes + summarizes via Gemini. Per-dictation Approve transcript / Approve summary required before filing. Bulk-approve queue available with explicit liability acknowledgement modal.',
      'Storage — Three new private buckets: voice-notes, simple-mode-images, clinician-dictations (owner-only RLS on storage.objects).',
      'Longer-form continuous dictation (Otter-style streaming) tracked for a follow-up; current 60s cap covers most Simple Mode prompts and short visit notes.',
    ],
  },

  {
    date: '2026-05-20',
    version: '0.9.7',
    title: 'Beta readiness pass: PWA, offline-first patient writes, unified pricing, /for-clinicians',
    tags: ['platform', 'patient', 'clinician', 'infrastructure'],
    bullets: [
      'B1 — Family-member switcher now mounts in both desktop and mobile patient header so vitals/meds/schedule data follows the active member everywhere.',
      'B2 — Cookie banner uses lazy initial state from localStorage + storage-event sync so it never re-appears after Accept and stays in sync across tabs.',
      'B4 — Manifest-only installable PWA (no aggressive SW caching). Legacy meditracker-v1 service worker replaced with a kill-switch SW that unregisters itself. New /install page with platform-detected instructions for iOS Safari + Android Chrome.',
      'B5 — New reset-demo-accounts edge function for daily re-seeding of demo patient/clinician via existing seed-demo-data; keeps tester data recent.',
      'B6 — Beta tester pack: testing window, support address, and feedback flow filled in.',
      'Offline support: IndexedDB-backed write queue (idb) for vitals, medications, schedule check-offs, with retries + idempotency keys. OfflineBanner shows in patient header when offline or syncing.',
      'GTM: /pricing now hosts both Patient and Clinician tiers under a single audience toggle; /clinician/pricing 301-redirects to /pricing?audience=clinicians. New public /for-clinicians marketing landing page.',
      'WhatsApp scaffold: provider-agnostic interface (src/lib/whatsapp), inbound webhook stub with verify_jwt=false, and messages table gains transport + external_message_id columns. No transport wired yet — Twilio vs 360dialog tradeoff documented in docs/whatsapp-integration-plan.md.',
      'Profiles table gains onboarding_last_step + onboarding_skipped for future resume tracking (onboarding page already supports Skip and Save & Continue Later).',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.6',
    title: 'Brand copy alignment: from "medication tracker" to connected health platform',
    tags: ['platform'],
    bullets: [
      'BRAND constants gain shortDescription + metaDescription so all surface copy pulls from one source of truth.',
      'Footer slogan revised from "Your intelligent medication tracker…" to the broader scope (vitals, medications, records, care-team sharing) — consistent with the master "Your Health, Connected" tagline.',
      'Privacy Policy intro broadened to name the full scope (vitals, medications, Health Vault, care-team sharing) instead of "health tracking and medication management".',
      'Careers hero rewritten around connected post-discharge care, not just medication management + remote monitoring.',
      'Features page SEO title + meta description rewritten to reflect the full connected health platform.',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.5',
    title: 'Clinician gap-closing pass: nav expansion, Triage Inbox, invitation bell',
    tags: ['clinician', 'platform'],
    bullets: [
      'C1 — Clinician header gains a "More" dropdown surfacing Practice & Team, EHR Integrations, BAA, and All Settings (previously buried inside Settings).',
      'C1 — ClinicianSettings now hash-scrolls to #practice-team and #ehr-connections sections, so More-menu deep links land in the right place.',
      'C4 — ClinicianAlerts redesigned as a Triage Inbox with Unread / Acknowledged tabs, an Acknowledge action that writes acknowledged_at on alert_logs, and a live unread badge.',
      'C8 — Practice invitations surface inside the clinician notification bell with inline Accept/Decline; total badge count now combines guidance updates + pending invitations.',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.4',
    title: 'Patient gap-closing pass + i18n scaffold',
    tags: ['patient', 'platform', 'security'],
    bullets: [
      'Care Circle: added one-click "Email" invite (mailto pre-fills provider email, subject, and secure link) — no more copy-paste only.',
      'Onboarding: new "Save & Continue Later" button persists draft progress without marking onboarding complete, so patients can resume.',
      'Provider share revoke: now writes a hipaa_audit_logs entry (provider_share_revoked) and shows a richer confirmation toast naming the provider.',
      'i18n scaffold: i18next + react-i18next + browser language-detector wired through src/lib/i18n.ts; Settings now has a Language selector (English live, ES/FR marked coming soon).',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.3',
    title: 'Health Vault: "What this means for you" plain-language explainers',
    tags: ['patient', 'ai'],
    bullets: [
      'Document summarization now produces both a clinical summary and a patient-friendly explanation in plain language (3–5 sentences, no jargon, no dose/diagnosis advice).',
      'New patient_friendly_explanation column on health_documents; shown as a dedicated "What this means for you" card on each document, with an explicit "not medical advice" footer.',
      'Tool-call schema hardened: PII guard kept in place; new field is required output so it lands on every re-summarize.',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.2',
    title: 'QHIN provenance scaffolding (TEFCA-ready)',
    tags: ['infrastructure', 'platform', 'security'],
    bullets: [
      'New qhin_imports and qhin_record_provenance tables: every future network-fetched vital/med/document will carry source org, source system OID, original FHIR resource id, and a raw FHIR snapshot.',
      'profiles.qhin_consent_at + qhin_disclosure_version columns capture explicit TEFCA disclosure acceptance, separate from AI/Vault consent.',
      'RLS: patients see only their own imports/provenance; clinicians see provenance only for patients they already have shared access to via provider_shares.',
      'No live Particle/Health Gorilla wiring yet — schema-first so ingestion workers, dedupe, and UI badges can be built incrementally without backfill churn.',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.1',
    title: 'Patient AI assistant: global FAB + medication awareness',
    tags: ['patient', 'ai'],
    bullets: [
      'AI Chat FAB now mounted globally across patient routes (Vitals, Meds, Schedule, Vault, Family, Messages, etc.) — single mount, no per-page duplicates.',
      'Assistant system prompt now includes the user\'s active medication list (consent-gated, capped at 20) so it can answer in context without giving dose advice.',
      'Hardened safety rules: explicit red-flag escalation, no dose/interaction changes, prescriber-deferral phrasing.',
      'New /admin/implementation-tracking source-of-truth doc for how features work internally.',
    ],
  },
  {
    date: '2026-05-20',
    version: '0.9.0',
    title: 'P3 polish, messaging, and enterprise pipeline',
    tags: ['platform', 'clinician', 'patient', 'infrastructure'],
    bullets: [
      'Secure 1:1 in-app messaging between patients and consented clinicians (realtime, RLS-scoped to active shares).',
      'Clinician Messages workspace with patient list and thread view.',
      'Enterprise inquiry pipeline: confirmation email to inquirer + sales notification, idempotent send via Resend.',
      'Discontinued-medication auto-deactivation: PL/pgSQL trigger flips is_active=false on end_date passage; backfill applied.',
      'Guidance creation: built-in starter templates (BP monitoring, new-med starts, post-discharge, etc.) to remove repetitive typing.',
      'Patient subscription auto-refresh + Premium-state polling parity with clinician hook.',
      'Notes auto-save indicator with "Saved X ago" and unsaved-changes state.',
      'Clinician session-timeout: 2-minute warning toast before forced sign-out.',
      'Empty-state copy added to permission-denied clinician tabs and first-load patient list.',
      'Send-activation-link button surfaced directly on managed-patient rows.',
      'QHIN/Particle Health integration plan locked in (docs/qhin-integration-plan.md).',
    ],
  },
  {
    date: '2026-05-19',
    title: 'May 2026 housekeeping audit',
    tags: ['platform'],
    bullets: [
      'Full logic-break + dead-end audit across patient, clinician, and marketing surfaces.',
      'Roadmap reordered to defer Phase A–D UI redesign until functional gaps close.',
      'Documented follow-ups: AI med knowledge base, health-news feed, additional GTM opportunities.',
    ],
  },
  {
    date: '2026-05-15',
    title: 'Family health tracking + context switcher',
    tags: ['patient'],
    bullets: [
      'Add and manage family members; assign vitals, meds, schedule, and vault entries per member.',
      'Global active-member switcher filters every patient-side view consistently.',
    ],
  },
  {
    date: '2026-05-10',
    title: 'Health Vault + AI document summarization',
    tags: ['patient', 'ai'],
    bullets: [
      'Encrypted Health Vault with per-document sharing (5-minute signed URLs for clinicians).',
      'Opt-in AI summarization via Gemini 2.5 Flash; 13-pattern PII de-identification before submission.',
      'Lab reports auto-sync to vault with provenance badges.',
    ],
  },
  {
    date: '2026-05-05',
    title: 'Clinician practice management',
    tags: ['clinician'],
    bullets: [
      'Multi-clinician practices with RBAC and shared patient pools (security-definer RLS).',
      'Bulk patient onboarding via CSV with unique activation links.',
      'Specialty vital presets (e.g., Cardiology) for focused monitoring.',
    ],
  },
  {
    date: '2026-04-28',
    title: 'EHR integration framework',
    tags: ['clinician', 'infrastructure'],
    bullets: [
      'Bidirectional FHIR sync framework with LOINC mappings.',
      'Webhook ingestion + scheduled background sync.',
      'Vital source tracking distinguishes EHR-imported vs patient-entered data.',
    ],
  },
  {
    date: '2026-04-20',
    title: 'Security & compliance hardening',
    tags: ['security'],
    bullets: [
      'HIPAA audit logging on every PHI interaction (useHipaaAuditLog).',
      'Clinician 30-minute strict inactivity logout.',
      'Generic password-reset responses to prevent user enumeration.',
      'AES-256 at rest, TLS in transit, Leaked Password Protection enabled.',
    ],
  },
  {
    date: '2026-04-10',
    title: 'Patient AI Assistant',
    tags: ['ai', 'patient'],
    bullets: [
      'Voice-enabled assistant (Web Speech API) with navigation intents.',
      'Granular per-feature consent gating before any AI processing.',
    ],
  },
  {
    date: '2026-04-01',
    title: 'Public launch foundations',
    tags: ['platform'],
    bullets: [
      'Brand identity, marketing site, careers, pricing, and BAA framework live.',
      'Lovable Cloud backend, Supabase auth + RLS, Resend email pipeline configured.',
    ],
  },
];
