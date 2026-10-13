// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime, installCasparGlobals } from '@cg/template-runtime';
import { Preview } from '../src/platform/preview.js';

/**
 * Session Z — A CONTROL THAT CANNOT BE EXECUTED MUST NOT VANISH.
 *
 * The preview document's play/update/stop/out/next branches used to be gated on
 * `typeof window.<name> === 'function'`. That guard drops a command with no diagnostic
 * anywhere — and for `stop` it cannot even detect the fault it exists to catch, because
 * lib.dom ALWAYS defines `window.stop` (the page-load canceller): the guard reads
 * "installed", the native no-op runs, and the operator sees a dead button. This file
 * runs the REAL generated preview document (the same string the modal and the canvas
 * load) and pins that every undeliverable control now reports on the existing
 * `cg-preview-error` channel — the one the host logs as `[cg-preview]`.
 */

const T = {
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 400, h: 60 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
} as const;

const bg: Element = {
  ...T,
  id: 'bg',
  name: 'bg',
  type: 'shape',
  shape: 'rect',
  fill: { kind: 'solid', color: '#FF0000' },
} as unknown as Element;

/** A shape whose `fill` is malformed — the scene builder throws on it. */
const brokenBg: Element = {
  ...T,
  id: 'bg',
  name: 'bg',
  type: 'shape',
  shape: 'rect',
  fill: 'not-a-fill',
} as unknown as Element;

function scene(child: Element = bg): Scene {
  return {
    schemaVersion: 1,
    id: 'silence',
    name: 'silence',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'l',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [child],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

interface Posted {
  kind?: string;
  label?: string;
  payload?: string;
}

const posted: Posted[] = [];
const errors = (label: string): Posted[] =>
  posted.filter((m) => m.kind === 'cg-preview-error' && m.label === label);

/**
 * Each boot registers its own 'message' listener on the SHARED test window, so an
 * earlier document would still answer (from its own, now-stale, runtime) and muddy the
 * next case. Capture what each boot registers and unregister it between tests.
 */
const booted: ((e: Event) => void)[] = [];
let capturing = false;
const realAdd = window.addEventListener.bind(window);
window.addEventListener = ((type: string, h: (e: Event) => void, o?: unknown) => {
  if (capturing && type === 'message') booted.push(h);
  realAdd(type, h as EventListener, o as never);
}) as typeof window.addEventListener;

/** Run the document's module script with the real runtime injected for its import. */
function bootPreviewDoc(s: Scene): void {
  const p = new Preview({ cgJs: '', cgCss: '' });
  const { html } = p.load(s, true, false);
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  if (m === null) throw new Error('the preview document has no module script');
  const body = (m[1] as string).replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  capturing = true;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('createRuntime', 'installCasparGlobals', body) as (
    a: unknown,
    b: unknown,
  ) => void;
  fn(createRuntime, installCasparGlobals);
}

const post = (msg: Record<string, unknown>): void => {
  window.dispatchEvent(
    new MessageEvent('message', { data: { kind: 'cg-preview', ...msg } }) as unknown as Event,
  );
};

const settle = async (ms = 60): Promise<void> => {
  await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const w = (): Record<string, unknown> => window as unknown as Record<string, unknown>;

beforeEach(() => {
  posted.length = 0;
  // happy-dom makes `window.parent === window`, which the document reads as "no host to
  // report to". Stand in a host so the diagnostics are observable.
  Object.defineProperty(window, 'parent', {
    value: { postMessage: (msg: Posted) => posted.push(msg) },
    configurable: true,
  });
  document.body.innerHTML = '';
  document.body.className = '';
});

afterEach(() => {
  capturing = false;
  for (const h of booted.splice(0)) window.removeEventListener('message', h as EventListener);
  document.body.innerHTML = '';
  document.body.className = '';
  delete w()['cg'];
  delete w()['out'];
  delete w()['play'];
});

describe('an undeliverable control reports instead of vanishing', () => {
  it('a stale/absent global makes stop and out report on cg-preview-error', async () => {
    bootPreviewDoc(scene());
    await settle(150);
    expect(w()['cg']).toBeDefined();

    // A healthy control is silent — no diagnostic noise on the normal path.
    post({ action: 'play', fields: {} });
    await settle();
    post({ action: 'stop' });
    await settle();
    expect(errors('control.dropped')).toHaveLength(0);

    // THE FAULT: the globals no longer belong to this document's runtime.
    w()['cg'] = {};
    post({ action: 'stop' });
    await settle();
    post({ action: 'out' });
    await settle();
    const dropped = errors('control.dropped').map((e) => e.payload ?? '');
    expect(dropped).toHaveLength(2);
    expect(dropped[0]).toContain('stop');
    expect(dropped[0]).toContain('stale runtime');
    expect(dropped[1]).toContain('out');
  });

  it('window.stop is a function even with nothing installed — why the old guard could not see this', () => {
    // The point of the whole change: `typeof window.stop === 'function'` is TRUE on a bare
    // document, so the guard it used to gate the branch on could never distinguish an
    // installed control from lib.dom's page-load canceller. `window.out` (not a DOM
    // global) is the honest half of the pair, and it is the half that reported nothing.
    delete w()['cg'];
    expect(typeof window.stop).toBe('function');
    expect(typeof w()['out']).toBe('undefined');
  });

  it('an uninstalled next reports rather than doing nothing', async () => {
    bootPreviewDoc(scene());
    await settle(150);
    delete w()['next'];
    post({ action: 'next' });
    await settle();
    expect(errors('control.dropped')[0]?.payload).toContain('not installed');
  });
});

describe('a boot build that throws still leaves a document that listens', () => {
  it('reports boot.applyScene and keeps handling messages afterwards', async () => {
    bootPreviewDoc(scene(brokenBg));
    await settle(150);
    // The build failed — and said so, instead of aborting the module silently.
    expect(errors('boot.applyScene')).toHaveLength(1);
    // …and the message listener below that await is alive, so the host can repair the
    // document with the next scene-replace instead of owning a permanently deaf iframe.
    post({ action: 'scene-replace', scene: scene() });
    await settle(150);
    expect(document.querySelectorAll('[data-cg-element-id="bg"]').length).toBe(1);
    post({ action: 'play', fields: {} });
    await settle();
    expect(errors('control.dropped')).toHaveLength(0);
  });
});
