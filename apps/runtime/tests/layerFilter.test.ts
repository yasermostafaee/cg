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
 * The case that matters is the LAST one in each group: a row that would lose its only surface
 * survives every narrowing. It was taken RED against a build with the override's early return
 * removed from `rowIsShown` — with it gone, `an occupied row survives a query that does not
 * match it` and `…survives Hide empty` both failed and the tally read 1 where it must read 2.
 *
 * ⚠ **WHICH ROWS THOSE ARE was narrowed by `CONSOLE-MATCH-03`** — see the block below and
 * `layerFilter.ts`'s header. "A row the bridge reports something on" was too wide by exactly
 * the pre-rolled case, and on the station that was nearly every row.
 */

const row = (over: Partial<FilterableRow> = {}): FilterableRow => ({
  rowName: 'Layer 5',
  templateName: null,
  occupied: false,
  onAir: false,
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

describe('🔴 the override: a row that would lose its only surface is never hidden', () => {
  it('an UNBOUND occupied row survives a query that does not match it', () => {
    // UNBOUND is the load-bearing word since `CONSOLE-MATCH-03`: a producer nothing of ours
    // is bound to cannot be named, so it cannot be typed, so a query may not hide it. A
    // producer on a row we merely pre-rolled is a different thing — see the block below.
    const r = row({ rowName: 'Layer 5', occupied: true, loaded: false });
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

/**
 * 🔴 `CONSOLE-MATCH-03` — THE PLANT CASE, and why the override above had to be narrowed.
 *
 * Owner report, 2026-09-11: «سرچ لایه‌ها هم کار نمیکنه» — the layers search does nothing on the
 * station. It was not the input and it was not the matching: it was THIS override, firing on
 * every row.
 *
 * `occupied` is `observed.kind === 'producer'`, and a `CG ADD` puts a producer on a layer.
 * The station's workflow keeps its rows LOADED, so on `~/.cg-runtime`'s real bank — seven
 * visible rows, layers 97/98/99 and beds 6–9, with loads and takes on 97, 98, 99, 7 and 9 in
 * the audit record — almost every row the operator wants to find is `occupied` and therefore
 * unhideable. The filter could only ever remove rows that were already empty, which is what
 * `Hide empty` is for. From the operator's seat that is a search box that does nothing.
 *
 * ⚠ THE SAFETY PROPERTY IS KEPT, NOT TRADED AWAY. What the override was written to protect is
 * _"a live graphic can never lose its only surface"_, and a pre-rolled producer is not a live
 * graphic — `CG ADD` without a `PLAY` renders nothing. So the override now names the two
 * states where hiding the row really would cost the operator something he cannot recover from
 * the list, and nothing else:
 *
 *   1. **ON AIR** — the sacred case, asked through `isOnAirStatus`.
 *   2. **A PRODUCER NOBODY'S ITEM EXPLAINS** — the bridge sees something on a layer no row is
 *      bound to. The console cannot name it, so a query cannot match it, so a query must not
 *      be able to hide it. This is the `Hide empty` case that was already argued below.
 *
 * A row of OUR OWN that we merely pre-rolled is neither, and the operator typed the query.
 */
describe('🔴 CONSOLE-MATCH-03 — a pre-rolled row of our own is filterable', () => {
  it('the plant case: loaded, a producer on the layer, nothing on air — the query hides it', () => {
    const r = row({ rowName: 'Layer 28', occupied: true, loaded: true, onAir: false });
    expect(rowIsShown(r, { query: 'لوگو', hideEmpty: false })).toBe(false);
  });

  it('and the tally agrees, so the list and the numbers cannot contradict each other', () => {
    const rows = [
      row({ rowName: 'لوگوی اصلی', occupied: true, loaded: true, onAir: false }),
      row({ rowName: 'زیرنویس اصلی', occupied: true, loaded: true, onAir: false }),
      row({ rowName: 'Bed 6' }),
    ];
    const t = layerTally(rows, { query: 'لوگو', hideEmpty: false });
    expect(t.shown).toBe(1);
    expect(t.total).toBe(3);
  });

  it('ON AIR still overrides — the one case the override exists for', () => {
    const r = row({ rowName: 'Layer 28', occupied: true, loaded: true, onAir: true });
    expect(rowIsShown(r, { query: 'nothing-like-this', hideEmpty: false })).toBe(true);
  });

  it('an on-air row survives Hide empty as well', () => {
    const r = row({ occupied: true, loaded: true, onAir: true });
    expect(rowIsShown(r, { query: '', hideEmpty: true })).toBe(true);
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
    /*
      SUPERSEDED BY `CONSOLE-MATCH-03`, and kept as a corrected line rather than deleted,
      because the number is the whole point. It read `shown: 2` — _"LOGO BUG matches; DEBATE
      is occupied and overrides"_ — and DEBATE is loaded with a producer on its layer and
      NOTHING ON AIR, which is the plant's ordinary pre-rolled row. That override was the
      defect the owner reported. LOGO BUG matches; nothing else survives.
    */
    expect(t).toEqual({ loaded: 2, shown: 1, total: 4 });
  });

  it('knows whether it is narrowing at all', () => {
    expect(isNarrowing(NO_FILTER)).toBe(false);
    expect(isNarrowing({ query: '  ', hideEmpty: false })).toBe(false);
    expect(isNarrowing({ query: 'a', hideEmpty: false })).toBe(true);
    expect(isNarrowing({ query: '', hideEmpty: true })).toBe(true);
  });
});
