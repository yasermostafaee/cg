import { beforeEach, describe, expect, it } from 'vitest';
import {
  migrateScene,
  type ClockElement,
  type Element as SceneElement,
  type Scene,
} from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { compileStepCss } from '../src/step-css.js';

/**
 * D-141 Phase 4 — the runtime wiring: `clock-target` bindings routed through the
 * driver's re-target seam, and each scope's container handed to its clock drivers
 * as the step scope root.
 *
 * `DELTA-RUN-NEXT-VERSION-01-A` — the scenes below are still AUTHORED IN D-141 v1's zones and
 * per-element overrides: `createRuntime` migrates them to steps on the way in, so this file now
 * also proves that a zoned package reaches the same roots, the same reach and the same
 * nearest-wins through the migration. A step is published as `data-cg-cd<c>="<token>"`; the
 * migration names each step by its zone key, so `stepOf` reads the name back.
 *
 * On the colour assertions: jsdom resolves no `var()`, so these assert the full CHAIN that
 * produces a restyle — which scope root publishes which step, which elements carry which index,
 * and what the compiled stylesheet declares for that step — rather than a computed colour. The
 * pixel proof is the E2E's.
 */

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

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

const T = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const EL = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 } as const;

const ZONES = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
  ],
};

function clockEl(overrides: Partial<ClockElement> & { id: string }): ClockElement {
  return {
    ...EL,
    name: overrides.id,
    type: 'clock',
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'HH:mm:ss',
    digits: 'latin',
    ...overrides,
  } as ClockElement;
}

function shapeEl(id: string, overrides?: SceneElement['zoneOverrides']): SceneElement {
  return {
    ...EL,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#202020' },
    ...(overrides === undefined ? {} : { zoneOverrides: overrides }),
  } as SceneElement;
}

function layerOf(id: string, children: SceneElement[]) {
  return { id, name: id, visible: true, locked: false, blendMode: 'normal' as const, children };
}

function sceneOf(partial: Partial<Scene> & Pick<Scene, 'layers'>): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-d141',
    name: 'd141',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z' },
    ...partial,
  } as Scene;
}

/** The NAME of the step countdown `c` publishes on `root` (the migration names steps by zone key). */
function stepOf(root: HTMLElement, c: number): string | null {
  const token = root.getAttribute(`data-cg-cd${String(c)}`);
  if (token === null) return null;
  if (token === 'b') return 'normal';
  return ['caution', 'critical'][Number(token)] ?? token;
}

const timeText = (root: HTMLElement): string =>
  root.querySelector<HTMLElement>('[data-cg-clock-time]')?.textContent ?? '';

/** A local instant, so every expectation is time-zone independent by construction. */
const AT = (h: number, mi: number): number => new Date(2026, 6, 28, h, mi, 0, 0).getTime();

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

// — 4.1 / 4.2 — the clock-target binding ————————————————————————————————

describe('clock-target binding — re-target through the driver seam (D-141)', () => {
  const boundScene = (): Scene =>
    sceneOf({
      layers: [
        layerOf('L1', [clockEl({ id: 'clk', target: { kind: 'timeofday', time: '20:32' } })]),
      ],
      fields: [
        {
          type: 'text',
          id: 'targetTime',
          label: 'Target time',
          required: false,
          default: '20:32',
          pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
        },
      ],
      bindings: [{ fieldId: 'targetTime', target: { kind: 'clock-target', elementId: 'clk' } }],
    });

  it('a bound HH:mm value re-targets on update() WITHOUT replaying', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const rt = createRuntime(boundScene(), { clock });
    await rt.ready;
    await rt.play({});
    await flush();
    expect(timeText(document.body)).toBe('01:32:00'); // 19:00 → 20:32

    const events: string[] = [];
    rt.on('play.start', () => events.push('play.start'));

    await rt.update({ targetTime: '21:00' });
    await flush();
    expect(timeText(document.body)).toBe('02:00:00'); // re-aimed at once
    // No replay: the play cascade did not re-run.
    expect(events).toEqual([]);

    // …and it keeps ticking from the NEW deadline.
    clock.advance(60_000);
    await flush();
    expect(timeText(document.body)).toBe('01:59:00');
  });

  /*
    `PERSIAN-DIGITS-01` §2 B — the operator's keyboard is Persian. `۲۱:۰۰` used to fail the ASCII
    `\d` of the old parse, so the template kept the OLD target and reported the operator's own
    correct time as unparseable. The Latin case above is this one's control.
  */
  it('a time typed in Persian or Arabic-Indic digits re-targets exactly as a Latin one', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const rt = createRuntime(boundScene(), { clock });
    const errors: { code: string }[] = [];
    rt.on('error', (e) => errors.push(e));
    await rt.ready;
    await rt.play({});
    await flush();
    expect(timeText(document.body)).toBe('01:32:00');

    await rt.update({ targetTime: '۲۱:۰۰' });
    await flush();
    expect(timeText(document.body)).toBe('02:00:00');

    await rt.update({ targetTime: '٢١:٣٠' });
    await flush();
    expect(timeText(document.body)).toBe('02:30:00');
    expect(errors, 'a Persian time is not an unparseable one').toEqual([]);

    // The control: a value that is not a time is still refused, in any digit set.
    await rt.update({ targetTime: '۲۵:۳۲' });
    await flush();
    expect(timeText(document.body)).toBe('02:30:00');
    expect(errors.map((e) => e.code)).toEqual(['clock-target-unparseable']);
  });

  /*
    `DELTA-RUN-NEXT-VERSION-01-C` — CG Control's date and time control sends the STORED value: an
    ISO instant. The value decides the kind, so the same field re-aims a countdown at that exact
    instant — on another day if need be — through the same driver seam, without a replay.
  */
  it('an ISO date and time re-targets the countdown at that instant, without replaying', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const rt = createRuntime(boundScene(), { clock });
    const events: string[] = [];
    await rt.ready;
    await rt.play({});
    await flush();
    rt.on('play.start', () => events.push('play.start'));

    await rt.update({ targetTime: new Date(AT(19, 45)).toISOString() });
    await flush();
    expect(timeText(document.body)).toBe('00:45:00');
    // Tomorrow at 19:00 is 24 h away — a time of day could never say that.
    await rt.update({ targetTime: new Date(AT(19, 0) + 86_400_000).toISOString() });
    await flush();
    expect(timeText(document.body)).toBe('24:00:00');
    expect(events).toEqual([]);
  });

  it('the field DEFAULT applies at play() when the operator sent nothing', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const s = boundScene();
    // A default that differs from the authored target proves the binding ran.
    s.fields = [
      {
        type: 'text',
        id: 'targetTime',
        label: 'Target time',
        required: false,
        default: '19:45',
      },
    ] as Scene['fields'];
    const rt = createRuntime(s, { clock });
    await rt.ready;
    await rt.play({});
    await flush();
    expect(timeText(document.body)).toBe('00:45:00');
  });

  it('an UNPARSEABLE value applies NOTHING — the current target keeps running', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const rt = createRuntime(boundScene(), { clock });
    const errors: { code: string; elementId?: string }[] = [];
    rt.on('error', (e) => errors.push(e));
    await rt.ready;
    await rt.play({});
    await flush();
    expect(timeText(document.body)).toBe('01:32:00');

    await rt.update({ targetTime: '25:99' });
    await flush();
    // Unchanged — never a countdown blanked or zeroed by a typo.
    expect(timeText(document.body)).toBe('01:32:00');
    expect(errors.map((e) => e.code)).toEqual(['clock-target-unparseable']);
    expect(errors[0]?.elementId).toBe('clk');

    // Still ticking on the ORIGINAL deadline.
    clock.advance(60_000);
    await flush();
    expect(timeText(document.body)).toBe('01:31:00');

    // Reported ONCE — the same bad value on every UPDATE does not spam.
    await rt.update({ targetTime: '25:99' });
    await flush();
    expect(errors).toHaveLength(1);
  });

  it('routes a namespaced binding to the RIGHT instance — two instances re-target independently', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const s = sceneOf({
      layers: [
        layerOf('L1', [
          { ...EL, id: 'inst-a', name: 'early', type: 'composition', compositionId: 'child' },
          { ...EL, id: 'inst-b', name: 'late', type: 'composition', compositionId: 'child' },
        ] as SceneElement[]),
      ],
      compositions: [
        {
          id: 'child',
          name: 'child',
          resolution: { width: 400, height: 60 },
          editorBackdrop: 'transparent',
          frameRange: { in: 0, out: 50 },
          layers: [
            layerOf('CL', [clockEl({ id: 'clk', target: { kind: 'timeofday', time: '20:32' } })]),
          ],
          fields: [
            { type: 'text', id: 'targetTime', label: 'Target time', required: false, default: '' },
          ],
          bindings: [{ fieldId: 'targetTime', target: { kind: 'clock-target', elementId: 'clk' } }],
        },
      ] as Scene['compositions'],
    });
    const rt = createRuntime(s, { clock });
    await rt.ready;
    await rt.play({ early: { targetTime: '19:30' }, late: { targetTime: '21:30' } });
    await flush();

    const spans = document.body.querySelectorAll<HTMLElement>('[data-cg-clock-time]');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.textContent).toBe('00:30:00'); // the `early` instance
    expect(spans[1]?.textContent).toBe('02:30:00'); // the `late` instance

    // One namespace updating leaves the other alone.
    await rt.update({ early: { targetTime: '19:45' } });
    await flush();
    expect(spans[0]?.textContent).toBe('00:45:00');
    expect(spans[1]?.textContent).toBe('02:30:00');
  });
});

// — 4.3 / 4.4 — the zone scope root ————————————————————————————————————

describe('step scope roots — reach, nearest-wins, inertness, through the zone migration (D-141 v2)', () => {
  /** Host countdown + a nested composition holding an opted-in shape. */
  const nestedScene = (nestedZoned: boolean): Scene =>
    sceneOf({
      layers: [
        layerOf('L1', [
          clockEl({
            id: 'host-clk',
            target: { kind: 'duration', ms: 3_900_000 }, // 65 min: starts in `normal`
            zones: ZONES,
          }),
          shapeEl('host-shape', [{ zone: 'caution', fill: 'zone' }]),
          { ...EL, id: 'inst', name: 'child', type: 'composition', compositionId: 'child' },
        ] as SceneElement[]),
      ],
      compositions: [
        {
          id: 'child',
          name: 'child',
          resolution: { width: 400, height: 60 },
          editorBackdrop: 'transparent',
          frameRange: { in: 0, out: 50 },
          layers: [
            layerOf('CL', [
              shapeEl('nested-shape', [{ zone: 'caution', fill: 'zone' }]),
              ...(nestedZoned
                ? [
                    clockEl({
                      id: 'nested-clk',
                      target: { kind: 'duration', ms: 300_000 }, // 5 min: starts in `critical`
                      zones: ZONES,
                    }),
                  ]
                : []),
            ]),
          ],
        },
      ] as Scene['compositions'],
    });

  const rootOf = (): HTMLElement =>
    document.body.querySelector<HTMLElement>('.cg-stage') as HTMLElement;
  const innerOf = (): HTMLElement =>
    document.body.querySelector<HTMLElement>('.cg-comp-inner') as HTMLElement;

  it("a host countdown's boundary reaches an opted-in element INSIDE a nested instance", async () => {
    const clock = makeClock();
    const s = nestedScene(false);
    const rt = createRuntime(s, { clock });
    await rt.ready;
    await rt.play({});
    await flush();

    const root = rootOf();
    const inner = innerOf();
    expect(stepOf(root, 0)).toBe('normal');
    // The nested instance owns NO countdown with steps, so it is NOT a step root: nothing
    // intercepts the host's published values on the way down. That is what makes a step cross
    // an instance boundary.
    expect(inner.hasAttribute('data-cg-step-root')).toBe(false);

    clock.advance(300_000); // → 60 min remaining, crossing into `caution`
    await flush();
    expect(stepOf(root, 0)).toBe('caution');

    // The nested element carries an index, and the stylesheet publishes it under the
    // `caution` step — the complete chain from the host's boundary to the nested element's
    // colour. (The computed colour itself is the E2E's job.)
    const nested = document.body.querySelector<HTMLElement>('[data-cg-element-id="nested-shape"]');
    const slot = nested?.dataset['cgStepEl'];
    expect(slot).toBeDefined();
    const css = compileStepCss(migrateScene(s)).css;
    expect(css).toContain(`[data-cg-cd0='0']{--cgs-dur:400ms;`);
    expect(css).toContain(`--cgs-${String(slot)}-fill:#ffd600`);
  });

  it('NEAREST-WINS — host and nested countdowns in different zones each govern their own subtree', async () => {
    const clock = makeClock();
    const s = nestedScene(true);
    const rt = createRuntime(s, { clock });
    await rt.ready;
    await rt.play({});
    await flush();

    const root = rootOf();
    const inner = innerOf();
    // Two independent step roots, in DIFFERENT steps at the same instant.
    expect(stepOf(root, 0)).toBe('normal'); // 65 min out
    expect(inner.hasAttribute('data-cg-step-root')).toBe(true);
    expect(stepOf(inner, 1)).toBe('critical'); // 5 min out

    // The nested root being a step root is exactly what stops the host's values: the
    // compiled reset rule keys off `data-cg-step-root` and is emitted before the
    // equal-specificity publication rules, so the nested subtree resolves from the
    // NESTED step alone. And the migration gave the host's step NO change on the nested
    // shape — it belonged to the nested countdown — so nothing could reach it anyway.
    const css = compileStepCss(migrateScene(s)).css;
    expect(css.indexOf('[data-cg-step-root]')).toBeLessThan(css.indexOf("[data-cg-cd0='"));

    // They advance independently: the host crosses while the nested one holds.
    clock.advance(300_000);
    await flush();
    expect(stepOf(root, 0)).toBe('caution');
    expect(stepOf(inner, 1)).toBe('critical');
  });

  it('an override with NO enclosing zone renders authored — the migration leaves it nothing to apply', async () => {
    const clock = makeClock();
    // The same opted-in shape, but no zoned countdown anywhere (a composition
    // previewed standalone is this case).
    const s = sceneOf({
      layers: [layerOf('L1', [shapeEl('lonely', [{ zone: 'caution', fill: 'zone' }])])],
    });
    const rt = createRuntime(s, { clock });
    await rt.ready;
    await rt.play({});
    await flush();

    const root = rootOf();
    expect(root.hasAttribute('data-cg-step-root')).toBe(false);
    // The zone stylesheet compiled a consumption rule that fell back to the AUTHORED colour and
    // nothing published it; the migration drops the override (no countdown defines its key), so
    // there is nothing to compile — the element renders as authored either way: inert, not an error.
    expect(compileStepCss(migrateScene(s)).css).toBe('');
    expect(
      document.body.querySelector<HTMLElement>('[data-cg-element-id="lonely"]')?.dataset[
        'cgStepEl'
      ],
    ).toBeUndefined();
  });

  it('a zoned countdown injects the step stylesheet; a scene without one injects nothing', async () => {
    const clock = makeClock();
    const rt = createRuntime(nestedScene(false), { clock });
    await rt.ready;
    expect(document.getElementById('cg-steps')).not.toBeNull();

    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const plain = createRuntime(sceneOf({ layers: [layerOf('L1', [shapeEl('plain')])] }), {
      clock: makeClock(),
    });
    await plain.ready;
    expect(document.getElementById('cg-steps')).toBeNull();
  });
});
