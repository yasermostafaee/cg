import { beforeEach, describe, expect, it } from 'vitest';
import type { ClockElement, Element as SceneElement, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { compileZoneCss } from '../src/zone-css.js';

/**
 * D-141 Phase 4 — the runtime wiring: `clock-target` bindings routed through the
 * driver's re-target seam, and each scope's container handed to its clock drivers
 * as the zone scope root.
 *
 * On the zone assertions: jsdom resolves neither `var()` nor the cascade, so these
 * assert the full CHAIN that produces a restyle — which scope root publishes which
 * key, which elements carry which slot index, and what the compiled stylesheet
 * declares for that key — rather than a computed colour. The pixel proof is owed to
 * the phase-7 E2E and is NOT claimed here.
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
    background: 'transparent',
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z' },
    ...partial,
  } as Scene;
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
          id: 'azanTime',
          label: 'Azan time',
          required: false,
          default: '20:32',
          pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
        },
      ],
      bindings: [{ fieldId: 'azanTime', target: { kind: 'clock-target', elementId: 'clk' } }],
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

    await rt.update({ azanTime: '21:00' });
    await flush();
    expect(timeText(document.body)).toBe('02:00:00'); // re-aimed at once
    // No replay: the play cascade did not re-run.
    expect(events).toEqual([]);

    // …and it keeps ticking from the NEW deadline.
    clock.advance(60_000);
    await flush();
    expect(timeText(document.body)).toBe('01:59:00');
  });

  it('the field DEFAULT applies at play() when the operator sent nothing', async () => {
    const clock = makeClock();
    clock.advance(AT(19, 0));
    const s = boundScene();
    // A default that differs from the authored target proves the binding ran.
    s.fields = [
      {
        type: 'text',
        id: 'azanTime',
        label: 'Azan time',
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

    await rt.update({ azanTime: '25:99' });
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
    await rt.update({ azanTime: '25:99' });
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
          background: 'transparent',
          frameRange: { in: 0, out: 50 },
          layers: [
            layerOf('CL', [clockEl({ id: 'clk', target: { kind: 'timeofday', time: '20:32' } })]),
          ],
          fields: [{ type: 'text', id: 'azanTime', label: 'Azan', required: false, default: '' }],
          bindings: [{ fieldId: 'azanTime', target: { kind: 'clock-target', elementId: 'clk' } }],
        },
      ] as Scene['compositions'],
    });
    const rt = createRuntime(s, { clock });
    await rt.ready;
    await rt.play({ early: { azanTime: '19:30' }, late: { azanTime: '21:30' } });
    await flush();

    const spans = document.body.querySelectorAll<HTMLElement>('[data-cg-clock-time]');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.textContent).toBe('00:30:00'); // the `early` instance
    expect(spans[1]?.textContent).toBe('02:30:00'); // the `late` instance

    // One namespace updating leaves the other alone.
    await rt.update({ early: { azanTime: '19:45' } });
    await flush();
    expect(spans[0]?.textContent).toBe('00:45:00');
    expect(spans[1]?.textContent).toBe('02:30:00');
  });
});

// — 4.3 / 4.4 — the zone scope root ————————————————————————————————————

describe('zone scope roots — reach, nearest-wins, inertness (D-141)', () => {
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
          background: 'transparent',
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
    expect(root.getAttribute('data-cg-zone')).toBe('normal');
    // The nested instance owns NO zoned countdown, so it is NOT a zone root: nothing
    // intercepts the host's published values on the way down. That is what makes zone
    // state cross an instance boundary.
    expect(inner.hasAttribute('data-cg-zone-root')).toBe(false);

    clock.advance(300_000); // → 60 min remaining, crossing into `caution`
    await flush();
    expect(root.getAttribute('data-cg-zone')).toBe('caution');

    // The nested element carries a slot index, and the stylesheet publishes that slot
    // under `caution` — the complete chain from the host's boundary to the nested
    // element's colour. (The computed colour itself is the E2E's job.)
    const nested = document.body.querySelector<HTMLElement>('[data-cg-element-id="nested-shape"]');
    const slot = nested?.dataset['cgZoneEl'];
    expect(slot).toBeDefined();
    expect(compileZoneCss(s).css).toContain(`[data-cg-zone='caution']{`);
    expect(compileZoneCss(s).css).toContain(`--cgz-${String(slot)}-fill:#ffd600`);
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
    // Two independent zone roots, in DIFFERENT zones at the same instant.
    expect(root.getAttribute('data-cg-zone')).toBe('normal'); // 65 min out
    expect(inner.hasAttribute('data-cg-zone-root')).toBe(true);
    expect(inner.getAttribute('data-cg-zone')).toBe('critical'); // 5 min out

    // The nested root being a zone root is exactly what stops the host's values: the
    // compiled reset rule keys off `data-cg-zone-root` and is emitted before the
    // equal-specificity publication rules, so the nested subtree resolves from the
    // NESTED key alone.
    const css = compileZoneCss(s).css;
    expect(css.indexOf('[data-cg-zone-root]')).toBeLessThan(css.indexOf("[data-cg-zone='"));

    // They advance independently: the host crosses while the nested one holds.
    clock.advance(300_000);
    await flush();
    expect(root.getAttribute('data-cg-zone')).toBe('caution');
    expect(inner.getAttribute('data-cg-zone')).toBe('critical');
  });

  it('an override with NO enclosing zone renders authored — nothing publishes its slot', async () => {
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
    expect(root.hasAttribute('data-cg-zone-root')).toBe(false);
    expect(root.hasAttribute('data-cg-zone')).toBe(false);
    // The consumption rule exists and falls back to the AUTHORED colour; no rule
    // publishes the slot, so the element renders as authored — inert, not an error.
    const css = compileZoneCss(s).css;
    expect(css).toContain("[data-cg-zone-el='0']{background:var(--cgz-0-fill,#202020) !important}");
    expect(css).not.toContain("[data-cg-zone='caution']");
  });

  it('a zoned countdown injects the stylesheet; a scene without one injects nothing', async () => {
    const clock = makeClock();
    const rt = createRuntime(nestedScene(false), { clock });
    await rt.ready;
    expect(document.getElementById('cg-zones')).not.toBeNull();

    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const plain = createRuntime(sceneOf({ layers: [layerOf('L1', [shapeEl('plain')])] }), {
      clock: makeClock(),
    });
    await plain.ready;
    expect(document.getElementById('cg-zones')).toBeNull();
  });
});
