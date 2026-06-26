import { beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Scene, SequenceElement } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { SequenceDriver } from '../src/sequence-driver.js';

/** Fake rAF + timer clock (same pattern as the ticker/clock-runtime tests). */
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

/** Deterministic ticker width: 10px per code unit (the ticker fixture math). */
const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

// Two items, dwell 500, transition 400, repeat 1 ⇒ the run completes at
// 500 + 400 + 500 = 1400ms of active hold time.
function sequenceElement(overrides: Partial<SequenceElement>): SequenceElement {
  return {
    id: 'seq',
    name: 'now-next',
    type: 'sequence',
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
    align: 'start',
    direction: 'rtl',
    items: [
      { id: 'a', text: 'اکنون: یک' },
      { id: 'b', text: 'سپس: دو' },
    ],
    defaultDwellMs: 500,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 1,
    ...overrides,
  };
}

// Fixture math (cf. ticker-runtime): repeat 1 ticker completes at 7100ms.
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
  repeat: 1,
  cycleBoundary: 'seamless' as const,
  items: [
    { id: 'a', text: 'aaaaaaaaaa' },
    { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' },
  ],
};

const clockElement = {
  id: 'clk',
  name: 'clock',
  type: 'clock' as const,
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  font: {
    family: 'Vazirmatn',
    weight: 600,
    style: 'normal' as const,
    size: 48,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  color: '#FFFFFF',
  align: 'center' as const,
  mode: 'countdown' as const,
  format: 'mm:ss',
  digits: 'latin' as const,
  target: { kind: 'duration' as const, ms: 2000 },
};

function sequenceScene(opts: {
  playout?: Scene['playout'];
  sequence: Partial<SequenceElement>;
  withTicker?: boolean;
  withClock?: boolean;
  fields?: Scene['fields'];
  bindings?: Scene['bindings'];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-seq',
    name: 'sequence',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    ...(opts.playout !== undefined ? { playout: opts.playout } : {}),
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          sequenceElement(opts.sequence),
          ...(opts.withTicker === true ? [tickerElement] : []),
          ...(opts.withClock === true ? [clockElement] : []),
        ],
      },
    ],
    fields: opts.fields ?? [],
    bindings: opts.bindings ?? [],
    fonts: [],
    metadata: { createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z' },
  };
}

/** Texts of the on-stage (non-hidden) sequence item nodes. */
function visibleItems(): string[] {
  const host = document.querySelector<HTMLElement>('[data-cg-element-id="seq"]');
  if (host === null) throw new Error('sequence host not rendered');
  return [...host.querySelectorAll<HTMLElement>('[data-cg-sequence-item]')]
    .filter((n) => n.style.visibility !== 'hidden')
    .map((n) => n.textContent ?? '');
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('createRuntime — sequence content source + next() dispatch (D-029)', () => {
  it('auto-out + content-driven: a finite sequence alone governs the hold', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        sequence: {},
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 1300); // completes at 1400ms of hold time
    expect(events).toEqual([]);
    await run(clock, 300);
    expect(events).toEqual(['stop.start', 'stop.end']);
    // The LAST item stayed on screen through the exit.
    expect(visibleItems()).toEqual(['سپس: دو']);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('an INFINITE sequence is not a content source — it holds until stop()', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        sequence: { repeat: 'infinite' },
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 20_000, 500); // cycles forever — never exits on its own
    expect(events).toEqual([]);
    await runtime.stop();
    expect(events).toEqual(['stop.end']);
  });

  it('all three content-source kinds mixed: the LAST one governs (Promise.all)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        sequence: {}, // completes at 1400ms
        withClock: true, // countdown completes at 2000ms
        withTicker: true, // repeat-1 crawl completes at 7100ms — governs
      }),
      { skipFontLoad: true, clock, tickerMeasure },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 6900);
    expect(events).toEqual([]); // sequence + countdown done long ago
    await run(clock, 500);
    expect(events).toEqual(['stop.end']);
  });

  it('stop() during a sequence-held hold is IMMEDIATE — hard out', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        sequence: { defaultDwellMs: 60_000 }, // would hold for minutes
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.start', () => events.push('stop.start'));
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 2000);
    await runtime.stop(); // must NOT wait for the pass to finish
    expect(events).toEqual(['stop.start', 'stop.end']);
    await run(clock, 120_000, 5000); // the abandoned run never replays the outro
    expect(events).toEqual(['stop.start', 'stop.end']);
  });

  it('loop-cycle: each hold entry starts a FRESH run from item 1', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 2 },
        sequence: {}, // each cycle's run = 1400ms
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 1600); // inside cycle 2 — item 1 again (fresh run)
    expect(events).toEqual([]);
    expect(visibleItems()).toEqual(['اکنون: یک']);
    await run(clock, 1500); // cycle 2's run plays out too
    expect(events).toEqual(['stop.end']);
  });

  it('runtime.next() advances the sequence; in manual mode it is the only driver', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'manual' },
        sequence: { advance: 'manual', repeat: 'infinite' },
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    await run(clock, 5000, 500); // manual: time alone never advances
    expect(visibleItems()).toEqual(['اکنون: یک']);
    await runtime.next();
    await run(clock, 400); // the transition plays
    expect(visibleItems()).toEqual(['سپس: دو']);
  });

  it('next() is a safe no-op for a template with no sequences', async () => {
    const clock = makeClock();
    const scene = sequenceScene({ playout: { mode: 'manual' }, sequence: {} });
    scene.layers[0]!.children = []; // strip everything
    const runtime = createRuntime(scene, { skipFontLoad: true, clock });
    await runtime.play({});
    await expect(runtime.next?.()).resolves.toBeUndefined();
  });

  it('a next() during the intro (before the run starts) is ignored', async () => {
    const clock = makeClock();
    // A manual-advance run that we next() BEFORE play(): nothing may move.
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'manual' },
        sequence: { advance: 'manual', repeat: 'infinite' },
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.next?.(); // pre-play: the drivers are idle — ignored
    await runtime.play({});
    await run(clock, 500);
    expect(visibleItems()).toEqual(['اکنون: یک']);
  });

  it('pause()/resume() freeze the dwell and the hold in lockstep', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'auto-out', holdSource: 'content-driven' },
        sequence: {},
      }),
      { skipFontLoad: true, clock },
    );
    const events: string[] = [];
    runtime.on('stop.end', () => events.push('stop.end'));
    await runtime.play({});
    await run(clock, 300); // mid first dwell
    runtime.pause();
    await run(clock, 30_000, 1000);
    expect(events).toEqual([]);
    expect(visibleItems()).toEqual(['اکنون: یک']); // frozen
    runtime.resume();
    await run(clock, 1300); // remaining 1100ms of the run + margin
    expect(events).toEqual(['stop.end']);
  });

  it('tick(frame) never moves the sequence (scrub has no representation)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({ playout: { mode: 'manual' }, sequence: { repeat: 'infinite' } }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    await run(clock, 200);
    const before = visibleItems();
    runtime.tick(0);
    runtime.tick(42);
    expect(visibleItems()).toEqual(before);
  });

  it('update() with a bound list reconciles through the sequence-items binding', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      sequenceScene({
        playout: { mode: 'manual' },
        sequence: { advance: 'manual', repeat: 'infinite' },
        fields: [
          {
            id: 'rundown',
            label: 'Rundown',
            required: false,
            type: 'list',
            default: [
              { id: 'a', text: 'اکنون: یک' },
              { id: 'b', text: 'سپس: دو' },
            ],
          },
        ],
        bindings: [{ fieldId: 'rundown', target: { kind: 'sequence-items', elementId: 'seq' } }],
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    // In-place edit of the CURRENT item — never yanked, text corrected live.
    await runtime.update({
      rundown: [
        { id: 'a', text: 'اکنون: ویرایش‌شده' },
        { id: 'b', text: 'سپس: دو' },
        { id: 'c', text: 'بعد: سه', dwellMs: 750 },
      ],
    });
    expect(visibleItems()).toEqual(['اکنون: ویرایش‌شده']);
    // The appended item (with its per-item dwell) is reachable by next().
    await runtime.next?.();
    await run(clock, 400);
    await runtime.next?.();
    await run(clock, 400);
    expect(visibleItems()).toEqual(['بعد: سه']);
  });
});

describe('createRuntime — D-083 composition sequence items (text | composition)', () => {
  /** A one-element composition: a countdown clock (deterministic with the fake clock). */
  function clockComp(): Composition {
    return {
      id: 'comp-clock',
      name: 'Clock card',
      resolution: { width: 400, height: 60 },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      layers: [
        {
          id: 'cl',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          // A long countdown so it ticks throughout the test without completing.
          children: [{ ...clockElement, target: { kind: 'duration', ms: 600_000 } }],
        },
      ],
      fields: [],
      bindings: [],
    } as unknown as Composition;
  }

  function compScene(seq: Partial<SequenceElement>): Scene {
    return {
      schemaVersion: 1,
      id: 'scene-seq-comp',
      name: 'rotating-title',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      background: 'transparent',
      playout: { mode: 'manual' },
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [sequenceElement(seq)],
        },
      ],
      fields: [],
      bindings: [],
      fonts: [],
      compositions: [clockComp()],
      metadata: { createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z' },
    } as unknown as Scene;
  }

  /** The clock time inside the sequence host (null when no composition item is on stage). */
  function clockText(): string | null {
    return (
      document.querySelector<HTMLElement>('[data-cg-element-id="seq"] [data-cg-clock-time]')
        ?.textContent ?? null
    );
  }

  it('renders the referenced composition content with a LIVE ticking clock', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      compScene({
        advance: 'manual',
        repeat: 'infinite',
        items: [
          { kind: 'composition', id: 'c1', compositionId: 'comp-clock' },
          { id: 't1', text: 'NEXT' },
        ],
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    // Item 1 is the composition: its clock is on stage at its initial value.
    const t0 = clockText();
    expect(t0).not.toBeNull();
    expect(t0).toBe('10:00');
    // The inner clock TICKS — the whole point of the live wiring (D-084 timezone /
    // D-103 blink ride along the existing clock engine).
    await run(clock, 3000);
    expect(clockText()).toBe('09:57');
    expect(clockText()).not.toBe(t0);
  });

  it('advancing away tears down the composition item (its clock is gone)', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      compScene({
        advance: 'manual',
        repeat: 'infinite',
        transitionMs: 100,
        items: [
          { kind: 'composition', id: 'c1', compositionId: 'comp-clock' },
          { id: 't1', text: 'NEXT' },
        ],
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    expect(clockText()).not.toBeNull();
    await runtime.next?.();
    await run(clock, 300); // the transition completes; the old comp item is removed
    expect(visibleItems()).toEqual(['NEXT']);
    expect(clockText()).toBeNull(); // the comp clock subtree was torn down
  });

  it('pause() freezes the composition item clock in lockstep', async () => {
    const clock = makeClock();
    const runtime = createRuntime(
      compScene({
        advance: 'manual',
        repeat: 'infinite',
        items: [{ kind: 'composition', id: 'c1', compositionId: 'comp-clock' }],
      }),
      { skipFontLoad: true, clock },
    );
    await runtime.play({});
    await run(clock, 2000);
    const frozen = clockText();
    runtime.pause();
    await run(clock, 30_000, 1000);
    expect(clockText()).toBe(frozen); // the inner clock froze with the sequence
    runtime.resume();
    await run(clock, 3000);
    expect(clockText()).not.toBe(frozen); // and resumed
  });

  it('destroy() tears down a composition item subtree (no leaked inner drivers)', () => {
    let live = 0;
    const host = document.createElement('div');
    host.style.width = '400px';
    host.style.height = '60px';
    document.body.appendChild(host);
    const driver = new SequenceDriver({
      host,
      direction: 'ltr',
      items: [{ kind: 'composition', id: 'c1', compositionId: 'x' }],
      defaultDwellMs: 1000,
      advance: 'manual',
      transitionIn: 'bottom',
      transitionOut: 'top',
      transitionTiming: 'simultaneous',
      transitionMs: 100,
      repeat: 'infinite',
      // Stand-in for the runtime's wired comp subtree: build increments, hide (idempotent)
      // decrements — so `live` is exactly the count of un-torn-down subtrees.
      renderComposition: () => {
        live += 1;
        let down = false;
        return {
          node: document.createElement('div'),
          show: () => undefined,
          pause: () => undefined,
          resume: () => undefined,
          hide: () => {
            if (!down) {
              down = true;
              live -= 1;
            }
          },
        };
      },
    });
    driver.start(); // builds + shows item 1
    expect(live).toBe(1);
    driver.destroy(); // must tear it down — NOT rebuild a stranded subtree
    expect(live).toBe(0);
  });
});
