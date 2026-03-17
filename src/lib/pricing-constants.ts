// Single Source of Truth for all patient pricing, feature lists, and limits

export const FREE_MEDICATION_LIMIT = 3;
export const FREE_DOCUMENT_LIMIT = 3;

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

// Feature lists used on both Landing and Pricing pages
export const FREE_FEATURES = [
  'Track up to 3 medications',
  'Drug interaction warnings',
  'Daily medication schedule',
  'Health profile storage',
  'Mobile-friendly access',
  'Vitals & lab tracking',
  'Care Circle – share with providers',
  'Knowledge base access',
  'Push notification reminders',
  'Emergency contacts & info',
] as const;

export const PREMIUM_FEATURES = [
  'Unlimited medications',
  'Family member profiles',
  'AI lab report parsing',
  'Health reports export',
  'Health Document Vault',
  'AI document summaries',
] as const;

// Features in active development — shown separately on pricing page
export const COMING_SOON_FEATURES = [
  'Refill reminders',
  'Priority support',
] as const;

// Combined list for Pricing page detail view
export const FREE_FEATURE_DETAIL = [
  ...FREE_FEATURES.map(text => ({ text, included: true })),
  ...PREMIUM_FEATURES.map(text => ({ text, included: false })),
];

export const PREMIUM_FEATURE_DETAIL = [
  ...FREE_FEATURES.map(text => ({ text, included: true })),
  ...PREMIUM_FEATURES.map(text => ({ text, included: true })),
];

// Simplified list for Landing page
export const LANDING_FREE_FEATURES = [
  'Track up to 3 medications',
  'Drug interaction warnings',
  'Daily schedule & reminders',
  'Vitals & lab tracking',
  'Care Circle – share with providers',
] as const;

export const LANDING_PREMIUM_FEATURES = [
  'Everything in Free',
  'Unlimited medications',
  'Family member profiles',
  'AI lab report parsing',
  'Health Document Vault',
  'Health reports export',
] as const;
