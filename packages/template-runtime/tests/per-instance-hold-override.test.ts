import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-112 — per-instance hold overrides. A content-driven parent aggregates a NON-coordinator
 * nested child's content per-element; `holdOverrides` on the composition-INSTANCE element decides,
 * per instance, whether each nested content element drives THIS parent's hold (absent ⇒ the
 * element's own `drivesHold`). The override affects ONLY the parent's aggregation — the shared
 * child is untouched, so a second instance of the same child is unaffected.
 *
 * The repro: a child with a finite countdown + an INFINITE ticker. Without an override the parent
 * holds forever (the infinite ticker drives). Excluding the ticker via the instance override lets
 * the parent close on the countdown — and a second instance (no override) still holds.
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

/** A composition-instance element, optionally carrying per-instance `holdOverrides`. */
function instance(
  id: string,
  name: string,
  compositionId: string,
  holdOverrides?: Record<string, boolean>,
): Element {
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
    ...(holdOverrides !== undefined ? { holdOverrides } : {}),
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

describe('D-112 — per-instance hold overrides', () => {
  // The child: a 1s countdown (finite) + an infinite ticker, both drive by default. Manual ⇒ a
  // NON-coordinator child whose content the parent aggregates per-element.
  const childWith = (): Composition =>
    comp('child', 25, [countdownClock('clk', 1000), infiniteTicker('crawl')], { mode: 'manual' });

  it('without an override, the infinite nested ticker keeps the parent holding until stop()', async () => {
    const clock = makeClock();
    const scene = parentScene({
      compositions: [childWith()],
      children: [instance('i1', 'inst1', 'child')], // no holdOverrides ⇒ both drive
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 4000); // countdown finished at ~1000ms, but the infinite ticker never does
    expect(onAir()).toBe(true); // still holding — the looping ticker drives the parent's hold

    await r.stop();
    await run(clock, 1000);
    expect(onAir()).toBe(false); // only stop() ends it
    r.remove();
  });

  it('an instance override excluding the infinite ticker lets the parent close on the finite countdown', async () => {
    const clock = makeClock();
    const scene = parentScene({
      compositions: [childWith()],
      // The PARENT excludes the looping ticker from ITS hold — on the instance, not the child.
      children: [instance('i1', 'inst1', 'child', { crawl: false })],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});
    expect(onAir()).toBe(true);

    await run(clock, 600);
    expect(onAir()).toBe(true); // countdown not yet at 00:00

    await run(clock, 1400); // countdown reaches 0 (~1000ms) → parent plays its outro → settles
    expect(onAir()).toBe(false); // CLOSED despite the still-running infinite ticker
    r.remove();
  });

  it('the override is per-instance: a SECOND instance of the same child is unaffected', async () => {
    const clock = makeClock();
    const scene = parentScene({
      compositions: [childWith()],
      children: [
        instance('i1', 'inst1', 'child', { crawl: false }), // excludes the ticker
        instance('i2', 'inst2', 'child'), // NO override ⇒ the ticker still drives
      ],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 4000);
    // i1's override excluded its ticker, but i2 has NO override — its infinite ticker still drives
    // the parent's hold. If the override had leaked to the shared child, BOTH tickers would be
    // excluded and the parent would have closed on the countdown (~1000ms). It is still holding ⇒
    // per-instance isolation.
    expect(onAir()).toBe(true);

    await r.stop();
    await run(clock, 1000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('the override cascades per level — a DEEP instance excludes its OWN infinite content', async () => {
    const clock = makeClock();
    // P → I_mid (comp MID, manual) → I_leaf (comp LEAF, manual). LEAF has a countdown + an infinite
    // ticker; the override that excludes the ticker lives on I_leaf (inside MID), not on I_mid.
    const leaf = comp('leaf', 25, [countdownClock('clk', 1000), infiniteTicker('crawl')], {
      mode: 'manual',
    });
    const mid = comp('mid', 25, [instance('i-leaf', 'leaf', 'leaf', { crawl: false })], {
      mode: 'manual',
    });
    const scene = parentScene({
      compositions: [mid, leaf],
      children: [instance('i-mid', 'mid', 'mid')],
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 600);
    expect(onAir()).toBe(true); // countdown not yet done

    await run(clock, 1400); // countdown done (~1000ms); the leaf ticker is excluded by I_leaf's override
    expect(onAir()).toBe(false); // CLOSED — the per-level override on the DEEP instance cascaded
    r.remove();
  });

  it('an override can FORCE-INCLUDE a child-excluded element (drivesHold:false) into the parent hold', async () => {
    const clock = makeClock();
    // The child EXCLUDES its countdown from its OWN hold (drivesHold:false), so on its own it is a
    // zero-length hold. The PARENT force-includes it via the instance override → the parent waits.
    const cd = countdownClock('clk', 1000);
    (cd as unknown as { drivesHold: boolean }).drivesHold = false;
    const child = comp('child', 25, [cd], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i1', 'inst1', 'child', { clk: true })], // force-include
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 600);
    expect(onAir()).toBe(true); // holding for the FORCE-INCLUDED countdown (else it'd be zero-length)

    await run(clock, 1400);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('an override on a CONTENT-DRIVEN (coordinator) nested child is inert — the parent awaits its settle', async () => {
    const clock = makeClock();
    // C is itself content-driven (a coordinator): the parent awaits C.whenSettled, NOT C's content
    // per-element, so a per-instance override on C's content has NO effect (B-031 delegation). The
    // Designer reflects this by surfacing a coordinator child READ-ONLY (no writable override rows).
    const child = comp('child', 25, [countdownClock('clk', 1000), infiniteTicker('crawl')], {
      mode: 'auto-out',
      holdSource: 'content-driven',
    });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i1', 'inst1', 'child', { crawl: false })], // would exclude — but inert
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 4000);
    // C's OWN hold still includes its infinite ticker (its own drivesHold), so C never settles and
    // the parent holds forever — the instance override was INERT because C is a coordinator. (Were
    // the override wrongly applied, C would settle on the countdown and the parent would close.)
    expect(onAir()).toBe(true);

    await r.stop();
    await run(clock, 1000);
    expect(onAir()).toBe(false);
    r.remove();
  });

  it('B-032 × D-112 fold — excluding the ONLY nested driver via an instance override resolves the hold to TIMED (holds holdMs)', async () => {
    const clock = makeClock();
    // The child's only hold driver is a finite countdown; the parent EXCLUDES it via a per-instance
    // override → no EFFECTIVE drivers → the content-driven hold resolves to TIMED (B-032) and honors
    // holdMs, instead of closing on the (excluded) countdown or collapsing to a zero-length hold.
    const child = comp('child', 25, [countdownClock('clk', 1000)], { mode: 'manual' });
    const scene = parentScene({
      compositions: [child],
      children: [instance('i1', 'inst1', 'child', { clk: false })], // exclude the only driver
      lifecycle: { outPoint: 25 },
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 5000 },
    });
    const r = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await r.play({});

    await run(clock, 2000);
    // If the override were ignored, the countdown (~1000ms) would have closed the parent by now; if
    // the resolution miscounted it would be zero-length. Resolved to timed (5000ms) ⇒ still holding.
    expect(onAir()).toBe(true);

    await run(clock, 4000); // ~6s: the 5s timed hold elapses → outro → settle
    expect(onAir()).toBe(false);
    r.remove();
  });
});
