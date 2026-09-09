import { describe, expect, it } from 'vitest';
import {
  NO_FILTER,
  isNarrowing,
  layerTally,
  rowIsShown,
  type FilterableRow,
} from '../src/renderer/features/layers/layerFilter.js';

/**
 * 🔴 `AUDIT-CLOSE-01` B2 — the layers sub-bar's filter, and the override it may not break.
 *
 * These are claims about SETS and carry no geometry, so they belong here rather than in
 * Playwright (golden rule 12c decides which way a claim goes, and it points both ways: a box
 * goes to Chromium, a predicate does not need to). The sub-bar's own boxes are measured in
 * `layers-subbar.spec.ts`.
 *
 * The case that matters is the LAST one in each group: a row the bridge reports something on
 * survives every narrowing. It was taken RED against a build with the override's early return
 * removed from `rowIsShown` — with it gone, `an occupied row survives a query that does not
 * match it` and `…survives Hide empty` both failed and the tally read 1 where it must read 2.
 */

const row = (over: Partial<FilterableRow> = {}): FilterableRow => ({
  rowName: 'Layer 5',
  templateName: null,
  occupied: false,
  loaded: false,
  ...over,
});

describe('the query matches what the operator can see on the row', () => {
  it('matches the ROW name', () => {
    expect(rowIsShown(row({ rowName: 'STUDIO FEED' }), { query: 'studio', hideEmpty: false })).toBe(
      true,
    );
    expect(rowIsShown(row({ rowName: 'STUDIO FEED' }), { query: 'ticker', hideEmpty: false })).toBe(
      false,
    );
  });

  it('matches the TEMPLATE name', () => {
    const r = row({ rowName: 'Layer 5', templateName: 'News Composite' });
    expect(rowIsShown(r, { query: 'composite', hideEmpty: false })).toBe(true);
    expect(rowIsShown(r, { query: 'lower', hideEmpty: false })).toBe(false);
  });

  /*
    PERSIAN, because this console's row names are Persian and a case-folding that is wrong for
    them is wrong on the station and nowhere else. `toLocaleLowerCase` is a no-op on a script
    with no case, so this is the assertion that the fold does not MANGLE it.
  */
  it('matches a Persian name unchanged', () => {
    const r = row({ rowName: 'زیرنویس اصلی' });
    expect(rowIsShown(r, { query: 'زیرنویس', hideEmpty: false })).toBe(true);
    expect(rowIsShown(r, { query: 'لوگو', hideEmpty: false })).toBe(false);
  });

  it('ignores surrounding whitespace and case', () => {
    const r = row({ rowName: 'Logo Bug' });
    expect(rowIsShown(r, { query: '  LOGO  ', hideEmpty: false })).toBe(true);
  });

  it('shows everything when nothing is typed', () => {
    expect(rowIsShown(row(), NO_FILTER)).toBe(true);
    expect(rowIsShown(row(), { query: '   ', hideEmpty: false })).toBe(true);
  });
});

describe('Hide empty drops rows carrying nothing', () => {
  it('hides an unbound, unoccupied row', () => {
    expect(rowIsShown(row(), { query: '', hideEmpty: true })).toBe(false);
  });

  it('keeps a LOADED row, whatever its status', () => {
    expect(rowIsShown(row({ loaded: true }), { query: '', hideEmpty: true })).toBe(true);
  });
});

describe('🔴 the override: a row the bridge reports something on is never hidden', () => {
  it('an occupied row survives a query that does not match it', () => {
    const r = row({ rowName: 'Layer 5', occupied: true });
    expect(rowIsShown(r, { query: 'nothing-like-this', hideEmpty: false })).toBe(true);
  });

  it('an occupied row survives Hide empty even while unbound', () => {
    // The shape that makes this real: the bridge sees a producer on a layer NO row is bound
    // to. `Hide empty` would read it as empty from the app's own model — and the app's model
    // is exactly what is wrong in that state.
    const r = row({ occupied: true, loaded: false });
    expect(rowIsShown(r, { query: '', hideEmpty: true })).toBe(true);
  });

  it('and the tally counts it as shown, so the numbers cannot contradict the list', () => {
    const rows = [row({ rowName: 'STUDIO FEED', loaded: true }), row({ occupied: true })];
    const t = layerTally(rows, { query: 'studio', hideEmpty: false });
    expect(t.shown).toBe(2);
    expect(t.total).toBe(2);
    expect(t.loaded).toBe(1);
  });
});

describe('the tally', () => {
  const rows = [
    row({ rowName: 'DEBATE', templateName: 'Debate — 4 box', loaded: true, occupied: true }),
    row({ rowName: 'LOGO BUG', templateName: 'Logo Sting', loaded: true }),
    row({ rowName: 'Layer 5' }),
    row({ rowName: 'Layer 6' }),
  ];

  it('counts loaded, shown and total', () => {
    expect(layerTally(rows, NO_FILTER)).toEqual({ loaded: 2, shown: 4, total: 4 });
  });

  it('narrows `shown` and never `total`', () => {
    const t = layerTally(rows, { query: 'logo', hideEmpty: false });
    // LOGO BUG matches; DEBATE is occupied and overrides; the two empties do not.
    expect(t).toEqual({ loaded: 2, shown: 2, total: 4 });
  });

  it('knows whether it is narrowing at all', () => {
    expect(isNarrowing(NO_FILTER)).toBe(false);
    expect(isNarrowing({ query: '  ', hideEmpty: false })).toBe(false);
    expect(isNarrowing({ query: 'a', hideEmpty: false })).toBe(true);
    expect(isNarrowing({ query: '', hideEmpty: true })).toBe(true);
  });
});
