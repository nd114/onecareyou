/**
 * Locale registry.
 *
 * Each locale carries what the app needs to render it correctly, not just a
 * label: the writing direction (Arabic is right-to-left, which changes layout,
 * not only text), the BCP-47 tag used for date and number formatting, and a
 * review status.
 *
 * `reviewStatus` is deliberately part of the data. A health app can ship an
 * unreviewed "Save" button; it must not ship an unreviewed medication
 * instruction. Locales that have not been through native-speaker review are
 * marked `draft` and are hidden from the switcher unless explicitly enabled,
 * so a half-finished language cannot reach patients by accident.
 */

export type LocaleCode =
  | 'en'
  | 'fr'
  | 'de'
  | 'it'
  | 'es'
  | 'pt'
  | 'zh'
  | 'ru'
  | 'ar'
  | 'yo'
  | 'ha'
  | 'ig';

export type ReviewStatus = 'released' | 'draft';

export interface LocaleMeta {
  code: LocaleCode;
  /** The language's own name — never the English name. */
  nativeLabel: string;
  englishLabel: string;
  dir: 'ltr' | 'rtl';
  /** For Intl date/number formatting. */
  intlTag: string;
  reviewStatus: ReviewStatus;
}

export const LOCALES: LocaleMeta[] = [
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', dir: 'ltr', intlTag: 'en', reviewStatus: 'released' },
  { code: 'fr', nativeLabel: 'Français', englishLabel: 'French', dir: 'ltr', intlTag: 'fr', reviewStatus: 'draft' },
  { code: 'de', nativeLabel: 'Deutsch', englishLabel: 'German', dir: 'ltr', intlTag: 'de', reviewStatus: 'draft' },
  { code: 'it', nativeLabel: 'Italiano', englishLabel: 'Italian', dir: 'ltr', intlTag: 'it', reviewStatus: 'draft' },
  { code: 'es', nativeLabel: 'Español', englishLabel: 'Spanish', dir: 'ltr', intlTag: 'es', reviewStatus: 'draft' },
  { code: 'pt', nativeLabel: 'Português', englishLabel: 'Portuguese', dir: 'ltr', intlTag: 'pt', reviewStatus: 'draft' },
  { code: 'zh', nativeLabel: '中文（简体）', englishLabel: 'Mandarin (Simplified)', dir: 'ltr', intlTag: 'zh-Hans', reviewStatus: 'draft' },
  { code: 'ru', nativeLabel: 'Русский', englishLabel: 'Russian', dir: 'ltr', intlTag: 'ru', reviewStatus: 'draft' },
  { code: 'ar', nativeLabel: 'العربية', englishLabel: 'Arabic', dir: 'rtl', intlTag: 'ar', reviewStatus: 'draft' },
  { code: 'yo', nativeLabel: 'Yorùbá', englishLabel: 'Yoruba', dir: 'ltr', intlTag: 'yo', reviewStatus: 'draft' },
  { code: 'ha', nativeLabel: 'Hausa', englishLabel: 'Hausa', dir: 'ltr', intlTag: 'ha', reviewStatus: 'draft' },
  { code: 'ig', nativeLabel: 'Igbo', englishLabel: 'Igbo', dir: 'ltr', intlTag: 'ig', reviewStatus: 'draft' },
];

export const LOCALE_CODES = LOCALES.map((l) => l.code);

export function getLocale(code: string | undefined | null): LocaleMeta {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/**
 * Locales offered in the switcher. Draft locales are included only when the
 * build opts in, so translation work can land continuously without exposing a
 * partly-translated app to patients.
 */
export function selectableLocales(includeDrafts = import.meta.env.DEV): LocaleMeta[] {
  return LOCALES.filter((l) => l.reviewStatus === 'released' || includeDrafts);
}

/** Applies writing direction and language to the document. */
export function applyDocumentLocale(code: string) {
  const locale = getLocale(code);
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale.code;
  document.documentElement.dir = locale.dir;
}
