import { useSyncExternalStore } from 'react';
import ar from './catalogs/ar.json';
import en from './catalogs/en.json';
import fa from './catalogs/fa.json';

export const CONTROL_LOCALES = ['en', 'fa', 'ar'] as const;
export type Locale = (typeof CONTROL_LOCALES)[number];
export type LanguageScope = 'interface' | 'feedback';

type Messages = Readonly<Record<string, string>>;
interface Catalog {
  locale: Locale;
  interface: Messages;
  feedback: Messages;
}
interface Preferences {
  interface: Locale;
  feedback: Locale;
  overrides: Partial<Record<Locale, Catalog>>;
}
type Values = Readonly<Record<string, string | number>>;

const key = 'cg.runtime.language.v1';
const bundled: Readonly<Record<Locale, Catalog>> = {
  en: { ...en, locale: 'en' },
  fa: { ...fa, locale: 'fa' },
  ar: { ...ar, locale: 'ar' },
};
const defaults: Preferences = { interface: 'en', feedback: 'en', overrides: {} };
const listeners = new Set<() => void>();
const scopes: readonly LanguageScope[] = ['interface', 'feedback'];
const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fa' || value === 'ar';
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : 'en';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokens(message: string): string[] {
  return [...message.matchAll(placeholder)].map((match) => match[1] ?? '').sort();
}

/** Language files contain plain text and may override a subset of the bundled catalog. */
function catalogOf(value: unknown): Catalog | null {
  if (!isRecord(value) || !isLocale(value['locale'])) return null;
  const locale = value['locale'];
  const catalog: Catalog = { locale, interface: {}, feedback: {} };
  for (const scope of scopes) {
    const entries = value[scope];
    if (!isRecord(entries)) return null;
    const messages: Record<string, string> = {};
    for (const [source, translation] of Object.entries(entries)) {
      if (!Object.hasOwn(bundled.en[scope], source)) continue;
      if (typeof translation !== 'string' || translation.trim() === '') return null;
      if (tokens(source).join('\n') !== tokens(translation).join('\n')) return null;
      messages[source] = translation;
    }
    catalog[scope] = messages;
  }
  return catalog;
}

function readPreferences(): Preferences {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage.getItem(key) ?? 'null');
    if (!isRecord(raw)) return defaults;
    const overrides: Preferences['overrides'] = {};
    const rawOverrides = raw['overrides'];
    if (isRecord(rawOverrides)) {
      for (const locale of CONTROL_LOCALES) {
        const override = catalogOf(rawOverrides[locale]);
        if (override?.locale === locale) overrides[locale] = override;
      }
    }
    return {
      interface: normalizeLocale(raw['interface']),
      feedback: normalizeLocale(raw['feedback']),
      overrides,
    };
  } catch {
    return defaults;
  }
}

let current = readPreferences();

function publish(next: Preferences): void {
  current = next;
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota can prevent persistence for this console.
  }
  for (const listener of listeners) listener();
}

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
  if (current[scope] !== locale) publish({ ...current, [scope]: locale });
}

export function readLanguageFile(contents: string): boolean {
  try {
    const catalog = catalogOf(JSON.parse(contents.replace(/^\uFEFF/, '')));
    if (catalog === null) return false;
    publish({ ...current, overrides: { ...current.overrides, [catalog.locale]: catalog } });
    return true;
  } catch {
    return false;
  }
}

export function resetLanguageFile(locale: Locale): void {
  const overrides = { ...current.overrides };
  delete overrides[locale];
  publish({ ...current, overrides });
}

export function languageFile(locale: Locale): string {
  const catalog = bundled[locale];
  const overrides = current.overrides[locale];
  return `${JSON.stringify(
    {
      locale,
      interface: { ...en.interface, ...catalog.interface, ...overrides?.interface },
      feedback: { ...en.feedback, ...catalog.feedback, ...overrides?.feedback },
    },
    null,
    2,
  )}\n`;
}

function own(messages: Messages | undefined, key: string): string | undefined {
  return messages !== undefined && Object.hasOwn(messages, key) ? messages[key] : undefined;
}

function translate(
  prefs: Preferences,
  scope: LanguageScope,
  source: string,
  values?: Values,
): string {
  const locale = prefs[scope];
  const message =
    own(prefs.overrides[locale]?.[scope], source) ??
    own(bundled[locale][scope], source) ??
    own(bundled.en[scope], source) ??
    source;
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
