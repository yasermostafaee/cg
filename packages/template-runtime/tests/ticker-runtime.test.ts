import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldValues, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { tickerDriverFor } from '../src/ticker-driver.js';

/** Fake rAF + timer clock (same pattern as the playout-controller tests). */
function makeClock() {
  let ms = 0;
  let rafQueue: ((ts: number) => void)[] = [];
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
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
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

/** Deterministic width: 10px per code unit. */
const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

const tickerElement = {
  id: 'crawl',
  name: 'news-crawl',
  type: 'ticker' as const,
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  font: {
    family: 'Vazirmatn',
    weight: 500,
    style: 'normal' as const,
    size: 36,
    lineHeight: 1.4,
    letterSpacing: 0,
  },
  color: '#FFFFFF',
  direction: 'rtl' as const,
  speed: 100,
  gap: 10,
  // 'a'×10 → 100px, 'b'×20 → 200px ⇒ cycleWidth = (100+10)+(200+10) = 320.
  items: [
    { id: 'a', text: 'aaaaaaaaaa' },
    { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' },
  ],
};

/** A content-driven scene whose only animation source is the ticker crawl. */
function tickerScene(repeat: number | 'infinite'): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-ticker',
    name: 'ticker',
    templateType: 'ticker',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    playout: { mode: 'content-driven', repeat },
    layers: [
      {
        id: 'L1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [tickerElement],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-10T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z' },
  };
}

function bandEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-cg-element-id="crawl"]');
  if (el === null) throw new Error('ticker band not rendered');
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('createRuntime — self-wired content-driven ticker (D-028)', () => {
  it('repeat: N exits after exactly N content passes with NO boot wiring', async () => {
    const clock = makeClock();
    const runtime = createRuntime(tickerScene(2), { skipFontLoad: true, clock, tickerMeasure });
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});

    // Pass 1: intro is instant (no keyframed elements) → hold starts the
    // treadmill → hook = (320 + 400) / 100 px/s = 7200 ms.
    clock.advance(7100);
    expect(events).toEqual([]); // still in pass 1
    clock.advance(100); // 7200 — outro (instant) → pass 2 begins
    expect(events).toEqual([]); // not exiting yet (one pass left)

    // Pass 2 self-corrects: the crawl kept rolling, so the next boundary is
    // cycle 2's seam: (640 + 400 − 720) / 100 = 3200 ms.
    clock.advance(3100);
    expect(events).toEqual([]);
    clock.advance(100); // 10400 total — final outro + settle
    expect(events).toEqual(['stop.start', 'stop.end']);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it("repeat: 'infinite' crawls until stop()", async () => {
    const clock = makeClock();
    const runtime = createRuntime(tickerScene('infinite'), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    clock.advance(100_000); // many passes — never exits on its own
    expect(events).toEqual([]);
    await runtime.stop();
    clock.advance(1);
    expect(events).toEqual(['stop.end']);
  });

  it('an explicit boot durationHook overrides the self-wired ticker hook', async () => {
    const clock = makeClock();
    const runtime = createRuntime(tickerScene(2), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
      durationHook: () => 1000,
    });
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    clock.advance(1000); // pass 1 (explicit 1000ms, not 7200)
    clock.advance(1000); // pass 2
    expect(events).toEqual(['stop.end']);
  });

  it('the crawl starts at the first hold and the static authoring layout is gone', async () => {
    const clock = makeClock();
    const runtime = createRuntime(tickerScene('infinite'), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    expect(bandEl().querySelector('[data-cg-ticker-static]')).not.toBeNull();
    await runtime.play({});
    expect(bandEl().querySelector('[data-cg-ticker-static]')).toBeNull();
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    clock.advance(500); // d = 50
    expect(track?.style.transform).toBe('translateX(50px)'); // rtl: moves left→right
  });

  it('pause()/resume() freeze the crawl in lockstep with the pass timer', async () => {
    const clock = makeClock();
    const runtime = createRuntime(tickerScene(1), { skipFontLoad: true, clock, tickerMeasure });
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    clock.advance(7000); // 200ms before the single pass ends
    runtime.pause();
    clock.advance(50_000); // frozen — neither timer nor crawl advances
    expect(events).toEqual([]);
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    expect(track?.style.transform).toBe('translateX(700px)');
    runtime.resume();
    clock.advance(200);
    expect(events).toEqual(['stop.end']);
  });

  it('a ticker nested in a child composition drives ITS OWN scope (not root-only)', async () => {
    const clock = makeClock();
    const scene: Scene = {
      ...tickerScene(2),
      playout: { mode: 'manual' }, // root holds; the CHILD is content-driven
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'inst',
              name: 'band-instance',
              type: 'composition',
              compositionId: 'comp-band',
              transform: baseTransform,
              opacity: 1,
              visible: true,
              locked: false,
              zIndex: 0,
            },
          ],
        },
      ],
      compositions: [
        {
          id: 'comp-band',
          name: 'band',
          resolution: { width: 400, height: 60 },
          frameRange: { in: 0, out: 50 },
          background: 'transparent',
          playout: { mode: 'content-driven', repeat: 1 },
          layers: [
            {
              id: 'CL1',
              name: 'band-layer',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [tickerElement],
            },
          ],
        },
      ],
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await runtime.play({});
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    // The child scope's hold started the nested treadmill (root is manual)…
    clock.advance(500);
    expect(track?.style.transform).toBe('translateX(50px)');
    // …and the child's own pass duration came from ITS ticker: after 7200 ms
    // the child settles (repeat: 1) and freezes its crawl; root keeps holding.
    clock.advance(6700); // 7200 total
    clock.advance(1000); // frozen after settle — no further motion
    expect(track?.style.transform).toBe('translateX(720px)');
    expect(document.body.classList.contains('cg-pending')).toBe(false); // root still on air
  });

  it('update() with a list field reconciles the crawl through the ticker-items binding', async () => {
    const clock = makeClock();
    const scene: Scene = {
      ...tickerScene('infinite'),
      fields: [
        {
          id: 'headlines',
          label: 'Headlines',
          required: false,
          type: 'list',
          default: [{ id: 'a', text: 'aaaaaaaaaa' }],
        },
      ],
      bindings: [{ fieldId: 'headlines', target: { kind: 'ticker-items', elementId: 'crawl' } }],
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    const driver = tickerDriverFor(bandEl());
    expect(driver).toBeDefined();
    await runtime.play({});
    // The field DEFAULT replaced the authored two items before the crawl began:
    // cycle = 100+10 = 110 ⇒ first pass (110+400)/100 = 5100 ms.
    expect(driver?.passRemainingMs()).toBe(5100);

    await runtime.update({ headlines: [{ id: 'a', text: 'aaaaaaaaaa' }, { id: 'n', text: 'nn' }] });
    clock.advance(60_000); // run ahead — the new item is part of the cycle now
    const texts = [...bandEl().querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => n.textContent ?? '');
    expect(texts).toContain('nn');

    // Bare string arrays coerce with positional ids (degraded fallback) — a
    // wire payload no schema validated, hence the cast.
    await runtime.update({ headlines: ['zzz'] } as unknown as Partial<FieldValues>);
    clock.advance(60_000);
    const after = [...bandEl().querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => n.textContent ?? '');
    expect(after).toContain('zzz');
  });
});
