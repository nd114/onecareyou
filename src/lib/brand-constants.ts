/**
 * Marpe Brand Constants - Single Source of Truth (SSOT)
 * 
 * All brand-related values should be imported from here.
 * DO NOT hardcode brand names, emails, or URLs elsewhere in the codebase.
 */

export const BRAND = {
  name: 'Marpe',
  tagline: 'Your Health, Connected',
  domain: 'marpe.care',
  
  emails: {
    support: 'support@marpe.care',
    privacy: 'privacy@marpe.care',
    legal: 'legal@marpe.care',
    dpo: 'dpo@marpe.care',
  },
  
  urls: {
    app: 'https://marpecare.lovable.app',
    published: 'https://marpecare.lovable.app',
  },
  
  legal: {
    companyName: 'Marpe',
    lastUpdated: 'January 17, 2026',
  },
} as const;

// Type exports for TypeScript consumers
export type BrandEmails = typeof BRAND.emails;
export type BrandUrls = typeof BRAND.urls;
