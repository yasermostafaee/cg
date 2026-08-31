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

/** The clearance every probe must keep from any hole edge it is not meant to straddle. */
export const PROBE_EDGE_CLEARANCE = 60;

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
export function probePlacementIssues(): readonly string[] {
  const issues: string[] = [];
  const bannerA = BANNER_RECTS[PLATE_A];
  const columnA = COLUMN_RECTS[PLATE_A];
  if (bannerA === undefined || columnA === undefined) {
    return ['the fixture no longer defines guest-1 in both looks'];
  }

  // Probe A must see the plate in BOTH looks, clear of every edge of both.
  if (!containsWithMargin(bannerA, SKEW_PROBE_A, PROBE_EDGE_CLEARANCE)) {
    issues.push('probe A is not clear inside guest-1 in the BANNER look');
  }
  if (!containsWithMargin(columnA, SKEW_PROBE_A, PROBE_EDGE_CLEARANCE)) {
    issues.push('probe A is not clear inside guest-1 in the COLUMN look');
  }

  // Probe B must be background in the OUTGOING look — clear of EVERY hole it has, not just
  // the guest-1 one. A probe sitting in the guest-2 hole would already show a picture and
  // would read the mixer move, not the page move.
  for (const [plate, rect] of Object.entries(BANNER_RECTS)) {
    if (!clearOf(rect, SKEW_PROBE_B, PROBE_EDGE_CLEARANCE)) {
      issues.push(`probe B is not clear of the ${plate} hole in the BANNER look`);
    }
  }
  // …and must be well inside the hole of the ENTERING look.
  if (!containsWithMargin(columnA, SKEW_PROBE_B, PROBE_EDGE_CLEARANCE)) {
    issues.push('probe B is not clear inside guest-1 in the COLUMN look');
  }

  // The two probes must not overlap, or one transition would be read twice.
  if (intersects(SKEW_PROBE_A, SKEW_PROBE_B)) {
    issues.push('probe A and probe B overlap');
  }

  // Both must be inside the raster the recording is read back in.
  const raster = `${String(SKEW_SCENE.width)}x${String(SKEW_SCENE.height)}`;
  for (const [name, probe] of [
    ['A', SKEW_PROBE_A],
    ['B', SKEW_PROBE_B],
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
