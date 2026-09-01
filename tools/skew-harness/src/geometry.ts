/**
 * `B-174` — **THE DISCRIMINATING GEOMETRY, and the two probe regions derived FROM it.**
 *
 * ── WHAT `k` IS ─────────────────────────────────────────────────────────────
 *
 * A look switch is two mutations issued in a fixed order by `setActiveLook`: the bridge
 * moves the plate producers with `MIXER FILL`/`CLIP` FIRST, then tells the page to move its
 * mask holes with `CG UPDATE`. `k` is the number of CHANNEL FRAMES between the two landing.
 * The whole of `B-174` is that number, and every candidate fix is chosen by it.
 *
 * ── 🔴 WHY THE PROBES CANNOT BE PLACED BY EYE, AND WHAT MAKES ONE WRONG ──────
 *
 * The two halves are not independently visible. A screen pixel shows the PLATE only where
 * the page has punched a hole; everywhere else it shows the page's own background. So:
 *
 * - **Probe A — "the picture moved"** must sit where a hole exists in BOTH looks, or it
 *   cannot see the plate at all before the page has moved. It is therefore placed strictly
 *   inside the INTERSECTION of one plate's hole across the two looks, with a wide margin to
 *   every edge of that intersection.
 * - **Probe B — "the holes moved"** must sit where the entering look has a hole and the
 *   outgoing look has NONE, over painted background. It changes when, and only when, the
 *   page repunches.
 *
 * ⚠ **The failure this shape exists to prevent is `k = 0` by construction.** A probe that
 * overlaps a hole EDGE fires on both transitions — the fill moving under the edge and the
 * edge itself moving — so it reads whichever came first and the difference collapses.
 * {@link SKEW_PROBE_A} and {@link SKEW_PROBE_B} are therefore checked against every rect of
 * both looks by {@link probePlacementIssues}, which is asserted in the unit tests rather
 * than trusted: the numbers below are hand-chosen, and a hand-chosen number is exactly the
 * kind that survives a later edit to the layout it was chosen for.
 *
 * ── WHY PROBE A ACTUALLY CHANGES ────────────────────────────────────────────
 *
 * A probe inside both holes sees the plate before and after. It only registers the mixer
 * move if the SOURCE CONTENT under it differs between the two fills — so the two boxes are
 * given wildly different shapes (a wide banner vs a tall column) under `cover`, which maps
 * completely different parts of the source picture onto the same screen pixels. The source
 * itself is STATIC (see `media.ts`): a moving source would change probe A every frame and
 * destroy the very "first change" this measures.
 */

/** An axis-aligned rect in SCENE pixels — the space every rect in this module lives in. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The scene resolution, and the channel raster the recording is read back in. */
export const SKEW_SCENE = { width: 1920, height: 1080 } as const;

/** The two plates. Both exist in both looks, so a switch changes geometry and nothing else. */
export const PLATE_A = 'guest-1';
export const PLATE_B = 'guest-2';
/**
 * 🔴 `single-clock-look-switch` — **the THIRD plate, which the owner's template has and the
 * two-look fixtures did not.**
 *
 * `B-164`'s own record of his file is `ghab-1` → 1 box, `ghab-2` → 2 boxes, `ghab-3` → 3 boxes,
 * over ONE row declaring three plates. A measurement that stopped at two looks could not run
 * `1↔3` or either three-step sequence at all — and those are the switches in which a state
 * carried from the previous look would show.
 */
export const PLATE_C = 'guest-3';

/**
 * **Look "banner"** — `guest-1` is a wide strip across the top; `guest-2` sits bottom-RIGHT,
 * deliberately clear of the column `guest-1` occupies in the other look, so that the region
 * probe B watches is PAINTED BACKGROUND here rather than another plate hole.
 */
export const LOOK_BANNER = 'look-banner';
export const BANNER_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 240, y: 120, width: 1440, height: 405 },
  [PLATE_B]: { x: 1000, y: 600, width: 680, height: 360 },
};

/**
 * **Look "column"** — `guest-1` becomes a tall narrow column on the left and `guest-2` fills
 * the rest. Different membership is NOT used: both looks show both plates, so the switch is
 * a pure geometry change and the union pre-seat has nothing to add. That is what makes it
 * the `PLAY`-free switch `B-174` is about rather than the one `B-155` is about.
 */
export const LOOK_COLUMN = 'look-column';
export const COLUMN_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 240, y: 120, width: 480, height: 840 },
  [PLATE_B]: { x: 840, y: 120, width: 840, height: 840 },
};

/**
 * **Probe A — inside the `guest-1` hole in BOTH looks.**
 *
 * The intersection of the two `guest-1` rects is `x 240..720, y 120..525`. This sits at its
 * centre-left with at least 100 px of clearance on every side, so no hole edge of either
 * look can cross it.
 *
 * Under `cover`, the same screen pixels map to source `u ≈ 0.07` in the banner look and
 * `u ≈ 0.41` in the column look — a third of the way across the source picture — which is
 * why a horizontal ramp in the source content makes the mixer move unmissable.
 */
export const SKEW_PROBE_A: Rect = { x: 340, y: 220, width: 100, height: 100 };

/**
 * **Probe B — on the mask-hole EDGE: inside the `column` `guest-1` hole, outside every hole
 * of `banner`.**
 *
 * In `banner`, `guest-1` ends at `y = 525` and `guest-2` starts at `x = 1000`, so at
 * `x 340..440, y 620..720` the banner look paints BACKGROUND. In `column`, `guest-1` covers
 * `x 240..720, y 120..960`, so the same pixels become picture the moment the page repunches.
 */
export const SKEW_PROBE_B: Rect = { x: 340, y: 620, width: 100, height: 100 };

/**
 * 🔴 **`SKEW-INTERSECT-01` — THE DISCRIMINATING FIXTURE: a FULL-FRAME look against a multi-box
 * look, at the owner's own numbers.**
 *
 * ── WHY THE BANNER/COLUMN PAIR COULD NOT SEE THIS ───────────────────────────
 *
 * Both of its looks are two mid-sized boxes, so the region one look punches and the other does
 * not is 15.9 % of the frame in one direction and 2.3 % in the other. That is the whole artefact
 * it can produce, and it is small enough to read as "a bit of edge noise".
 *
 * The owner's `3-ghab` is not like that. `look-1` is ONE 1920×1080 plate, so **every switch
 * into or out of it opens or closes a FULL-FRAME hole**: the exclusive region is ~55 % of the
 * picture, and in the direction where the page moves after the fills it is ~55 % of the frame
 * showing the CHANNEL — the near-full-frame black flash he reports. A fixture of two
 * similarly-sized boxes cannot tell an intersection mask from an entering-look mask at all,
 * because their intersection IS most of both.
 *
 * ── WHERE THESE NUMBERS COME FROM, AND WHAT IS NOT COMMITTED ────────────────
 *
 * Read out of the owner's own export — `tools/skew-harness/fixtures/owner/3-ghab.vcg`,
 * `template.json`, compositions `comp-2` (look-1) and `comp-3` (look-2). His `.vcg` and
 * `.cgproj` are deliberately NOT in the repo (see `fixtures/README.md`): they are 610 KB of
 * binary carrying a photograph of a person, they are re-exportable from his Designer, and a
 * fixture nobody can diff is the thing this file's own header refuses. What IS committed is
 * the SHAPE, at his measurements, built by the same code path as every other fixture here — so
 * the acceptance test survives without his files while still reproducing his case rather than
 * an approximation of it.
 *
 * ⚠ One deliberate difference: his backdrop is a full-frame JPG and this one is the harness's
 * painted rect. The geometry — which is what the mask is computed from — is identical; the
 * page's paint cost is not, and that axis has its own control (`--background video`).
 */
export const LOOK_GHAB_FULL = 'look-ghab-full';
export const GHAB_FULL_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 0, y: 0, width: 1920, height: 1080 },
};

/** His `look-2`: two boxes, at 916 × 515.27 — rounded to the pixel the mask is expressed in. */
export const LOOK_GHAB_BOXES = 'look-ghab-boxes';
export const GHAB_BOXES_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 23, y: 301, width: 916, height: 515 },
  [PLATE_B]: { x: 984, y: 301, width: 916, height: 515 },
};

/**
 * **Probe A for the `ghab` pair** — inside `guest-1`'s hole in BOTH looks (the left box, which
 * lies wholly inside the full-frame plate), with ≥ 60 px to every edge of either.
 *
 * Under `cover` the same screen pixels map to source `u ≈ 0.16` in the full-frame look and
 * `u ≈ 0.30` in the boxes look, so a horizontal ramp makes the mixer move unmissable — the same
 * argument {@link SKEW_PROBE_A} rests on, re-earned for this geometry rather than assumed.
 */
/**
 * 🔴 **The owner's `look-3` — THREE boxes**, the third of his authored looks.
 *
 * `l1` and `l2` keep the two-box geometry the re-export measured (`B-195`: `32,258 887×498.94`
 * and `1006,258 887×498.94`, rounded to whole pixels here because the harness's own scene is
 * authored in integers); `l3` takes the strip beneath them. The shape matters more than the
 * exact pixels: what a three-box look has to exercise is a plate ARRIVING while two others
 * MOVE, which is the case a two-look pair cannot produce.
 */
export const LOOK_GHAB_THREE = 'look-ghab-three';
export const GHAB_THREE_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 23, y: 301, width: 600, height: 340 },
  [PLATE_B]: { x: 1000, y: 301, width: 600, height: 340 },
  [PLATE_C]: { x: 660, y: 700, width: 600, height: 300 },
};

export const GHAB_PROBE_A: Rect = { x: 300, y: 450, width: 100, height: 100 };

/**
 * **Probe B for the `ghab` pair** — in the region exactly ONE look punches: inside the
 * full-frame plate, above both boxes (they start at `y = 301`), clear of everything by ≥ 100 px.
 *
 * 🔴 It watches the page's repunch in BOTH directions, and that generality is the point. Going
 * `boxes → full` it is a hole OPENING (background → picture); going `full → boxes` it is a hole
 * CLOSING (picture → background). The banner/column pair's probe B is the same idea in a
 * fixture where only one direction has an exclusive region worth watching.
 */
export const GHAB_PROBE_B: Rect = { x: 400, y: 100, width: 100, height: 100 };

/**
 * **Probe C for the `ghab` pair** — inside `guest-2`'s RIGHT box, with ≥ 200 px of clearance.
 *
 * `guest-2` is the plate the two looks disagree about: the boxes look gives it that box, the
 * full look does not place it at all. So this region shows `guest-2`'s picture in one settled
 * state and `guest-1`'s (through the full-frame hole) in the other, and the frame on which it
 * changes is the frame that box's CONTENT actually changed — which is neither of the two
 * questions probes A and B answer.
 */
export const GHAB_PROBE_C: Rect = { x: 1200, y: 450, width: 100, height: 100 };

/**
 * One measured pair: two looks, the two probes derived from them, and an id the CLI names.
 *
 * Introduced so {@link probePlacementIssues} — the whole soundness argument for `k` — is asked
 * about the fixture actually being recorded rather than about the one it was written for. A
 * second fixture whose placement was checked by the first fixture's constants would be a
 * measurement with no soundness argument at all.
 */
export interface SkewFixture {
  readonly id: string;
  /** `lookId → plate → rect`, for exactly the two looks a run switches between. */
  readonly rects: Readonly<Record<string, Readonly<Record<string, Rect>>>>;
  /**
   * The look ids this fixture's scene carries, in authoring order (the first is the default).
   *
   * ⚠ **AT LEAST TWO, and possibly more.** A fixture with three looks measures a PAIR chosen at
   * run time; the placement check is therefore asked about that pair rather than about the
   * fixture, because a probe that is sound for `1↔2` says nothing about `2↔3`.
   */
  readonly looks: readonly string[];
  /** Inside a hole of BOTH looks: it sees the FILL move and nothing else. */
  readonly probeA: Rect;
  /** Inside a hole of EXACTLY ONE look: it sees the PAGE repunch, opening or closing. */
  readonly probeB: Rect;
  /**
   * 🔴 `SKEW-INTERSECT-01` §2 — **inside the box of a plate that ARRIVES or DEPARTS across the
   * switch**, which is what terms (b) and (c) are read from.
   *
   * It is a third region and deliberately not a third `k`: probes A and B answer *when did each
   * half of the switch land*, and this one answers *when did the picture in that box actually
   * change*. On the `ghab` pair it sits inside `guest-2`'s box, which the boxes look shows and
   * the full look covers with `guest-1` — so going one way it watches a producer being STARTED
   * (term b) and going the other it watches the outgoing plate being cleared (term c).
   *
   * Absent ⇒ neither term is measured for that fixture, which is the honest answer for a pair
   * where no plate arrives or departs at all.
   */
  readonly probeC?: Rect;
  /**
   * 🔴 `single-clock-look-switch` — **probe B PER MEASURED PAIR, where one rectangle cannot
   * serve them all.**
   *
   * Probe B must be inside a hole in EXACTLY ONE of the two looks, and on a three-look fixture
   * that is a property of the PAIR rather than of the fixture: a point inside the full-frame
   * look and clear of the two-box look is inside BOTH of the two multi-box looks, so it is
   * sound for `1↔2` and blind for `2↔3`.
   *
   * Keyed `from->to`, resolved in either order (a pair is unordered for placement). Absent for a
   * pair ⇒ {@link probeB}, which is every two-look fixture's only case.
   */
  readonly probeBByPair?: Readonly<Record<string, Rect>>;
}

/** THE probe-B rect for one measured pair — the per-pair override, else the fixture's own. */
export function probeBFor(fixture: SkewFixture, pair?: readonly [string, string]): Rect {
  if (pair === undefined) return fixture.probeB;
  const [a, b] = pair;
  return (
    fixture.probeBByPair?.[`${a}->${b}`] ?? fixture.probeBByPair?.[`${b}->${a}`] ?? fixture.probeB
  );
}

export const BANNER_COLUMN_FIXTURE: SkewFixture = {
  id: 'banner-column',
  rects: { [LOOK_BANNER]: BANNER_RECTS, [LOOK_COLUMN]: COLUMN_RECTS },
  looks: [LOOK_BANNER, LOOK_COLUMN],
  probeA: SKEW_PROBE_A,
  probeB: SKEW_PROBE_B,
};

export const GHAB_FIXTURE: SkewFixture = {
  id: 'ghab',
  rects: { [LOOK_GHAB_FULL]: GHAB_FULL_RECTS, [LOOK_GHAB_BOXES]: GHAB_BOXES_RECTS },
  looks: [LOOK_GHAB_FULL, LOOK_GHAB_BOXES],
  probeA: GHAB_PROBE_A,
  probeB: GHAB_PROBE_B,
  probeC: GHAB_PROBE_C,
};

/**
 * 🔴 **`ghab-seated` — the same geometry with `guest-2` present in BOTH looks, and the reason
 * it has to exist.**
 *
 * {@link GHAB_FIXTURE} is faithful to the owner's file, membership included: his `look-1` holds
 * ONE plate and `l2` exists only in `look-2`. Measured on the plant, that costs every switch
 * after the first a **`PLAY`** — the parked seat does not survive being parked, so re-entering
 * the look that shows it starts the producer again. (`@cg/amcp-mock` disagrees: against the mock
 * the union pre-seat holds and the switch back is pure `MIXER`. The divergence is real and is
 * reported, not papered over.)
 *
 * A `PLAY` inside the window makes the run `B-155`'s subject rather than `B-174`'s, and the
 * harness discards it — correctly. So the two questions are measured on two fixtures:
 *
 * - **term (a)**, the mask/fill disagreement, needs `PLAY`-free windows ⇒ this fixture, where
 *   `guest-2` is in both looks and nothing is ever parked;
 * - **term (b)**, the first-frame latency of a producer the switch had to START, is what
 *   {@link GHAB_FIXTURE}'s discarded runs contain ⇒ measured there, deliberately.
 *
 * ⚠ **The mask geometry is IDENTICAL to `ghab`'s**, which is what makes the substitution
 * legitimate: `guest-2`'s extra rect lies wholly INSIDE the full-frame plate, so the union of
 * holes in the full look is still the whole frame, and the exclusive region is still ~55 %. It
 * sits clear of both probes and of the background motion patch, so nothing a reading depends on
 * moves.
 */
export const GHAB_SEATED_FULL_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 0, y: 0, width: 1920, height: 1080 },
  [PLATE_B]: { x: 1400, y: 880, width: 200, height: 150 },
};

export const GHAB_SEATED_FIXTURE: SkewFixture = {
  id: 'ghab-seated',
  rects: { [LOOK_GHAB_FULL]: GHAB_SEATED_FULL_RECTS, [LOOK_GHAB_BOXES]: GHAB_BOXES_RECTS },
  looks: [LOOK_GHAB_FULL, LOOK_GHAB_BOXES],
  probeA: GHAB_PROBE_A,
  probeB: GHAB_PROBE_B,
  probeC: GHAB_PROBE_C,
};

/**
 * 🔴 **`ghab3` — the owner's THREE looks in one scene, and the fixture the acceptance runs on.**
 *
 * `look-1` is the full-frame plate; `look-2` is his two-box layout; `look-3` is the three-box
 * one. Every measured pair is chosen at run time (`--from` / `--to`), so `1↔2`, `1↔3` and the
 * two three-step sequences are all switches inside ONE scene — which is what makes a sequence
 * mean anything: the row really has been through the intermediate look.
 *
 * ⚠ **`guest-2` and `guest-3` are seated in EVERY look**, at a 2×2 px rect off in the corner
 * where they are not shown. That is the `ghab-seated` device and it is here for the same
 * reason: a plate that is absent from a look gets PARKED, and re-entering the look that shows
 * it starts the producer again — a `PLAY` inside the window, which is term (b) (`B-192`) and
 * not the term this change is about. Seating them everywhere keeps every switch pure
 * `MIXER FILL` / `CLIP`, which is exactly the claim under test.
 */
const OFFSCREEN = (x: number): Rect => ({ x, y: 1078, width: 2, height: 2 });

export const GHAB3_ONE_RECTS: Readonly<Record<string, Rect>> = {
  [PLATE_A]: { x: 0, y: 0, width: 1920, height: 1080 },
  [PLATE_B]: OFFSCREEN(1400),
  [PLATE_C]: OFFSCREEN(1500),
};
export const GHAB3_TWO_RECTS: Readonly<Record<string, Rect>> = {
  ...GHAB_BOXES_RECTS,
  [PLATE_C]: OFFSCREEN(1500),
};
export const GHAB3_THREE_RECTS: Readonly<Record<string, Rect>> = GHAB_THREE_RECTS;

export const GHAB3_FIXTURE: SkewFixture = {
  id: 'ghab3',
  rects: {
    [LOOK_GHAB_FULL]: GHAB3_ONE_RECTS,
    [LOOK_GHAB_BOXES]: GHAB3_TWO_RECTS,
    [LOOK_GHAB_THREE]: GHAB3_THREE_RECTS,
  },
  looks: [LOOK_GHAB_FULL, LOOK_GHAB_BOXES, LOOK_GHAB_THREE],
  probeA: GHAB_PROBE_A,
  probeB: GHAB_PROBE_B,
  probeC: GHAB_PROBE_C,
  /*
    `look-2 -> look-3` is the pair the fixture's own probe B cannot read: it sits at the top of
    the frame, which is inside the FULL look's plate and outside both multi-box looks' — sound
    for either pair that involves `look-1`, blind for the pair that does not. This rect is inside
    `look-2`'s left box and clear of every plate of `look-3`, which is the same condition one
    pair along.
  */
  probeBByPair: {
    [`${LOOK_GHAB_BOXES}->${LOOK_GHAB_THREE}`]: { x: 700, y: 400, width: 100, height: 100 },
  },
};

export const SKEW_FIXTURES: Readonly<Record<string, SkewFixture>> = {
  [BANNER_COLUMN_FIXTURE.id]: BANNER_COLUMN_FIXTURE,
  [GHAB_FIXTURE.id]: GHAB_FIXTURE,
  [GHAB_SEATED_FIXTURE.id]: GHAB_SEATED_FIXTURE,
  [GHAB3_FIXTURE.id]: GHAB3_FIXTURE,
};

/** The clearance every probe must keep from any hole edge it is not meant to straddle. */
export const PROBE_EDGE_CLEARANCE = 60;

/**
 * `SKEW-RESIDUE-01` — **FILLER LOOKS: more of the page, and deliberately nothing else.**
 *
 * The owner's report is that a template carrying 1-box, 2-box and 3-box looks skews WORSE than
 * a two-look one. The axis that claim is about is the PAGE's — every look's subtree is built
 * and lives in the DOM at once, and `sceneMaskHoles` re-flattens the whole scene on every
 * repunch — so a sweep that also changed what the BRIDGE does would answer a different
 * question.
 *
 * These looks are therefore built from the SAME TWO PLATES at other rects. The union pre-seat
 * is both plates whatever the look count is, so the wire work is identical run to run and the
 * only thing that grows is the page. They are never entered: every measured switch is still
 * `banner → column`, which is what keeps {@link probePlacementIssues} the whole soundness
 * argument rather than one that has to be re-made per variant.
 */
export function fillerLookRects(index: number): Readonly<Record<string, Rect>> {
  // Deterministic, and deliberately different from both measured looks so the subtree is real
  // layout rather than a copy the browser might share.
  const inset = 60 + index * 40;
  return {
    [PLATE_A]: { x: inset, y: inset, width: 900 - index * 50, height: 500 - index * 30 },
    [PLATE_B]: {
      x: 960 + index * 20,
      y: 560 - index * 20,
      width: 880 - index * 40,
      height: 460 - index * 20,
    },
  };
}

/**
 * The region the background clip animates in the VIDEO-background variant — the positive
 * control that says the decoder is actually running, since a still clip cannot prove it.
 *
 * Chosen to be clear of both probes AND of every plate rect in both measured looks, so it
 * changes nothing the measurement reads. {@link probePlacementIssues} asserts that.
 */
export const BACKGROUND_MOTION_PATCH: Rect = { x: 1700, y: 970, width: 200, height: 100 };

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** `inner` lies wholly inside `outer` with at least `margin` px of slack on every side. */
function containsWithMargin(outer: Rect, inner: Rect, margin: number): boolean {
  return (
    inner.x - outer.x >= margin &&
    inner.y - outer.y >= margin &&
    outer.x + outer.width - (inner.x + inner.width) >= margin &&
    outer.y + outer.height - (inner.y + inner.height) >= margin
  );
}

/** `probe` does not come within `margin` px of `rect` at all. */
function clearOf(rect: Rect, probe: Rect, margin: number): boolean {
  const grown: Rect = {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + 2 * margin,
    height: rect.height + 2 * margin,
  };
  return !intersects(grown, probe);
}

/**
 * 🔴 **THE PROBE-PLACEMENT CHECK, as a value rather than a comment.**
 *
 * Returns one sentence per violated condition; an empty array means the placement is sound.
 * Every condition here is a way the measurement reads a wrong `k` while looking healthy —
 * which is why this is asserted in the tests AND re-run by the harness before it records,
 * rather than being a note beside two hand-picked rectangles.
 */
/**
 * The two look ids ONE run switches between, resolved and CHECKED.
 *
 * A fixture may carry more than two (the owner's carries three), so the pair is a per-run
 * choice. It is resolved here rather than at each call site so an id that the fixture does not
 * declare is a loud refusal instead of an empty rect map and a measurement of nothing.
 */
export function measuredPair(
  fixture: SkewFixture,
  from?: string,
  to?: string,
): readonly [string, string] {
  const pick = (id: string | undefined, fallbackIndex: number, label: string): string => {
    const chosen = id ?? fixture.looks[fallbackIndex];
    if (chosen === undefined || !fixture.looks.includes(chosen)) {
      throw new Error(
        `the ${fixture.id} fixture does not declare a look "${String(chosen)}" for --${label}; ` +
          `it has: ${fixture.looks.join(', ')}`,
      );
    }
    return chosen;
  };
  return [pick(from, 0, 'from'), pick(to, 1, 'to')];
}

export function probePlacementIssues(
  fixture: SkewFixture = BANNER_COLUMN_FIXTURE,
  pair?: readonly [string, string],
): readonly string[] {
  const issues: string[] = [];
  const [first, second] = pair ?? measuredPair(fixture);
  const probeB = probeBFor(fixture, [first, second]);
  const looks = [first, second].map((id) => ({ id, rects: fixture.rects[id] ?? {} }));
  for (const look of looks) {
    if (Object.keys(look.rects).length === 0) {
      return [`the ${fixture.id} fixture no longer defines any plate in ${look.id}`];
    }
  }

  /** The plate whose hole wholly contains `probe`, with margin, in this look — or none. */
  const holdingPlate = (
    rects: Readonly<Record<string, Rect>>,
    probe: Rect,
  ): { plate: string; rect: Rect } | undefined => {
    for (const [plate, rect] of Object.entries(rects)) {
      if (containsWithMargin(rect, probe, PROBE_EDGE_CLEARANCE)) return { plate, rect };
    }
    return undefined;
  };

  // Probe A must see a plate in BOTH looks, clear of every edge of both.
  const aIn = looks.map((look) => ({
    look: look.id,
    held: holdingPlate(look.rects, fixture.probeA),
  }));
  for (const { look, held } of aIn) {
    if (held === undefined) issues.push(`probe A is not clear inside any hole in ${look}`);
  }
  /*
    🔴 **AND THE PLATE UNDER IT MUST MOVE.** Probe A reads "the fill moved"; it can only do that
    if the SOURCE CONTENT under those screen pixels differs between the two looks, which under
    `cover` means the plate's rect differs. A probe sitting where one plate has the SAME rect in
    both looks sees nothing at the mixer's move and the harness reads `k` off probe B alone —
    a `k` of zero by construction, looking perfectly healthy. The banner/column pair argued this
    in prose; asked as a value it also covers every fixture added later.
  */
  const [aFirst, aSecond] = aIn;
  const rectA = aFirst?.held?.rect;
  const rectB = aSecond?.held?.rect;
  if (rectA !== undefined && rectB !== undefined) {
    if (
      rectA.x === rectB.x &&
      rectA.y === rectB.y &&
      rectA.width === rectB.width &&
      rectA.height === rectB.height
    ) {
      issues.push(
        'probe A sits under a plate whose rect is IDENTICAL in both looks — it cannot see the fill move',
      );
    }
  }

  /*
    Probe B must be inside a hole of EXACTLY ONE look and clear of every hole of the other. That
    is what makes it read the PAGE's repunch and only that — opening (background → picture) or
    closing (picture → background), depending on the direction of the switch. A probe inside
    both would read the mixer move as well and the two transitions would collapse.
  */
  const bIn = looks.filter((look) => holdingPlate(look.rects, probeB) !== undefined);
  if (bIn.length !== 1) {
    issues.push(
      `probe B is inside a hole in ${String(bIn.length)} of the two looks — it must be inside exactly one`,
    );
  }
  for (const look of looks) {
    if (bIn.some((l) => l.id === look.id)) continue;
    for (const [plate, rect] of Object.entries(look.rects)) {
      if (!clearOf(rect, probeB, PROBE_EDGE_CLEARANCE)) {
        issues.push(`probe B is not clear of the ${plate} hole in ${look.id}`);
      }
    }
  }

  // The probes must not overlap, or one transition would be read twice.
  if (intersects(fixture.probeA, probeB)) {
    issues.push('probe A and probe B overlap');
  }
  if (fixture.probeC !== undefined) {
    for (const [name, other] of [
      ['A', fixture.probeA],
      ['B', probeB],
    ] as const) {
      if (intersects(fixture.probeC, other)) issues.push(`probe C overlaps probe ${name}`);
    }
    /*
      Probe C must be inside a hole in BOTH looks — it is never background. That is what makes
      its transition a statement about the PICTURE (which plate is behind that box) rather than
      about the mask, which probe B already answers. A probe C over background in either look
      would fire on the repunch and duplicate probe B.
    */
    for (const look of looks) {
      if (holdingPlate(look.rects, fixture.probeC) === undefined) {
        issues.push(
          `probe C is not clear inside any hole in ${look.id} — it must always show a picture`,
        );
      }
    }
  }

  // `SKEW-RESIDUE-01` — the background clip's moving patch is the load positive control, and
  // it must be invisible to every reading: not under a probe, and not inside any hole either
  // look punches (where it would sit under a picture and change the classifier's regions).
  for (const [name, probe] of [
    ['A', fixture.probeA],
    ['B', probeB],
  ] as const) {
    if (intersects(BACKGROUND_MOTION_PATCH, probe)) {
      issues.push(`the background motion patch overlaps probe ${name}`);
    }
  }
  /*
    🔴 **AND IT MUST BE VISIBLE IN AT LEAST ONE OF THE TWO LOOKS — which is WEAKER than the
    rule this started as, deliberately, and the reason is the fixture that broke it.**

    The original rule was "outside every hole of BOTH looks", written for a pair of mid-sized
    boxes where such a region is easy to find. It is UNSATISFIABLE for the `ghab` pair: its
    full-frame look punches the entire raster, so every pixel is under a picture while that
    look is on screen. Kept as written, the check would have refused the one fixture that can
    discriminate the fix — a soundness check rejecting the sound thing.

    What the patch is FOR is unchanged: it answers *is the decoder actually running?*, and a
    patch visible in ONE settled state answers that as well as one visible in both. What it
    must never do is disturb a reading, so the two conditions that do the work stay exactly as
    they were: it is clear of both probes (above), and the classifier excludes it by rect. A
    patch covered in BOTH looks would prove nothing at all, and that is what is refused here.
  */
  const patchVisibleIn = looks.filter((look) =>
    Object.values(look.rects).every((rect) => !intersects(rect, BACKGROUND_MOTION_PATCH)),
  );
  if (patchVisibleIn.length === 0) {
    issues.push(
      'the background motion patch is under a hole in BOTH looks — it can never be seen, so it ' +
        'proves nothing about the decoder',
    );
  }

  // Both must be inside the raster the recording is read back in.
  const raster = `${String(SKEW_SCENE.width)}x${String(SKEW_SCENE.height)}`;
  for (const [name, probe] of [
    ['A', fixture.probeA],
    ['B', probeB],
  ] as const) {
    if (
      probe.x < 0 ||
      probe.y < 0 ||
      probe.x + probe.width > SKEW_SCENE.width ||
      probe.y + probe.height > SKEW_SCENE.height
    ) {
      issues.push(`probe ${name} falls outside the ${raster} raster`);
    }
  }
  return issues;
}
