import { beforeEach, describe, expect, it } from 'vitest';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * D-102 Phase 2 — the session-only PER-ELEMENT preview timing override extends from tickers
 * (Phase 1) to SEQUENCES and COUNTDOWN clocks, and reaches REPEATER-STAMPED content: every stamped
 * row is built from the SAME authored element, so the authored element's override governs them all
 * (the row subtree inherits its host scope's element-timing maps). Each driver stamps its EFFECTIVE
 * (post-override) timing on its host — `data-cg-sequence-repeat` / `-dwell`, `data-cg-countdown-ms`,
 * `data-cg-ticker-boundary` / `-repeat` — so stored vs. overridden is directly comparable. All of it
 * is session-only: the stored scene object is never mutated.
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

const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const baseElProps = {
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};
const font = {
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal' as const,
  size: 36,
  lineHeight: 1.4,
  letterSpacing: 0,
};

function sequenceEl(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...baseElProps,
    id,
    name: id,
    type: 'sequence',
    font,
    color: '#FFFFFF',
    align: 'start',
    verticalAlign: 'middle',
    direction: 'rtl',
    items: [
      { id: 'i1', text: 'یک' },
      { id: 'i2', text: 'دو' },
    ],
    defaultDwellMs: 5000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
    ...over,
  } as unknown as Element;
}

function clockEl(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...baseElProps,
    id,
    name: id,
    type: 'clock',
    font,
    color: '#FFFFFF',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'latin',
    target: { kind: 'duration', ms: 60_000 },
    ...over,
  } as unknown as Element;
}

function tickerEl(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...baseElProps,
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
    items: [{ id: 'a', text: 'خبر' }],
    ...over,
  } as unknown as Element;
}

/** A one-composition scene whose root layer holds `children`. */
function sceneOf(children: Element[], compositions: Composition[] = []): Scene {
  return {
    schemaVersion: 1,
    id: 'scene',
    name: 'Phase2',
    templateType: 'custom',
    resolution: { width: 800, height: 600 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    background: 'transparent',
    layers: [
      { id: 'pl', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions,
    metadata: { createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z' },
  } as unknown as Scene;
}

function el(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`);
  if (node === null) throw new Error(`element ${id} not rendered`);
  return node;
}

/**
 * A clock's DRIVER node is the inner time span (the D-105 content root, `data-cg-content="clock"`),
 * not the element box — that is where the effective countdown duration is stamped.
 */
function clockNode(box: HTMLElement): HTMLElement {
  const node = box.querySelector<HTMLElement>('[data-cg-content="clock"]');
  if (node === null) throw new Error('clock node not rendered');
  return node;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('createRuntime — per-element SEQUENCE timing overrides (D-102 Phase 2)', () => {
  const twoSequences = (): Scene =>
    sceneOf([
      sequenceEl('seqA', { repeat: 'infinite', defaultDwellMs: 5000 }),
      sequenceEl('seqB', { repeat: 'infinite', defaultDwellMs: 5000 }),
    ]);

  it('applies each sequence its OWN repeat / dwell — two independent drivers', () => {
    const scene = twoSequences();
    createRuntime(scene, {
      skipFontLoad: true,
      clock: makeClock(),
      scopeOverrides: {
        '': {
          sequences: {
            seqA: { repeat: 2, dwellMs: 800 },
            seqB: { repeat: 'infinite', dwellMs: 300 },
          },
        },
      },
    });
    expect(el('seqA').dataset['cgSequenceRepeat']).toBe('2');
    expect(el('seqA').dataset['cgSequenceDwell']).toBe('800');
    expect(el('seqB').dataset['cgSequenceRepeat']).toBe('infinite');
    expect(el('seqB').dataset['cgSequenceDwell']).toBe('300');
    // Session-only — the STORED scene is untouched.
    const stored = scene.layers[0]!.children as unknown as Record<string, unknown>[];
    expect(stored[0]!['repeat']).toBe('infinite');
    expect(stored[0]!['defaultDwellMs']).toBe(5000);
    expect(stored[1]!['defaultDwellMs']).toBe(5000);
  });

  it('an override on ONE sequence leaves the other at its authored values', () => {
    createRuntime(twoSequences(), {
      skipFontLoad: true,
      clock: makeClock(),
      scopeOverrides: { '': { sequences: { seqA: { dwellMs: 250 } } } },
    });
    expect(el('seqA').dataset['cgSequenceDwell']).toBe('250');
    // B keeps its authored dwell / passes.
    expect(el('seqB').dataset['cgSequenceDwell']).toBe('5000');
    expect(el('seqB').dataset['cgSequenceRepeat']).toBe('infinite');
  });

  it('no override → both sequences run their authored timing (no regression)', () => {
    createRuntime(twoSequences(), { skipFontLoad: true, clock: makeClock() });
    for (const id of ['seqA', 'seqB']) {
      expect(el(id).dataset['cgSequenceRepeat']).toBe('infinite');
      expect(el(id).dataset['cgSequenceDwell']).toBe('5000');
    }
  });

  it('a SEQUENCE override never touches a ticker in the same scope', () => {
    createRuntime(sceneOf([sequenceEl('seqA'), tickerEl('tk')]), {
      skipFontLoad: true,
      clock: makeClock(),
      tickerMeasure,
      scopeOverrides: { '': { sequences: { seqA: { repeat: 2 } } } },
    });
    expect(el('seqA').dataset['cgSequenceRepeat']).toBe('2');
    expect(el('tk').dataset['cgTickerRepeat']).toBe('infinite'); // authored
  });
});

describe('createRuntime — per-element COUNTDOWN timing overrides (D-102 Phase 2)', () => {
  it('overrides a DURATION-target countdown, leaving another countdown authored', () => {
    const scene = sceneOf([
      clockEl('cdA', { target: { kind: 'duration', ms: 60_000 } }),
      clockEl('cdB', { target: { kind: 'duration', ms: 90_000 } }),
    ]);
    createRuntime(scene, {
      skipFontLoad: true,
      clock: makeClock(),
      scopeOverrides: { '': { countdowns: { cdA: { durationMs: 3000 } } } },
    });
    expect(clockNode(el('cdA')).dataset['cgCountdownMs']).toBe('3000');
    expect(clockNode(el('cdB')).dataset['cgCountdownMs']).toBe('90000'); // authored — untouched
    // Session-only — the stored target is unchanged.
    const stored = scene.layers[0]!.children as unknown as Record<string, unknown>[];
    expect(stored[0]!['target']).toEqual({ kind: 'duration', ms: 60_000 });
  });

  it('overrides a DATETIME-deadline countdown with a duration (the only way to rehearse it)', () => {
    const scene = sceneOf([
      clockEl('cdIso', { target: { kind: 'datetime', iso: '2030-01-01T20:00:00Z' } }),
    ]);
    // Without an override there is no ms to stamp — the clock counts to a wall-clock deadline.
    createRuntime(scene, { skipFontLoad: true, clock: makeClock() });
    expect(clockNode(el('cdIso')).dataset['cgCountdownMs']).toBeUndefined();

    document.body.innerHTML = '';
    createRuntime(scene, {
      skipFontLoad: true,
      clock: makeClock(),
      scopeOverrides: { '': { countdowns: { cdIso: { durationMs: 5000 } } } },
    });
    expect(clockNode(el('cdIso')).dataset['cgCountdownMs']).toBe('5000');
    const stored = scene.layers[0]!.children as unknown as Record<string, unknown>[];
    expect(stored[0]!['target']).toEqual({ kind: 'datetime', iso: '2030-01-01T20:00:00Z' });
  });

  it('wall / countup clocks are never overridden (they never complete)', () => {
    createRuntime(
      sceneOf([
        clockEl('wall', { mode: 'wall', target: undefined }),
        clockEl('up', { mode: 'countup', target: undefined }),
      ]),
      {
        skipFontLoad: true,
        clock: makeClock(),
        // Even if a stale map addressed them by id, a non-countdown clock takes no duration.
        scopeOverrides: { '': { countdowns: { wall: { durationMs: 1000 } } } },
      },
    );
    expect(clockNode(el('wall')).dataset['cgCountdownMs']).toBeUndefined();
    expect(clockNode(el('up')).dataset['cgCountdownMs']).toBeUndefined();
  });
});

describe('createRuntime — repeater-stamped content honors the AUTHORED element override (D-102 Phase 2)', () => {
  /** A repeater over a child composition that holds a ticker + a countdown. */
  function repeaterScene(): Scene {
    const row = {
      id: 'rowc',
      name: 'Row',
      resolution: { width: 400, height: 60 },
      frameRange: { in: 0, out: 40 },
      background: 'transparent',
      layers: [
        {
          id: 'rl',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [tickerEl('rowTicker'), clockEl('rowCountdown')],
        },
      ],
      fields: [],
      bindings: [],
    } as unknown as Composition;
    const repeater = {
      ...baseElProps,
      id: 'rep',
      name: 'Repeater',
      type: 'repeater',
      compositionId: 'rowc',
      direction: 'column',
      flow: 'rtl',
      gap: 10,
      items: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
    } as unknown as Element;
    return sceneOf([repeater], [row]);
  }

  /** Every stamped row's copy of the authored element (rows share the element id). */
  function stamped(elementId: string): HTMLElement[] {
    return [
      ...document.querySelectorAll<HTMLElement>(
        `[data-cg-repeater-row] [data-cg-element-id="${elementId}"]`,
      ),
    ];
  }

  it('the authored ticker override reaches EVERY stamped row (one control, all rows)', () => {
    const scene = repeaterScene();
    createRuntime(scene, {
      skipFontLoad: true,
      clock: makeClock(),
      tickerMeasure,
      // The override is written against the AUTHORED element id, under the scope that HOSTS the
      // repeater — the row subtrees are wired under synthetic paths no override addresses.
      scopeOverrides: { '': { tickers: { rowTicker: { repeat: 2, cycleBoundary: 'drain' } } } },
    });
    const bands = stamped('rowTicker');
    expect(bands).toHaveLength(3); // three data rows
    for (const b of bands) {
      expect(b.dataset['cgTickerRepeat']).toBe('2');
      expect(b.dataset['cgTickerBoundary']).toBe('drain');
    }
    // Session-only — the stored child composition is untouched.
    const authored = scene.compositions![0]!.layers[0]!.children[0] as unknown as Record<
      string,
      unknown
    >;
    expect(authored['repeat']).toBe('infinite');
    expect(authored['cycleBoundary']).toBe('seamless');
  });

  it('a countdown inside the repeater child is overridden across all rows too', () => {
    createRuntime(repeaterScene(), {
      skipFontLoad: true,
      clock: makeClock(),
      tickerMeasure,
      scopeOverrides: { '': { countdowns: { rowCountdown: { durationMs: 2000 } } } },
    });
    const clocks = stamped('rowCountdown');
    expect(clocks).toHaveLength(3);
    for (const c of clocks) expect(clockNode(c).dataset['cgCountdownMs']).toBe('2000');
  });

  it('no override → every stamped row runs the authored timing (no regression)', () => {
    createRuntime(repeaterScene(), { skipFontLoad: true, clock: makeClock(), tickerMeasure });
    for (const b of stamped('rowTicker')) {
      expect(b.dataset['cgTickerRepeat']).toBe('infinite');
      expect(b.dataset['cgTickerBoundary']).toBe('seamless');
    }
    for (const c of stamped('rowCountdown'))
      expect(clockNode(c).dataset['cgCountdownMs']).toBe('60000');
  });
});
