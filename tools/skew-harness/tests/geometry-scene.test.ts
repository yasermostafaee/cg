import { describe, expect, it } from 'vitest';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import {
  BANNER_RECTS,
  COLUMN_RECTS,
  LOOK_BANNER,
  LOOK_COLUMN,
  PLATE_A,
  PLATE_B,
  PROBE_EDGE_CLEARANCE,
  probePlacementIssues,
  SKEW_PROBE_A,
  SKEW_PROBE_B,
  type Rect,
} from '../src/geometry.js';
import { buildSkewScene } from '../src/scene.js';
import { framePeriodMs } from '../src/amcp.js';

/**
 * `B-174` — the probe placement IS the measurement's validity, so it is asserted, not
 * trusted. Every fact below is one the harness's `k` silently depends on; a later edit to
 * the layout that breaks one of them must redden this file, not ship a wrong number.
 */

const inside = (outer: Rect, inner: Rect, margin: number): boolean =>
  inner.x - outer.x >= margin &&
  inner.y - outer.y >= margin &&
  outer.x + outer.width - (inner.x + inner.width) >= margin &&
  outer.y + outer.height - (inner.y + inner.height) >= margin;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('probe placement', () => {
  it('the committed placement is sound by its own check', () => {
    expect(probePlacementIssues()).toEqual([]);
  });

  it('probe A sees the guest-1 picture in BOTH looks, clear of every hole edge', () => {
    const banner = BANNER_RECTS[PLATE_A] as Rect;
    const column = COLUMN_RECTS[PLATE_A] as Rect;
    expect(inside(banner, SKEW_PROBE_A, PROBE_EDGE_CLEARANCE)).toBe(true);
    expect(inside(column, SKEW_PROBE_A, PROBE_EDGE_CLEARANCE)).toBe(true);
  });

  it('🔴 probe B is BACKGROUND in the outgoing look and PICTURE in the entering one', () => {
    // Background in banner: clear of BOTH its holes…
    expect(overlaps(BANNER_RECTS[PLATE_A] as Rect, SKEW_PROBE_B)).toBe(false);
    expect(overlaps(BANNER_RECTS[PLATE_B] as Rect, SKEW_PROBE_B)).toBe(false);
    // …and inside guest-1's hole in column.
    expect(inside(COLUMN_RECTS[PLATE_A] as Rect, SKEW_PROBE_B, PROBE_EDGE_CLEARANCE)).toBe(true);
  });

  it('the two boxes give probe A a genuinely different source mapping (aspect flip)', () => {
    const banner = BANNER_RECTS[PLATE_A] as Rect;
    const column = COLUMN_RECTS[PLATE_A] as Rect;
    const bannerAspect = banner.width / banner.height;
    const columnAspect = column.width / column.height;
    // A wide banner and a tall column — under `cover` the same screen pixels map far apart
    // in the source, which is what makes the mixer move visible at probe A at all.
    expect(bannerAspect).toBeGreaterThan(2);
    expect(columnAspect).toBeLessThan(1);
  });
});

describe('the scene the switch runs on', () => {
  it('parses through SceneSchema and derives the exact carrier the bridge consumes', () => {
    const scene = buildSkewScene();
    const carrier = buildTemplateLiveSources(scene);
    expect(carrier.looks?.map((l) => l.id)).toEqual([LOOK_BANNER, LOOK_COLUMN]);
    expect(carrier.defaultLookId).toBe(LOOK_BANNER);
    const banner = carrier.looks?.find((l) => l.id === LOOK_BANNER);
    const column = carrier.looks?.find((l) => l.id === LOOK_COLUMN);
    expect(banner?.rects).toEqual(BANNER_RECTS);
    expect(column?.rects).toEqual(COLUMN_RECTS);
    // `cover` per plate per look — under `contain` a probe could be watching letterbox
    // margins instead of picture (see scene.ts).
    expect(banner?.fits).toEqual({ [PLATE_A]: 'cover', [PLATE_B]: 'cover' });
    expect(column?.fits).toEqual({ [PLATE_A]: 'cover', [PLATE_B]: 'cover' });
  });

  it('🔴 the painted background is BELOW both look instances in paint order', () => {
    // `sceneMaskHoles` punches holes only through elements below a plate in paint order —
    // a background that drifted above the instances would never lose a pixel and probe B
    // would read nothing.
    const scene = buildSkewScene();
    const children = scene.layers[0]?.children ?? [];
    const ids = children.map((c) => c.id);
    expect(ids[0]).toBe('skew-background');
    expect(ids.slice(1)).toEqual(['inst-banner', 'inst-column']);
  });
});

describe('framePeriodMs — the unit k is converted with', () => {
  it('an interlaced mode ticks at HALF the rate its name carries', () => {
    // stage.cpp pulls both fields in one tick — "it lets us tick at 25hz and avoids amcp
    // changes starting on the second field" — so 1080i5000 is a 40 ms channel frame.
    expect(framePeriodMs('1080i5000')).toBe(40);
    expect(framePeriodMs('1080p5000')).toBe(20);
    expect(framePeriodMs('1080p2500')).toBe(40);
    expect(framePeriodMs('1080i5994')).toBeCloseTo(2000 / 59.94, 3);
  });

  it('an unrecognised mode is NaN, never a guessed period', () => {
    expect(Number.isNaN(framePeriodMs('PAL'))).toBe(true);
    expect(Number.isNaN(framePeriodMs(''))).toBe(true);
  });
});
