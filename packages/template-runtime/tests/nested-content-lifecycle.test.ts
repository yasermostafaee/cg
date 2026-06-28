import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-104 — finite content (ticker / sequence / countdown) inside a NESTED
 * composition participates in the PARENT's lifecycle: a content-driven parent
 * holds until the nested content completes (then plays out), and the nested
 * content starts at the PARENT's hold entry (after the parent's intro), not on
 * the play cascade. A content-driven NESTED composition is a "coordinator" and
 * stays independent (the parent skips it) — preserving today's per-scope holds.
 */

/** Fake rAF + timer clock with UNIQUE rAF handles (concurrent FrameDrivers). */
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

const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** A countdown clock that completes after `ms` of active (hold) time. */
function countdownClock(id: string, ms: number): Element {
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
  } as unknown as Element;
}

/** An infinite crawl (never completes on its own). */
function infiniteTicker(id: string): Element {
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
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
  } as unknown as Element;
}

/** A shape whose opacity ramps 0→1 across frames [0, 40] (gives the parent an intro). */
function animShape(id: string): Element {
  return {
    id,
    name: id,
    type: 'shape',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
    animation: {
      tracks: {
        opacity: {
          keyframes: [
            { frame: 0, value: 0, easing: 'linear' },
            { frame: 40, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  } as unknown as Element;
}

function instance(id: string, name: string, compositionId: string): Element {
  return {
    id,
    name,
    type: 'composition',
    compositionId,
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  } as unknown as Element;
}

function comp(id: string, outPoint: number, children: Element[], playout?: Playout): Composition {
  return {
    id,
    name: id,
    resolution: { width: 400, height: 60 },
    frameRange: { in: 0, out: 50 },
    lifecycle: { outPoint },
    ...(playout !== undefined ? { playout } : {}),
    background: 'transparent',
    layers: [
      { id: `${id}-l`, name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
  } as unknown as Composition;
}

function parentScene(opts: {
  compositions: Composition[];
  children: Element[];
  lifecycle?: { outPoint: number };
  playout?: Playout;
}): Scene {
  return {
    schemaVersion: 1,
    id: 'parent',
    name: 'parent',
    templateType: 'custom',
    resolution: { width: 400, height: 120 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    ...(opts.lifecycle !== undefined ? { lifecycle: opts.lifecycle } : {}),
    ...(opts.playout !== undefined ? { playout: opts.playout } : {}),
    background: 'transparent',
    layers: [
      {
        id: 'pl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: opts.children,
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: opts.compositions,
    metadata: { createdAt: '2026-06-27T00:00:00.000Z', updatedAt: '2026-06-27T00:00:00.000Z' },
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

describe('D-104 — nested-composition content participates in the parent lifecycle', () => {
  it('(1) a content-driven parent holds until a nested composition countdown completes, then plays out', async () => {
    const clock = makeClock();
    // Parent: content-driven, NO direct content; the only finite content (a 1s
    // countdown) lives in a non-coordinator (manual) nested composition.
    const child = comp('cd', 25, [countdownClock('clk', 1000)], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});
    expect(onAir()).toBe(true); // playing — holding for the nested countdown

    await run(clock, 600);
    expect(onAir()).toBe(true); // still holding (countdown not yet at 00:00)

    await run(clock, 1400); // the countdown reaches 0 → parent plays its outro → settles
    expect(onAir()).toBe(false); // settled (cleared) — the background played out
    r.remove();
  });

  it('(3) a content-driven parent with INFINITE nested content holds until stop()', async () => {
    const clock = makeClock();
    const child = comp('inf', 25, [infiniteTicker('crawl')], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-inf', 'inf', 'inf')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 6000);
    expect(onAir()).toBe(true); // infinite nested content never completes → still holding

    await r.stop();
    await run(clock, 1000);
    expect(onAir()).toBe(false); // settled only on stop()
    r.remove();
  });

  it('(4) nested content starts at the parent hold entry (after the parent intro), not at play', async () => {
    const clock = makeClock();
    // Parent has a DIRECT intro animation [0→40] = 800ms before it enters hold,
    // and a non-coordinator nested composition holding a 2s countdown.
    const child = comp('cd', 25, [countdownClock('clk', 2000)], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [animShape('intro'), instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 40 }, // 40 frames @50fps ⇒ 800ms intro
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});

    // If the nested countdown had (buggily) started at PLAY, it would finish at
    // ~2000ms and the parent (in hold from ~800ms) would settle by ~2200ms. With
    // correct gating it starts at the hold entry (~800ms) and finishes at ~2800ms.
    await run(clock, 2400);
    expect(onAir()).toBe(true); // STILL holding ⇒ the countdown did not start at play

    await run(clock, 1200); // ~3600ms total: countdown done (~2800ms) → outro → settle
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('(2/no-regression) a content-driven NESTED composition still self-settles; a manual parent is untouched', async () => {
    const clock = makeClock();
    // The nested comp is itself content-driven (a coordinator): it owns its own
    // 1s countdown and auto-outs on it; the manual parent does NOT wait on it.
    const child = comp('cd', 10, [countdownClock('clk', 1000)], {
      mode: 'auto-out',
      holdSource: 'content-driven',
    });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'manual' }, // parent holds until stop, never aggregates the coordinator child
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});

    await run(clock, 2000); // the child's countdown completes → child self-settles
    expect(onAir()).toBe(true); // the MANUAL parent is untouched — still on air
    r.remove();
  });

  it('(depth) a coordinator aggregates content two levels down (through a content-less middle comp)', async () => {
    const clock = makeClock();
    // parent (content-driven) → mid (manual, no content) → gc (manual, countdown).
    const gc = comp('gc', 25, [countdownClock('clk', 1000)], { mode: 'manual' });
    const mid = comp('mid', 25, [instance('i-gc', 'gc', 'gc')], { mode: 'manual' });
    const scene = parentScene({
      compositions: [gc, mid],
      children: [instance('i-mid', 'mid', 'mid')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});

    await run(clock, 600);
    expect(onAir()).toBe(true); // still holding for the grandchild countdown
    await run(clock, 1400);
    expect(onAir()).toBe(false); // settled once the two-levels-down content completed
    r.remove();
  });

  it('(loop-cycle) a content-driven loop re-awaits the nested countdown each cycle, then settles', async () => {
    const clock = makeClock();
    const child = comp('cd', 25, [countdownClock('clk', 500)], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 3 },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});

    await run(clock, 300);
    expect(onAir()).toBe(true); // mid first cycle — did NOT settle instantly
    await run(clock, 6000);
    expect(onAir()).toBe(false); // a finite 3-cycle loop eventually settles
    r.remove();
  });

  it('(root override) an explicit boot contentHold wins over nested aggregation at the root', async () => {
    const clock = makeClock();
    let resolveHold: () => void = () => undefined;
    const hold = new Promise<void>((res) => {
      resolveHold = res;
    });
    // The root nests a 1s countdown that WOULD govern, but the explicit contentHold
    // overrides the root scope, so only resolveHold() ends the hold.
    const child = comp('cd', 25, [countdownClock('clk', 1000)], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, contentHold: () => hold });
    await r.play({});

    await run(clock, 3000); // the nested countdown is long done, but the override governs
    expect(onAir()).toBe(true);
    resolveHold();
    await run(clock, 200);
    expect(onAir()).toBe(false); // settles only when the override resolves
    r.remove();
  });

  it('(B-031) a content-driven parent HOLDS for a CONTENT-DRIVEN nested child until it self-settles', async () => {
    const clock = makeClock();
    // The nested comp is ITSELF content-driven (a coordinator): a 1s countdown drives
    // ITS own hold. B-031 — that nested content now DRIVES the content-driven parent's
    // hold too; the parent waits until the child self-settles (its content + its outro).
    const child = comp('cd', 10, [countdownClock('clk', 1000)], {
      mode: 'auto-out',
      holdSource: 'content-driven',
    });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});

    await run(clock, 600);
    expect(onAir()).toBe(true); // holding — the nested content-driven child has not settled

    await run(clock, 3000); // child countdown done (~1s) → child self-settles → parent plays out
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('(B-031) drivesHold:false on the nested content opts it out — the parent does NOT wait on it', async () => {
    const clock = makeClock();
    // The child's only content (a 5s countdown) is EXCLUDED (drivesHold:false), so the
    // child gets a zero-length hold and self-settles fast; the parent must NOT wait on
    // the 5s countdown — it settles well before the countdown would have ended.
    const excluded = {
      ...countdownClock('clk', 5000),
      drivesHold: false,
    } as unknown as Element;
    const child = comp('cd', 10, [excluded], { mode: 'auto-out', holdSource: 'content-driven' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i-cd', 'cd', 'cd')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock });
    await r.play({});

    await run(clock, 3000); // < the 5s countdown: settled ⇒ the parent did not wait on the opted-out content
    expect(onAir()).toBe(false);
    r.remove();
  });
});
