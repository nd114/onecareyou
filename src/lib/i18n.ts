import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Base English resources. Other locales can be added as separate
// resource bundles (e.g. es.ts, fr.ts) — keys must match this shape.
// For now we ship English only; the scaffold is here so future PRs can
// add translations without re-wiring the app.
export const resources = {
  en: {
    common: {
      appName: 'OneCare',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      loading: 'Loading…',
      signOut: 'Sign Out',
      settings: 'Settings',
      dashboard: 'Dashboard',
      medications: 'Medications',
      vitals: 'Vitals',
      schedule: 'Schedule',
      healthVault: 'Health Vault',
      careCircle: 'Care Circle',
      language: 'Language',
      english: 'English',
      spanish: 'Spanish (coming soon)',
      french: 'French (coming soon)',
    },
  },
} as const;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', enabled: true },
  { code: 'es', label: 'Español (coming soon)', enabled: false },
  { code: 'fr', label: 'Français (coming soon)', enabled: false },
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'onecare-lang',
    },
  });

export default i18n;
