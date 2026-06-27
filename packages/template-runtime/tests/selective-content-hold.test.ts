import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-107 — per-element selection of which content drives the content-driven hold.
 * An optional `drivesHold` (absent ⇒ participates) on tickers / sequences /
 * countdown clocks controls whether each gates the scope's
 * `holdSource: 'content-driven'` hold. The runtime still STARTS every content
 * element (this is the HOLD, not visibility); only the wait is filtered to
 * `drivesHold !== false`. Maps the D-107 acceptance scenarios:
 *  - an EXCLUDED infinite element does NOT block the hold (a finite SELECTED one governs);
 *  - the same infinite element INCLUDED (default) holds until stop() (regression);
 *  - default (no drivesHold) keeps the all-content behaviour;
 *  - ALL content excluded ⇒ a zero-length hold (the no-content case).
 */

/** Fake rAF + timer clock (same pattern as the playout-controller / ticker tests). */
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

/** Advance with microtask drains between steps (content completion is async). */
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

/** Deterministic width: 10px per code unit (matches ticker-runtime.test). */
const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

// Fixture math (from ticker-runtime.test): items a(100px) + b(200px), gap 10,
// viewport 400, speed 100 ⇒ a repeat:1 crawl completes its single pass at ~7100ms.
function ticker(id: string, opts: { repeat: number | 'infinite'; drivesHold?: boolean }): Element {
  return {
    id,
    name: id,
    type: 'ticker',
    transform: baseTransform,
    opacity: 1,
    visible: true,
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
    repeat: opts.repeat,
    cycleBoundary: 'seamless',
    items: [
      { id: 'a', text: 'aaaaaaaaaa' },
      { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' },
    ],
    ...(opts.drivesHold !== undefined ? { drivesHold: opts.drivesHold } : {}),
  } as unknown as Element;
}

/** A countdown clock that completes after `ms` of active (hold) time. */
function countdown(id: string, ms: number, drivesHold?: boolean): Element {
  return {
    id,
    name: id,
    type: 'clock',
    transform: baseTransform,
    opacity: 1,
    visible: true,
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
    ...(drivesHold !== undefined ? { drivesHold } : {}),
  } as unknown as Element;
}

/** A single root composition (auto-out, content-driven) with `children` and a short outro. */
function scene(children: Element[], playout: Playout, outPoint = 25): Scene {
  return {
    schemaVersion: 1,
    id: 'scene',
    name: 'scene',
    templateType: 'ticker',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    lifecycle: { outPoint },
    playout,
    background: 'transparent',
    layers: [
      { id: 'l', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [],
    metadata: { createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z' },
  } as unknown as Scene;
}

const CD: Playout = { mode: 'auto-out', holdSource: 'content-driven' };
const onAir = (): boolean => !document.body.classList.contains('cg-pending');

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-107 — selective content-driven hold (drivesHold)', () => {
  it('a finite SELECTED ticker governs the hold; an infinite EXCLUDED ticker does NOT block it', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene(
        [
          ticker('finite', { repeat: 1 }),
          ticker('deco', { repeat: 'infinite', drivesHold: false }),
        ],
        CD,
      ),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 4000);
    expect(onAir()).toBe(true); // the finite pass isn't done yet (~7100ms) → still holding

    await run(clock, 5000); // ~9000ms: the finite pass completes → outro → settle
    expect(onAir()).toBe(false); // the excluded infinite ticker did NOT keep the graphic on air
    r.remove();
  });

  it('regression — the SAME infinite ticker INCLUDED (default) holds until stop()', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // both participate (no drivesHold on either) — today's all-content behaviour
      scene([ticker('finite', { repeat: 1 }), ticker('deco', { repeat: 'infinite' })], CD),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 12000); // long past the finite ticker's completion
    expect(onAir()).toBe(true); // the infinite ticker still blocks the Promise.all hold

    await r.stop();
    await run(clock, 1000);
    expect(onAir()).toBe(false); // settles only on stop()
    r.remove();
  });

  it('default (no drivesHold) — a finite ticker still drives the hold (all-content behaviour preserved)', async () => {
    const clock = makeClock();
    const r = createRuntime(scene([ticker('finite', { repeat: 1 })], CD), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    await r.play({});

    await run(clock, 3000);
    expect(onAir()).toBe(true); // still crawling its single pass

    await run(clock, 6000);
    expect(onAir()).toBe(false); // the finite pass completed → settled (participates by default)
    r.remove();
  });

  it('ALL content EXCLUDED — the hold is zero-length (settles like the no-content case)', async () => {
    const clock = makeClock();
    const r = createRuntime(
      // the only content is an infinite ticker, explicitly excluded
      scene([ticker('deco', { repeat: 'infinite', drivesHold: false })], CD),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    // No HOLD-DRIVING content ⇒ a zero-length hold; only the ~500ms outro remains.
    await run(clock, 1500);
    expect(onAir()).toBe(false); // settled without waiting for the excluded infinite ticker
    r.remove();
  });

  it('mixed kinds — a finite countdown clock SELECTED governs while an infinite EXCLUDED ticker runs free', async () => {
    const clock = makeClock();
    const r = createRuntime(
      scene([countdown('cd', 1000), ticker('deco', { repeat: 'infinite', drivesHold: false })], CD),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 600);
    expect(onAir()).toBe(true); // the countdown hasn't reached 00:00 yet

    await run(clock, 1400); // countdown hits 0 (~1000ms) → outro → settle; the ticker is ignored
    expect(onAir()).toBe(false);
    r.remove();
  });
});
