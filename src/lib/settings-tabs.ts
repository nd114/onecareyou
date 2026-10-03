/**
 * Which Settings tab a deep link lands on.
 *
 * Both Settings pages group their cards into tabs, so a link to something
 * inside one has to name a tab or it lands on whichever is open by default.
 * The links in the app use `#hash` (Care Circle's sharing history) and
 * `?section=` (the dashboard's reminders prompt); search adds more of the
 * second kind. One resolver, so a link works the same on both spellings.
 */

export type PatientSettingsTab = 'account' | 'care' | 'privacy' | 'prefs';
export type ClinicianSettingsTab = 'account' | 'privacy' | 'prefs';

const PATIENT_TABS: Record<PatientSettingsTab, string[]> = {
  account: ['account', 'profile'],
  care: ['care', 'emergency', 'alerts'],
  privacy: ['privacy', 'sharing-history', 'ai-history', 'audit'],
  prefs: ['prefs', 'preferences', 'notifications', 'units', 'simple-mode'],
};

const CLINICIAN_TABS: Record<ClinicianSettingsTab, string[]> = {
  account: ['account', 'profile'],
  privacy: ['privacy', 'audit'],
  prefs: ['prefs', 'preferences', 'notifications', 'appearance'],
};

function target(search: string, hash: string): string {
  const section = new URLSearchParams(search).get('section');
  return (hash.replace(/^#/, '') || section || '').toLowerCase();
}

function resolve<T extends string>(
  table: Record<T, string[]>,
  fallback: T,
  search: string,
  hash: string,
): T {
  const wanted = target(search, hash);
  if (!wanted) return fallback;
  const found = (Object.keys(table) as T[]).find((tab) => table[tab].includes(wanted));
  return found ?? fallback;
}

export function patientSettingsTab(search: string, hash: string): PatientSettingsTab {
  return resolve(PATIENT_TABS, 'account', search, hash);
}

export function clinicianSettingsTab(search: string, hash: string): ClinicianSettingsTab {
  return resolve(CLINICIAN_TABS, 'account', search, hash);
}
