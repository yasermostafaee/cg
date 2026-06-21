import { beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-085 - Stop = CLEARED terminal. LOCKS the already-correct runtime behaviour:
 * on Stop (after the OUT, or immediately when there is no outro) the composition
 * SETTLES into a CLEARED state - the stage is hidden (`body.cg-pending` =>
 * `.cg-stage { visibility: hidden }`) AND every content driver (ticker / clock /
 * sequence / repeater) is halted (no further frame scheduled), so content-driven
 * elements and nested children all go away - with no per-element opacity-out.
 *
 * The mechanism is VISIBILITY (hide + halt), NOT destruction: the nodes stay
 * MOUNTED (distinct from CG REMOVE / `remove()`, which unmounts). Re-play clears
 * `cg-pending` and re-inits the drivers from a fresh state.
 *
 * These are BEHAVIOUR tests, per driver kind: each proves the driver schedules NO
 * further frame after settle (its paint does not change when the clock advances),
 * and `clock.pending()` (rAF + timer handles) drops to zero.
 */

/** Map-based fake rAF + timer clock with pending-handle counters (unique handles
 *  so one driver cancelling its own frame can't kill another's - many drivers run
 *  concurrently). Same shape as nested-lifecycle-cascade's clock. */
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
    /** Outstanding rAF + timer handles - zero means no further frame is scheduled. */
    pending: () => rafs.size + timers.length,
  };
}

type Clock = ReturnType<typeof makeClock>;

/** Advance in small steps with microtask drains (content/lifecycle reactions
 *  land on microtasks between rAF steps). */
async function run(clock: Clock, totalMs: number, step = 50): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

/** Deterministic ticker width (the ticker fixture math): 10px per code unit. */
const tickerMeasure = (n: HTMLElement): number => (n.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const font = {
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal' as const,
  size: 36,
  lineHeight: 1.4,
  letterSpacing: 0,
};
const baseEl = { transform: baseTransform, opacity: 1, visible: true, locked: false, zIndex: 0 };

function tickerEl(id = 'crawl'): Element {
  return {
    ...baseEl,
    id,
    name: id,
    type: 'ticker',
    font,
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [
      { id: 'a', text: 'aaaaaaaaaa' },
      { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' },
    ],
  } as unknown as Element;
}

function clockEl(id = 'clk'): Element {
  return {
    ...baseEl,
    id,
    name: id,
    type: 'clock',
    font,
    color: '#FFFFFF',
    align: 'center',
    mode: 'wall',
    format: 'mm:ss',
    digits: 'latin',
  } as unknown as Element;
}

function sequenceEl(id = 'seq'): Element {
  return {
    ...baseEl,
    id,
    name: id,
    type: 'sequence',
    font,
    color: '#FFFFFF',
    align: 'start',
    direction: 'rtl',
    items: [
      { id: 'a', text: 'now-one' },
      { id: 'b', text: 'next-two' },
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

/** A shape whose opacity ramps 0->1 across frames [0,40] - gives the OUT a real
 *  duration so we can prove the clear is DEFERRED until the outro completes. */
function animShape(id: string): Element {
  return {
    ...baseEl,
    id,
    name: id,
    type: 'shape',
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

function instance(id: string, compositionId: string): Element {
  return { ...baseEl, id, name: id, type: 'composition', compositionId } as unknown as Element;
}

function childComp(id: string, children: Element[], lifecycle?: { outPoint: number }): Composition {
  return {
    id,
    name: id,
    resolution: { width: 400, height: 200 },
    frameRange: { in: 0, out: 40 },
    ...(lifecycle !== undefined ? { lifecycle } : {}),
    background: 'transparent',
    layers: [
      { id: `${id}-l`, name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
  } as unknown as Composition;
}

function scene(opts: {
  children: Element[];
  playout?: Playout;
  lifecycle?: { outPoint: number };
  compositions?: Composition[];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'd085',
    name: 'd085',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    ...(opts.playout !== undefined ? { playout: opts.playout } : {}),
    ...(opts.lifecycle !== undefined ? { lifecycle: opts.lifecycle } : {}),
    background: 'transparent',
    layers: [
      {
        id: 'L1',
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
    ...(opts.compositions !== undefined ? { compositions: opts.compositions } : {}),
    metadata: { createdAt: '2026-06-21T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z' },
  } as unknown as Scene;
}

const pending = (): boolean => document.body.classList.contains('cg-pending');
const node = (...chain: string[]): HTMLElement | null =>
  document.querySelector<HTMLElement>(chain.map((id) => `[data-cg-element-id="${id}"]`).join(' '));
const stageMounted = (): boolean => document.querySelector('.cg-stage') !== null;

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('D-085 - Stop = CLEARED terminal (visibility-clear + drivers halted)', () => {
  // Per driver kind: Play -> it runs -> Stop -> cleared (hidden, halted, mounted)

  it('text/ticker: Stop halts the crawl, hides the stage, leaves the node mounted', async () => {
    const clock = makeClock();
    const runtime = createRuntime(scene({ children: [tickerEl()], playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    await runtime.play({});
    await run(clock, 1000);
    expect(clock.pending()).toBeGreaterThan(0); // a frame is scheduled - crawling

    await runtime.stop();
    await run(clock, 100); // flush the (empty-outro) instant settle

    expect(pending()).toBe(true); // stage hidden
    expect(node('crawl')).not.toBeNull(); // MOUNTED - not unmounted
    expect(stageMounted()).toBe(true);
    expect(clock.pending()).toBe(0); // crawl rAF cancelled - no further frame

    const frozen = node('crawl')?.innerHTML ?? '';
    await run(clock, 3000);
    expect(node('crawl')?.innerHTML).toBe(frozen); // does not repaint after settle
  });

  it('clock: Stop halts the tick, hides the stage, leaves the node mounted', async () => {
    const clock = makeClock();
    const runtime = createRuntime(scene({ children: [clockEl()], playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
    });
    await runtime.play({});
    await run(clock, 3000); // wall clock ticks
    expect(clock.pending()).toBeGreaterThan(0);

    await runtime.stop();
    await run(clock, 100);

    expect(pending()).toBe(true);
    expect(node('clk')).not.toBeNull();
    expect(clock.pending()).toBe(0); // clock rAF cancelled

    const frozen = node('clk')?.textContent ?? '';
    await run(clock, 10_000); // 10s later...
    expect(node('clk')?.textContent).toBe(frozen); // ...the time does NOT advance
  });

  it('sequence: Stop halts the rotation, hides the stage, leaves the node mounted', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      scene({ children: [sequenceEl()], playout: { mode: 'manual' } }),
      {
        skipFontLoad: true,
        clock,
      },
    );
    await runtime.play({});
    await run(clock, 1200); // past the first dwell+transition - rotating
    expect(clock.pending()).toBeGreaterThan(0);

    await runtime.stop();
    await run(clock, 100);

    expect(pending()).toBe(true);
    expect(node('seq')).not.toBeNull();
    expect(clock.pending()).toBe(0);

    const frozen = node('seq')?.innerHTML ?? '';
    await run(clock, 3000);
    expect(node('seq')?.innerHTML).toBe(frozen); // no further advance/transition
  });

  it('repeater: Stop halts the stamped rows content + driver, hides the stage, rows stay mounted', async () => {
    const clock = makeClock();
    // A repeater whose child rows each carry a ticker -> on play the row tickers
    // crawl; Stop must halt them via the cascade into the stamped row subtrees.
    const runtime = createRuntime(
      scene({
        children: [
          {
            ...baseEl,
            id: 'rep',
            name: 'rep',
            type: 'repeater',
            compositionId: 'row',
            direction: 'column',
            flow: 'rtl',
            gap: 10,
            items: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
          } as unknown as Element,
        ],
        playout: { mode: 'manual' },
        compositions: [childComp('row', [tickerEl('rowcrawl')])],
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await runtime.play({});
    await run(clock, 1000);
    expect(clock.pending()).toBeGreaterThan(0); // the row tickers are crawling
    const rowsBefore = document.querySelectorAll('[data-cg-repeater-row]').length;
    expect(rowsBefore).toBeGreaterThan(0);

    await runtime.stop();
    await run(clock, 100);

    expect(pending()).toBe(true);
    // Rows stay MOUNTED (hidden by cg-pending, not destroyed).
    expect(document.querySelectorAll('[data-cg-repeater-row]').length).toBe(rowsBefore);
    expect(node('rep')).not.toBeNull();
    expect(clock.pending()).toBe(0); // every row ticker halted by the cascade

    const frozen = node('rep')?.innerHTML ?? '';
    await run(clock, 3000);
    expect(node('rep')?.innerHTML).toBe(frozen);
  });

  // Nested composition instance: parent Stop clears the child + halts its driver

  it('nested child is GONE after the PARENT Stop (cascade hides + halts the child driver)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      scene({
        children: [instance('inst', 'child')],
        playout: { mode: 'manual' },
        compositions: [childComp('child', [tickerEl('childcrawl')])],
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await runtime.play({});
    await run(clock, 1000);
    expect(clock.pending()).toBeGreaterThan(0); // the nested ticker is crawling
    expect(node('inst', 'childcrawl')).not.toBeNull();

    await runtime.stop();
    await run(clock, 100);

    expect(pending()).toBe(true); // the whole stage (incl. the nested child) is hidden
    expect(node('inst', 'childcrawl')).not.toBeNull(); // child stays MOUNTED
    expect(clock.pending()).toBe(0); // the nested ticker rAF is cancelled

    const frozen = node('inst', 'childcrawl')?.innerHTML ?? '';
    await run(clock, 3000);
    expect(node('inst', 'childcrawl')?.innerHTML).toBe(frozen); // halted under the hidden stage
  });

  // Re-play after the clear restarts cleanly from a fresh state

  it('Play after Stop clears cg-pending and re-inits the drivers (a frame is scheduled again)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(scene({ children: [tickerEl()], playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    await runtime.play({});
    await run(clock, 1000);
    await runtime.stop();
    await run(clock, 100);
    expect(pending()).toBe(true);
    expect(clock.pending()).toBe(0);

    // Re-play: stage revealed + the crawl runs again from a fresh state.
    await runtime.play({});
    await run(clock, 1000);
    expect(pending()).toBe(false); // cg-pending cleared
    expect(clock.pending()).toBeGreaterThan(0); // a frame is scheduled again - re-init
    expect(node('crawl')).not.toBeNull();
  });

  // Timing: clear AFTER the outro; the nodes are never destroyed

  it('with an OUTRO the clear is DEFERRED until the outro completes; with none it is immediate', async () => {
    // Outro case: outPoint 10 < out 40, with a shape animating across [10,40].
    const clockA = makeClock();
    const withOutro = createRuntime(
      scene({
        children: [animShape('s')],
        playout: { mode: 'manual' },
        lifecycle: { outPoint: 10 },
      }),
      { skipFontLoad: true, clock: clockA },
    );
    await withOutro.play({});
    await run(clockA, 1000); // settle into the hold at the out-point
    expect(pending()).toBe(false);
    await withOutro.stop(); // begin the OUT [10 -> 40]
    await run(clockA, 60); // mid-outro: a few frames in, NOT yet settled
    expect(pending()).toBe(false); // clear is DEFERRED until the outro finishes
    await run(clockA, 1500); // let the outro play out
    expect(pending()).toBe(true); // now cleared

    // No-outro case (empty outro): Stop clears on the next tick (immediate).
    document.body.innerHTML = '';
    document.body.className = '';
    const clockB = makeClock();
    const noOutro = createRuntime(
      scene({ children: [animShape('s')], playout: { mode: 'manual' } }),
      { skipFontLoad: true, clock: clockB },
    );
    await noOutro.play({});
    await run(clockB, 1000);
    expect(pending()).toBe(false);
    await noOutro.stop();
    await run(clockB, 50); // a single small step - empty outro settles at once
    expect(pending()).toBe(true);
    expect(node('s')).not.toBeNull(); // still MOUNTED - a clear, not a CG REMOVE
  });
});
