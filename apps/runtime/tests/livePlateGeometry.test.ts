import { describe, expect, it } from 'vitest';
import type { ChannelRaster, TemplateLiveSources, TemplateSourceAssignment } from '@cg/shared-ipc';
import type { Position } from '@cg/shared-schema';
import { outputLetterbox, outputScale, outputTranslate } from '@cg/template-runtime/position';
import {
  platePlacements,
  type PlateSourceLookup,
} from '../src/renderer/features/monitors/livePlateGeometry.js';

/**
 * R-049 — a PVW placeholder must land ON its hole, on EVERY channel raster.
 *
 * 🔴 THE TABLE IS MOSTLY NON-16:9, AND THAT IS THE WHOLE POINT OF THE TABLE.
 * On a 16:9 raster the uniform output scale is exactly 1 and the letterbox is
 * exactly (0,0), so every term of the chain collapses and a WRONG implementation
 * returns the RIGHT answer — the same trap `live-source-multibox` task 6.2b names
 * for the bridge's FILL contract test. A suite that only exercised 1920×1080
 * would pass against the naive "normalize by scene.resolution" form the design
 * explicitly forbids.
 *
 * The anchor case is design.md §6's own worked example, so this test and the
 * bridge's future FILL test are pinned to the same numbers:
 *
 *   960×540 scene, centred, on a 1440×1080 channel, hole at scene x=100
 *     s   = min(1440/1920, 1080/1080) = 0.75
 *     pad = ((1440 − 1440)/2, (1080 − 810)/2) = (0, 135)
 *     T   = (0.5·(1920 − 960), 0.5·(1080 − 540)) = (480, 270)
 *     X   = 0 + 0.75·(480 + 100) = 435          ← and 435/1440 = 0.302083
 *
 *   The naive form says 100 — wrong by a fifth of the frame width.
 */

const CENTER: Position = { anchor: 'center', offset: { x: 0, y: 0 } };

function liveSources(over: Partial<TemplateLiveSources> = {}): TemplateLiveSources {
  return {
    resolution: { width: 960, height: 540 },
    defaultPosition: CENTER,
    sources: [
      {
        elementId: 'el-a',
        sourceId: 'guest-1',
        rect: { x: 100, y: 60, width: 320, height: 180 },
        dynamic: false,
      },
    ],
    ...over,
  };
}

/**
 * 🔴 SESSION BQ — the lookup `platePlacements` now takes, instead of a plate-keyed name
 * callback. The old `(plateId) => name` shape is the DEFECT: it had no look dimension, so a
 * per-look binding could not be expressed at all. These helpers build the real inputs.
 */
function lookup(over: Partial<PlateSourceLookup> = {}): PlateSourceLookup {
  return {
    templateId: 'tpl-1',
    assignments: { assignments: [] },
    nameOf: (id) => NAMES[id] ?? null,
    ...over,
  };
}

/** A catalog, as the panel's `nameOf` would resolve it. */
const NAMES: Record<string, string> = {
  'studio-1': 'Studio 1',
  'studio-3': 'Studio 3',
  'studio-9': 'Studio 9',
};

/** Level 2 for `tpl-1`, the template's default assignment. */
const assign = (pairs: Record<string, string>): { assignments: TemplateSourceAssignment[] } => ({
  assignments: Object.entries(pairs).map(([plateId, sourceId]) => ({
    templateId: 'tpl-1',
    plateId,
    sourceId,
  })),
});

/** The old helper's replacement: every plate resolves to one name. */
const named = (name: string | null) =>
  lookup({
    nameOf: () => name,
    assignments: assign({ 'guest-1': 'studio-1', 'l-1': 'studio-1', 'l-2': 'studio-1' }),
  });

function only(raster: ChannelRaster, live = liveSources(), position?: Position) {
  const [placement] = platePlacements(live, raster, position, named('Studio A'), undefined);
  if (placement === undefined) throw new Error('expected one placement');
  return placement;
}

/**
 * The chain, spelled out INDEPENDENTLY of the module under test, from the same
 * primitives the exported page runs. It is not a copy of the implementation: it
 * is the design's formula written as arithmetic, so a rearrangement of the
 * implementation that changes the RESULT fails even where the literal expected
 * numbers below have not been hand-computed for that raster.
 */
function expected(
  live: TemplateLiveSources,
  raster: ChannelRaster,
  position: Position,
): { x: number; y: number; width: number; height: number } {
  const s = outputScale(raster);
  const pad = outputLetterbox(raster);
  const t = outputTranslate({ resolution: live.resolution }, position);
  const rect = live.sources[0]?.rect;
  if (rect === undefined) throw new Error('fixture has no rect');
  return {
    x: pad.x + s * (t.x + rect.x),
    y: pad.y + s * (t.y + rect.y),
    width: s * rect.width,
    height: s * rect.height,
  };
}

describe('R-049 — plate placement across rasters', () => {
  it('1440×1080 (pads on Y) reproduces design.md §6 exactly', () => {
    const p = only({ width: 1440, height: 1080 });
    // The number the design worked out by hand. If this moves, the overlay and
    // the bridge's FILL have stopped agreeing about where the hole is.
    expect(p.x).toBeCloseTo(435, 6);
    expect(p.x / 1440).toBeCloseTo(0.302083, 6);
    // s=0.75, pad.y=135, T.y=270, rect.y=60 → 135 + 0.75·330 = 382.5
    expect(p.y).toBeCloseTo(382.5, 6);
    expect(p.width).toBeCloseTo(240, 6);
    expect(p.height).toBeCloseTo(135, 6);
  });

  it('the NAIVE form is not what is computed — the guard, stated as a test', () => {
    const p = only({ width: 1440, height: 1080 });
    // `rect.x / resolution.width * raster.width` = 100/960 · 1440 = 150.
    expect(p.x).not.toBeCloseTo(150, 3);
    // And not the raw scene pixel either.
    expect(p.x).not.toBeCloseTo(100, 3);
  });

  it('720×576 (PAL — pads on Y, a different scale) matches the chain', () => {
    const raster = { width: 720, height: 576 };
    const p = only(raster);
    // s = min(720/1920, 576/1080) = 0.375; pad = (0, (576 − 405)/2) = (0, 85.5)
    expect(outputScale(raster)).toBeCloseTo(0.375, 6);
    expect(outputLetterbox(raster).y).toBeCloseTo(85.5, 6);
    expect(p).toMatchObject(expected(liveSources(), raster, CENTER));
    expect(p.x).toBeCloseTo(0.375 * (480 + 100), 6);
  });

  it('2048×1080 (DCI — pads on the OTHER axis) offsets horizontally, not vertically', () => {
    const raster = { width: 2048, height: 1080 };
    const pad = outputLetterbox(raster);
    // The case the two vertical-pad rasters above cannot catch: a raster WIDER
    // than 16:9 puts the padding on X. An implementation that hard-coded a
    // vertical letterbox passes both of the others and fails here.
    expect(pad.x).toBeCloseTo(64, 6);
    expect(pad.y).toBeCloseTo(0, 6);
    const p = only(raster);
    expect(p).toMatchObject(expected(liveSources(), raster, CENTER));
    expect(p.x).toBeCloseTo(64 + 480 + 100, 6);
  });

  it('1920×1080 is the collapse case — and is asserted BECAUSE it collapses', () => {
    const raster = { width: 1920, height: 1080 };
    expect(outputScale(raster)).toBe(1);
    expect(outputLetterbox(raster)).toEqual({ x: 0, y: 0 });
    const p = only(raster);
    // Only the anchor translate survives. Stated so nobody "simplifies" the
    // implementation to this and passes every 16:9 test in the repo.
    expect(p.x).toBeCloseTo(580, 6);
    expect(p.width).toBeCloseTo(320, 6);
  });

  it('a FULL-FRAME scene needs no anchor translate — the no-regression shape', () => {
    const live = liveSources({
      resolution: { width: 1920, height: 1080 },
      sources: [
        {
          elementId: 'el-a',
          sourceId: 'guest-1',
          rect: { x: 100, y: 60, width: 320, height: 180 },
          dynamic: false,
        },
      ],
    });
    const p = only({ width: 1920, height: 1080 }, live);
    expect(p).toMatchObject({ x: 100, y: 60, width: 320, height: 180 });
  });
});

describe('R-049 — which position the placement resolves', () => {
  it("the operator's applied override wins, and moves the plate with the graphic", () => {
    const override: Position = { anchor: 'top-left', offset: { x: 20, y: 10 } };
    const p = only({ width: 1920, height: 1080 }, liveSources(), override);
    // top-left ⇒ T = (0,0) + offset.
    expect(p.x).toBeCloseTo(120, 6);
    expect(p.y).toBeCloseTo(70, 6);
  });

  it('with NO override the carried authored default is used, never an assumed centre', () => {
    // The reason `defaultPosition` rides the carrier at all: a surface that
    // assumed "centred" would compute a different origin from the page for every
    // template whose author set a position, and the marker would sit where the
    // hole is not.
    const live = liveSources({
      defaultPosition: { anchor: 'bottom-right', offset: { x: 0, y: 0 } },
    });
    const p = only({ width: 1920, height: 1080 }, live);
    // bottom-right ⇒ T = (1920 − 960, 1080 − 540) = (960, 540).
    expect(p.x).toBeCloseTo(1060, 6);
    expect(p.y).toBeCloseTo(600, 6);
    // …and it is NOT the centred answer.
    expect(p.x).not.toBeCloseTo(580, 3);
  });
});

describe('R-049 — what each placement carries', () => {
  it('joins the plate to the APPLIED source name, and marks an unbound plate null', () => {
    const live = liveSources({
      sources: [
        {
          elementId: 'el-a',
          sourceId: 'guest-1',
          rect: { x: 0, y: 0, width: 10, height: 10 },
          dynamic: false,
        },
        {
          elementId: 'el-b',
          sourceId: 'guest-2',
          rect: { x: 20, y: 0, width: 10, height: 10 },
          dynamic: false,
        },
      ],
    });
    const placed = platePlacements(
      live,
      { width: 1920, height: 1080 },
      undefined,
      lookup({
        assignments: assign({ 'guest-1': 'studio-1' }),
        nameOf: (id) => (id === 'studio-1' ? 'Studio A' : null),
      }),
      undefined,
    );
    expect(placed.map((p) => [p.plateId, p.sourceName])).toEqual([
      ['guest-1', 'Studio A'],
      ['guest-2', null],
    ]);
    // `elementId` is what keys the React list: two plates of one template share
    // neither, but two plates could share a `plateId` across templates.
    expect(placed.map((p) => p.elementId)).toEqual(['el-a', 'el-b']);
  });

  it('a template that declares no plates places nothing', () => {
    expect(
      platePlacements(
        liveSources({ sources: [] }),
        { width: 1920, height: 1080 },
        undefined,
        lookup(),
        undefined,
      ),
    ).toEqual([]);
  });
});

// ───────────── `B-151` — PVW AND AIR AGREE ABOUT WHICH LOOK IS SHOWING ─────────────

/**
 * 🔴 The defect the owner met on the plant: PVW drew a 1-box look's plate and a 2-box
 * look's plates at the same time, overlapping, while air drew one. A preview that shows a
 * picture air never shows is worse than no preview — it is the operator's last chance to
 * catch a mistake, manufacturing one.
 *
 * Two errors compounded, and each is asserted separately below:
 *
 *   1. MEMBERSHIP — `sources` is the UNION of every look's members, so every plate of every
 *      look was drawn;
 *   2. GEOMETRY — a declaration's `rect` is its DEFAULT-look rect, so even the plates that
 *      did belong were placed by the wrong look after a switch.
 */
describe('B-151 — the overlay draws the ACTIVE look, and only it', () => {
  const LEFT = { x: 0, y: 0, width: 480, height: 270 };
  const RIGHT = { x: 480, y: 0, width: 480, height: 270 };
  const FULL = { x: 0, y: 0, width: 960, height: 540 };

  /** A 1-box look and a 2-box look over the same two declared sources. */
  const twoLooks = (): TemplateLiveSources =>
    liveSources({
      sources: [
        { elementId: 'el-1', sourceId: 'l-1', rect: LEFT, dynamic: false },
        { elementId: 'el-2', sourceId: 'l-2', rect: RIGHT, dynamic: false },
      ],
      looks: [
        {
          id: 'pair',
          name: 'Pair',
          entered: { mode: 'cut' },
          rects: { 'l-1': LEFT, 'l-2': RIGHT },
        },
        // SOLO shows one source, and at a DIFFERENT rect from its 2-box one — so a wrong
        // answer is visible in the geometry as well as in the count.
        { id: 'solo', name: 'Solo', entered: { mode: 'cut' }, rects: { 'l-1': FULL } },
      ],
      defaultLookId: 'pair',
    });

  const RASTER: ChannelRaster = { width: 1920, height: 1080 };
  const place = (activeLookId: string | undefined) =>
    platePlacements(twoLooks(), RASTER, undefined, named('Studio A'), activeLookId);

  it('🔴 4.2 — a hidden look’s plate has NO placement at all, not a covered one', () => {
    /*
      BB's lesson, and the reason this asserts ABSENCE rather than a zero size: the rehearsal
      stage is transparent, so "hidden" and "absent" photograph identically. A zero-area
      placement would still paint a frame and a label at the origin, and would still be
      counted by anything that reads this list.
    */
    const solo = place('solo');
    expect(solo.map((p) => p.plateId)).toEqual(['l-1']);
    expect(solo.some((p) => p.plateId === 'l-2')).toBe(false);
  });

  it('🔴 4.1 — the geometry follows the ACTIVE look, not the declaration’s default rect', () => {
    // `l-1` is LEFT in the pair look and FULL-frame in solo. The declaration carries LEFT,
    // which is what the overlay used to draw in BOTH.
    const [pair] = place('pair');
    const [solo] = place('solo');
    expect(pair?.width).toBeCloseTo(480, 6);
    expect(solo?.width, 'solo re-places the same plate').toBeCloseTo(960, 6);
    expect(solo?.width).not.toBeCloseTo(pair?.width ?? 0, 6);
  });

  it('4.1b — an UNSWITCHED row resolves to the AUTHORED DEFAULT, which is what a take enters', () => {
    // `undefined` is "nobody has switched this row" — the ordinary state of a freshly loaded
    // row — and it must mean the default look, never array order and never "all of them".
    expect(place(undefined).map((p) => p.plateId)).toEqual(['l-1', 'l-2']);
  });

  it('4.1c — a STALE look id falls back to the authored default rather than drawing nothing', () => {
    // The template was re-imported with different looks while a row still records an old id.
    // Drawing nothing would read as "this template has no live plates", which is a lie.
    expect(place('a-look-that-was-deleted').map((p) => p.plateId)).toEqual(['l-1', 'l-2']);
  });

  it('a PRE-LOOKS template is untouched — it keeps its declaration rects', () => {
    // The absent-vs-empty rule at the overlay: a carrier with no `looks` predates LOOKS and
    // its declarations ARE its geometry. Passing a look id it cannot honour must not empty it.
    const placed = platePlacements(liveSources(), RASTER, undefined, lookup(), 'solo');
    expect(placed.map((p) => p.plateId)).toEqual(['guest-1']);
  });
});

// ───────── SESSION BQ — PVW NAMES WHAT A TAKE WOULD SHOW, IN THIS LOOK ─────────

/**
 * 🔴 **THE OWNER'S REPORT, 2026-08-21, with a screenshot.** A row is ON PVW, PVW LOOK =
 * `look-1`. In LOOK INPUTS he sets `look-1` → plate `11` → **studio 3** and presses UPDATE.
 * **The PVW placeholder still reads "studio 1"** — the template's default for that plate.
 * The binding is applied everywhere else; the preview names the old source.
 *
 * That strikes at `R-049`'s stated reason for existing: _"It does what the PAGE never could:
 * show the ASSIGNED SOURCE'S NAME… The Runtime knows the join."_ The join it drew was the
 * wrong one.
 *
 * ── WHY THE OLD CODE COULD NOT PASS THESE ───────────────────────────────────
 *
 * `platePlacements` took `sourceNameOf: (plateId: string) => string | null` and the caller
 * built it from `appliedPlateSources` — LEVEL 2 ONLY, keyed by plate. **The look was not in
 * the signature**, so the second test below could not even be WRITTEN against the old shape:
 * one plate, two looks, two different names is not expressible by a plate-keyed map.
 *
 * ⚠ **`B-151` again, one field over** — that bug was this overlay never learning looks exist,
 * about RECTS. BL's handoff warned that _"one surface learning a state and its neighbour not
 * is a recurring shape in this feature, not a one-off."_
 *
 * **The rule these pin:** _the PVW overlay names exactly what a TAKE of THIS row, in THIS
 * look, would put on air._
 */
describe('BQ — the overlay resolves the NAME from the look, not from the plate alone', () => {
  const LEFT = { x: 0, y: 0, width: 480, height: 270 };
  const RIGHT = { x: 480, y: 0, width: 480, height: 270 };
  const RASTER: ChannelRaster = { width: 1920, height: 1080 };

  /** Two looks over two plates — `l-1` is in both, which is what makes the case expressible. */
  const carrier = (): TemplateLiveSources =>
    liveSources({
      resolution: { width: 960, height: 540 },
      sources: [
        { elementId: 'el-1', sourceId: 'l-1', rect: LEFT, dynamic: false },
        { elementId: 'el-2', sourceId: 'l-2', rect: RIGHT, dynamic: false },
      ],
      looks: [
        {
          id: 'look-1',
          name: '2-box',
          entered: { mode: 'cut' },
          rects: { 'l-1': LEFT, 'l-2': RIGHT },
        },
        { id: 'look-2', name: 'Solo', entered: { mode: 'cut' }, rects: { 'l-1': LEFT } },
      ],
      defaultLookId: 'look-1',
    });

  const nameOn = (over: Partial<PlateSourceLookup>, lookId: string | undefined, plateId = 'l-1') =>
    platePlacements(carrier(), RASTER, undefined, lookup(over), lookId).find(
      (p) => p.plateId === plateId,
    )?.sourceName ?? null;

  it('🔴 §3.1 — THE REPORTED CASE: a per-look binding is NAMED, not the template default', () => {
    /*
      Red before the fix, and it could not have been anything else: the name came from a map
      keyed by plate, so `studio-1` was the only answer available for `l-1` in any look.
    */
    expect(
      nameOn(
        {
          assignments: assign({ 'l-1': 'studio-1', 'l-2': 'studio-1' }),
          lookBindings: { 'look-1': { 'l-1': 'studio-3' } },
        },
        'look-1',
      ),
    ).toBe('Studio 3');
  });

  it('🔴 §3.2 — the SAME plate in two looks gets two names; switching the look changes it', () => {
    /*
      🔴 THE ASSERTION THE OLD SIGNATURE COULD NOT EXPRESS. One plate, two looks, two
      bindings. A `(plateId) => name` callback has exactly one slot for this answer, which is
      why the defect was not a missed case but an unrepresentable one.
    */
    const bound = {
      assignments: assign({ 'l-1': 'studio-1' }),
      lookBindings: { 'look-1': { 'l-1': 'studio-3' }, 'look-2': { 'l-1': 'studio-9' } },
    };
    expect(nameOn(bound, 'look-1')).toBe('Studio 3');
    expect(nameOn(bound, 'look-2')).toBe('Studio 9');
  });

  it('🔴 §3.3 — the `R-048` EMERGENCY wins, in EVERY look', () => {
    /*
      Level 4 is outermost because a dead input is dead in every look. If a per-look binding
      outranked it, switching look would bring the dead feed straight back and the operator
      would have to re-patch, live, once per look — having already been told the substitution
      was applied.
    */
    const patched = {
      assignments: assign({ 'l-1': 'studio-1' }),
      lookBindings: { 'look-1': { 'l-1': 'studio-3' }, 'look-2': { 'l-1': 'studio-3' } },
      overrides: { 'l-1': 'studio-9' },
    };
    expect(nameOn(patched, 'look-1')).toBe('Studio 9');
    expect(nameOn(patched, 'look-2')).toBe('Studio 9');
  });

  it('§3.4 — BLANK falls through to the template default, named as it always was', () => {
    // The commonest case by far, and the one the old code got right. It must stay right:
    // a fix that made every plate need an explicit binding would be a worse regression.
    expect(nameOn({ assignments: assign({ 'l-1': 'studio-1' }) }, 'look-1')).toBe('Studio 1');
    // …and a look with a binding for a DIFFERENT plate does not disturb this one.
    expect(
      nameOn(
        {
          assignments: assign({ 'l-1': 'studio-1', 'l-2': 'studio-1' }),
          lookBindings: { 'look-1': { 'l-2': 'studio-3' } },
        },
        'look-1',
      ),
    ).toBe('Studio 1');
  });

  it('a plate with nothing bound anywhere still reads as UNASSIGNED', () => {
    expect(nameOn({ assignments: assign({}) }, 'look-1')).toBeNull();
  });

  it('a binding whose CATALOG ENTRY has gone reads as unassigned, not as a raw id', () => {
    // `pruneAssignmentsForCatalog`'s own reading of a dangling reference, and the safe
    // direction anyway: that plate will refuse its take.
    expect(
      nameOn(
        {
          assignments: assign({ 'l-1': 'studio-1' }),
          lookBindings: { 'look-1': { 'l-1': 'a-source-that-was-deleted' } },
        },
        'look-1',
      ),
    ).toBeNull();
  });

  it('session BP — a FROZEN level 2 is what the overlay names, not the live assignment', () => {
    /*
      ⚠ A rehearsing row is off air by `R-022`'s interlock, so nothing is frozen for it today
      and this path is not reachable from PVW. It is asserted anyway because the RULE is "name
      what a take would show", and a surface that resolved the LIVE assignment while air
      resolved the FROZEN one would be a second answer to the same question — the exact class
      this feature keeps producing. Pinning it now means the rule stays true if the interlock
      ever changes, rather than being correct by accident.
    */
    expect(
      nameOn(
        {
          assignments: assign({ 'l-1': 'studio-9' }), // the store has moved on…
          frozenAssignment: { 'l-1': 'studio-1' }, // …but this row froze studio-1
        },
        'look-1',
      ),
    ).toBe('Studio 1');
  });
});
