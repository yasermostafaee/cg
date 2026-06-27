import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

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
    cancel: (h: number) => rafs.delete(h),
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
async function run(clock: ReturnType<typeof makeClock>, total: number, step = 20): Promise<void> {
  let left = total;
  while (left > 0) {
    clock.advance(Math.min(step, left));
    left -= step;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}
const t = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const font = {
  family: 'Vazirmatn',
  weight: 600,
  style: 'normal',
  size: 48,
  lineHeight: 1.2,
  letterSpacing: 0,
};

function clockEl(id: string, visible: boolean): Element {
  return {
    id,
    name: id,
    type: 'clock',
    transform: t,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
    font,
    color: '#FFFFFF',
    align: 'center',
    mode: 'wall',
    format: 'ss',
    digits: 'latin',
  } as unknown as Element;
}
function seqEl(id: string, visible: boolean): Element {
  return {
    id,
    name: id,
    type: 'sequence',
    transform: t,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
    font: { ...font, size: 36, lineHeight: 1.4 },
    color: '#FFFFFF',
    align: 'start',
    direction: 'rtl',
    items: [
      { id: 'a', text: 'ONE' },
      { id: 'b', text: 'TWO' },
    ],
    defaultDwellMs: 500,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
  } as unknown as Element;
}
function tickerEl(id: string, visible: boolean): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform: t,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
    font: { ...font, size: 36, lineHeight: 1.4 },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
  } as unknown as Element;
}
function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'root',
    name: 'root',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 40 },
    playout: { mode: 'manual' },
    background: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z' },
  } as unknown as Scene;
}
const disp = (id: string): string =>
  document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.style.display ?? 'MISSING';

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('HIDE — a hidden clock / sequence stays display:none through the WHOLE runtime lifecycle', () => {
  it('hidden clock + sequence are display:none at build, and STILL after play (drivers + frame gates run)', async () => {
    const clock = makeClock();
    const tickerMeasure = (n: HTMLElement): number => (n.textContent?.length ?? 0) * 10;
    const r = createRuntime(
      scene([
        clockEl('clk', false),
        seqEl('seq', false),
        tickerEl('tk', false),
        clockEl('shown', true),
      ]),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    // At build (pre-play): the hide is respected.
    expect(disp('clk')).toBe('none');
    expect(disp('seq')).toBe('none');
    expect(disp('tk')).toBe('none');
    expect(disp('shown')).toBe('flex'); // the visible one is shown

    await r.play({});
    await run(clock, 800); // drivers reset+start at the hold entry; per-frame gates run
    // The REAL bug would surface here: a driver / play path re-showing the hidden element.
    expect(disp('clk')).toBe('none');
    expect(disp('seq')).toBe('none');
    expect(disp('tk')).toBe('none');
    expect(disp('shown')).toBe('flex');
    r.remove();
  });
});
