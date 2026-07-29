/**
 * THE Layers table's column model — one declaration, read by the sticky header
 * and by every row.
 *
 * This module is the whole answer to "nothing moves when text changes length".
 * The previous row was a `grid-template-columns: auto auto 1fr auto` with
 * `minWidth` FLOORS, and `auto` sizes to content — so a row aliased
 * `lower-third` started its template name 20px further right than a row aliased
 * `logo`, measured on the real screen. Floors are not widths. Every column here
 * is a FIXED px width (or the single flexible `1fr` that absorbs the slack), so
 * a longer alias, a longer template name or a longer state word changes nothing
 * but its own ellipsis.
 *
 * It is also what makes the header honest: the header and the rows call the same
 * `gridTemplateColumns(density)`, so a column cannot be labelled in one place and
 * laid out differently in another. Hand-writing the two would have been the
 * per-surface drift that `rowAction` and `Tooltip` exist to prevent elsewhere.
 *
 * Pure and React-free: the density arithmetic is the kind of thing that is wrong
 * by 30px and invisible until an operator drags a panel, so it is unit-testable
 * without a DOM.
 */

/**
 * The minimum hit target for a row verb, in px.
 *
 * These get pressed under time pressure by someone half-watching a monitor, so
 * this is a FLOOR that density is never allowed to trade away — the columns drop
 * text to make room, never shrink the buttons. Sits between WCAG 2.5.8's 24px
 * minimum and 2.5.5's 44px enhanced target: 34 is comfortable for a mouse in a
 * gallery while keeping ~30 rows scannable in one list.
 */
export const VERB_TARGET_PX = 34;

/**
 * Width of one verb column, in px — WIDER than the hit-target floor, and set by
 * the header rather than the button.
 *
 * Icon-only verbs are only safe because the sticky header prints the word each
 * glyph stands for directly above it, so a verb column has to be wide enough for
 * its longest word ("REMOVE", ~37px at the header's type size). Sizing the column
 * to the 34px button instead would have produced a header of clipped stumps —
 * which is the one thing that would make the icons unsafe again.
 */
const VERB_COL_PX = 44;

/** Gap between verb buttons, in px. */
const VERB_GAP_PX = 4;

/** How many verbs get a BUTTON on the row (the rest are right-click only). */
export const VERB_COUNT = 5;

/** Gap between table columns, and the row's horizontal padding, in px. */
const COL_GAP_PX = 12;
const ROW_PAD_PX = 12;

/** Fixed column widths in px. The `alias` column is the flexible one. */
const W = {
  /** Row number — `1..n`, up to two digits plus breathing room. */
  rowNum: 34,
  /** State: icon + word. Collapses to the icon alone at the tightest density. */
  stateFull: 118,
  stateIconOnly: 30,
  /** The alias — the row's primary label. Flexible, with a floor. */
  aliasMin: 96,
  template: 176,
  description: 200,
  /** The REAL CasparCG layer number — small, fixed-width, secondary. */
  layer: 52,
} as const;

/** The verb block's total width — fixed, because it is never allowed to reflow. */
export const VERBS_WIDTH_PX = VERB_COUNT * VERB_COL_PX + (VERB_COUNT - 1) * VERB_GAP_PX;

/**
 * The verb block's own grid — shared by the header's word row and the row's
 * button row, so a word always sits directly above the control it names.
 */
export const VERBS_GRID = {
  display: 'grid',
  gridTemplateColumns: `repeat(${String(VERB_COUNT)}, ${String(VERB_COL_PX)}px)`,
  gap: `${String(VERB_GAP_PX)}px`,
  alignItems: 'center',
  justifyContent: 'flex-end',
} as const;

/**
 * How much of the row's text is shown. Ordered widest-first; the drop order is
 * the one the review specified — description, then template name, then the real
 * layer number — and the ALIAS and the VERBS never drop at any density.
 */
export type Density = 'full' | 'mid' | 'compact' | 'tight';

export interface DensitySpec {
  showDescription: boolean;
  showTemplate: boolean;
  showLayer: boolean;
  /** The state's WORD. Its icon is never dropped — that is the signal. */
  showStateLabel: boolean;
  /**
   * The alias column's floor, in px.
   *
   * ZERO at the tightest density, deliberately. Below `minWidthFor('tight')` some
   * column has to give, and the order is not a matter of taste: the alias is TEXT
   * (it ellipsizes, and its tooltip still says the whole thing) while a verb is a
   * CONTROL the operator has to reach. A non-zero floor here would push the grid
   * wider than its container and clip the verb block — which is precisely the
   * defect this model replaces. So the last thing to give way is the label, never
   * a button.
   */
  aliasFloor: number;
}

const SPECS: Record<Density, DensitySpec> = {
  full: {
    showDescription: true,
    showTemplate: true,
    showLayer: true,
    showStateLabel: true,
    aliasFloor: W.aliasMin,
  },
  mid: {
    showDescription: false,
    showTemplate: true,
    showLayer: true,
    showStateLabel: true,
    aliasFloor: W.aliasMin,
  },
  compact: {
    showDescription: false,
    showTemplate: false,
    showLayer: true,
    showStateLabel: true,
    aliasFloor: W.aliasMin,
  },
  tight: {
    showDescription: false,
    showTemplate: false,
    showLayer: false,
    showStateLabel: false,
    aliasFloor: 0,
  },
};

/** Widest to narrowest — the order `resolveDensity` walks. */
const ORDER: readonly Density[] = ['full', 'mid', 'compact', 'tight'];

export function densitySpec(density: Density): DensitySpec {
  return SPECS[density];
}

/** The fixed (non-flexible) px a density needs, excluding the alias column. */
function fixedWidth(density: Density): number {
  const spec = SPECS[density];
  const columns = [
    W.rowNum,
    spec.showStateLabel ? W.stateFull : W.stateIconOnly,
    // The alias column is deliberately absent here — it is the `1fr`.
    ...(spec.showTemplate ? [W.template] : []),
    ...(spec.showDescription ? [W.description] : []),
    ...(spec.showLayer ? [W.layer] : []),
    VERBS_WIDTH_PX,
  ];
  // Total columns is `columns.length + 1` (the alias), so the number of GAPS
  // between them is `columns.length`.
  const gaps = columns.length * COL_GAP_PX;
  return columns.reduce((a, b) => a + b, 0) + gaps + ROW_PAD_PX * 2;
}

/** The narrowest panel a density is usable in — its fixed columns plus the alias floor. */
export function minWidthFor(density: Density): number {
  return fixedWidth(density) + SPECS[density].aliasFloor;
}

/**
 * Pick the richest density that fits `availablePx`, falling back to `tight`.
 *
 * `tight` is the FLOOR and is returned even when it does not fit: there is no
 * density below it, and the alternative — letting the row wrap or the list scroll
 * sideways to reach a control — is what this whole model exists to prevent. A
 * panel dragged below `minWidthFor('tight')` clips its ALIAS (which has an
 * ellipsis and a tooltip); it never clips a button.
 */
export function resolveDensity(availablePx: number): Density {
  for (const density of ORDER) {
    if (availablePx >= minWidthFor(density)) return density;
  }
  return 'tight';
}

/**
 * The grid template for a density — THE shared layout, used by the header row
 * and every body row so the two cannot disagree about where a column starts.
 */
export function gridTemplateColumns(density: Density): string {
  const spec = SPECS[density];
  return [
    `${String(W.rowNum)}px`,
    `${String(spec.showStateLabel ? W.stateFull : W.stateIconOnly)}px`,
    // The one flexible column. `minmax(floor, 1fr)` rather than a bare `1fr`:
    // a bare `1fr` still refuses to shrink below its CONTENT's intrinsic width,
    // which is how a long template name used to push the verb block off the
    // panel. An explicit floor (0 at the tightest density) makes the alias the
    // thing that gives way.
    `minmax(${String(spec.aliasFloor)}px, 1fr)`,
    ...(spec.showTemplate ? [`${String(W.template)}px`] : []),
    ...(spec.showDescription ? [`${String(W.description)}px`] : []),
    ...(spec.showLayer ? [`${String(W.layer)}px`] : []),
    `${String(VERBS_WIDTH_PX)}px`,
  ].join(' ');
}

/** Shared row geometry, so the header and the rows are padded identically. */
export const ROW_GEOMETRY = {
  columnGap: `${String(COL_GAP_PX)}px`,
  padding: `0 ${String(ROW_PAD_PX)}px`,
} as const;
