import { describe, expect, it } from 'vitest';
import ar from '../src/renderer/i18n/catalogs/ar.json';
import en from '../src/renderer/i18n/catalogs/en.json';
import fa from '../src/renderer/i18n/catalogs/fa.json';
import {
  feedback,
  languageFile,
  localeDirection,
  readLanguageFile,
  resetLanguageFile,
  setLanguage,
} from '../src/renderer/i18n/locale.js';

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

  it('accepts a local edit, keeps built-in fallback, and validates placeholders', () => {
    const raw = JSON.stringify({
      locale: 'fa',
      interface: {},
      feedback: { '{row} is on air.': '{row} پخش شد.' },
    });
    expect(readLanguageFile(raw)).toBe(true);
    setLanguage('feedback', 'fa');
    try {
      expect(feedback('{row} is on air.', { row: 'Logo 1' })).toBe('\u2068Logo 1\u2069 پخش شد.');
      expect(feedback('Request failed.')).toBe('درخواست ناموفق بود.');
      expect(readLanguageFile(raw.replace('{row} پخش', 'پخش'))).toBe(false);
      expect(JSON.parse(languageFile('fa')).feedback['{row} is on air.']).toBe('{row} پخش شد.');
      expect(localeDirection('ar')).toBe('rtl');
      expect(localeDirection('en')).toBe('ltr');
    } finally {
      resetLanguageFile('fa');
      setLanguage('feedback', 'en');
    }
  });
});
