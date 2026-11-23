import { useCallback, useSyncExternalStore } from 'react';
import ar from './catalogs/ar.json';
import en from './catalogs/en.json';
import fa from './catalogs/fa.json';
import { CONTROL_LANGUAGE_KEY, CONTROL_LOCALES } from './localePreferences.js';

export { CONTROL_LOCALES };
export type Locale = (typeof CONTROL_LOCALES)[number];
type LanguageScope = 'interface' | 'feedback';
type Messages = Readonly<Record<string, string>>;
type Catalog = Readonly<Record<LanguageScope, Messages>>;
type Preferences = Readonly<Record<LanguageScope, Locale>>;
type SavedPreferences = Readonly<Record<LanguageScope, Locale | undefined>>;
type Values = Readonly<Record<string, string | number>>;

const bundled: Readonly<Record<Locale, Catalog>> = { en, fa, ar };
const setupLanguage = normalizeLocale(
  (globalThis as { __CG_INSTALL_LANGUAGE__?: unknown }).__CG_INSTALL_LANGUAGE__,
);
const defaults: Preferences = { interface: setupLanguage, feedback: setupLanguage };
const noSavedPreferences: SavedPreferences = { interface: undefined, feedback: undefined };
const listeners = new Set<() => void>();
const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

function supportedLocale(value: unknown): Locale | undefined {
  return CONTROL_LOCALES.find((locale) => locale === value);
}

export function normalizeLocale(value: unknown): Locale {
  return supportedLocale(value) ?? 'en';
}

function readSavedPreferences(): SavedPreferences {
  try {
    const raw: unknown = JSON.parse(
      globalThis.localStorage.getItem(CONTROL_LANGUAGE_KEY) ?? 'null',
    );
    if (raw === null || typeof raw !== 'object') return noSavedPreferences;
    return {
      interface: supportedLocale('interface' in raw ? raw.interface : undefined),
      feedback: supportedLocale('feedback' in raw ? raw.feedback : undefined),
    };
  } catch {
    return noSavedPreferences;
  }
}

let saved = readSavedPreferences();
let current: Preferences = {
  interface: saved.interface ?? defaults.interface,
  feedback: saved.feedback ?? defaults.feedback,
};

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
  if (saved[scope] === locale) return;
  saved = { ...saved, [scope]: locale };
  try {
    globalThis.localStorage.setItem(CONTROL_LANGUAGE_KEY, JSON.stringify(saved));
  } catch {
    // The current session can still use the choice if local storage is unavailable.
  }
  if (current[scope] === locale) return;
  current = { ...current, [scope]: locale };
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
  return useCallback(
    (source: string, values?: Values) => translate(prefs, 'interface', source, values),
    [prefs],
  );
}

export function useFeedbackText(): (source: string, values?: Values) => string {
  const prefs = useLanguages();
  return (source, values) => translate(prefs, 'feedback', source, values);
}

/** For action callbacks that are not React components. */
export function feedback(source: string, values?: Values): string {
  return translate(current, 'feedback', source, values);
}
