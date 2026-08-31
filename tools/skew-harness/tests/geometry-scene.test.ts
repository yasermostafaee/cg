import { describe, expect, it } from 'vitest';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import {
  BACKGROUND_MOTION_PATCH,
  BANNER_COLUMN_FIXTURE,
  BANNER_RECTS,
  COLUMN_RECTS,
  GHAB_BOXES_RECTS,
  GHAB_FIXTURE,
  GHAB_FULL_RECTS,
  GHAB_PROBE_A,
  GHAB_PROBE_B,
  GHAB_SEATED_FIXTURE,
  GHAB_SEATED_FULL_RECTS,
  LOOK_BANNER,
  LOOK_COLUMN,
  LOOK_GHAB_BOXES,
  LOOK_GHAB_FULL,
  PLATE_A,
  PLATE_B,
  PROBE_EDGE_CLEARANCE,
  probePlacementIssues,
  SKEW_FIXTURES,
  SKEW_PROBE_A,
  SKEW_PROBE_B,
  type Rect,
  type SkewFixture,
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
    expect(ids.slice(1)).toEqual([`inst-${LOOK_BANNER}`, `inst-${LOOK_COLUMN}`]);
  });
});

/**
 * 🔴 **`SKEW-INTERSECT-01` — THE DISCRIMINATING FIXTURE.** The banner/column pair's two looks
 * are both mid-sized boxes, so the region one punches and the other does not is 15.9 % of the
 * frame at most. The owner's `3-ghab` has a FULL-FRAME look, so that region is ~55 % — and
 * "similarly-sized boxes cannot see the difference" is asserted here as arithmetic rather than
 * left as the reason the harness missed this for two sessions.
 */
describe('the ghab fixture — a full-frame look against a multi-box look', () => {
  const areaOf = (rects: Readonly<Record<string, Rect>>): number =>
    Object.values(rects).reduce((sum, r) => sum + r.width * r.height, 0);
  const FRAME = 1920 * 1080;

  it('its committed placement is sound by the check, asked about IT', () => {
    expect(probePlacementIssues(GHAB_FIXTURE)).toEqual([]);
  });

  it('🔴 the EXCLUSIVE region is ~55 % of the frame, against ~16 % for banner/column', () => {
    // The exclusive region is what a hole set opens or closes on its own, and therefore the
    // most that can be black for a field. The full-frame look punches everything, so it is
    // simply the frame minus the boxes.
    const ghabExclusive = FRAME - areaOf(GHAB_BOXES_RECTS);
    expect(ghabExclusive / FRAME).toBeGreaterThan(0.5);
    // banner/column: the part of `column` that `banner` does not reach. Computed from the
    // rects rather than quoted, so a fixture edit moves the comparison with it.
    const bannerCovers = (x: number, y: number): boolean =>
      Object.values(BANNER_RECTS).some(
        (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height,
      );
    let columnOnly = 0;
    for (const r of Object.values(COLUMN_RECTS)) {
      for (let y = r.y; y < r.y + r.height; y += 5) {
        for (let x = r.x; x < r.x + r.width; x += 5) if (!bannerCovers(x, y)) columnOnly += 25;
      }
    }
    expect(columnOnly / FRAME).toBeLessThan(0.2);
  });

  it('the INTERSECTION is never empty here: the full-frame look contains both boxes', () => {
    // The full-frame plate covers everything, so the intersection of the two hole sets is
    // exactly the boxes look's own rects: the fix has the most to work with on the scene that
    // looks worst today.
    expect(areaOf(GHAB_BOXES_RECTS)).toBeGreaterThan(0);
    for (const r of Object.values(GHAB_BOXES_RECTS)) {
      const full = GHAB_FULL_RECTS[PLATE_A] as Rect;
      expect(r.x >= full.x && r.x + r.width <= full.x + full.width).toBe(true);
      expect(r.y >= full.y && r.y + r.height <= full.y + full.height).toBe(true);
    }
  });

  it('builds a scene whose carrier is the two looks, boxes-look membership included', () => {
    const scene = buildSkewScene({ fixture: GHAB_FIXTURE });
    const carrier = buildTemplateLiveSources(scene);
    expect(carrier.looks?.map((l) => l.id)).toEqual([LOOK_GHAB_FULL, LOOK_GHAB_BOXES]);
    expect(carrier.defaultLookId).toBe(LOOK_GHAB_FULL);
    expect(carrier.looks?.find((l) => l.id === LOOK_GHAB_FULL)?.rects).toEqual(GHAB_FULL_RECTS);
    expect(carrier.looks?.find((l) => l.id === LOOK_GHAB_BOXES)?.rects).toEqual(GHAB_BOXES_RECTS);
    // DIFFERENT MEMBERSHIP: guest-2 exists only in the boxes look, exactly as `live-2` exists
    // only in the owner's look-2. The union pre-seat is what keeps that switch PLAY-free.
    expect(Object.keys(GHAB_FULL_RECTS)).toEqual([PLATE_A]);
    expect(Object.keys(GHAB_BOXES_RECTS)).toEqual([PLATE_A, PLATE_B]);
  });
});

/**
 * The placement check is the whole soundness argument for `k`, so it is tested for what it
 * REJECTS as well as what it accepts — a check that cannot fail proves nothing about the
 * fixtures it passes.
 */
describe('probePlacementIssues — the check itself', () => {
  const bend = (over: Partial<SkewFixture>): SkewFixture => ({ ...GHAB_FIXTURE, ...over });

  it('rejects a probe A that sits under an UNMOVED plate', () => {
    // The failure it exists for: probe A reads "the fill moved", and a plate whose rect is
    // identical in both looks does not move. `k` would then be read off probe B alone — zero
    // by construction, and perfectly healthy-looking.
    const frozen = bend({
      rects: { [LOOK_GHAB_FULL]: GHAB_BOXES_RECTS, [LOOK_GHAB_BOXES]: GHAB_BOXES_RECTS },
    });
    expect(probePlacementIssues(frozen).join(' ')).toContain('IDENTICAL in both looks');
  });

  it('rejects a probe B inside a hole in BOTH looks', () => {
    // It would then read the mixer move as well as the repunch, and the two would collapse.
    expect(probePlacementIssues(bend({ probeB: GHAB_PROBE_A })).join(' ')).toContain(
      'it must be inside exactly one',
    );
  });

  it('rejects a motion patch that is under a hole in BOTH looks', () => {
    // The weakened form of the patch rule still has teeth: a patch nothing can ever see
    // proves nothing about the decoder, which is the only reason it exists.
    const covered = bend({
      rects: { [LOOK_GHAB_FULL]: GHAB_FULL_RECTS, [LOOK_GHAB_BOXES]: GHAB_FULL_RECTS },
      probeB: { x: 400, y: 100, width: 100, height: 100 },
    });
    expect(probePlacementIssues(covered).join(' ')).toContain('under a hole in BOTH looks');
  });

  it('rejects a probe outside the raster', () => {
    expect(
      probePlacementIssues(bend({ probeA: { x: 1900, y: 1000, width: 100, height: 100 } })).join(
        ' ',
      ),
    ).toContain('falls outside');
  });

  it('the ghab-seated variant has the SAME hole union as ghab in the full look', () => {
    /*
      The whole legitimacy of substituting it for the PLAY-free measurement: `guest-2`'s extra
      rect lies wholly inside the full-frame plate, so the set of pixels the full look punches
      is identical and the exclusive region is unchanged.
    */
    const full = GHAB_FULL_RECTS[PLATE_A] as Rect;
    const extra = GHAB_SEATED_FULL_RECTS[PLATE_B] as Rect;
    expect(extra.x >= full.x && extra.x + extra.width <= full.x + full.width).toBe(true);
    expect(extra.y >= full.y && extra.y + extra.height <= full.y + full.height).toBe(true);
    // …and it must not touch either probe or the motion patch, or a reading would move with it.
    for (const other of [GHAB_PROBE_A, GHAB_PROBE_B, BACKGROUND_MOTION_PATCH]) {
      expect(overlaps(extra, other)).toBe(false);
    }
    // Membership is the ONLY difference from `ghab`: both plates in both looks, nothing parked.
    expect(Object.keys(GHAB_SEATED_FULL_RECTS)).toEqual([PLATE_A, PLATE_B]);
  });

  it('every registered fixture is sound', () => {
    // The registry is what the CLI resolves `--fixture` against, so a fixture that is
    // reachable but unsound is the one nobody would think to check.
    for (const [id, fixture] of Object.entries(SKEW_FIXTURES)) {
      expect(probePlacementIssues(fixture), `${id} placement`).toEqual([]);
    }
    // The three the CLI can name, listed so a fixture added without a placement argument is
    // an edit to this line rather than a silent new measurement.
    expect(Object.keys(SKEW_FIXTURES).sort()).toEqual(
      [BANNER_COLUMN_FIXTURE.id, GHAB_FIXTURE.id, GHAB_SEATED_FIXTURE.id].sort(),
    );
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
