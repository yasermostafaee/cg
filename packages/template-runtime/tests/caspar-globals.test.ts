import { withCgControl } from '@cg/shared-schema';
import { Window as HappyWindow } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('applies explicit transition packets directly to each resident pass without mirroring them', () => {
    const postMessage = vi.fn();
    const installPass = (pass: 'background' | 'foreground') => {
      const win = new HappyWindow({
        url: `http://localhost/template?cgpass=${pass}&cgsync=paired`,
      }) as unknown as Window & typeof globalThis;
      Object.defineProperty(win, 'BroadcastChannel', {
        value: class {
          postMessage = postMessage;
          addEventListener = vi.fn();
          close = vi.fn();
        },
      });
      const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
      const update = vi.spyOn(runtime, 'update').mockResolvedValue(undefined);
      return { win, update, uninstall: installCasparGlobals(runtime, win) };
    };
    const background = installPass('background');
    const foreground = installPass('foreground');
    const from = { x: 10, y: 20, width: 100, height: 80 };
    const to = { ...from, x: 70 };
    const frameKey = 'frame-1';
    const framePlacements = [{ frameKey, rect: to }];
    const phase = withCgControl(
      {},
      {
        frameTransition: {
          durationMs: 400,
          easing: 'linear',
          frames: [{ frameKey, from, to, fromOpacity: 1, toOpacity: 1 }],
        },
      },
    );
    const release = withCgControl({}, { frameTransition: null, framePlacements });

    try {
      for (const { win, update } of [background, foreground]) {
        win.update?.(JSON.stringify(phase));
        win.update?.(JSON.stringify(release));
        expect(update.mock.calls).toEqual([[phase], [release]]);
      }
      expect(postMessage).not.toHaveBeenCalled();

      const manualUpdate = withCgControl({ anchor: 'مهمان' }, { framePlacements });
      background.win.update?.(JSON.stringify(manualUpdate));
      background.win.next?.();
      expect(postMessage.mock.calls).toEqual([
        [{ verb: 'update', fields: manualUpdate }],
        [{ verb: 'next', fields: undefined }],
      ]);
    } finally {
      background.uninstall();
      foreground.uninstall();
    }
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
