import type { Resolution } from './primitives.js';

export type LiveSourceLayoutBias = 'more-top' | 'more-bottom';
export type TwoPlateLayout = 'horizontal' | 'vertical';

export interface LiveSourceLayoutMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LiveSourceLayoutOptions {
  /** Scene-pixel gap between neighbours in one row. */
  horizontalGap?: number;
  /** Scene-pixel gap between rows. */
  verticalGap?: number;
  /** Insets from the output edges in scene pixels. */
  margins?: LiveSourceLayoutMargins;
  /** Size cells to the available area independently of their picture fit. */
  fill?: boolean;
  /** Two plates may sit side by side or one above the other. */
  twoPlateLayout?: TwoPlateLayout;
  /** An authored grid can keep its chosen membership in each row. */
  rowCounts?: readonly number[];
  /** Reverse seat order without changing layer/z order. */
  reverse?: boolean;
}

export interface LiveSourceLayoutItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiveSourceLayoutSource {
  readonly id: string;
  readonly aspect: number;
}

export function liveSourceLayoutMargins(
  resolution: Resolution,
  margins?: LiveSourceLayoutMargins,
  defaultPercent = 0.05,
): LiveSourceLayoutMargins {
  const inset = Math.min(resolution.width, resolution.height) * defaultPercent;
  return margins ?? { top: inset, right: inset, bottom: inset, left: inset };
}

export function liveSourceLayoutBounds(
  resolution: Resolution,
  margins: LiveSourceLayoutMargins,
): Omit<LiveSourceLayoutItem, 'id'> | undefined {
  const { top, right, bottom, left } = margins;
  const width = resolution.width - left - right;
  const height = resolution.height - top - bottom;
  if (
    !Object.values(margins).every((value) => Number.isFinite(value) && value >= 0) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return undefined;
  return { x: left, y: top, width, height };
}

/**
 * Divide a selection into near-square rows. Odd remainders deliberately stay
 * at one edge so three plates can be authored as either 2+1 or 1+2.
 */
export function liveSourceRowCounts(
  count: number,
  bias: LiveSourceLayoutBias,
  twoPlateLayout: TwoPlateLayout = 'horizontal',
): readonly number[] {
  if (count < 1) return [];
  if (count === 2 && twoPlateLayout === 'vertical') return [1, 1];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  const counts = Array.from({ length: rows }, (_, index) => (index < extra ? base + 1 : base));
  return bias === 'more-bottom' ? counts.reverse() : counts;
}

function rowCountsFor(count: number, rows: number, bias: LiveSourceLayoutBias): number[] {
  const base = Math.floor(count / rows);
  const extra = count % rows;
  const counts = Array.from({ length: rows }, (_, index) => (index < extra ? base + 1 : base));
  return bias === 'more-bottom' ? counts.reverse() : counts;
}

function commonHeightForRows(
  aspects: readonly number[],
  rowCounts: readonly number[],
  resolution: Resolution,
  horizontalGap: number,
  verticalGap: number,
): number {
  const heightLimit =
    (resolution.height - verticalGap * Math.max(0, rowCounts.length - 1)) / rowCounts.length;
  let commonHeight = heightLimit;
  let offset = 0;
  for (const rowCount of rowCounts) {
    const aspectSum = aspects
      .slice(offset, offset + rowCount)
      .reduce((sum, aspect) => sum + aspect, 0);
    const widthLimit = (resolution.width - horizontalGap * Math.max(0, rowCount - 1)) / aspectSum;
    commonHeight = Math.min(commonHeight, widthLimit);
    offset += rowCount;
  }
  return commonHeight;
}

/**
 * Pick the row count that gives every selected plate the largest common height.
 * This makes the decision aspect-aware: three 16:9 plates naturally remain 2+1,
 * while three portrait plates can use the 16:9 canvas much better as one row.
 */
function bestRowCounts(
  aspects: readonly number[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  horizontalGap: number,
  verticalGap: number,
): readonly number[] {
  const count = aspects.length;
  const balanced = liveSourceRowCounts(count, bias);
  let best = [...balanced];
  let bestHeight = commonHeightForRows(aspects, best, resolution, horizontalGap, verticalGap);
  for (let rows = 1; rows <= count; rows += 1) {
    const candidate = rowCountsFor(count, rows, bias);
    const height = commonHeightForRows(aspects, candidate, resolution, horizontalGap, verticalGap);
    if (height > bestHeight + 0.01) {
      best = candidate;
      bestHeight = height;
    }
  }
  return best;
}

/** The effective rows for the current plates and controls; shared with the Inspector UI. */
export function liveSourceAutoLayoutRowCounts(
  sources: readonly LiveSourceLayoutSource[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options: LiveSourceLayoutOptions = {},
): readonly number[] {
  if (
    sources.length < 1 ||
    !Number.isFinite(resolution.width) ||
    !Number.isFinite(resolution.height) ||
    resolution.width <= 0 ||
    resolution.height <= 0 ||
    sources.some(({ aspect }) => !Number.isFinite(aspect) || aspect <= 0)
  ) {
    return [];
  }
  if (options.rowCounts !== undefined) {
    const { rowCounts } = options;
    return rowCounts.every((count) => Number.isSafeInteger(count) && count > 0) &&
      rowCounts.reduce((sum, count) => sum + count, 0) === sources.length
      ? rowCounts
      : [];
  }
  if (sources.length <= 2 || options.fill === true) {
    return liveSourceRowCounts(sources.length, bias, options.twoPlateLayout ?? 'horizontal');
  }
  const shortSide = Math.min(resolution.width, resolution.height);
  const margins = liveSourceLayoutMargins(
    resolution,
    options.margins,
    sources.length === 1 ? 0 : 0.05,
  );
  const bounds = liveSourceLayoutBounds(resolution, margins);
  if (bounds === undefined) return [];
  const horizontalGap = Math.max(0, options.horizontalGap ?? shortSide * 0.025);
  const verticalGap = Math.max(0, options.verticalGap ?? shortSide * 0.025);
  const ordered = options.reverse === true ? [...sources].reverse() : sources;
  return bestRowCounts(
    ordered.map(({ aspect }) => aspect),
    bounds,
    bias,
    horizontalGap,
    verticalGap,
  );
}

/**
 * Produce an axis-aligned, centred arrangement with one common frame height.
 * A common height lets every horizontal and vertical inter-frame gap remain
 * exact even when the selected Live Sources declare different aspect ratios.
 * With aspect preservation the group is centred inside the available area.
 * Fill uses the same row membership and gaps, with cells spanning the area.
 */
export function calculateLiveSourceAutoLayout(
  sources: readonly LiveSourceLayoutSource[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options: LiveSourceLayoutOptions = {},
): readonly LiveSourceLayoutItem[] {
  const rowCounts = liveSourceAutoLayoutRowCounts(sources, resolution, bias, options);
  if (rowCounts.length === 0) return [];

  const shortSide = Math.min(resolution.width, resolution.height);
  const margins = liveSourceLayoutMargins(
    resolution,
    options.margins,
    sources.length === 1 ? 0 : 0.05,
  );
  const bounds = liveSourceLayoutBounds(resolution, margins);
  if (bounds === undefined) return [];
  const horizontalGap = Math.max(0, options.horizontalGap ?? shortSide * 0.025);
  const verticalGap = Math.max(0, options.verticalGap ?? shortSide * 0.025);
  const ordered = options.reverse === true ? [...sources].reverse() : sources;
  const aspects = ordered.map(({ aspect }) => aspect);
  const fill = options.fill === true;
  const commonHeight = fill
    ? (bounds.height - verticalGap * (rowCounts.length - 1)) / rowCounts.length
    : commonHeightForRows(aspects, rowCounts, bounds, horizontalGap, verticalGap);
  if (!Number.isFinite(commonHeight) || commonHeight <= 0) return [];

  const groupHeight = commonHeight * rowCounts.length + verticalGap * (rowCounts.length - 1);
  let y = bounds.y + (bounds.height - groupHeight) / 2;
  let offset = 0;
  const result: LiveSourceLayoutItem[] = [];
  for (const rowCount of rowCounts) {
    const rowSources = ordered.slice(offset, offset + rowCount);
    const rowAspects = aspects.slice(offset, offset + rowCount);
    const rowWidth = fill
      ? bounds.width
      : rowAspects.reduce((sum, aspect) => sum + aspect * commonHeight, 0) +
        horizontalGap * Math.max(0, rowCount - 1);
    const filledWidth = (rowWidth - horizontalGap * (rowCount - 1)) / rowCount;
    if (!Number.isFinite(filledWidth) || filledWidth <= 0) return [];
    let x = bounds.x + (bounds.width - rowWidth) / 2;
    rowSources.forEach(({ id, aspect }) => {
      const width = fill ? filledWidth : aspect * commonHeight;
      result.push({ id, x, y, width, height: commonHeight });
      x += width + horizontalGap;
    });
    offset += rowCount;
    y += commonHeight + verticalGap;
  }
  return result;
}
