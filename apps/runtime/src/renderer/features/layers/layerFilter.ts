/**
 * 🔴 `AUDIT-CLOSE-01` B2 — THE LAYERS SUB-BAR'S FILTER, AND THE ONE RULE IT MAY NOT BREAK.
 *
 * ── WHY THIS DID NOT EXIST, AND WHY NOBODY NOTICED ───────────────────────────────────
 *
 * The reference draws a line under the layers card's toolbar: a `Find row or template…`
 * field, a `Hide empty` checkbox, and a tally reading `7 loaded · 3 on air · 10/10 rows`.
 * `design.md` §1.1 row 72 records that surface as ALREADY BUILT — _"Search, `Hide empty`,
 * counts, results hint — `LayersPanel.tsx` sub-bar + `features/layers/layerTable.ts`"_ — and
 * it was not: `LayersPanel.tsx` had no text input at all and `layerTable.ts` is density
 * arithmetic. The map asserted parity for a control that did not exist, so the delta never
 * reached §10.2's property table and was never argued either way. The map line is corrected
 * in place; this module is the control.
 *
 * ── 🔴 THE OVERRIDE, WHICH IS THE WHOLE SAFETY ARGUMENT ──────────────────────────────
 *
 * `LayersPanel`'s row list already carries one honesty override, and its comment says why:
 * _"part A's honesty override keeps a bound or observably-occupied row visible even when
 * unticked, so a live graphic can never lose its only surface."_ A search box is a SECOND way
 * to make a row disappear from the only list that shows it, and it would be a worse one,
 * because unticking a row is a deliberate configuration act while typing three letters is
 * not.
 *
 * So the same rule applies here: **a row the bridge reports something on is never hidden by
 * this filter**, whatever the query says and whatever `Hide empty` says. The tally is what
 * keeps that honest rather than mysterious — it says how many rows are shown out of how many
 * exist, so a query that appears to match nothing still shows its total.
 *
 * ⚠ This is a bucket-A reason and not a preference: the reference filters plainly, and this
 * console deliberately does not, for the same reason `isLayerVisible` does not.
 *
 * ── WHY IT IS A MODULE AND NOT A `useMemo` IN THE PANEL ──────────────────────────────
 *
 * Every claim here is about SETS, not layout, so it is provable without a browser — which
 * means it can be red-first in jsdom while the sub-bar's geometry is measured in Chromium
 * (golden rule 12c cuts both ways: layout goes to Playwright, and everything that is not
 * layout should not be paying Playwright's price).
 */

/** What the filter needs to know about a row. Deliberately not the row itself. */
export interface FilterableRow {
  /** The operator's name for the row, exactly as `operatorRowName` composed it. */
  readonly rowName: string;
  /** The template's display name, or `null` where the row carries none. */
  readonly templateName: string | null;
  /**
   * 🔴 The bridge reports a producer on this layer. The override reads THIS, never a status:
   * a status can be stale or refused, and the question here is "is something on the layer",
   * which is the observation's own question.
   */
  readonly occupied: boolean;
  /** The row is bound to an item — loaded, whatever its status says about air. */
  readonly loaded: boolean;
}

export interface LayerFilter {
  /** The `Find row or template…` query, as typed. */
  readonly query: string;
  /** `Hide empty` — drop rows carrying nothing at all. */
  readonly hideEmpty: boolean;
}

export const NO_FILTER: LayerFilter = { query: '', hideEmpty: false };

/** Is this filter narrowing anything at all? A quiet tally when it is not. */
export function isNarrowing(filter: LayerFilter): boolean {
  return filter.query.trim().length > 0 || filter.hideEmpty;
}

/**
 * Case-insensitive, accent-preserving substring match.
 *
 * ⚠ `toLocaleLowerCase()` and NOT `toLowerCase()`: the names on this console are Persian, and
 * a locale-blind lower-casing is exactly the class of bug that shows up only on the station.
 * Persian has no case, so this is a no-op there and correct for the Latin template names
 * beside it — which is the point of using the locale-aware one for both rather than branching.
 */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

/**
 * Should this row be SHOWN?
 *
 * The override comes first, on purpose: reading it as the last clause of a long boolean is how
 * it eventually gets refactored out (golden rule 6's shape, one surface over).
 */
export function rowIsShown(row: FilterableRow, filter: LayerFilter): boolean {
  // 🔴 THE OVERRIDE. Something is on this layer; no query hides it.
  if (row.occupied) return true;
  if (filter.hideEmpty && !row.loaded) return false;
  const query = filter.query.trim();
  if (query.length === 0) return true;
  return (
    contains(row.rowName, query) || (row.templateName !== null && contains(row.templateName, query))
  );
}

/** The sub-bar's numbers. `onAir` is passed in — it is `airTally`'s, and never re-derived. */
export interface LayerTally {
  readonly loaded: number;
  readonly shown: number;
  readonly total: number;
}

export function layerTally(rows: readonly FilterableRow[], filter: LayerFilter): LayerTally {
  return {
    loaded: rows.filter((r) => r.loaded).length,
    shown: rows.filter((r) => rowIsShown(r, filter)).length,
    total: rows.length,
  };
}
