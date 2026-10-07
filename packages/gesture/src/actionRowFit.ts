import { useCallback, useRef } from 'react';

/**
 * `B-319` — ONE ACTION-ROW FIT, shared by the Designer's and the Runtime's dialog footers.
 *
 * A dialog footer is one row packed to its end. When its buttons are wider than the row — a
 * long label, a large text scale, a narrow window — a `nowrap` row spills out of its START
 * edge, and the first button (`Cancel`) is painted outside the dialog. That is the owner's
 * report, measured at 47.9 px past the clip dialog's left edge.
 *
 * This marks the row {@link ACTION_ROW_STACKED} exactly while its items do not fit inside it,
 * and each app's stylesheet turns a marked row into a column. Behaviour only, like the rest of
 * this package: the attribute is the whole interface, and the look stays app-local.
 *
 * ── "DOES NOT FIT" HAS TWO FACES, AND BOTH WERE MEASURED ───────────────────────────
 *
 * 1. An item's box leaves the row's content box — the Designer, whose buttons never shrink below
 *    their label, so the row overflows its start edge.
 * 2. An item's own content runs past its box — the Runtime, whose footer buttons carry an
 *    explicit `min-width`, so the row SQUEEZES them instead and each `nowrap` label overruns its
 *    button. Measured on the old footer: both labels of a relabelled confirm overflowed their
 *    buttons while every button box stayed inside the frame. A spill-only test passes that.
 *
 * ── WHY NOT `flex-wrap` ──────────────────────────────────────────────────────────────
 *
 * The row is laid out exactly as before while it fits. A Runtime footer carries a shrinkable
 * info line beside its buttons, and that line shrinks and wraps its own text inside the row —
 * a `flex-wrap` row would push it to a line of its own instead and re-lay-out dialogs that fit.
 * So the test is the property itself, read off the row as it is.
 *
 * ── WHY IT MEASURES IN ROW FORM EVERY TIME ─────────────────────────────────────────
 *
 * A stacked row cannot say whether one row would hold its buttons again. {@link fitActionRow}
 * drops the mark, measures, and puts it back in ONE task, so the row form it measures is never
 * painted.
 */

/** The attribute a stacked row carries. Present = stacked; absent = one row. */
export const ACTION_ROW_STACKED = 'data-stacked';

/** A horizontal extent, in viewport pixels. */
export interface Extent {
  readonly start: number;
  readonly end: number;
}

/** One item of the row: its box, and how far its own content runs past that box. */
export interface ItemFit extends Extent {
  /** `scrollWidth − clientWidth`: 0 when the content fits its box. Whole pixels. */
  readonly overrun: number;
}

/** Sub-pixel layout rounds; anything past half a pixel is a real spill. */
const ALLOWANCE = 0.5;
/** `scrollWidth` and `clientWidth` are rounded separately, so one pixel apart is rounding. */
const OVERRUN_ALLOWANCE = 1;

/** True when any item's box lies outside the row's content extent. */
export function spillsOut(row: Extent, items: readonly Extent[]): boolean {
  return items.some((c) => c.start < row.start - ALLOWANCE || c.end > row.end + ALLOWANCE);
}

/**
 * True when the row does not hold its items on one line: an item's box leaves the row's content
 * box ({@link spillsOut}), or an item was squeezed narrower than its own content.
 */
export function rowDoesNotFit(row: Extent, items: readonly ItemFit[]): boolean {
  return spillsOut(row, items) || items.some((c) => c.overrun > OVERRUN_ALLOWANCE);
}

const px = (value: string): number => Number.parseFloat(value) || 0;

/** The row's CONTENT box (inside border and padding), or `null` when it has no layout. */
function contentExtent(row: HTMLElement): Extent | null {
  const box = row.getBoundingClientRect();
  // No layout to judge (jsdom, `display: none`): never stack on a guess.
  if (box.width === 0) return null;
  const cs = getComputedStyle(row);
  return {
    start: box.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
    end: box.right - px(cs.borderRightWidth) - px(cs.paddingRight),
  };
}

function items(row: HTMLElement): ItemFit[] {
  const out: ItemFit[] = [];
  for (const child of Array.from(row.children)) {
    const r = child.getBoundingClientRect();
    // An empty slot occupies nothing and cannot spill.
    if (r.width === 0 && r.height === 0) continue;
    out.push({ start: r.left, end: r.right, overrun: child.scrollWidth - child.clientWidth });
  }
  return out;
}

/**
 * Measure `row` in its ROW form and mark it stacked when it does not hold its items
 * ({@link rowDoesNotFit}). Returns whether it is stacked.
 */
export function fitActionRow(row: HTMLElement): boolean {
  row.removeAttribute(ACTION_ROW_STACKED);
  const content = contentExtent(row);
  const stacked = content !== null && rowDoesNotFit(content, items(row));
  if (stacked) row.setAttribute(ACTION_ROW_STACKED, '');
  return stacked;
}

/**
 * Keep `row` fitted: now, and whenever the row or a child changes size or content. Returns the
 * teardown. A no-op where there is no `ResizeObserver` (jsdom), so a unit render never stacks.
 *
 * The refit runs on the NEXT frame rather than inside the observer callback: stacking changes
 * the sizes being observed, and doing it inside the callback is the "ResizeObserver loop"
 * error. The answer for a given width is stable, so the second pass changes nothing.
 */
export function watchActionRow(row: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  fitActionRow(row);
  let frame = 0;
  const refit = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fitActionRow(row);
    });
  };
  const sizes = new ResizeObserver(refit);
  const observeAll = (): void => {
    sizes.disconnect();
    sizes.observe(row);
    for (const child of Array.from(row.children)) sizes.observe(child);
  };
  observeAll();
  // A child added or removed, or a label rewritten (a busy state, a stacked button whose width
  // is the row's whatever its text says).
  const content = new MutationObserver(() => {
    observeAll();
    refit();
  });
  content.observe(row, { childList: true, subtree: true, characterData: true });
  return () => {
    sizes.disconnect();
    content.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
  };
}

/**
 * The React door: a ref CALLBACK for the row element. A callback rather than a `RefObject`, so
 * a row that mounts late (or is swapped) is watched by construction.
 */
export function useActionRowFit<T extends HTMLElement>(): (el: T | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    stop.current?.();
    stop.current = el === null ? null : watchActionRow(el);
  }, []);
}
