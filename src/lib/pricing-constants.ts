// Single Source of Truth for all patient pricing, feature lists, and limits

import { FAMILY_HEALTH_ENABLED } from './feature-flags';

// Free patients have no medication or document count cap. (FREE_MEDICATION_LIMIT
// and FREE_DOCUMENT_LIMIT were removed Oct 2026; nothing server-side enforced
// them.) The plan names people read are Free and Plus; the stored tier key for
// Plus stays `premium`.

// Stripe price IDs
export const STRIPE_PRICES = {
  premium_monthly: 'price_1SqXUWDycAbKvlfcCanJKM3L',
  premium_annual: 'price_1SqXUlDycAbKvlfcO63bve7U',
} as const;

export const PRICE_INFO = {
  premium_monthly: {
    price: 9.99,
    period: 'month',
    label: 'Monthly',
  },
  premium_annual: {
    price: 99.90,
    period: 'year',
    label: 'Annual',
    savings: '2 months free',
  },
} as const;

// Feature lists used on both Landing and Pricing pages.
// Free deliberately does not advertise the AI assistant: the allowance is a
// Plus feature on the page, whatever the assistant's current gating is.
export const FREE_FEATURES = [
  'Unlimited medications',
  'Unlimited documents',
  'Drug interaction warnings',
  'Daily medication schedule',
  'Push notification reminders',
  'Health profile storage',
  '2 GB document storage',
  'Mobile-friendly access',
  'Vitals & lab tracking',
  'Care Circle – share with providers',
  'Knowledge base access',
  'Emergency contacts & info',
] as const;

// Shown as "Plus" (the stored tier key is still `premium`).
export const PREMIUM_FEATURES = [
  'AI assistant allowance',
  'AI lab report parsing',
  'AI document summaries',
  '10 GB document storage',
  // Family health is switched off (feature-flags.ts); selling it as a Plus
  // feature charged people for a screen they could not reach.
  ...(FAMILY_HEALTH_ENABLED ? ['Family member profiles'] : []),
  'Health Document Vault',
  'Health reports export',
] as const;

// Features in active development — shown separately on pricing page
export const COMING_SOON_FEATURES = [
  'Refill reminders',
  'Priority support',
] as const;

// Combined list for Pricing page detail view. Plus-only items appear struck
// through on the Free card, except the AI ones: Free does not advertise AI, and
// striking it through would claim the assistant is unavailable.
export const FREE_FEATURE_DETAIL = [
  ...FREE_FEATURES.map(text => ({ text: text as string, included: true })),
  ...PREMIUM_FEATURES.filter(text => !text.startsWith('AI ')).map(text => ({ text: text as string, included: false })),
];

// Plus replaces Free's 2 GB with its own 10 GB, so the 2 GB line is not repeated.
export const PREMIUM_FEATURE_DETAIL = [
  ...FREE_FEATURES.filter(text => text !== '2 GB document storage').map(text => ({ text: text as string, included: true })),
  ...PREMIUM_FEATURES.map(text => ({ text: text as string, included: true })),
];

// Simplified list for Landing page
export const LANDING_FREE_FEATURES = [
  'Unlimited medications and documents',
  'Drug interaction warnings',
  'Daily schedule & reminders',
  'Vitals & lab tracking',
  'Care Circle – share with providers',
] as const;

export const LANDING_PREMIUM_FEATURES = [
  'Everything in Free',
  'AI assistant allowance',
  ...(FAMILY_HEALTH_ENABLED ? ['Family member profiles'] : []),
  'AI lab report parsing and summaries',
  'Health Document Vault',
  'Health reports export',
] as const;

// ── Enterprise / hospital ──────────────────────────────────────────────────────
// Enterprise is quoted, not self-serve (the bundle builder is not built, so the
// page must not claim one). Used by the clinician pricing page and the
// enterprise inquiry page.


/** What the entry-level Enterprise price includes. */
export const ENTERPRISE_INCLUDED = [
  '25 clinicians',
  '5,000 patients',
  '15,000 scribe minutes per month, pooled',
  '1 TB storage',
  'Departments and sub-admins',
  'Custom subdomain and practice branding',
  'Single sign-on (SSO)',
  'FHIR / EHR connections',
  'HIPAA BAA',
  'Priority support',
] as const;

/** Monthly price of a staff seat. Every non-clinical staff member needs one; none are included. */
export const STAFF_SEAT_PRICE = 15;

/** Seat and scribe figures for the plans that have a seat model. */
export const CLINICIAN_SEAT_MODEL = {
  pro: { includedClinicians: 3, extraClinicianPrice: 49, maxClinicians: null, scribeMinutes: 900 },
  clinic: { includedClinicians: 10, extraClinicianPrice: 45, maxClinicians: 30, scribeMinutes: 3000 },
} as const;

/** Storage included per clinician plan, as published. Practice and Clinic add 10 GB per added clinician. */
export const CLINICIAN_STORAGE_ALLOWANCE = {
  community: '500 MB',
  solo: '10 GB',
  pro: '30 GB',
  clinic: '100 GB',
  enterprise: '1 TB',
} as const;

/** Commercial items published as live or coming, with no promised date beyond what is stated. */
export const PRICING_ROADMAP = [
  { label: 'Seats and staff seats', detail: 'Clinician seats and staff seats are available to add to a plan now', when: 'Available' },
  { label: 'Storage packs', detail: 'Base allowance per plan, extra storage purchasable', when: 'Coming' },
  { label: 'Regional pricing', detail: 'Local pricing for non-US markets', when: 'Late 2026 – early 2027' },
  { label: 'Family plan', detail: 'A plan for households', when: 'Later' },
] as const;
