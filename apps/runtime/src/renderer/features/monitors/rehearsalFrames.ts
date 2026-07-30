import { defaultLayerAlias, type FixedLayerBank, type Rehearsal } from '@cg/shared-ipc';
import type { FieldValues, Position } from '@cg/shared-schema';

/**
 * R-022 — the SUBJECTS of a rehearsal render: one per rehearsing row, resolved
 * and ordered here so the panel does no ordering of its own.
 */
export interface RehearsalSubject {
  itemId: string;
  /** The REAL CasparCG layer number. The z-order is derived from THIS. */
  layer: number;
  channel: number;
  /** The row's operator-facing name — its alias, else `Layer <bankPosition>`. */
  rowName: string;
  /** The operator's applied placement override, when the item has one (R-011). */
  position: Position | undefined;
  /** Applied fields with any staged edits layered on. */
  fields: FieldValues;
}

/**
 * THE z-ORDER RULE, and the reason it is a named function with a test rather
 * than an inline `.sort()`.
 *
 * On a CasparCG channel the HIGHER layer number draws ON TOP. Two other numbers
 * on this surface look like they say the same thing and both run the OPPOSITE
 * way, so keying off either would invert the composite and look entirely
 * plausible:
 *
 *   - the row's DISPLAY INDEX — the list is sorted DESCENDING by layer, so the
 *     first row is the highest layer, i.e. index 0 is the TOP graphic;
 *   - the ALIAS number — `Layer 1` is `bankPosition` 1, which counts DOWN from
 *     the bank's highest layer, so `Layer 1` is layer 99 and `Layer 5` is 95.
 *
 * The only number that means what it says is the CasparCG layer itself, so that
 * is the only one this reads. Ascending, so the highest layer is rendered last
 * and therefore paints last — and the explicit `zIndex` below says the same
 * thing again, because document order alone is a property a future refactor can
 * quietly change.
 */
export function stackedByLayer(subjects: readonly RehearsalSubject[]): RehearsalSubject[] {
  // `channel` is compared first purely so the order is TOTAL and stable: this
  // bank is one channel today, and if that ever changes, a preview whose frames
  // reshuffled between renders would be worse than one with an arbitrary but
  // fixed inter-channel order.
  return [...subjects].sort((a, b) => a.channel - b.channel || a.layer - b.layer);
}

/**
 * The z-index for a subject at `index` in the {@link stackedByLayer} order.
 *
 * Starts at 1 so every frame sits ABOVE the transparency checker (z-index 0),
 * which is a single backdrop behind the WHOLE stack rather than one per frame —
 * a checker between two frames would read as opaque and hide exactly the alpha
 * it exists to reveal.
 */
export function frameZIndex(index: number): number {
  return index + 1;
}

/** The row's display name: its configured alias, else the bank's default. */
export function rowNameFor(
  bank: FixedLayerBank | null,
  layer: number,
  alias: string | undefined,
): string {
  if (alias !== undefined) return alias;
  if (bank === null) return `Layer ${String(layer)}`;
  return defaultLayerAlias(bank, layer);
}

/**
 * What the panel says it is showing, ALWAYS VISIBLE and never behind a
 * disclosure.
 *
 * Two jobs, and the second is the load-bearing one:
 *
 *   1. it says how many rows are being composited, because a composite that does
 *      not say how many it composites is the same silently-partial surface this
 *      replaced;
 *   2. when `shown < rehearsing` it says SO, in the form "showing N of M". PVW
 *      must never render fewer frames than there are rehearsing rows without
 *      saying it out loud — a quiet drop reproduces exactly the bug being fixed,
 *      and burying the shortfall in the collapsed caveats would be a quiet drop
 *      with extra steps. There is no cap today; this is what a shortfall from
 *      any cause (a page this browser does not hold) has to look like.
 *
 * It also says REHEARSING rather than naming air: on-air rows are deliberately
 * NOT composited here (PGM is the surface for air), so the count and the caption
 * have to agree that this is the rehearsal set and nothing else.
 */
export function rehearsalCaption(shown: number, rehearsing: number): string {
  const noun = rehearsing === 1 ? 'row' : 'rows';
  if (shown < rehearsing) {
    return `Rehearsing ${String(rehearsing)} ${noun} — showing ${String(shown)} of ${String(rehearsing)}`;
  }
  if (rehearsing === 1) return 'Rehearsing 1 row';
  return `Rehearsing ${String(rehearsing)} rows — composited in channel layer order`;
}

/** The rehearsals to render, newest contract first: EVERY one of them. */
export function subjectsFor(
  rehearsals: readonly Rehearsal[],
  resolve: (r: Rehearsal) => RehearsalSubject | null,
): RehearsalSubject[] {
  // NO CAP, and no quiet drop. A row that is rehearsing but absent from the
  // stack has no template and no fields, so it cannot be rendered at all — that
  // is the one exclusion, and it is a genuine impossibility rather than a budget.
  const out: RehearsalSubject[] = [];
  for (const r of rehearsals) {
    const subject = resolve(r);
    if (subject !== null) out.push(subject);
  }
  return stackedByLayer(out);
}
