import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-G` — `auditionSounds`, the Designer TIMELINE's sound: while the
 * transport PLAYS, each sound plays from where the playhead is in it, at ITS place — an entrance
 * sound from the active range's first frame, a timed one `ms` later, an exit sound from the out
 * point — and is silent outside it; a scrub or step (`playing: false`) is silent. jsdom has no
 * media stack, so `play` / `pause` and every `currentTime` write are recorded per node.
 */

const { createRuntime } = await import('../src/runtime.js');

const T = {
  position: { x: 0, y: 0 },
  size: { w: 0, h: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
};

function audio(id: string, start: unknown, durationMs = 1000): Element {
  return {
    id,
    name: id,
    type: 'audio',
    transform: T,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: `asset-${id}`,
    durationMs,
    start,
    volumeDb: 0,
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
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 60 },
    editorBackdrop: 'transparent',
    layers: [{ id: 'l', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
  } as unknown as Scene;
}

/** Per element id: is it playing, and the last position it was seated at. */
const state = new Map<string, { playing: boolean; at: number | null }>();
const idOf = (n: HTMLMediaElement): string => n.dataset['cgElementId'] ?? '?';
const of = (id: string) => state.get(id) ?? { playing: false, at: null };

beforeEach(() => {
  state.clear();
  document.body.innerHTML = '';
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    state.set(idOf(this), { ...of(idOf(this)), playing: true });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    state.set(idOf(this), { ...of(idOf(this)), playing: false });
  });
  const positions = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return positions.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, v: number) {
      positions.set(this, v);
      state.set(idOf(this), { ...of(idOf(this)), at: v });
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>)['currentTime'];
  document.body.innerHTML = '';
});

function boot(children: Element[]) {
  return createRuntime(scene(children), { skipFontLoad: true, installGlobals: false });
}

describe('the timeline plays each sound at its place', () => {
  it('an ENTRANCE sound plays from the playhead’s position in it, and stops outside it', () => {
    const r = boot([audio('in', { at: 'entrance' })]);
    r.auditionSounds({ playing: true, frame: 10 }); // 10 frames = 0.2 s into it
    expect(of('in')).toEqual({ playing: true, at: 0.2 });
    r.auditionSounds({ playing: true, frame: 60 }); // 1.2 s — past its 1 s
    expect(of('in').playing).toBe(false);
    r.remove();
  });

  it('a TIMED sound starts `ms` after the entrance; an EXIT sound at the out point', () => {
    const r = boot([audio('timed', { at: 'time', ms: 400 }), audio('out', { at: 'exit' })]);
    r.auditionSounds({ playing: true, frame: 10 }); // 0.2 s: before the timed one's 0.4 s
    expect(of('timed').playing).toBe(false);
    expect(of('out').playing).toBe(false);
    r.auditionSounds({ playing: true, frame: 25 }); // 0.5 s
    expect(of('timed')).toEqual({ playing: true, at: 0.1 });
    r.auditionSounds({ playing: true, frame: 65 }); // out point 60 → 0.1 s into the exit sound
    expect(of('out')).toEqual({ playing: true, at: 0.1 });
    r.remove();
  });

  it('🔴 a scrub or a step (`playing: false`) is SILENT, and stopping silences what plays', () => {
    const r = boot([audio('in', { at: 'entrance' })]);
    r.auditionSounds({ playing: false, frame: 10 });
    expect(of('in').playing).toBe(false);
    r.auditionSounds({ playing: true, frame: 10 });
    expect(of('in').playing).toBe(true);
    r.auditionSounds({ playing: false, frame: 11 });
    expect(of('in').playing).toBe(false);
    r.remove();
  });

  it('a jump of the playhead (a loop wrap) re-seats the sound; a frame’s step does not', () => {
    const r = boot([audio('in', { at: 'entrance' }, 3000)]);
    r.auditionSounds({ playing: true, frame: 40 });
    expect(of('in').at).toBe(0.8);
    // The media clock moves with real time; the next frame finds it where it should be.
    (document.querySelector('audio') as HTMLMediaElement).currentTime = 0.82;
    r.auditionSounds({ playing: true, frame: 41 });
    expect(of('in').at).toBe(0.82); // left alone — no stutter
    r.auditionSounds({ playing: true, frame: 2 }); // wrapped to the start
    expect(of('in').at).toBe(0.04);
    r.remove();
  });
});
