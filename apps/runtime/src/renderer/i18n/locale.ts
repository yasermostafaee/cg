import { useCallback, useSyncExternalStore } from 'react';
import ar from './catalogs/ar.json';
import en from './catalogs/en.json';
import fa from './catalogs/fa.json';
import {
  CONTROL_INSTALL_REQUEST_MAX_LENGTH,
  CONTROL_INSTALL_REQUEST_PATTERN,
  CONTROL_LANGUAGE_KEY,
  CONTROL_LOCALES,
} from './localePreferences.js';

export { CONTROL_LOCALES };
export type Locale = (typeof CONTROL_LOCALES)[number];
type LanguageScope = 'interface' | 'feedback';
type Messages = Readonly<Record<string, string>>;
type Catalog = Readonly<Record<LanguageScope, Messages>>;
type Preferences = Readonly<Record<LanguageScope, Locale>>;
type SavedPreferences = Readonly<
  Record<LanguageScope, Locale | undefined> & { setupRequest: string | undefined }
>;
type Values = Readonly<Record<string, string | number>>;

const bundled: Readonly<Record<Locale, Catalog>> = { en, fa, ar };
const setup = globalThis as {
  __CG_INSTALL_LANGUAGE__?: unknown;
  __CG_INSTALL_LANGUAGE_REQUEST__?: unknown;
};
const setupLanguage = supportedLocale(setup.__CG_INSTALL_LANGUAGE__);
const preferred = setupLanguage ?? 'en';
const defaults: Preferences = { interface: preferred, feedback: preferred };
const noSavedPreferences: SavedPreferences = {
  interface: undefined,
  feedback: undefined,
  setupRequest: undefined,
};
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

function supportedSetupRequest(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length <= CONTROL_INSTALL_REQUEST_MAX_LENGTH &&
    CONTROL_INSTALL_REQUEST_PATTERN.test(value)
    ? value
    : undefined;
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
      setupRequest: supportedSetupRequest('setupRequest' in raw ? raw.setupRequest : undefined),
    };
  } catch {
    return noSavedPreferences;
  }
}

function storePreferences(prefs: SavedPreferences): void {
  try {
    globalThis.localStorage.setItem(CONTROL_LANGUAGE_KEY, JSON.stringify(prefs));
  } catch {
    // The current session can still use the choice if local storage is unavailable.
  }
}

let saved = readSavedPreferences();
const setupRequest = supportedSetupRequest(setup.__CG_INSTALL_LANGUAGE_REQUEST__);
if (
  setupLanguage !== undefined &&
  setupRequest !== undefined &&
  setupRequest !== saved.setupRequest
) {
  saved = { interface: setupLanguage, feedback: setupLanguage, setupRequest };
  storePreferences(saved);
}
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
  storePreferences(saved);
  if (current[scope] === locale) return;
  current = { ...current, [scope]: locale };
  for (const listener of listeners) listener();
}

function own(messages: Messages, source: string): string | undefined {
  return Object.hasOwn(messages, source) ? messages[source] : undefined;
}

function catalogText(locale: Locale, scope: LanguageScope, source: string): string | undefined {
  const catalog = bundled[locale];
  return (
    own(catalog[scope], source) ??
    (scope === 'feedback' ? own(catalog.interface, source) : undefined)
  );
}

function translate(locale: Locale, scope: LanguageScope, source: string, values?: Values): string {
  const message = catalogText(locale, scope, source) ?? catalogText('en', scope, source) ?? source;
  if (values === undefined) return message;
  return message.replace(placeholder, (token: string, name: string) => {
    if (!Object.hasOwn(values, name)) return token;
    const value = String(values[name]);
    // Isolate authored names and technical values in a mixed-direction sentence.
    return localeDirection(locale) === 'rtl' ? `\u2068${value}\u2069` : value;
  });
}

export function useUiText(): (source: string, values?: Values) => string {
  const locale = useLanguages().interface;
  return useCallback(
    (source: string, values?: Values) => translate(locale, 'interface', source, values),
    [locale],
  );
}

export function useFeedbackText(): (source: string, values?: Values) => string {
  const locale = useLanguages().feedback;
  return (source, values) => translate(locale, 'feedback', source, values);
}

/** For action callbacks that are not React components. */
export function feedback(source: string, values?: Values): string {
  return translate(current.feedback, 'feedback', source, values);
}

/** Source wording for diagnostic records and helpers that are independent of the console. */
export function englishFeedback(source: string, values?: Values): string {
  return translate('en', 'feedback', source, values);
}

/** Resolve an exact operator feedback entry without falling back to source prose. */
export function knownFeedback(source: string): string | undefined {
  return catalogText(current.feedback, 'feedback', source);
}

/** Convert raw peer or exception prose to a localized operator message. */
export function feedbackProblem(source: string | undefined, fallback = 'Request failed.'): string {
  if (source !== undefined && source.trim() !== '') {
    if (current.feedback === 'en') return feedback(source);
    const localized = knownFeedback(source.trim());
    if (localized !== undefined) return localized;
  }
  return current.feedback === 'en'
    ? feedback(fallback)
    : (knownFeedback(fallback) ?? feedback('Request failed.'));
}

/** A translatable application exception carrying its parameters independently of `message`. */
export class FeedbackError extends Error {
  constructor(
    readonly source: string,
    readonly values?: Values,
  ) {
    super(englishFeedback(source, values));
  }
}

export function feedbackFailure(error: unknown, fallback?: string): string {
  if (error instanceof FeedbackError) {
    return current.feedback === 'en' || knownFeedback(error.source) !== undefined
      ? feedback(error.source, error.values)
      : feedbackProblem(undefined, fallback);
  }
  return feedbackProblem(error instanceof Error ? error.message : undefined, fallback);
}

export function feedbackLocale(): Locale {
  return current.feedback;
}
