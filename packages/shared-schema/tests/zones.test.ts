import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ClockElementSchema,
  ClockTargetSchema,
  ClockZonesSchema,
  ShapeElementSchema,
  TextElementSchema,
  ZoneOverridesSchema,
} from '../src/elements.js';
import { FieldBindingSchema } from '../src/bindings.js';
import { SceneSchema } from '../src/scene.js';
import { CURRENT_SCHEMA_VERSION, migrations } from '../src/migrations/index.js';

/**
 * D-141 — the schema half of the azan countdown: the `timeofday` target kind, a
 * countdown's colour `zones`, every element's opt-in `zoneOverrides`, and the
 * `clock-target` binding. The whole widening is ADDITIVE, which the last describe
 * block proves against a scene fixture authored before this change.
 */

const baseProps = {
  id: 'el-1',
  name: 'one',
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

const clockProps = {
  ...baseProps,
  type: 'clock' as const,
  font: {
    family: 'Vazirmatn',
    weight: 600,
    style: 'normal' as const,
    size: 48,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  color: '#FFFFFF',
};

/** The 4-zone 60/30/10 preset: `base` + three steps ⇒ 3 boundaries, 4 zones. */
const preset = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 3_600_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 1_800_000, key: 'warning', color: '#ff9100' },
    { atOrBelowMs: 600_000, key: 'critical', color: '#d50000' },
  ],
};

describe("ClockTarget — the 'timeofday' kind (D-141)", () => {
  it.each(['20:32', '20:32:45', '00:00', '00:00:00', '23:59', '23:59:59', '09:05'])(
    'accepts %s',
    (time) => {
      expect(ClockTargetSchema.parse({ kind: 'timeofday', time })).toEqual({
        kind: 'timeofday',
        time,
      });
    },
  );

  it.each([
    ['24:00', 'hour 24 does not exist on a 24-hour clock'],
    ['9:5', 'unpadded fields'],
    ['20:32:60', 'second 60'],
    ['20:60', 'minute 60'],
    ['', 'empty'],
    ['2032', 'no separator'],
    [' 20:32', 'leading space — the regex is anchored'],
    ['20:32 ', 'trailing space — the regex is anchored'],
    ['20:32:45.5', 'fractional seconds'],
  ])('rejects %s (%s)', (time) => {
    expect(() => ClockTargetSchema.parse({ kind: 'timeofday', time })).toThrow();
  });

  it('the existing duration and datetime kinds still parse (the widening is additive)', () => {
    expect(ClockTargetSchema.parse({ kind: 'duration', ms: 90_000 })).toEqual({
      kind: 'duration',
      ms: 90_000,
    });
    const iso = new Date(0).toISOString();
    expect(ClockTargetSchema.parse({ kind: 'datetime', iso })).toEqual({ kind: 'datetime', iso });
  });

  it('a countdown may take a timeofday target', () => {
    const parsed = ClockElementSchema.parse({
      ...clockProps,
      mode: 'countdown',
      target: { kind: 'timeofday', time: '20:32' },
    });
    expect(parsed.target).toEqual({ kind: 'timeofday', time: '20:32' });
  });
});

describe('ClockZones (D-141)', () => {
  it('accepts the 4-zone 60/30/10 preset', () => {
    expect(ClockZonesSchema.parse(preset)).toEqual(preset);
  });

  it('accepts a single step with no base ("red under ten minutes")', () => {
    const zones = { steps: [{ atOrBelowMs: 600_000, key: 'critical', color: '#d50000' }] };
    expect(ClockZonesSchema.parse(zones)).toEqual(zones);
  });

  it('rejects an EMPTY steps list', () => {
    expect(() => ClockZonesSchema.parse({ steps: [] })).toThrow();
  });

  it('rejects a non-decreasing pair, identifying the offending STEP', () => {
    const result = ClockZonesSchema.safeParse({
      steps: [
        { atOrBelowMs: 600_000, key: 'a', color: '#000000' },
        { atOrBelowMs: 1_800_000, key: 'b', color: '#000000' },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    // The row, not the section: `steps.1.atOrBelowMs` is the one the Designer marks.
    expect(result.error.issues.some((i) => i.path.join('.') === 'steps.1.atOrBelowMs')).toBe(true);
  });

  it('rejects EQUAL thresholds (strictly decreasing, not merely non-increasing)', () => {
    expect(() =>
      ClockZonesSchema.parse({
        steps: [
          { atOrBelowMs: 600_000, key: 'a', color: '#000000' },
          { atOrBelowMs: 600_000, key: 'b', color: '#000000' },
        ],
      }),
    ).toThrow();
  });

  it('rejects a duplicate key between two steps', () => {
    expect(() =>
      ClockZonesSchema.parse({
        steps: [
          { atOrBelowMs: 600_000, key: 'critical', color: '#000000' },
          { atOrBelowMs: 60_000, key: 'critical', color: '#111111' },
        ],
      }),
    ).toThrow();
  });

  it('rejects a duplicate key between BASE and a step', () => {
    expect(() =>
      ClockZonesSchema.parse({
        base: { key: 'critical', color: '#00c853' },
        steps: [{ atOrBelowMs: 600_000, key: 'critical', color: '#d50000' }],
      }),
    ).toThrow();
  });

  it('accepts a countdown carrying zones', () => {
    const parsed = ClockElementSchema.parse({
      ...clockProps,
      mode: 'countdown',
      target: { kind: 'timeofday', time: '20:32' },
      zones: preset,
    });
    expect(parsed.zones).toEqual(preset);
  });

  it.each(['wall', 'countup'] as const)('REJECTS zones on a %s clock', (mode) => {
    const result = ClockElementSchema.safeParse({ ...clockProps, mode, zones: preset });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join('.') === 'zones')).toBe(true);
  });

  it.each(['wall', 'countup'] as const)('still accepts a %s clock with no zones', (mode) => {
    expect(ClockElementSchema.parse({ ...clockProps, mode }).zones).toBeUndefined();
  });
});

describe('zoneOverrides — on every element (D-141)', () => {
  it('accepts an override taking the ZONE colour and one taking an explicit hex', () => {
    const zoneOverrides = [
      { zone: 'critical', textColor: 'zone' as const },
      { zone: 'warning', fill: '#ff9100', stroke: 'zone' as const },
    ];
    const parsed = ShapeElementSchema.parse({
      ...baseProps,
      type: 'shape',
      shape: 'rect',
      zoneOverrides,
    });
    expect(parsed.zoneOverrides).toEqual(zoneOverrides);
  });

  it('lives on the element BASE — every kind takes it, including text', () => {
    const parsed = TextElementSchema.parse({
      ...baseProps,
      type: 'text',
      text: 'اذان',
      font: {
        family: 'Vazirmatn',
        weight: 700,
        style: 'normal',
        size: 48,
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      color: '#FFFFFF',
      align: 'start',
      direction: 'rtl',
      fitMode: 'fixed',
      overflow: 'clip',
      zoneOverrides: [{ zone: 'critical', textColor: 'zone' }],
    });
    expect(parsed.zoneOverrides).toEqual([{ zone: 'critical', textColor: 'zone' }]);
  });

  it('rejects DUPLICATE zone keys within one element', () => {
    const result = ZoneOverridesSchema.safeParse([
      { zone: 'critical', textColor: 'zone' },
      { zone: 'critical', fill: '#000000' },
    ]);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join('.') === '1.zone')).toBe(true);
  });

  it('rejects an entry that sets NO slot', () => {
    expect(() => ZoneOverridesSchema.parse([{ zone: 'critical' }])).toThrow();
  });

  it('rejects an empty zone key and a non-colour slot value', () => {
    expect(() => ZoneOverridesSchema.parse([{ zone: '', textColor: 'zone' }])).toThrow();
    expect(() => ZoneOverridesSchema.parse([{ zone: 'critical', textColor: 'red' }])).toThrow();
  });

  it('a free-form (non-canonical) key is VALID — the picker is not a validation boundary', () => {
    const zoneOverrides = [{ zone: 'ramadan-final-call', textColor: 'zone' as const }];
    expect(ZoneOverridesSchema.parse(zoneOverrides)).toEqual(zoneOverrides);
  });
});

describe("FieldBinding — the 'clock-target' target (D-141)", () => {
  it('accepts a clock-target binding', () => {
    const b = { fieldId: 'azanTime', target: { kind: 'clock-target', elementId: 'clock-1' } };
    expect(FieldBindingSchema.parse(b)).toEqual(b);
  });

  it('requires an elementId', () => {
    expect(() =>
      FieldBindingSchema.parse({ fieldId: 'azanTime', target: { kind: 'clock-target' } }),
    ).toThrow();
  });
});

/**
 * The additivity proof. Every new field is `.optional()` and both union widenings
 * are supersets, so a scene authored BEFORE this change must parse to exactly what
 * it parsed to before — no injected keys, no version bump, nothing to migrate.
 * These are REAL committed fixtures (B-034, 2026-06-28), not scenes minted here.
 */
/**
 * B-129 — the one deliberate shape difference between a pre-B-129 fixture and its
 * parse: `background` (scene AND every composition) is now `editorBackdrop`. Applied
 * to the fixture so the additivity proof above compares like with like.
 */
function renameBackgroundKeys(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(renameBackgroundKeys);
  if (raw === null || typeof raw !== 'object') return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k === 'background' ? 'editorBackdrop' : k] = renameBackgroundKeys(v);
  }
  return out;
}

describe('the widening is additive — no schema-version bump, no migration', () => {
  const fixtures = ['hidden-content-inert', 'hidden-ancestor-inert'] as const;

  it.each(fixtures)('%s.scene.json parses byte-identically', (name) => {
    // vitest runs with cwd = the package dir (both `--filter exec` and turbo), so the
    // repo-root fixture is two levels up — same resolution the B-034 runtime suite uses.
    const p = resolve(process.cwd(), `../../fixtures/b034/${name}.scene.json`);
    const raw: unknown = JSON.parse(readFileSync(p, 'utf8'));
    const parsed = SceneSchema.parse(raw);
    // Round-tripping through JSON drops `undefined`-valued keys, so this compares the
    // SERIALISED forms: the parse neither added a field nor dropped one.
    //
    // B-129 — ONE documented difference, applied to the EXPECTATION rather than
    // relaxed away: `background` is normalized onto `editorBackdrop` at parse time.
    // Encoding it here keeps the proof exactly as strong as it was — any OTHER
    // injected or dropped key still fails — while naming the single rename that is
    // deliberate. Do NOT weaken this to `toMatchObject`: that would stop catching
    // injected keys, which is the whole point of the fixture.
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(renameBackgroundKeys(raw));
  });

  it.each(fixtures)('%s.scene.json gains no zones / zoneOverrides key anywhere', (name) => {
    const p = resolve(process.cwd(), `../../fixtures/b034/${name}.scene.json`);
    const parsed = SceneSchema.parse(JSON.parse(readFileSync(p, 'utf8')));
    const serialised = JSON.stringify(parsed);
    expect(serialised).not.toContain('zoneOverrides');
    expect(serialised).not.toContain('"zones"');
  });

  it('CURRENT_SCHEMA_VERSION is still 1 and the migration registry is still empty', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(migrations).toHaveLength(0);
  });
});
