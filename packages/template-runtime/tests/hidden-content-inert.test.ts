import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Playout, Scene } from '@cg/shared-schema';
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

describe('B-034 × D-112 — visibility wins over a parent per-instance holdOverride', () => {
  it('a parent override CANNOT force-include a HIDDEN nested driver (visible:false beats the override)', async () => {
    const clock = makeClock();
    // The child's only content is a HIDDEN infinite ticker (its own drivesHold defaults to true). The
    // parent tries to FORCE-INCLUDE it via the instance override `{ crawl: true }`. visible:false is a
    // HARD gate: the hidden element is absent from `contentDrivers`, so the override has nothing to
    // re-admit ⇒ no effective drivers ⇒ the content-driven hold resolves to TIMED (B-032) and settles.
    const hidden = infiniteTicker('crawl', false);
    const child = comp('child', 25, [hidden], { mode: 'manual' });
    const r = createRuntime(
      parentScene({
        compositions: [child],
        children: [instance('i1', 'inst1', 'child', { crawl: true })], // attempt to force-include
        lifecycle: { outPoint: 25 },
        playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 3000 },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 2000);
    expect(onAir()).toBe(true); // holding the TIMED 3s — the force-included hidden ticker did NOT win

    await run(clock, 2000); // ~4s: the timed hold elapses → settle
    expect(onAir()).toBe(false); // WITHOUT the gate the override would re-admit it → frozen until stop()
    r.remove();
  });

  it('a HIDDEN nested driver does not extend the parent hold; a VISIBLE nested sibling still does', async () => {
    const clock = makeClock();
    // The child has a hidden 3s countdown + a visible 1s countdown. The parent aggregates the child's
    // content; only the VISIBLE one gates the hold, so the parent closes at ~1s, not ~3s.
    const child = comp(
      'child',
      25,
      [countdownClock('hidden', 3000, false), countdownClock('shown', 1000, true)],
      { mode: 'manual' },
    );
    const r = createRuntime(
      parentScene({
        compositions: [child],
        children: [instance('i1', 'inst1', 'child')], // no override ⇒ each child element's own visibility/drivesHold
        lifecycle: { outPoint: 25 },
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 500);
    expect(onAir()).toBe(true); // holding for the visible 1s countdown

    await run(clock, 1500); // ~2s: the visible countdown completed → settle (the hidden 3s is inert)
    expect(onAir()).toBe(false);
    r.remove();
  });
});

describe('B-034 (ancestor) — a HIDDEN composition instance makes its WHOLE subtree inert', () => {
  /** Hide an instance element (the ancestor whose subtree must go inert). */
  const hide = (el: Element): Element => {
    (el as unknown as { visible: boolean }).visible = false;
    return el;
  };

  it('a VISIBLE infinite driver INSIDE a hidden instance does not keep the parent open (resolves to timed)', async () => {
    const clock = makeClock();
    // The user's master.vcg shape: a content-driven parent instances a child whose VISIBLE infinite
    // crawl would never complete — but the INSTANCE is hidden, so render skips it AND its whole subtree
    // is inert for the hold. The parent has no effective drivers ⇒ resolves to timed (B-032) + settles.
    const child = comp('child', 25, [infiniteTicker('crawl')], { mode: 'manual' }); // crawl is visible
    const r = createRuntime(
      parentScene({
        compositions: [child],
        children: [hide(instance('i1', 'inst1', 'child'))], // the INSTANCE is hidden
        lifecycle: { outPoint: 25 },
        playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 3000 },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 2000);
    expect(onAir()).toBe(true); // holding the timed 3s — NOT frozen by the hidden instance's visible crawl

    await run(clock, 2000); // ~4s: the timed hold elapses → settle
    expect(onAir()).toBe(false); // WITHOUT the subtree-skip the inner infinite crawl would hold forever
    r.remove();
  });

  it('only the HIDDEN instance is inert — a VISIBLE sibling instance still drives the parent hold', async () => {
    const clock = makeClock();
    // A HIDDEN instance of a child with an infinite crawl (inert) + a VISIBLE instance of a child with
    // a 1s countdown (drives). The parent closes on the visible instance — proving the skip is scoped
    // to the hidden subtree, not all nested content.
    const childInf = comp('childInf', 25, [infiniteTicker('crawl')], { mode: 'manual' });
    const childShort = comp('childShort', 25, [countdownClock('clk', 1000)], { mode: 'manual' });
    const r = createRuntime(
      parentScene({
        compositions: [childInf, childShort],
        children: [
          hide(instance('i1', 'hidden', 'childInf')),
          instance('i2', 'shown', 'childShort'),
        ],
        lifecycle: { outPoint: 25 },
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    await r.play({});

    await run(clock, 500);
    expect(onAir()).toBe(true); // holding for the VISIBLE instance's 1s countdown

    await run(clock, 1500); // ~2s: the visible countdown completes → settle; the hidden crawl is inert
    expect(onAir()).toBe(false); // WITHOUT the skip the hidden infinite crawl would hold forever
    r.remove();
  });
});
