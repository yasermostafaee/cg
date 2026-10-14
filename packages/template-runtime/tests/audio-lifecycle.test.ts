import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * 🔴 `D-165` — the audio element through the REAL runtime lifecycle, on the injected clock: an
 * entrance sound at PLAY, a timed one at its moment, an exit sound at STOP — and NOTHING on a hard
 * Clear (`remove()`), on a scrub (`tick`), or from a hidden element. jsdom has no media stack, so
 * `HTMLMediaElement.play/pause` are recorded per node; with no Web Audio the page's mute falls back
 * to the element's own `muted`, which is what the PVW-silence case reads.
 */

const { createRuntime } = await import('../src/runtime.js');
const { setSoundMuted } = await import('../src/audio-graph.js');

function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number) => {
      rafs.delete(h);
    },
    setTimeout: (cb: () => void, delay: number) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (delta: number) => {
      ms += delta;
      const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, cb] of round) cb(ms);
    },
  };
}

async function run(clock: ReturnType<typeof makeClock>, totalMs: number, step = 20): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 0, h: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
};

function audio(id: string, start: unknown, o: { visible?: boolean } = {}): Element {
  return {
    id,
    name: id,
    type: 'audio',
    transform: baseTransform,
    opacity: 1,
    visible: o.visible ?? true,
    locked: false,
    zIndex: 0,
    assetId: `asset-${id}`,
    durationMs: 1500,
    start,
    volumeDb: 0,
  } as unknown as Element;
}

function bgShape(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#123456' },
    transform: { ...baseTransform, size: { w: 400, h: 200 } },
    opacity: 0,
    visible: true,
    locked: false,
    zIndex: 0,
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 50, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
  } as unknown as Scene;
}

/** Every `play()` / `pause()` on an `<audio>`, by element id, in order. */
let heard: string[] = [];
const idOf = (node: HTMLMediaElement): string => node.dataset['cgElementId'] ?? '?';

beforeEach(() => {
  heard = [];
  document.body.innerHTML = '';
  document.body.className = '';
  setSoundMuted(false);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (this.tagName === 'AUDIO') heard.push(`play:${idOf(this)}`);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    if (this.tagName === 'AUDIO') heard.push(`pause:${idOf(this)}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const plays = (): string[] => heard.filter((h) => h.startsWith('play:'));
const onAir = (): boolean => !document.body.classList.contains('cg-pending');

function boot(
  children: Element[],
  clock: ReturnType<typeof makeClock>,
  assetUrls?: Record<string, string>,
) {
  return createRuntime(scene(children), {
    skipFontLoad: true,
    installGlobals: false,
    clock,
    ...(assetUrls !== undefined ? { assetUrls } : {}),
  });
}

describe('D-165 — the audio element in the runtime lifecycle', () => {
  it('builds a never-painted <audio> per sound, carrying its asset id', () => {
    const clock = makeClock();
    const r = boot([audio('in', { at: 'entrance' })], clock, { 'asset-in': 'blob:in.wav' });
    const node = document.querySelector<HTMLAudioElement>('audio[data-cg-element-id="in"]');
    expect(node).not.toBeNull();
    expect(node!.style.display).toBe('none');
    expect(node!.dataset['cgAssetId']).toBe('asset-in');
    // The export path's map sets the src, as it does an image's and a video's.
    expect(node!.getAttribute('src')).toBe('blob:in.wav');
    r.remove();
  });

  it('🔴 PLAY starts the entrance sound at once and the timed one at its moment; the exit sound waits', async () => {
    const clock = makeClock();
    const r = boot(
      [
        bgShape('bg'),
        audio('in', { at: 'entrance' }),
        audio('t', { at: 'time', ms: 300 }),
        audio('out', { at: 'exit' }),
      ],
      clock,
    );
    await r.play({});
    await run(clock, 20);
    expect(plays()).toEqual(['play:in']);
    await run(clock, 300);
    expect(plays()).toEqual(['play:in', 'play:t']);
    await run(clock, 1000);
    expect(plays()).not.toContain('play:out');
    r.remove();
  });

  it('🔴 STOP starts the exit sound, and the exit is not held by it; the settle does not cut it', async () => {
    const clock = makeClock();
    // A long entrance sound (15 s) is still playing when the exit comes — the control below.
    const longIn = { ...audio('in', { at: 'entrance' }), durationMs: 15_000 } as Element;
    const r = boot([bgShape('bg'), longIn, audio('out', { at: 'exit' })], clock);
    await r.play({});
    await run(clock, 1200);
    heard = [];
    const stopP = r.stop();
    await run(clock, 20);
    expect(plays()).toEqual(['play:out']);
    await run(clock, 2000);
    await stopP;
    expect(onAir()).toBe(false); // the graphic left on its own timing
    // The settle stopped every driver: the INSTRUMENT is live — it cut the entrance sound…
    expect(heard).toContain('pause:in');
    // …and it never touched the exit sound.
    expect(heard).not.toContain('pause:out');
    r.remove();
  });

  it('🔴 a HARD CLEAR (remove) plays NO exit sound', async () => {
    const clock = makeClock();
    const r = boot([bgShape('bg'), audio('out', { at: 'exit' })], clock);
    await r.play({});
    await run(clock, 600);
    heard = [];
    r.remove();
    await run(clock, 2000);
    expect(plays()).toEqual([]);
  });

  it('a scrub (tick) and a hidden sound make no sound', async () => {
    const clock = makeClock();
    const r = boot(
      [
        bgShape('bg'),
        audio('in', { at: 'entrance' }),
        audio('h', { at: 'entrance' }, { visible: false }),
      ],
      clock,
    );
    for (const f of [0, 10, 25, 40]) r.tick(f);
    expect(plays()).toEqual([]);
    await r.play({});
    await run(clock, 40);
    expect(plays()).toEqual(['play:in']); // never the hidden one
    r.remove();
  });

  it("🔴 the host's mute (CG Control's PVW) silences the page's sounds; unmuting restores them", async () => {
    const clock = makeClock();
    const r = boot([bgShape('bg'), audio('in', { at: 'entrance' })], clock);
    setSoundMuted(true);
    await r.play({});
    await run(clock, 40);
    const node = document.querySelector<HTMLAudioElement>('audio[data-cg-element-id="in"]')!;
    expect(node.muted).toBe(true);
    setSoundMuted(false);
    expect(node.muted).toBe(false);
    r.remove();
  });
});
