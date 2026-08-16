import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { LOCALE_CODES, applyDocumentLocale, getLocale } from '@/lib/locales';
import { en } from '@/lib/locales/messages/en';
import { fr } from '@/lib/locales/messages/fr';
import { de } from '@/lib/locales/messages/de';
import { it } from '@/lib/locales/messages/it';
import { es } from '@/lib/locales/messages/es';
import { pt } from '@/lib/locales/messages/pt';
import { zh } from '@/lib/locales/messages/zh';
import { ru } from '@/lib/locales/messages/ru';
import { ar } from '@/lib/locales/messages/ar';
import { yo } from '@/lib/locales/messages/yo';
import { ha } from '@/lib/locales/messages/ha';
import { ig } from '@/lib/locales/messages/ig';

/**
 * English is the source of truth; every other locale is a partial overlay.
 * `fallbackLng: 'en'` means an untranslated key renders in English rather than
 * showing a raw key or an empty string — which matters more here than in most
 * apps, because a blank label in a medication screen is worse than an English
 * one.
 *
 * Locale metadata (writing direction, review status) lives in
 * `src/lib/locales/index.ts`.
 */
export const resources = {
  en, fr, de, it, es, pt, zh, ru, ar, yo, ha, ig,
} as const;

/** Kept for existing imports; the registry in `@/lib/locales` is authoritative. */
export { LOCALES as SUPPORTED_LANGUAGES } from '@/lib/locales';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: LOCALE_CODES as unknown as string[],
    nonExplicitSupportedLngs: true, // pt-BR resolves to pt, zh-Hans to zh
    defaultNS: 'common',
    ns: ['common', 'nav', 'settings'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'onecare-lang',
    },
  });

// Arabic is right-to-left, which mirrors layout rather than only text, so the
// document has to carry dir — Tailwind's logical properties key off it.
applyDocumentLocale(i18n.resolvedLanguage ?? 'en');
i18n.on('languageChanged', (lng) => applyDocumentLocale(lng));

/** Locale-aware formatting, so dates and numbers follow the chosen language. */
export function formatDate(value: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const tag = getLocale(i18n.resolvedLanguage).intlTag;
  return new Intl.DateTimeFormat(tag, opts ?? { dateStyle: 'medium' }).format(date);
}

export function formatNumber(value: number, opts?: Intl.NumberFormatOptions) {
  const tag = getLocale(i18n.resolvedLanguage).intlTag;
  return new Intl.NumberFormat(tag, opts).format(value);
}

export default i18n;
