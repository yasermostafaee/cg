import { describe, expect, it } from 'vitest';
import ar from '../src/renderer/i18n/catalogs/ar.json';
import en from '../src/renderer/i18n/catalogs/en.json';
import fa from '../src/renderer/i18n/catalogs/fa.json';
import { feedback, localeDirection, setLanguage } from '../src/renderer/i18n/locale.js';

describe('CG Control language catalogs', () => {
  it('contains every English key in Persian and Arabic and preserves interpolation fields', () => {
    const tokens = (text: string) => (text.match(/\{[A-Za-z][A-Za-z0-9]*\}/g) ?? []).sort();
    for (const catalog of [fa, ar]) {
      for (const scope of ['interface', 'feedback'] as const) {
        expect(Object.keys(catalog[scope])).toEqual(Object.keys(en[scope]));
        for (const [key, source] of Object.entries(en[scope])) {
          const translated = (catalog[scope] as Record<string, string>)[key] ?? '';
          expect(translated).not.toBe('');
          expect(tokens(translated), key).toEqual(tokens(source));
        }
      }
    }
  });

  it('uses the chosen feedback language and isolates authored values', () => {
    setLanguage('feedback', 'fa');
    try {
      expect(feedback('{row} is on air.', { row: 'Logo 1' })).toBe(
        '\u2068Logo 1\u2069 روی آنتن رفت.',
      );
      expect(feedback('Request failed.')).toBe('درخواست ناموفق بود.');
      expect(feedback('Raw engine diagnostic')).toBe('Raw engine diagnostic');
      expect(localeDirection('ar')).toBe('rtl');
      expect(localeDirection('en')).toBe('ltr');
    } finally {
      setLanguage('feedback', 'en');
    }
  });

  it('keeps the CG Control product name where interface or feedback copy names it', () => {
    const product = /\bCG Control\b/i;
    for (const scope of ['interface', 'feedback'] as const) {
      for (const [key, english] of Object.entries(en[scope])) {
        if (!product.test(key) && !product.test(english)) continue;
        expect(english, `en/${scope}: ${key}`).toMatch(product);
        for (const [locale, catalog] of [
          ['fa', fa],
          ['ar', ar],
        ] as const) {
          expect(
            (catalog[scope] as Record<string, string>)[key],
            `${locale}/${scope}: ${key}`,
          ).toContain('CG Control');
        }
      }
    }
  });
});
