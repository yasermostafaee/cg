import { useSyncExternalStore } from 'react';
import ar from './catalogs/ar.json';
import en from './catalogs/en.json';
import fa from './catalogs/fa.json';

export const CONTROL_LOCALES = ['en', 'fa', 'ar'] as const;
export type Locale = (typeof CONTROL_LOCALES)[number];
type LanguageScope = 'interface' | 'feedback';
type Messages = Readonly<Record<string, string>>;
type Catalog = Readonly<Record<LanguageScope, Messages>>;
type Preferences = Readonly<Record<LanguageScope, Locale>>;
type Values = Readonly<Record<string, string | number>>;

const key = 'cg.runtime.language.v1';
const bundled: Readonly<Record<Locale, Catalog>> = { en, fa, ar };
const defaults: Preferences = { interface: 'en', feedback: 'en' };
const listeners = new Set<() => void>();
const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

export function normalizeLocale(value: unknown): Locale {
  return CONTROL_LOCALES.find((locale) => locale === value) ?? 'en';
}

function readPreferences(): Preferences {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage.getItem(key) ?? 'null');
    if (raw === null || typeof raw !== 'object') return defaults;
    return {
      interface: normalizeLocale('interface' in raw ? raw.interface : undefined),
      feedback: normalizeLocale('feedback' in raw ? raw.feedback : undefined),
    };
  } catch {
    return defaults;
  }
}

let current = readPreferences();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguages(): Preferences {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults,
  );
}

export function setLanguage(scope: LanguageScope, locale: Locale): void {
  if (current[scope] === locale) return;
  current = { ...current, [scope]: locale };
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(current));
  } catch {
    // The current session can still use the choice if local storage is unavailable.
  }
  for (const listener of listeners) listener();
}

function own(messages: Messages, source: string): string | undefined {
  return Object.hasOwn(messages, source) ? messages[source] : undefined;
}

function translate(
  prefs: Preferences,
  scope: LanguageScope,
  source: string,
  values?: Values,
): string {
  const locale = prefs[scope];
  const message = own(bundled[locale][scope], source) ?? own(bundled.en[scope], source) ?? source;
  if (values === undefined) return message;
  return message.replace(placeholder, (token: string, name: string) => {
    if (!Object.hasOwn(values, name)) return token;
    const value = String(values[name]);
    // Isolate authored names and technical values in a mixed-direction sentence.
    return localeDirection(locale) === 'rtl' ? `\u2068${value}\u2069` : value;
  });
}

export function useUiText(): (source: string, values?: Values) => string {
  const prefs = useLanguages();
  return (source, values) => translate(prefs, 'interface', source, values);
}

export function useFeedbackText(): (source: string, values?: Values) => string {
  const prefs = useLanguages();
  return (source, values) => translate(prefs, 'feedback', source, values);
}

/** For action callbacks that are not React components. */
export function feedback(source: string, values?: Values): string {
  return translate(current, 'feedback', source, values);
}
