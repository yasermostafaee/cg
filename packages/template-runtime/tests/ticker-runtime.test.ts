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

/**
 * Advance the fake clock in small steps with microtask drains in between —
 * content completion resolves on a microtask after the rAF step that crossed
 * the boundary, and the controller's reaction (outro → next cycle) must land
 * before the next advance.
 */
async function run(clock: ReturnType<typeof makeClock>, totalMs: number, step = 100): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
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

// Fixture math: items a(100px) + b(200px), gap 10, viewport 400.
// One cycle: a@0, b@110 ⇒ tail end 310 ⇒ repeat 1 completes at d ≥ 710 (7100ms
// @ 100px/s); repeat 2 (seamless): cycle 2 a@320, b@430 ⇒ end 630 ⇒ d ≥ 1030.
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
  repeat: 'infinite' as const,
  cycleBoundary: 'seamless' as const,
  items: [
    { id: 'a', text: 'aaaaaaaaaa' },
    { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' },
  ],
};

function tickerScene(overrides: {
  playout?: Scene['playout'];
  tickerRepeat?: number | 'infinite';
  cycleBoundary?: 'seamless' | 'drain';
}): Scene {
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
    ...(overrides.playout !== undefined ? { playout: overrides.playout } : {}),
    layers: [
      {
        id: 'L1',
        name: 'band',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            ...tickerElement,
            repeat: overrides.tickerRepeat ?? 'infinite',
            cycleBoundary: overrides.cycleBoundary ?? 'seamless',
          },
        ],
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

describe('createRuntime — two-loop ticker playout (D-028)', () => {
  it('auto-out + content-driven: the hold lasts until the ticker finishes its finite repeat', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      tickerScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        tickerRepeat: 2,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    // Two seamless passes end when the 2nd cycle's tail fully exits: 10300ms.
    await run(clock, 10_200);
    expect(events).toEqual([]);
    await run(clock, 200);
    expect(events).toEqual(['stop.start', 'stop.end']);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it("an 'infinite' ticker holds until stop() (completion never fires)", async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      tickerScene({ playout: { mode: 'auto-out', holdSource: 'content-driven' } }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 60_000, 1000);
    expect(events).toEqual([]); // never exits on its own
    await runtime.stop();
    expect(events).toEqual(['stop.end']);
  });

  it('NESTED LOOPS: loop-cycle repeat=2 × ticker repeat=2 ⇒ the crawl restarts each cycle and content plays 4 passes', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      tickerScene({
        playout: { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 2 },
        tickerRepeat: 2,
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    // Cycle 1's hold: 2 passes ⇒ 10300ms; outro/intro replays are instant
    // (no keyframes), then cycle 2 RESTARTS the crawl from its entering edge.
    await run(clock, 10_400);
    expect(events).toEqual([]); // one composition cycle left
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    // Fresh run: the offset restarted (translateX counts from the new hold).
    const tx = Number.parseFloat(/translateX\((-?[\d.]+)px\)/.exec(track?.style.transform ?? '')?.[1] ?? 'NaN');
    expect(tx).toBeLessThan(1030); // restarted — not continuing past cycle 1's end
    await run(clock, 10_400);
    expect(events).toEqual(['stop.end']); // 2 cycles × 2 passes = 4 crawls total
  });

  it('an explicit boot contentHold overrides the self-wired ticker completion (root scope)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      tickerScene({ playout: { mode: 'auto-out', holdSource: 'content-driven' } }), // infinite ticker
      {
        skipFontLoad: true,
        clock,
        tickerMeasure,
        contentHold: () => Promise.resolve(), // external: completes immediately
      },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 100); // the infinite ticker would NEVER end this hold
    expect(events).toEqual(['stop.end']);
  });

  it('a scope with NO tickers gets a zero-length content hold (legacy parity)', async () => {
    const clock = makeClock();
    const scene: Scene = {
      ...tickerScene({ playout: { mode: 'auto-out', holdSource: 'content-driven' } }),
      layers: [], // no content elements at all
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 100);
    expect(events).toEqual(['stop.end']); // instant outro — nothing to wait for
  });

  it("LEGACY: a stored `mode: 'content-driven'` scene normalizes and still plays", async () => {
    const clock = makeClock();
    const scene = tickerScene({ tickerRepeat: 1 });
    // Simulate a pre-D-028 stored document handed straight to the runtime.
    const legacy = {
      ...scene,
      playout: { mode: 'content-driven' },
    } as unknown as Scene;
    const runtime = createRuntime(legacy, { skipFontLoad: true, clock, tickerMeasure });
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    // Normalized to loop-cycle (1 cycle) + content-driven hold: one ticker run
    // (repeat 1 ⇒ completes at 7100ms), then exit.
    await run(clock, 7000);
    expect(events).toEqual([]);
    await run(clock, 200);
    expect(events).toEqual(['stop.end']);
  });

  it('pause()/resume() freeze the crawl and the content hold in lockstep', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      tickerScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        tickerRepeat: 1, // completes at 7100ms
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 7000); // 100ms short of completion
    runtime.pause();
    await run(clock, 50_000, 5000); // frozen — completion cannot arrive
    expect(events).toEqual([]);
    runtime.resume();
    await run(clock, 200);
    expect(events).toEqual(['stop.end']);
  });

  it('a ticker nested in a child composition drives ITS OWN scope (root manual keeps holding)', async () => {
    const clock = makeClock();
    const scene: Scene = {
      ...tickerScene({}),
      playout: { mode: 'manual' },
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
          playout: { mode: 'auto-out', holdSource: 'content-driven' },
          layers: [
            {
              id: 'CL1',
              name: 'band-layer',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [{ ...tickerElement, repeat: 1 as const }],
            },
          ],
        },
      ],
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await runtime.play({});
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    await run(clock, 500);
    expect(track?.style.transform).toBe('translateX(50px)'); // child crawl runs
    // The child completes its single pass at 7100ms and settles; its crawl
    // freezes; the manual root stays on air.
    await run(clock, 7000);
    const frozen = track?.style.transform;
    await run(clock, 5000, 1000);
    expect(track?.style.transform).toBe(frozen);
    expect(document.body.classList.contains('cg-pending')).toBe(false);
  });

  it('a finite root self-settle exits a nested infinite ticker (nothing rolls under the hidden stage)', async () => {
    const clock = makeClock();
    const scene: Scene = {
      ...tickerScene({}),
      // Root: content-driven hold with NO root tickers ⇒ zero-length hold ⇒
      // settles right after play; the nested infinite crawl must be taken
      // down with it.
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
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
          playout: { mode: 'manual' },
          layers: [
            {
              id: 'CL1',
              name: 'band-layer',
              visible: true,
              locked: false,
              blendMode: 'normal',
              children: [tickerElement], // infinite
            },
          ],
        },
      ],
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    await runtime.play({});
    await run(clock, 200);
    expect(document.body.classList.contains('cg-pending')).toBe(true); // root settled
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    const frozen = track?.style.transform;
    await run(clock, 60_000, 5000);
    expect(track?.style.transform).toBe(frozen); // crawl frozen — rAF stopped
  });

  it('update() with a list field reconciles the crawl through the ticker-items binding', async () => {
    const clock = makeClock();
    const scene: Scene = {
      ...tickerScene({ playout: { mode: 'manual' } }), // band holds; crawl rolls
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
    expect(tickerDriverFor(bandEl())).toBeDefined();
    await runtime.play({});
    await run(clock, 500);
    // The field DEFAULT replaced the authored two items before the crawl began.
    const initial = [...bandEl().querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => n.textContent ?? '');
    expect(initial).not.toContain('bbbbbbbbbbbbbbbbbbbb');

    await runtime.update({ headlines: [{ id: 'a', text: 'aaaaaaaaaa' }, { id: 'n', text: 'nn' }] });
    await run(clock, 60_000, 5000); // run ahead — the new item joins the cycle
    const texts = [...bandEl().querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => n.textContent ?? '');
    expect(texts).toContain('nn');

    // Bare string arrays coerce with positional ids (degraded fallback) — a
    // wire payload no schema validated, hence the cast.
    await runtime.update({ headlines: ['zzz'] } as unknown as Partial<FieldValues>);
    await run(clock, 60_000, 5000);
    const after = [...bandEl().querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => n.textContent ?? '');
    expect(after).toContain('zzz');
  });

  it('the crawl starts at the first hold and the static authoring layout is gone', async () => {
    const clock = makeClock();
    const runtime = createRuntime(tickerScene({ playout: { mode: 'manual' } }), {
      skipFontLoad: true,
      clock,
      tickerMeasure,
    });
    expect(bandEl().querySelector('[data-cg-ticker-static]')).not.toBeNull();
    await runtime.play({});
    expect(bandEl().querySelector('[data-cg-ticker-static]')).toBeNull();
    const track = bandEl().querySelector<HTMLElement>('.cg-ticker-track');
    await run(clock, 500);
    expect(track?.style.transform).toBe('translateX(50px)'); // rtl: moves left→right
  });

  it('band padding shrinks the crawl viewport (completion uses the padded width)', async () => {
    const clock = makeClock();
    const base = tickerScene({
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
      tickerRepeat: 1,
    });
    const layer = base.layers[0];
    if (layer === undefined) throw new Error('fixture layer missing');
    const el = layer.children[0];
    if (el === undefined || el.type !== 'ticker') throw new Error('fixture ticker missing');
    const scene: Scene = {
      ...base,
      layers: [
        {
          ...layer,
          children: [{ ...el, padding: { top: 4, right: 30, bottom: 4, left: 30 } }],
        },
      ],
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, clock, tickerMeasure });
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    // viewport = 400 − 60 = 340 ⇒ one pass ends at d ≥ 310 + 340 = 650 ⇒ 6500ms.
    await run(clock, 6400);
    expect(events).toEqual([]);
    await run(clock, 200);
    expect(events).toEqual(['stop.end']);
    expect(bandEl().querySelector('.cg-ticker-viewport')).not.toBeNull();
  });
});
