import { describe, expect, it } from 'vitest';
import {
  COLUMN_PX,
  VERBS_WIDTH_PX,
  gridTemplateColumns,
  minWidthFor,
} from '../src/renderer/features/layers/layerTable.js';

/**
 * `B-224` — the column model, held to MEASURED text rather than to guesses.
 *
 * Every number below was rendered in Chrome on 2026-09-05 at the exact font the cell uses
 * (root 16 px; the alias at `600 1.05rem`, the row state label at `700 0.72rem` with
 * `0.05em` tracking, the head at `700 0.62rem` uppercase with `0.06em`), through the app's
 * own stack (`Inter, system-ui, …, Vazirmatn, …` — Persian resolves to Segoe UI on Windows
 * and to the bundled Vazirmatn elsewhere; both measured, the wider kept). The script is in
 * the session record; the numbers are the fixture.
 *
 * Red-first: written against `stateFull: 132` / `aliasMin: 132`, where the old head
 * (`STATE (12 on air) (12 in error)`, 175 px) and the row's own `NOT CONNECTED` (136 px)
 * both overflowed the state column, and the longest real name fit the alias floor by 5 px.
 */

/** `NOT CONNECTED` + the 25 px mark + the 0.45 rem gap — the widest thing a row's state cell holds. */
const ROW_STATE_WIDEST_PX = 136;
/** `STATE` + `● 12` + `▲ 12` with two column gaps — the head's compact tally, both counts at two digits. */
const HEAD_COMPACT_TALLY_PX = 90;
/** The old head, `STATE (12 on air) (12 in error)` — what the 132 px column was asked to hold. */
const HEAD_OLD_TALLY_PX = 175;

/** The longest row NAME that actually exists (a plant alias, in the owner's screenshot). */
const LONGEST_REAL_ROW_NAME = 'میانبرنامه روی انتن';
const LONGEST_REAL_ROW_NAME_PX = 127;
/** The longest TEMPLATE name in the plant's records, should an operator alias a row with it. */
const LONGEST_TEMPLATE_NAME_AS_ALIAS_PX = 144;

describe('B-224 — the STATE column holds its own content', () => {
  it('🔴 is at least as wide as the widest row state label the column has to show', () => {
    expect(COLUMN_PX.stateFull).toBeGreaterThanOrEqual(ROW_STATE_WIDEST_PX);
  });

  it('🔴 holds the compact head tally at two digits each, and the old head could not fit', () => {
    expect(COLUMN_PX.stateFull).toBeGreaterThanOrEqual(HEAD_COMPACT_TALLY_PX);
    // The record of why the words left the head: the old form never fit a 132 px cell.
    expect(HEAD_OLD_TALLY_PX).toBeGreaterThan(132);
  });

  it('is wider than it was, by owner decision, and the width came out of the alias', () => {
    expect(COLUMN_PX.stateFull).toBeGreaterThan(132);
    expect(gridTemplateColumns('full')).toBe(
      `34px ${String(COLUMN_PX.stateFull)}px minmax(${String(COLUMN_PX.aliasMin)}px, ${String(COLUMN_PX.aliasMax)}px) minmax(${String(COLUMN_PX.templateMin)}px, 2fr) ${String(VERBS_WIDTH_PX)}px`,
    );
  });
});

describe('B-224 — the NAME column fits every real name on one line, and stops growing', () => {
  it('🔴 the floor fits the longest real row name with room for the dirty chip', () => {
    expect(LONGEST_REAL_ROW_NAME).toHaveLength(19);
    expect(COLUMN_PX.aliasMin).toBeGreaterThanOrEqual(LONGEST_REAL_ROW_NAME_PX + 16);
  });

  it('the floor also fits the longest template name, should a row be aliased with it', () => {
    expect(COLUMN_PX.aliasMin).toBeGreaterThanOrEqual(LONGEST_TEMPLATE_NAME_AS_ALIAS_PX);
  });

  it('🔴 at the full density the alias is CAPPED and the template takes the slack', () => {
    expect(gridTemplateColumns('full')).toContain(
      `minmax(${String(COLUMN_PX.aliasMin)}px, ${String(COLUMN_PX.aliasMax)}px)`,
    );
    expect(gridTemplateColumns('full')).not.toContain('1fr');
    expect(COLUMN_PX.aliasMax).toBeGreaterThan(LONGEST_REAL_ROW_NAME_PX + 60);
  });

  it('at the compact density there is no template column, so the alias keeps its 1fr', () => {
    expect(gridTemplateColumns('compact')).toBe(
      `34px ${String(COLUMN_PX.stateFull)}px minmax(${String(COLUMN_PX.aliasMin)}px, 1fr) ${String(VERBS_WIDTH_PX)}px`,
    );
  });

  it('the tightest density is untouched: the icon-only state, a zero alias floor, the whole verb block', () => {
    expect(gridTemplateColumns('tight')).toBe(
      `34px ${String(COLUMN_PX.stateIconOnly)}px minmax(0px, 1fr) ${String(VERBS_WIDTH_PX)}px`,
    );
    expect(COLUMN_PX.stateIconOnly).toBe(34);
  });

  it('the density thresholds follow the widths — the arithmetic is the same sum as before', () => {
    expect(minWidthFor('full')).toBe(
      34 +
        COLUMN_PX.stateFull +
        VERBS_WIDTH_PX +
        COLUMN_PX.aliasMin +
        COLUMN_PX.templateMin +
        4 * 12 +
        24,
    );
    expect(minWidthFor('compact')).toBe(
      34 + COLUMN_PX.stateFull + VERBS_WIDTH_PX + COLUMN_PX.aliasMin + 3 * 12 + 24,
    );
    expect(minWidthFor('tight')).toBe(34 + 34 + VERBS_WIDTH_PX + 0 + 3 * 12 + 24);
  });
});
