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
 *
 * `RUNTIME-REDESIGN-01` PHASE 3 — THE NUMBERS LIVE IN THE TOKEN HOME. The verb box,
 * the verb gap and the row padding are `LAYER_ROW_PX` in `theme.ts`, where the
 * `--r-row-*` tokens the stylesheet reads are derived from the same object. This
 * module does the arithmetic on them; it no longer spells them. A second copy here
 * is how a header word comes to sit above a column of a different width.
 */

import { LAYER_ROW_PX } from '../../theme.js';

/**
 * The minimum hit target for a row verb, in px — the verb's own height.
 *
 * These get pressed under time pressure by someone half-watching a monitor, so
 * this is a FLOOR that density is never allowed to trade away — the columns drop
 * text to make room, never shrink the buttons. Sits between WCAG 2.5.8's 24px
 * minimum and 2.5.5's 44px enhanced target: 36 is comfortable for a mouse in a
 * gallery while keeping ~30 rows scannable in one list.
 */
export const VERB_TARGET_PX: number = LAYER_ROW_PX.verbH;

/**
 * Width of one verb column, in px — WIDER than the hit-target floor, and set by
 * the header rather than the button.
 *
 * Icon-only verbs are only safe because the sticky header prints the word each
 * glyph stands for directly above it, so a verb column has to be wide enough for
 * its longest word ("REMOVE", ~37px at the header's type size). Sizing the column
 * to the 36px button instead would have produced a header of clipped stumps —
 * which is the one thing that would make the icons unsafe again.
 */
const VERB_COL_PX: number = LAYER_ROW_PX.verbW;

/**
 * Gap between verb buttons, in px.
 *
 * A SEPARATE failure mode from the hit target above, and it needs its own number.
 * `VERB_TARGET_PX` stops the operator MISSING a button; this stops them hitting
 * the NEIGHBOURING one. Adjacent targets pressed at speed still produce mis-clicks
 * when they touch, and the neighbours here are PLAY, NEXT, STOP and CLEAR — every
 * one an on-air action, and STOP and CLEAR mean opposite things in this product.
 *
 * 12px, read off the owner's mock-up, where the gap is visibly comparable to a
 * quarter of the button. The 4px it replaces read as a seam in one control block
 * rather than as five separate controls.
 */
const VERB_GAP_PX: number = LAYER_ROW_PX.verbGap;

/**
 * How many verbs get a BUTTON on the row (the rest are right-click only).
 *
 * SIX since R-022 added REHEARSE. This number is not decoration: it is the width
 * of the verb block AND the column count of the grid the header's word row and
 * the row's button row BOTH lay out on. Leaving it at five when the row started
 * emitting a sixth button did two things at once — the sixth button (CLEAR) wrapped
 * onto a second line, and every header word from NEXT rightward sat above the WRONG
 * glyph. That second one is the dangerous half: this product's STOP (graceful) and
 * CLEAR (hard kill) are the inverse of the reference product's, and the header word
 * is precisely the channel that retires the misread. Adding a button here without
 * adding its head to `VERB_HEADS` re-opens it.
 *
 * 🔴 **THE ADMISSION RULE, and the half two sessions had to work out for themselves.**
 * A control enters this block ONLY IF it is declared for EVERY row of the surface, and
 * its head joins `VERB_HEADS` in the SAME change that adds the button.
 *
 *   · availability that varies by STATE is fine — a disabled button in its own fixed
 *     column, which is the established pattern;
 *   · PRESENCE that varies by ROW is not. It either shifts every head to its right
 *     onto the wrong glyph, or claims a column whose head is a word most rows make
 *     false.
 *
 * Anything conditional goes to the row's CONTEXT MENU (or the Inspector), never into
 * the block. That is not a preference: `operator-surface` `§4` records SOURCE (R-048)
 * and plate AUDIO (C-015 6.5f) each arriving at it independently, from this comment,
 * with the block left at six both times. Written down here so the FOURTH control does
 * not rediscover it by collision. The MENU's own rule — and why it is different — sits
 * beside the C6 boundary in `PlayoutPanel.tsx`.
 */
export const VERB_COUNT = 6;

/** Gap between table columns, in px. */
const COL_GAP_PX = 12;
/**
 * The row's horizontal padding — the token home's `padX` (`--r-row-pad`). The
 * VERTICAL padding is the same token's `padY`; the width model never needs it, and
 * the row takes both through `ROW_GEOMETRY.padding` below.
 */
const ROW_PAD_PX: number = LAYER_ROW_PX.padX;

/**
 * Fixed column widths in px. The `alias` column is the flexible one.
 *
 * `B-224` (2026-09-05) — three of these were re-measured in Chrome at the fonts the table
 * actually renders with (the app stack resolves Persian to Segoe UI on Windows and to the
 * bundled Vazirmatn elsewhere; both were measured, the wider kept):
 *
 * | string, at its cell's font                                   | px       |
 * | ------------------------------------------------------------ | -------- |
 * | `NOT CONNECTED` + the 25px mark + the 0.45rem gap (row state) | 136      |
 * | `STATE` head + `● 12` + `▲ 12` (the compact tally, both)      | ≈ 90     |
 * | `STATE (12 on air) (12 in error)` (the old head, both)        | ≈ 175    |
 * | `میانبرنامه روی انتن` — the longest REAL row name (alias font) | 127      |
 * | `میان‌برنامه (روی آنتن)` — the longest template name, if aliased | 144      |
 *
 * The old `stateFull: 132` clipped its own `NOT CONNECTED` by 4 px and clipped the header's
 * tally whenever both counts were non-zero. The old `aliasMin: 132` fit the longest real
 * name by 5 px — and nothing else beside it.
 */
const W = {
  /** Row number — `1..n`, up to two digits plus breathing room. */
  rowNum: 34,
  /**
   * State: icon + word. Collapses to the icon alone at the tightest density.
   *
   * Sized for the 25px mark plus the longest label the column has to hold without
   * ellipsis — `NOT CONNECTED` (136 px measured) — and for the header's tally in its
   * compact form (`STATE ● 12 ▲ 12`, ≈ 90 px), with room to spare. WIDENED from 132 by
   * owner decision (`B-224`: _"the STATE column can also be wider"_); the width comes out
   * of the alias column's slack, never out of the template or the verbs.
   */
  stateFull: 150,
  stateIconOnly: 34,
  /**
   * The alias — the row's primary label. Flexible, with a floor AND a ceiling.
   *
   * The FLOOR fits the longest real row name on one line (`میانبرنامه روی انتن`, 127 px at
   * the alias font) and the longest template name should an operator alias a row with it
   * (144 px), with a little room for the dirty chip. A NAME column that fits `Layer 3` and
   * clips a real Persian name is not narrower, it is broken.
   *
   * The CEILING is the owner's `B-224` decision — _"the NAME column is far too wide"_: at
   * the full density the alias no longer absorbs any slack at all; every spare pixel goes
   * to the template, which holds the longest text on the row (Persian programme titles).
   * A row name is short by nature (`Layer 3`, `CLOCK`, `BREAKING`), and the ceiling leaves
   * 70 px over the longest real one. At the compact density there is no template column
   * to give the slack to, so the alias keeps its `1fr` there.
   */
  aliasMin: 150,
  aliasMax: 220,
  /** The template name's floor. Flexible above it, and the wider of the two. */
  templateMin: 160,
} as const;

/**
 * `B-224` — the widths a test can hold the model to, exported so the assertion reads the
 * same number the grid does rather than a copy of it.
 */
export const COLUMN_PX = {
  stateFull: W.stateFull,
  stateIconOnly: W.stateIconOnly,
  aliasMin: W.aliasMin,
  aliasMax: W.aliasMax,
  templateMin: W.templateMin,
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
 * How much of the row's text is shown. Ordered widest-first; the ALIAS and the
 * VERBS never drop at any density.
 *
 * TWO COLUMNS HAVE BEEN REMOVED ALTOGETHER, both by owner decision, and both are
 * safe for the same reason — the fact moved somewhere always reachable rather than
 * being deleted:
 *
 *   - the real CasparCG LAYER NUMBER lives in the Inspector and in the ROW's own
 *     tooltip and accessible name;
 *   - the DESCRIPTION (what the wire reports about the layer) lives in the STATE
 *     cell's tooltip, which always ends with CasparCG's own words for it.
 *
 * That second one is load-bearing, so it is worth being explicit: the occupancy
 * report is the B-094 honesty class (`unknown` must never read as `empty`), and it
 * would NOT have been safe to hide this column before the tooltip carried it. It
 * does now — for bound rows too, which was the gap fixed earlier — so the glanceable
 * layer gets simpler without the fact getting lost.
 */
export type Density = 'full' | 'compact' | 'tight';

export interface DensitySpec {
  showTemplate: boolean;
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
  full: { showTemplate: true, showStateLabel: true, aliasFloor: W.aliasMin },
  compact: { showTemplate: false, showStateLabel: true, aliasFloor: W.aliasMin },
  tight: { showTemplate: false, showStateLabel: false, aliasFloor: 0 },
};

/** Widest to narrowest — the order `resolveDensity` walks. */
const ORDER: readonly Density[] = ['full', 'compact', 'tight'];

export function densitySpec(density: Density): DensitySpec {
  return SPECS[density];
}

/**
 * The narrowest panel a density is usable in: its rigid columns, plus the FLOORS of
 * the flexible ones, plus the gaps and the row's padding.
 *
 * Both flexible columns contribute a floor — the alias and, where it is shown, the
 * template. Counting only one was the arithmetic slip that would let `resolveDensity`
 * pick a density whose own minimum does not fit, which is how a verb block gets
 * clipped again.
 */
export function minWidthFor(density: Density): number {
  const spec = SPECS[density];
  const rigid = [W.rowNum, spec.showStateLabel ? W.stateFull : W.stateIconOnly, VERBS_WIDTH_PX];
  const flexFloors = [spec.aliasFloor, ...(spec.showTemplate ? [W.templateMin] : [])];
  const columnCount = rigid.length + flexFloors.length;
  const total = [...rigid, ...flexFloors].reduce((a, b) => a + b, 0);
  return total + (columnCount - 1) * COL_GAP_PX + ROW_PAD_PX * 2;
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
    // The FLEXIBLE columns. `minmax(floor, Nfr)` rather than a bare `fr`: a bare
    // `fr` still refuses to shrink below its CONTENT's intrinsic width, which is
    // how a long template name used to push the verb block off the panel. An
    // explicit floor (0 for the alias at the tightest density) makes the text the
    // thing that gives way, never a control.
    //
    // `B-224` — WHERE THE TEMPLATE COLUMN EXISTS, the alias is CAPPED (`aliasMax`) and
    // the template takes every spare pixel: it holds the longest text on the row
    // (Persian programme titles) while a row name is short by nature, so a share for
    // the alias only ever bought dead space beside an ellipsizing title. Without a
    // template column the alias is the only flexible column and keeps its `1fr`.
    spec.showTemplate
      ? `minmax(${String(spec.aliasFloor)}px, ${String(W.aliasMax)}px)`
      : `minmax(${String(spec.aliasFloor)}px, 1fr)`,
    ...(spec.showTemplate ? [`minmax(${String(W.templateMin)}px, 2fr)`] : []),
    `${String(VERBS_WIDTH_PX)}px`,
  ].join(' ');
}

/** Shared row geometry, so the header and the rows are padded identically. */
export const ROW_GEOMETRY = {
  columnGap: `${String(COL_GAP_PX)}px`,
  /**
   * The row's padding, READ FROM THE TOKEN (`--r-row-pad`) rather than composed from
   * the numbers above — the numbers above are the same values, but the row must take
   * them the way the stylesheet does, so a Playwright measurement of the row and a
   * read of the token home are one fact. `minWidthFor` still sums the numbers.
   */
  padding: 'var(--r-row-pad)',
  /** The header keeps the horizontal padding but sets its own vertical rhythm. */
  headerPaddingX: `${String(ROW_PAD_PX)}px`,
} as const;
