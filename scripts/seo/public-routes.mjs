// Single source of truth for public, indexable routes.
// Drives: public/sitemap.xml (scripts/seo/generate-sitemap.mjs), the static
// per-route HTML shells (scripts/seo/prerender.mjs) and the SEO vitest.
// Anything that is not listed here must NOT be in the sitemap.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORIGIN = 'https://onecare.you';

/** Prefixes that are authenticated, per-user, token-bearing or internal. */
export const PRIVATE_PREFIXES = [
  '/dashboard', '/medications', '/schedule', '/vitals', '/settings', '/onboarding',
  '/care-circle', '/health-vault', '/family', '/billing', '/recordings', '/messages',
  '/guidance', '/adherence-report', '/knowledge-base', '/medication-info', '/ai',
  '/ehr-comparison', '/admin', '/practice', '/s', '/beta', '/i/', '/auth', '/staff',
  '/forgot-password', '/reset-password', '/subscription-success',
  '/clinician/dashboard', '/clinician/patients', '/clinician/patient', '/clinician/today',
  '/clinician/settings', '/clinician/alerts', '/clinician/guidance', '/clinician/scribe',
  '/clinician/schedule', '/clinician/invoices', '/clinician/messages', '/clinician/records',
  '/clinician/practice', '/clinician/enterprise-inquiry', '/clinician/baa',
  '/clinician/subscription-success', '/clinician/dictations', '/clinician/templates',
  '/clinician/audit', '/clinician/reports', '/clinician/compliance', '/clinician/sign-in',
  '/sign-in', '/sign-up',
];

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

function gitDate(file) {
  try {
    const d = execSync(`git log -1 --format=%cs -- "${file}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (d) return d;
  } catch { /* not a git checkout */ }
  return new Date().toISOString().slice(0, 10);
}

const STATIC = [
  { path: '/', file: 'src/pages/Landing.tsx', changefreq: 'weekly', priority: '1.0',
    title: 'OneCare | Your health record, and you decide who sees it',
    description: 'OneCare gives you one health record you own — readings, medications, letters and visit summaries — and lets you grant and withdraw access to each clinician or hospital yourself.' },
  { path: '/features', file: 'src/pages/Features.tsx', priority: '0.9',
    title: 'Features | OneCare', description: 'Track vitals, manage medications, store records in your Health Vault and share updates with your care team.' },
  { path: '/how-it-works', file: 'src/pages/HowItWorks.tsx', priority: '0.9',
    title: 'How It Works | OneCare', description: 'Guided walkthroughs of the OneCare patient app and the clinician surface: triage inbox, charts, scribe and audit trail.' },
  { path: '/pricing', file: 'src/pages/Pricing.tsx', priority: '0.9',
    title: 'Pricing | OneCare', description: 'Compare OneCare plans. Start free with unlimited medications and vitals tracking; upgrade to Plus for an AI assistant allowance, Health Vault and AI lab parsing.' },
  { path: '/for-clinicians', file: 'src/pages/ForClinicians.tsx', priority: '0.9',
    title: 'OneCare for Clinicians | OneCare', description: 'A connected view of patient vitals, medications and documents after discharge, with an ambient scribe and an audit trail.' },
  { path: '/clinician/why-onecare', file: 'src/pages/ClinicianWhyOneCare.tsx', priority: '0.7',
    title: 'Why OneCare for Clinicians | OneCare', description: 'Why clinicians use OneCare: patient-reported readings between visits, clinical guidance tools, care coordination and transparent pricing.' },
  { path: '/clinician/sign-up', file: 'src/pages/ClinicianSignUp.tsx', priority: '0.6',
    title: 'Clinician Sign Up | OneCare', description: 'Create a OneCare clinician account for patient monitoring, clinical guidance tools and care coordination.' },
  { path: '/about', file: 'src/pages/About.tsx', priority: '0.7',
    title: 'Why OneCare exists | OneCare', description: 'Health records are held by institutions; the patient is present at all of their own care. OneCare is built on that mismatch.' },
  { path: '/contact', file: 'src/pages/Contact.tsx', priority: '0.6',
    title: 'Contact OneCare | OneCare', description: 'Questions about your record, your account, or working with us. Reach the OneCare team directly.' },
  { path: '/install', file: 'src/pages/Install.tsx', priority: '0.6',
    title: 'Install OneCare | OneCare', description: 'Install OneCare on your phone, tablet or desktop for quick, app-like access to your health record.' },
  { path: '/docs', file: 'src/pages/Docs.tsx', priority: '0.8',
    title: 'Documentation | OneCare', description: 'How OneCare works: your record, sharing with your care team, the assistant, privacy and clinician workflows.' },
  { path: '/careers', file: 'src/pages/Careers.tsx', priority: '0.6',
    title: 'Careers at OneCare | OneCare', description: 'Open roles at OneCare. Remote-first, patient-first.' },
  { path: '/sitemap', file: 'src/pages/Sitemap.tsx', changefreq: 'monthly', priority: '0.3',
    title: 'Sitemap | OneCare', description: 'Every public page on OneCare: features, pricing, clinician tools, documentation and legal information.' },
  { path: '/privacy', file: 'src/pages/PrivacyPolicy.tsx', changefreq: 'yearly', priority: '0.3',
    title: 'Privacy Policy | OneCare', description: 'How OneCare collects, uses and protects your health data.' },
  { path: '/terms', file: 'src/pages/TermsOfService.tsx', changefreq: 'yearly', priority: '0.3',
    title: 'Terms of Service | OneCare', description: 'The terms for using the OneCare platform.' },
  { path: '/disclaimer', file: 'src/pages/MedicalDisclaimer.tsx', changefreq: 'yearly', priority: '0.3',
    title: 'Medical Disclaimer | OneCare', description: 'OneCare is for information and record-keeping. It is not a substitute for professional medical advice.' },
  { path: '/data-processing', file: 'src/pages/DataProcessing.tsx', changefreq: 'yearly', priority: '0.3',
    title: 'Data Processing | OneCare', description: 'How OneCare processes personal and health data, including GDPR details.' },
];

function docs() {
  const src = read('src/lib/docs.ts');
  const out = [];
  const re = /slug:\s*'([^']+)',\s*title:\s*'([^']+)',\s*blurb:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ path: `/docs/${m[1]}`, file: 'src/lib/docs.ts', priority: '0.7',
      title: `${m[2]} | OneCare Docs`, description: `${m[3]}. OneCare documentation.` });
  }
  return out;
}

function jobs() {
  const src = read('src/lib/job-listings.ts');
  const out = [];
  const re = /id:\s*"([a-z0-9-]+)",\s*title:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ path: `/careers/${m[1]}`, file: 'src/lib/job-listings.ts', changefreq: 'weekly', priority: '0.5',
      title: `${m[2]} | OneCare Careers`, description: `${m[2]} at OneCare.` });
  }
  return out;
}

export function publicRoutes() {
  return [...STATIC, ...docs(), ...jobs()].map((r) => ({
    changefreq: 'monthly',
    ...r,
    lastmod: gitDate(r.file),
  }));
}
