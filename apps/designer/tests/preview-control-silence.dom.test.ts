// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClockElement, Element, Scene, TextElement } from '@cg/shared-schema';
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
function bootPreviewDoc(s: Scene, broadcast = true): void {
  const p = new Preview({ cgJs: '', cgCss: '' });
  const { html } = p.load(s, broadcast, false);
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  if (m === null) throw new Error('the preview document has no module script');
  const body = (m[1] as string).replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  capturing = true;
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
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

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
  (w()['cg'] as ReturnType<typeof createRuntime> | undefined)?.remove?.();
  document.body.innerHTML = '';
  document.body.className = '';
  delete w()['cg'];
  delete w()['out'];
  delete w()['play'];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
});

describe('D-173 — dedicated Preview Reset ends the actual rehearsal', () => {
  function resetScene(): Scene {
    const font = {
      family: 'Arial',
      weight: 400,
      style: 'normal' as const,
      size: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
    };
    const s = scene({
      ...bg,
      animation: {
        tracks: {
          opacity: {
            keyframes: [
              { frame: 0, value: 1, easing: 'linear' },
              { frame: 10, value: 1, easing: 'linear' },
              { frame: 100, value: 0, easing: 'linear' },
            ],
          },
        },
      },
    });
    s.frameRange.out = 100;
    s.lifecycle = { outPoint: 10 };
    s.playout = { mode: 'manual', holdSource: 'timed', holdMs: 0 };
    s.layers[0]!.children.push(
      {
        ...T,
        id: 'headline',
        name: 'Headline',
        type: 'text',
        text: 'Default headline',
        font,
        color: '#ffffff',
        align: 'start',
        direction: 'ltr',
      } as TextElement,
      {
        ...T,
        id: 'clock',
        name: 'Clock',
        type: 'clock',
        mode: 'countdown',
        target: { kind: 'duration', ms: 10_000 },
        afterZero: 'hold',
        font,
        color: '#ffffff',
        align: 'center',
        verticalAlign: 'middle',
        format: 'HH:mm:ss',
        digits: 'latin',
      } as ClockElement,
    );
    s.fields = [
      {
        id: 'headline',
        label: 'Headline',
        type: 'text',
        required: false,
        default: 'Default headline',
      },
    ];
    s.bindings = [{ fieldId: 'headline', target: { kind: 'text', elementId: 'headline' } }];
    return s;
  }

  it.each(['playing', 'paused', 'closing'] as const)(
    'immediately removes %s content, restores defaults and waits for explicit Play',
    async (state) => {
      bootPreviewDoc(resetScene());
      await settle();
      post({ action: 'play', fields: { headline: 'Prepared headline' } });
      await settle(500);
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
        'Prepared headline',
      );
      if (state === 'paused') post({ action: 'pause' });
      if (state === 'closing') post({ action: 'stop' });
      await settle(40);
      // Positive control: the authored 3.6-second outro has not finished by itself.
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      const oldRuntime = w()['cg'];
      const oldClock = document.querySelector('[data-cg-clock-time]')!;
      const oldBackground = document.querySelector<HTMLElement>('[data-cg-element-id="bg"]')!;
      post({ action: 'reset' });
      expect(oldBackground.isConnected).toBe(false);
      const frozenClock = oldClock.textContent;
      const frozenBackground = oldBackground.style.opacity;
      await settle();
      expect(w()['cg']).not.toBe(oldRuntime);
      expect(document.body.classList.contains('cg-pending')).toBe(true);
      expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
        'Default headline',
      );
      await settle(1_100);
      expect(oldClock.textContent).toBe(frozenClock);
      expect(oldBackground.style.opacity).toBe(frozenBackground);
      expect(document.body.classList.contains('cg-pending')).toBe(true);
      post({ action: 'play', fields: {} });
      await settle();
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      expect(document.querySelector('[data-cg-clock-time]')?.textContent).toBe('00:00:10');
      expect(errors('message.handler')).toHaveLength(0);
    },
  );

  it('cancels a pending old Play and orders an explicit new Play after Reset', async () => {
    bootPreviewDoc(resetScene());
    await settle();
    post({ action: 'play', fields: { headline: 'Old pending data' } });
    post({ action: 'reset' });
    await settle();
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
      'Default headline',
    );
    post({ action: 'reset' });
    post({ action: 'play', fields: { headline: 'Fresh explicit data' } });
    await settle();
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
      'Fresh explicit data',
    );
    expect(errors('control.dropped')).toHaveLength(0);
    expect(errors('message.handler')).toHaveLength(0);
  });

  it('keeps the latest duplicate Reset seed, then applies a following Update before Play', async () => {
    bootPreviewDoc(resetScene());
    await settle();
    post({ action: 'reset', fields: { headline: 'Obsolete reset seed' } });
    post({ action: 'reset', fields: { headline: 'Latest reset seed' } });
    await settle();
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
      'Latest reset seed',
    );
    post({ action: 'update', fields: { headline: 'Fresh update' } });
    post({ action: 'play', fields: { headline: 'Fresh update' } });
    await settle();
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
      'Fresh update',
    );
    expect(errors('message.handler')).toHaveLength(0);
    expect(errors('control.dropped')).toHaveLength(0);
  });

  it('cancels Play already awaiting a font without reviving content after Reset', async () => {
    const s = resetScene();
    s.fonts = [
      { family: 'asset-reset-font', source: 'bundled', weights: [400], styles: ['normal'] },
    ];
    bootPreviewDoc(s);
    await settle();
    let release!: (buffer: ArrayBuffer) => void;
    const waiting = new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
    const fetchFont = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(await waiting));
    vi.stubGlobal('fetch', fetchFont);
    vi.stubGlobal(
      'FontFace',
      class {
        load() {
          return Promise.resolve(this);
        }
      },
    );
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        add: vi.fn<FontFaceSet['add']>(),
        addEventListener: vi.fn<FontFaceSet['addEventListener']>(),
        removeEventListener: vi.fn<FontFaceSet['removeEventListener']>(),
      },
    });
    post({ action: 'asset-urls', assetUrls: { 'reset-font': 'https://example.test/font.woff2' } });
    await settle(10);
    post({ action: 'play', fields: { headline: 'Old awaiting Play' } });
    await settle(10);
    expect(fetchFont.mock.calls.length).toBeGreaterThanOrEqual(2);
    post({ action: 'reset', fields: { headline: 'Reset seed' } });
    release(new ArrayBuffer(0));
    await settle();
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
      'Reset seed',
    );
    expect(errors('font.load')).toHaveLength(0);
    expect(errors('message.handler')).toHaveLength(0);
  });

  it('restores the exact seeded repeater rows instead of old values or authored fallbacks', async () => {
    const s = resetScene();
    const child = resetScene();
    child.id = 'reset-row';
    child.layers[0]!.children = [child.layers[0]!.children[1]!];
    s.compositions = [child];
    s.layers[0]!.children.push({
      ...T,
      id: 'rows',
      name: 'Rows',
      type: 'repeater',
      compositionId: child.id,
      direction: 'column',
      flow: 'ltr',
      gap: 0,
      items: [{ id: 'row-1', headline: 'Authored row' }],
    } as Element);
    s.fields!.push({
      id: 'rows',
      label: 'Rows',
      type: 'list',
      required: false,
      default: [{ id: 'row-1', headline: 'Authored row' }],
    });
    s.bindings!.push({ fieldId: 'rows', target: { kind: 'repeater-items', elementId: 'rows' } });
    bootPreviewDoc(s);
    await settle();
    post({ action: 'play', fields: { rows: [{ id: 'old', headline: 'Old applied row' }] } });
    await settle();
    expect(document.querySelector('[data-cg-element-id="rows"]')?.textContent).toContain(
      'Old applied row',
    );
    post({
      action: 'reset',
      fields: {
        rows: [
          { id: 'file-1', headline: 'Connected first row' },
          { id: 'file-2', headline: 'Connected second row' },
        ],
      },
    });
    await settle();
    const rows = document.querySelector('[data-cg-element-id="rows"]')!;
    expect(rows.textContent).toContain('Connected first row');
    expect(rows.textContent).toContain('Connected second row');
    expect(rows.textContent).not.toContain('Old applied row');
    expect(rows.textContent).not.toContain('Authored row');
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('still reports a genuine current-generation failure after Reset', async () => {
    bootPreviewDoc(resetScene());
    await settle();
    post({ action: 'reset' });
    post({ action: 'scene-replace', scene: scene(brokenBg) });
    await settle();
    expect(errors('message.handler')).toHaveLength(1);
    expect(errors('message.handler')[0]?.payload).toContain('scene-replace');
  });

  it('keeps the authoring Canvas field-only Reset and its existing runtime', async () => {
    bootPreviewDoc(resetScene(), false);
    await settle();
    const original = w()['cg'];
    post({ action: 'update', fields: { headline: 'Canvas data' } });
    await settle();
    post({ action: 'reset' });
    await settle();
    expect(w()['cg']).toBe(original);
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    expect(document.querySelector('[data-cg-element-id="headline"]')?.textContent).toBe(
      'Default headline',
    );
  });
});

describe('an undeliverable control reports instead of vanishing', () => {
  it('starts a fresh accelerated rehearsal on each Play, without changing the actual deadline', async () => {
    const deadline = new Date(Date.now() + 15_000).toISOString();
    const s = scene({
      ...T,
      id: 'clock',
      name: 'Clock',
      type: 'clock',
      mode: 'countdown',
      target: { kind: 'datetime', iso: deadline },
      afterZero: 'close',
      font: {
        family: 'Arial',
        weight: 400,
        style: 'normal',
        size: 24,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      color: '#ffffff',
      align: 'center',
      verticalAlign: 'middle',
      format: 'HH:mm:ss',
      digits: 'latin',
    } as ClockElement);
    s.playout = { mode: 'auto-out', holdSource: 'content-driven' };
    bootPreviewDoc(s);
    await settle(50);
    post({ action: 'clock-rate', rate: 60 });
    await settle(40);
    post({ action: 'play', fields: {} });
    await settle(400);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    post({ action: 'play', fields: {} });
    await settle(20);
    const text = document.querySelector('[data-cg-clock-time]')?.textContent ?? '';
    expect(
      Number(text.split(':').at(-1)),
      'second rehearsal still has most of the real 15 seconds left',
    ).toBeGreaterThan(8);
    expect(s.layers[0]?.children[0]).toMatchObject({ target: { kind: 'datetime', iso: deadline } });
    post({ action: 'stop' });
    await settle(40);
  });

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
