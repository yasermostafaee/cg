// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const key = 'cg.runtime.language.v1';

afterEach(() => {
  localStorage.removeItem(key);
  vi.unstubAllGlobals();
});

async function readLanguages(seed: unknown, stored?: string, request?: unknown): Promise<unknown> {
  vi.resetModules();
  vi.stubGlobal('__CG_INSTALL_LANGUAGE__', seed);
  vi.stubGlobal('__CG_INSTALL_LANGUAGE_REQUEST__', request);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (stored !== undefined) localStorage.setItem(key, stored);

  const { useLanguages } = await import('../src/renderer/i18n/locale.js');
  const root = createRoot(document.createElement('div'));
  let observed: unknown;
  function Read(): null {
    observed = useLanguages();
    return null;
  }
  await act(async () => root.render(createElement(Read)));
  await act(async () => root.unmount());
  return observed;
}

describe('CG Control installer language at document start', () => {
  it.each(['en', 'fa', 'ar'])('seeds both preferences with %s', async (seed) => {
    expect(await readLanguages(seed, undefined)).toEqual({ interface: seed, feedback: seed });
  });

  it('keeps valid stored preferences independently and uses the seed for a missing one', async () => {
    expect(await readLanguages('fa', '{"interface":"en","feedback":"invalid"}')).toEqual({
      interface: 'en',
      feedback: 'fa',
    });
  });

  it('keeps a previously saved feedback choice and seeds the missing interface', async () => {
    expect(await readLanguages('ar', '{"feedback":"fa"}')).toEqual({
      interface: 'ar',
      feedback: 'fa',
    });
  });

  it('uses the seed when the stored preferences are unreadable', async () => {
    expect(await readLanguages('fa', '{broken')).toEqual({ interface: 'fa', feedback: 'fa' });
  });

  it('persists only the chosen scope, including an explicit choice equal to the seed', async () => {
    await readLanguages('ar', undefined);
    const { setLanguage } = await import('../src/renderer/i18n/locale.js');
    setLanguage('feedback', 'en');
    expect(localStorage.getItem(key)).toBe('{"feedback":"en"}');
    setLanguage('interface', 'ar');
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({
      interface: 'ar',
      feedback: 'en',
    });
  });

  it('applies a different interactive setup request once and remembers later choices', async () => {
    const request = '1700000000-1';
    const upgraded = { interface: 'fa', feedback: 'fa' };
    const old = '{"interface":"en","feedback":"ar","setupRequest":"1600000000-1"}';
    expect(await readLanguages('fa', old, request)).toEqual(upgraded);
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({
      ...upgraded,
      setupRequest: request,
    });
    const { setLanguage } = await import('../src/renderer/i18n/locale.js');
    setLanguage('interface', 'en');
    setLanguage('feedback', 'ar');
    expect(await readLanguages('fa', undefined, request)).toEqual({
      interface: 'en',
      feedback: 'ar',
    });
    expect(await readLanguages('fa', undefined, '1700000000-2')).toEqual(upgraded);
  });

  it.each(['unknown', '1-'.repeat(96) + '1'])(
    'ignores an invalid installer request',
    async (request) => {
      const old = '{"interface":"en","feedback":"ar"}';
      expect(await readLanguages('fa', old, request)).toEqual({ interface: 'en', feedback: 'ar' });
      expect(localStorage.getItem(key)).toBe(old);
    },
  );

  it('does not acknowledge a request with an invalid selection', async () => {
    const old = '{"interface":"fa","feedback":"ar"}';
    expect(await readLanguages('invalid', old, '1700000000-1')).toEqual({
      interface: 'fa',
      feedback: 'ar',
    });
    expect(localStorage.getItem(key)).toBe(old);
  });

  it.each([undefined, 'invalid'])('defaults to English for seed %s', async (seed) => {
    expect(await readLanguages(seed, undefined)).toEqual({ interface: 'en', feedback: 'en' });
  });
});
