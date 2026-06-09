import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime } from '../src/runtime.js';
import { installCasparGlobals } from '../src/adapters/caspar-globals.js';
import { lowerThirdScene } from './fixtures.js';

describe('installCasparGlobals', () => {
  let uninstall: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  afterEach(() => {
    uninstall?.();
    uninstall = null;
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('installs window.play / update / stop / next / remove', () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    expect(typeof window.play).toBe('function');
    expect(typeof window.update).toBe('function');
    expect(typeof window.stop).toBe('function');
    expect(typeof window.next).toBe('function');
    expect(typeof window.remove).toBe('function');
    expect(window.cg).toBe(runtime);
  });

  it('window.play(JSON) routes to runtime.play()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.play?.('{"anchor":"از CasparCG"}');
    await new Promise((r) => setTimeout(r, 0));
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('از CasparCG');
    expect(document.body.classList.contains('cg-pending')).toBe(false);
  });

  it('window.update(JSON) routes to runtime.update()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.play?.('{"anchor":"first"}');
    await new Promise((r) => setTimeout(r, 0));
    window.update?.('{"anchor":"second"}');
    await new Promise((r) => setTimeout(r, 0));
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('second');
  });

  it('window.stop() routes to runtime.stop()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.play?.('{}');
    await new Promise((r) => setTimeout(r, 0));
    window.stop?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('parses CasparCG legacy XML payloads and ignores unknown keys', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.play?.(
      '<templateData>' +
        '<componentData id="anchor"><data id="text" value="از XML"/></componentData>' +
        '<componentData id="nope"><data id="text" value="ignored"/></componentData>' +
        '</templateData>',
    );
    await new Promise((r) => setTimeout(r, 0));
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('از XML'); // unknown "nope" key harmlessly dropped
  });

  it('window.update accepts an already-parsed object (Chrome console use)', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.play?.('{}');
    await new Promise((r) => setTimeout(r, 0));
    window.update?.({ anchor: 'از آبجکت' });
    await new Promise((r) => setTimeout(r, 0));
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('از آبجکت');
  });

  it('drops malformed JSON without throwing', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    expect(() => window.play?.('{not json')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    // Falls back to default
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('سارا نادری');
  });

  it('uninstall removes the globals it added', () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const off = installCasparGlobals(runtime);
    expect(window.cg).toBe(runtime);
    off();
    expect(window.cg).toBeUndefined();
    expect(window.play).toBeUndefined();
  });
});
