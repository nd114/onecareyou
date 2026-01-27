/**
 * OneCare Brand Constants - Single Source of Truth (SSOT)
 * 
 * All brand-related values should be imported from here.
 * DO NOT hardcode brand names, emails, or URLs elsewhere in the codebase.
 */

export const BRAND = {
  name: 'OneCare',
  tagline: 'Your Health, Connected',
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
