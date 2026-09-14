/**
 * 🔴 **THE LAYER MAP — the ONE place the three role bands are written down.**
 *
 * CasparCG's layer space is one number per channel, and a HIGHER layer renders ABOVE a
 * lower one. That is not trivia: it is the whole reason this map is ORDERED rather than
 * merely partitioned. A graphics bed draws the programme's background and its live plates
 * are composited ON TOP of it; the templates — supers, tickers, logos — sit above both. So
 * the composition the product ships REQUIRES
 *
 *   bed  <  plate  <  template
 *
 * and {@link assertLayerBands} enforces it rather than leaving it to the next person who
 * renumbers something to remember.
 *
 * ── THE OWNER'S CUT (2026-09-14) ───────────────────────────────────────────
 *
 *   1-49   FREE. We allocate NOTHING here. See {@link FIRST_ALLOCATABLE_LAYER}.
 *   50-59  graphics beds     — the multi-box frame itself
 *   60-79  live plates       — the frame's inputs / live sources
 *   80-99  templates         — the operator's candidate layer bank
 *
 * ⚠ **WHY THE FLOOR EXISTS, recorded here because a free band with no reason attached is
 * a band someone reclaims.** The beds used to sit at **1-9**, which is exactly where a
 * playout server is likely to be working on a shared channel. A graphic of ours landing on
 * a playout layer is indistinguishable from the playout system's own graphic on the wire
 * (OSC reports producer KIND, not identity), so the collision is discovered on air or not
 * at all. 1-49 is therefore not "spare capacity we have not got round to using" — it is
 * SOMEONE ELSE'S, and the product's own reservation mechanism (`reservedLayers`) is a
 * per-station declaration that cannot speak for a station that has declared nothing.
 */

/** One inclusive band of layer numbers. */
export interface LayerBand {
  readonly start: number;
  readonly end: number;
}

/**
 * 🔴 **THE FLOOR. Nothing this product allocates may land below it.**
 *
 * Read by {@link assertLayerBands}; see the header for WHY 1-49 is left to the playout
 * server. Raising or lowering it is an owner decision, not a refactor.
 */
export const FIRST_ALLOCATABLE_LAYER = 50;

/**
 * 🔴 **THE three bands, named for their ROLES and not for their numbers.**
 *
 * Every allocator reads THIS. A band bound written anywhere else — a constant, a bare
 * literal, or a coordinate string like `1-9` in a message or a test — is a second copy that
 * cannot notice when this one moves, which is golden rule 6 applied to a number instead of
 * a predicate.
 */
export const LAYER_BANDS = {
  /** The graphics BED: the multi-box frame itself, composited UNDER its own plates. */
  bed: { start: 50, end: 59 },
  /** The LIVE PLATES: the frame's inputs, composited over the bed and under the templates. */
  plate: { start: 60, end: 79 },
  /** The TEMPLATES: the operator's candidate layer bank, composited over everything. */
  template: { start: 80, end: 99 },
} as const satisfies Record<string, LayerBand>;

export type LayerBandRole = keyof typeof LAYER_BANDS;

/**
 * The bands in COMPOSITION order, bottom-most first — the order {@link assertLayerBands}
 * holds them to, and the one a reader should picture when they read the map.
 *
 * It is a separate declaration rather than `Object.keys(LAYER_BANDS)` deliberately: object
 * key order is an implementation detail of how the literal above happens to be written, and
 * an ordering REQUIREMENT that derives itself from the thing it is checking cannot fail.
 */
export const LAYER_BAND_ORDER = [
  'bed',
  'plate',
  'template',
] as const satisfies readonly LayerBandRole[];

/** How many layers a band holds, inclusive of both ends. */
export function bandSize(band: LayerBand): number {
  return band.end - band.start + 1;
}

/** Is this layer number inside the band? Inclusive of both ends. */
export function inBand(band: LayerBand, layer: number): boolean {
  return layer >= band.start && layer <= band.end;
}

/** `50-59`, for a message. ONE spelling, so two refusals cannot render the map differently. */
export function bandText(band: LayerBand): string {
  return `${String(band.start)}-${String(band.end)}`;
}

/** The layer map is self-contradictory. Thrown at module load — see {@link assertLayerBands}. */
export class LayerBandError extends Error {
  override readonly name = 'LayerBandError';
}

/**
 * 🔴 **THE GUARD. Three questions, asked of the map itself, at module load.**
 *
 * 1. Is every band ABOVE the floor (nothing allocated below {@link FIRST_ALLOCATABLE_LAYER})?
 * 2. Do the bands run in COMPOSITION order — bed strictly below plate strictly below
 *    template?
 * 3. Do any two bands OVERLAP?
 *
 * ⚠ **WHY THIS IS A THROW AT MODULE LOAD AND NOT ONLY A TEST.** The failure it exists to
 * catch has no error of its own. Put a bed at or above its own plates and CasparCG composites
 * exactly as instructed: the bed's opaque background draws OVER the live pictures, the
 * operator watches the guests' frames vanish behind their own backdrop, and nothing anywhere
 * reports a fault. A renumbering that gets the order wrong must not be able to reach a
 * running bridge, so the module that DEFINES the map refuses to load with a broken one.
 *
 * ⚠ **(2) IS NOT REDUNDANT WITH (3), which is why both are here.** Disjointness is a
 * weaker property than order: `bed: 80-89` and `template: 50-59` are perfectly disjoint and
 * put the bed on top. Two bands that overlap and two bands in the wrong order are different
 * defects with the same consequence, and a guard that only asked one of them would pass the
 * other.
 *
 * ⚠ **OVERLAP IS ASKED BEFORE ORDER, and the order of the two arms is load-bearing for the
 * DIAGNOSIS rather than for the verdict.** Under a total order the ordering arm subsumes
 * overlap for ADJACENT bands — if `bed.end < plate.start` then they cannot intersect — so
 * asking order first would report every touching pair as "not strictly below" and leave the
 * overlap arm unreachable, which is a check nothing can ever watch go red. Asked in this
 * order, a bed whose top row lands ON its first plate is diagnosed as the OVERLAP it is, and
 * "not strictly below" is left to say the thing only it can say: these bands are disjoint
 * and still composite the wrong way up.
 *
 * Exported and parameterised so the tests can feed it a DELIBERATELY broken map — the guard
 * is only worth having if something has watched it go red.
 */
export function assertLayerBands(
  bands: Readonly<Record<LayerBandRole, LayerBand>> = LAYER_BANDS,
  order: readonly LayerBandRole[] = LAYER_BAND_ORDER,
  floor: number = FIRST_ALLOCATABLE_LAYER,
): void {
  for (const role of order) {
    const band = bands[role];
    if (!Number.isInteger(band.start) || !Number.isInteger(band.end)) {
      throw new LayerBandError(`the ${role} band ${bandText(band)} is not a pair of integers`);
    }
    if (band.end < band.start) {
      throw new LayerBandError(`the ${role} band ${bandText(band)} ends before it starts`);
    }
    if (band.start < floor) {
      throw new LayerBandError(
        `the ${role} band ${bandText(band)} allocates below layer ${String(floor)} — ` +
          `1-${String(floor - 1)} is left free for the playout server and anything else on ` +
          `the channel, and a graphic of ours landing there is indistinguishable from theirs ` +
          `on the wire`,
      );
    }
  }

  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const aRole = order[i] as LayerBandRole;
      const bRole = order[j] as LayerBandRole;
      const a = bands[aRole];
      const b = bands[bRole];
      if (a.start <= b.end && b.start <= a.end) {
        throw new LayerBandError(
          `the ${aRole} band ${bandText(a)} overlaps the ${bRole} band ${bandText(b)} — ` +
            `a layer cannot hold two roles, and the two would overwrite each other on air`,
        );
      }
    }
  }
  for (let i = 1; i < order.length; i += 1) {
    const lowerRole = order[i - 1] as LayerBandRole;
    const upperRole = order[i] as LayerBandRole;
    const lower = bands[lowerRole];
    const upper = bands[upperRole];
    if (lower.end >= upper.start) {
      throw new LayerBandError(
        `the ${lowerRole} band ${bandText(lower)} is not strictly below the ${upperRole} ` +
          `band ${bandText(upper)} — a higher CasparCG layer renders ABOVE a lower one, so ` +
          `this would composite the ${lowerRole} over the ${upperRole} and the operator ` +
          `would watch it happen with no error anywhere`,
      );
    }
  }
}

// The map is checked the moment it is imported, so a broken renumbering cannot reach a
// running bridge, a build, or a test that was not looking for it.
assertLayerBands();
