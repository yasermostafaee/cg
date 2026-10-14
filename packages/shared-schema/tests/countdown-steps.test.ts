import { describe, expect, it } from 'vitest';
import {
  changePropertiesOf,
  ClockElementSchema,
  CompositionElementSchema,
  completesAtZero,
  CountdownStepsSchema,
  migrateCountdownZones,
  migrateScene,
  SceneSchema,
  type ClockElement,
  type Element,
  type Scene,
} from '../src/index.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` / `-D` / `-F` — a countdown's STEPS: what changes, on which
 * element, when this much or less remains — and the registered migration that turns D-141's colour
 * zones into steps with the SAME on-air result.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 200, h: 80 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const BASE = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 };

function clock(id: string, extra: Record<string, unknown> = {}): Element {
  return {
    ...BASE,
    id,
    name: id,
    type: 'clock',
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'persian',
    target: { kind: 'duration', ms: 3_600_000 },
    ...extra,
  } as Element;
}

function rect(id: string, extra: Record<string, unknown> = {}): Element {
  return {
    ...BASE,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#202020' },
    ...extra,
  } as Element;
}

function text(id: string, extra: Record<string, unknown> = {}): Element {
  return {
    ...BASE,
    id,
    name: id,
    type: 'text',
    text: 'x',
    font: {
      family: 'Vazirmatn',
      weight: 400,
      style: 'normal',
      size: 30,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    ...extra,
  } as Element;
}

function instance(id: string, compositionId: string): Element {
  return { ...BASE, id, name: id, type: 'composition', compositionId } as Element;
}

const layer = (children: Element[]) => ({
  id: 'l',
  name: 'l',
  visible: true,
  locked: false,
  blendMode: 'normal' as const,
  children,
});

function comp(id: string, children: Element[]) {
  return {
    id,
    name: id,
    resolution: { width: 1920, height: 1080 },
    layers: [layer(children)],
    fields: [],
    bindings: [],
  };
}

function scene(children: Element[], compositions: ReturnType<typeof comp>[] = []): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [layer(children)],
    ...(compositions.length > 0 ? { compositions } : {}),
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
  } as unknown as Scene;
}

const PRESET = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
    { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
  ],
};
const FOLLOW_ALL = ['normal', 'caution', 'warning', 'critical'].map((zone) => ({
  zone,
  textColor: 'zone' as const,
}));

const clockOf = (s: Scene, id: string, compId?: string): ClockElement => {
  const layers =
    compId === undefined ? s.layers : (s.compositions?.find((c) => c.id === compId)?.layers ?? []);
  return layers[0]?.children.find((e) => e.id === id) as ClockElement;
};

describe('the steps schema', () => {
  it('round-trips Before, steps across zero, changes of every kind and the after-zero choice', () => {
    const el = clock('c', {
      steps: {
        before: {
          name: 'Before',
          changes: [{ elementId: 'r', property: 'fill', value: '#00c853' }],
        },
        steps: [
          {
            name: 'Step 1',
            atMs: 60_000,
            changes: [
              { elementId: 'r', property: 'visible', value: false },
              { elementId: 'logo', property: 'image', value: { assetId: 'a2', source: 'project' } },
              { elementId: 'c', property: 'blink', value: true },
            ],
            transition: { kind: 'cut' },
          },
          {
            name: 'At zero',
            atMs: 0,
            changes: [{ elementId: 'r', property: 'opacity', value: 0.5 }],
          },
          {
            name: '5 min after zero',
            atMs: -300_000,
            changes: [],
            transition: { kind: 'fade', ms: 800 },
          },
        ],
      },
      afterZero: 'count-past',
    });
    const parsed = ClockElementSchema.safeParse(el);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(el);
  });

  it('thresholds are STRICTLY decreasing across zero; the offending ROW is named', () => {
    const r = CountdownStepsSchema.safeParse({
      steps: [
        { name: 'a', atMs: 60_000, changes: [] },
        { name: 'b', atMs: -1_000, changes: [] },
        { name: 'c', atMs: 0, changes: [] },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['steps', 2, 'atMs']);
  });

  it('one step sets one property of one element once — the second is named', () => {
    const r = CountdownStepsSchema.safeParse({
      steps: [
        {
          name: 'a',
          atMs: 0,
          changes: [
            { elementId: 'r', property: 'fill', value: '#ff0000' },
            { elementId: 'r', property: 'fill', value: '#00ff00' },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['steps', 0, 'changes', 1, 'property']);
  });

  it('steps and the after-zero choice are countdown-only', () => {
    for (const extra of [{ steps: { steps: [] } }, { afterZero: 'close' }]) {
      expect(ClockElementSchema.safeParse(clock('c', { mode: 'wall', ...extra })).success).toBe(
        false,
      );
    }
  });

  it('only Count past zero leaves a content-driven hold open; absent is Hold at zero', () => {
    expect(completesAtZero(undefined)).toBe(true);
    expect(completesAtZero('hold')).toBe(true);
    expect(completesAtZero('hide-digits')).toBe(true);
    expect(completesAtZero('close')).toBe(true);
    expect(completesAtZero('count-past')).toBe(false);
  });

  it('a composition instance may start hidden (delta F); absent is not', () => {
    const el = { ...instance('i', 'warn'), startsHidden: true };
    expect(CompositionElementSchema.safeParse(el).success).toBe(true);
  });

  it('a property the kind does not own is not offered; a Live Source offers nothing', () => {
    expect(changePropertiesOf(text('t'))).toEqual([
      'visible',
      'opacity',
      'textColor',
      'backgroundColor',
      'blink',
    ]);
    expect(changePropertiesOf(rect('r'))).toEqual([
      'visible',
      'opacity',
      'fill',
      'stroke',
      'blink',
    ]);
    expect(changePropertiesOf(clock('c'))).toEqual(['visible', 'opacity', 'textColor', 'blink']);
    const image = {
      ...BASE,
      id: 'i',
      name: 'i',
      type: 'image',
      assetId: 'a',
      source: 'project',
      fit: 'contain',
      preserveAspect: true,
    } as Element;
    expect(changePropertiesOf(image)).toContain('image');
    const live = { ...BASE, id: 'v', name: 'v', type: 'video-placeholder' } as unknown as Element;
    expect(changePropertiesOf(live)).toEqual([]);
  });
});

describe('migrateCountdownZones — zones become steps with the same on-air result', () => {
  it('🔴 the 4-zone preset: base → Before, each zone → a step at its threshold, 400 ms morph kept', () => {
    const s = scene([
      clock('c', { zones: PRESET, zoneOverrides: FOLLOW_ALL }),
      rect('r', { zoneOverrides: [{ zone: 'critical', fill: 'zone' }] }),
    ]);
    const out = migrateCountdownZones(s);
    const c = clockOf(out, 'c');
    expect('zones' in c).toBe(false);
    expect('zoneOverrides' in c).toBe(false);
    expect(c.steps).toEqual({
      before: {
        name: 'normal',
        changes: [{ elementId: 'c', property: 'textColor', value: '#00c853' }],
        transition: { kind: 'fade', ms: 400 },
      },
      steps: [
        {
          name: 'caution',
          atMs: 3_600_000,
          changes: [{ elementId: 'c', property: 'textColor', value: '#ffd600' }],
          transition: { kind: 'fade', ms: 400 },
        },
        {
          name: 'warning',
          atMs: 1_800_000,
          changes: [{ elementId: 'c', property: 'textColor', value: '#ff9100' }],
          transition: { kind: 'fade', ms: 400 },
        },
        {
          name: 'critical',
          atMs: 600_000,
          changes: [
            { elementId: 'c', property: 'textColor', value: '#d50000' },
            { elementId: 'r', property: 'fill', value: '#d50000' },
          ],
          transition: { kind: 'fade', ms: 400 },
        },
      ],
    });
    expect('zoneOverrides' in (out.layers[0]?.children[1] as object)).toBe(false);
  });

  it('an explicit colour is copied; a key the countdown does not define, a control-character key, a non-hex colour and an unowned slot were dropped by the stylesheet and are dropped here', () => {
    const s = scene([
      clock('c', { zones: PRESET }),
      rect('r', {
        zoneOverrides: [
          { zone: 'warning', fill: '#ff6d00', stroke: '#112233' },
          { zone: 'dangre', fill: 'zone' },
        ],
      }),
      text('t', { zoneOverrides: [{ zone: 'critical', stroke: '#ffffff', textColor: '#abc' }] }),
    ]);
    const c = clockOf(migrateCountdownZones(s), 'c');
    expect(c.steps?.steps[1]?.changes).toEqual([
      { elementId: 'r', property: 'fill', value: '#ff6d00' },
      { elementId: 'r', property: 'stroke', value: '#112233' },
    ]);
    // 'critical' on the text: `stroke` is not a text slot, and `#abc` is not 6/8 hex digits.
    expect(c.steps?.steps[2]?.changes).toEqual([]);
    expect(JSON.stringify(c.steps)).not.toContain('dangre');
  });

  it('a "zone" colour resolves through the SCENE-WIDE palette — the first authored definition wins', () => {
    const s = scene(
      [
        clock('first', {
          zones: { steps: [{ atOrBelowMs: 600_000, key: 'critical', color: '#111111' }] },
        }),
      ],
      [
        comp('nested', [
          clock('second', {
            zones: { steps: [{ atOrBelowMs: 60_000, key: 'critical', color: '#222222' }] },
          }),
          rect('r', { zoneOverrides: [{ zone: 'critical', fill: 'zone' }] }),
        ]),
      ],
    );
    const second = clockOf(migrateCountdownZones(s), 'second', 'nested');
    expect(second.steps?.steps[0]?.changes).toEqual([
      { elementId: 'r', property: 'fill', value: '#111111' },
    ]);
  });

  it('🔴 NEAREST WINS: a host countdown reaches into an UNZONED nested composition, never into one with its own zoned countdown', () => {
    const s = scene(
      [
        clock('host', { zones: PRESET }),
        instance('i-plain', 'plain'),
        instance('i-zoned', 'zoned'),
      ],
      [
        comp('plain', [rect('inPlain', { zoneOverrides: [{ zone: 'critical', fill: 'zone' }] })]),
        comp('zoned', [
          clock('inner', { zones: PRESET }),
          rect('inZoned', { zoneOverrides: [{ zone: 'critical', fill: 'zone' }] }),
        ]),
      ],
    );
    const out = migrateCountdownZones(s);
    const host = clockOf(out, 'host');
    const inner = clockOf(out, 'inner', 'zoned');
    expect(host.steps?.steps[2]?.changes.map((c) => c.elementId)).toEqual(['inPlain']);
    expect(inner.steps?.steps[2]?.changes.map((c) => c.elementId)).toEqual(['inZoned']);
  });

  it('a zoned clock that is not a countdown just loses its zones', () => {
    const s = scene([clock('w', { mode: 'wall', zones: PRESET })]);
    const w = clockOf(migrateCountdownZones(s), 'w');
    expect('zones' in w).toBe(false);
    expect(w.steps).toBeUndefined();
  });

  it('🔴 a scene that never had zones is the SAME object — and so through the whole registry', () => {
    const plain = scene([clock('c'), rect('r')]);
    expect(migrateCountdownZones(plain)).toBe(plain);
    expect(migrateScene(plain)).toBe(plain);
  });

  it('is idempotent, parses, and leaves no legacy key behind', () => {
    const s = scene([
      clock('c', { zones: PRESET, zoneOverrides: FOLLOW_ALL }),
      rect('r', { zoneOverrides: [{ zone: 'critical', fill: 'zone' }] }),
    ]);
    const once = migrateScene(s);
    expect(migrateCountdownZones(once)).toBe(once);
    expect(SceneSchema.safeParse(once).success).toBe(true);
    const json = JSON.stringify(once);
    expect(json).not.toContain('zoneOverrides');
    expect(json).not.toContain('"zones"');
  });
});
