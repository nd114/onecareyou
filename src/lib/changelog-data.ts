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
