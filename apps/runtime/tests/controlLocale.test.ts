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
});
