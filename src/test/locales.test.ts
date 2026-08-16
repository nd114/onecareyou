import { describe, it, expect } from 'vitest';
import { LOCALES, getLocale, selectableLocales } from '@/lib/locales';
import { en } from '@/lib/locales/messages/en';
import { fr } from '@/lib/locales/messages/fr';
import { ar } from '@/lib/locales/messages/ar';
import { yo } from '@/lib/locales/messages/yo';

describe('locale registry', () => {
  it('carries every language we committed to', () => {
    const codes = LOCALES.map((l) => l.code).sort();
    expect(codes).toEqual(
      ['ar', 'de', 'en', 'es', 'fr', 'ha', 'ig', 'it', 'pt', 'ru', 'yo', 'zh'].sort(),
    );
  });

  it('marks Arabic right-to-left and everything else left-to-right', () => {
    expect(getLocale('ar').dir).toBe('rtl');
    for (const l of LOCALES.filter((x) => x.code !== 'ar')) {
      expect(l.dir, l.code).toBe('ltr');
    }
  });

  it('falls back to English for an unknown or missing code', () => {
    expect(getLocale('klingon').code).toBe('en');
    expect(getLocale(undefined).code).toBe('en');
  });

  it('names each language in its own script', () => {
    // Someone looking for Hausa scans for "Hausa", not an English label.
    expect(getLocale('zh').nativeLabel).toBe('中文（简体）');
    expect(getLocale('ru').nativeLabel).toBe('Русский');
    expect(getLocale('ar').nativeLabel).toBe('العربية');
    expect(getLocale('yo').nativeLabel).toBe('Yorùbá');
  });

  it('hides unreviewed languages from the switcher in production builds', () => {
    // A half-translated medical app must not reach patients by accident.
    const shipped = selectableLocales(false).map((l) => l.code);
    expect(shipped).toEqual(['en']);
    expect(selectableLocales(true).length).toBe(LOCALES.length);
  });
});

describe('message bundles', () => {
  it('keeps every translated key within the English key set', () => {
    // A key that exists only in a translation is a key nothing renders.
    const englishKeys = new Set([
      ...Object.keys(en.common).map((k) => `common.${k}`),
      ...Object.keys(en.nav).map((k) => `nav.${k}`),
      ...Object.keys(en.settings).map((k) => `settings.${k}`),
    ]);

    for (const [name, bundle] of Object.entries({ fr, ar, yo })) {
      for (const ns of Object.keys(bundle) as (keyof typeof bundle)[]) {
        for (const key of Object.keys(bundle[ns])) {
          expect(englishKeys.has(`${String(ns)}.${key}`), `${name}: ${String(ns)}.${key}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('allows a partial translation, because missing keys fall back to English', () => {
    // Yoruba deliberately covers fewer keys than French; both are valid.
    expect(Object.keys(yo.nav).length).toBeLessThan(Object.keys(fr.nav).length);
    expect(Object.keys(yo.common).length).toBeGreaterThan(0);
  });

  it('translates the tab-bar keys the navigation actually looks up', () => {
    // nav-ia.ts uses the pillar keys today/health/team/learn as lookup keys.
    for (const bundle of [fr, ar]) {
      for (const key of ['today', 'health', 'team'] as const) {
        expect(bundle.nav).toHaveProperty(key);
      }
    }
  });
});
