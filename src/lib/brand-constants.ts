/**
 * OneCare Brand Constants - Single Source of Truth (SSOT)
 * 
 * All brand-related values should be imported from here.
 * DO NOT hardcode brand names, emails, or URLs elsewhere in the codebase.
 */

export const BRAND = {
  name: 'OneCare',
  tagline: 'Your Health, Connected',
  shortDescription:
    'OneCare keeps your vitals, medications, and health records connected with the people who care for you — from hospital to home.',
  metaDescription:
    'OneCare is a connected health platform for patients and clinicians. Track vitals, manage medications, store records, and share continuous updates with your care team after discharge.',
  domain: 'onecare.you',
  
  emails: {
    hello: 'hello@onecare.you',
    support: 'support@onecare.you',
    privacy: 'privacy@onecare.you',
    legal: 'legal@onecare.you',
    dpo: 'dpo@onecare.you',
    careers: 'careers@onecare.you',
    compliance: 'compliance@onecare.you',
    euPrivacy: 'eu-privacy@onecare.you',
  },
  
  urls: {
    app: 'https://onecareyou.lovable.app',
    published: 'https://onecareyou.lovable.app',
  },
  
  legal: {
    companyName: 'OneCare',
    lastUpdated: 'January 27, 2026',
  },
} as const;

// Type exports for TypeScript consumers
export type BrandEmails = typeof BRAND.emails;
export type BrandUrls = typeof BRAND.urls;
