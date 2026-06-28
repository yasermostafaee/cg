import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * B-034 — a HIDDEN content element (`visible: false`) is fully inert: it does NOT drive the
 * content-driven hold (regardless of `drivesHold` / a parent's `holdOverrides`). So a hidden
 * infinite ticker no longer freezes the graphic (the scope has no effective drivers ⇒ resolves to
 * timed, B-032), and a hidden finite driver does not gate the hold. (Render-side hide — `display:
 * none` — is covered by apps/designer/tests/e2e/hide-clock-sequence.spec.ts.)
 */

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

async function run(
  clock: ReturnType<typeof makeClock>,
  totalMs: number,
  step = 100,
): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function countdownClock(id: string, ms: number, visible = true): Element {
  return {
    id,
    name: id,
    type: 'clock',
    transform: baseTransform,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'center',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'latin',
    target: { kind: 'duration', ms },
  } as unknown as Element;
}

function infiniteTicker(id: string, visible = true): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform: baseTransform,
    opacity: 1,
    visible,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
  } as unknown as Element;
}

function scene(children: Element[], playout: Playout): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    playout,
    background: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [],
    metadata: { createdAt: '2026-06-28T00:00:00.000Z', updatedAt: '2026-06-28T00:00:00.000Z' },
  } as unknown as Scene;
}

const onAir = (): boolean => !document.body.classList.contains('cg-pending');

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('B-034 — a hidden content element does not drive the hold', () => {
  it('a HIDDEN infinite ticker is inert — the comp resolves to timed and settles (not frozen)', async () => {
    const clock = makeClock();
    // The ONLY content is a hidden infinite ticker → no effective drivers → resolves to timed (B-032).
    const r = createRuntime(
      scene([infiniteTicker('crawl', false)], {
        mode: 'auto-out',
        holdSource: 'content-driven',
        holdMs: 3000,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 2000);
    expect(onAir()).toBe(true); // holding the timed 3s — NOT frozen forever by the hidden infinite ticker

    await run(clock, 2000); // ~4s: the timed hold elapses → settle
    expect(onAir()).toBe(false); // WITHOUT the fix the hidden infinite ticker held it until stop()
    r.remove();
  });

  it('a HIDDEN finite driver does not gate the hold; only the VISIBLE content does', async () => {
    const clock = makeClock();
    // A hidden 3s countdown + a visible 1s countdown. Only the visible one gates the hold.
    const r = createRuntime(
      scene([countdownClock('hidden', 3000, false), countdownClock('shown', 1000, true)], {
        mode: 'auto-out',
        holdSource: 'content-driven',
      }),
      { skipFontLoad: true, clock },
    );
    await r.play({});

    await run(clock, 500);
    expect(onAir()).toBe(true); // holding for the visible 1s countdown

    await run(clock, 1500); // ~2s: the visible countdown completed → settle
    expect(onAir()).toBe(false); // WITHOUT the fix the hidden 3s countdown would still hold it here
    r.remove();
  });
});
