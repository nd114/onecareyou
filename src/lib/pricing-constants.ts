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
  '500 MB document storage',
  'Mobile-friendly access',
  'Vitals & lab tracking',
  'Care Circle – share with providers',
  'Knowledge base access',
  'Push notification reminders',
  'Emergency contacts & info',
] as const;

export const PREMIUM_FEATURES = [
  'Unlimited medications',
  '10 GB document storage',
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

// ── Enterprise / hospital tiers ────────────────────────────────────────────────
// Single source of truth for institutional pricing. Used by the clinician
// pricing page, the enterprise inquiry page and the comparison table.

export const ENTERPRISE_ONBOARDING_FEE = 2500;

export interface EnterpriseTier {
  key: 'practice' | 'mid' | 'high' | 'enterprise_plus';
  name: string;
  from: number;
  /** null = "from" pricing is a starting point, quoted after scoping. */
  shape: string;
  metrics: string[];
}

export const ENTERPRISE_TIERS: EnterpriseTier[] = [
  {
    key: 'practice',
    name: 'Practice',
    from: 399,
    shape: 'Single practice or clinic',
    metrics: ['Up to ~5 clinicians', 'Up to 1,000 patients', 'Single department'],
  },
  {
    key: 'mid',
    name: 'Mid-sized',
    from: 1500,
    shape: 'Multi-department clinic or small hospital',
    metrics: ['Up to ~12 clinicians', 'Up to 5,000 patients', 'Up to 7 departments'],
  },
  {
    key: 'high',
    name: 'High',
    from: 3000,
    shape: 'Hospital with established departments',
    metrics: ['Up to ~30 clinicians', 'Up to 15,000 patients', '7–10 departments'],
  },
  {
    key: 'enterprise_plus',
    name: 'Enterprise+',
    from: 4000,
    shape: 'Large hospital or hospital group',
    metrics: ['31+ clinicians', '15,000+ patients', '10+ departments'],
  },
];

/** Commercial items published as coming, not billed yet. */
export const PRICING_ROADMAP = [
  { label: 'Storage packs', detail: 'Base allowance per plan, extra storage purchasable', when: 'Coming' },
  { label: 'Per-seat pricing', detail: 'Seat-based add-ons for large teams', when: 'Early 2027' },
  { label: 'Regional pricing', detail: 'Local pricing for non-US markets', when: 'Late 2026 – early 2027' },
  { label: 'Profit sharing', detail: 'Revenue share with institutional partners', when: '2027' },
] as const;
