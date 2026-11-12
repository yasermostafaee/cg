import type { Resolution } from './primitives.js';

export type LiveSourceLayoutBias = 'more-top' | 'more-bottom';
export type TwoPlateLayout = 'horizontal' | 'vertical';

export interface LiveSourceLayoutOptions {
  /** Scene-pixel gap between neighbours in one row. */
  horizontalGap?: number;
  /** Scene-pixel gap between rows. */
  verticalGap?: number;
  /** Two plates may sit side by side or one above the other. */
  twoPlateLayout?: TwoPlateLayout;
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
  margin: number,
  horizontalGap: number,
  verticalGap: number,
): number {
  const heightLimit =
    (resolution.height - margin * 2 - verticalGap * Math.max(0, rowCounts.length - 1)) /
    rowCounts.length;
  let commonHeight = heightLimit;
  let offset = 0;
  for (const rowCount of rowCounts) {
    const aspectSum = aspects
      .slice(offset, offset + rowCount)
      .reduce((sum, aspect) => sum + aspect, 0);
    const widthLimit =
      (resolution.width - margin * 2 - horizontalGap * Math.max(0, rowCount - 1)) / aspectSum;
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
  margin: number,
  horizontalGap: number,
  verticalGap: number,
): readonly number[] {
  const count = aspects.length;
  const balanced = liveSourceRowCounts(count, bias);
  let best = [...balanced];
  let bestHeight = commonHeightForRows(
    aspects,
    best,
    resolution,
    margin,
    horizontalGap,
    verticalGap,
  );
  for (let rows = 1; rows <= count; rows += 1) {
    const candidate = rowCountsFor(count, rows, bias);
    const height = commonHeightForRows(
      aspects,
      candidate,
      resolution,
      margin,
      horizontalGap,
      verticalGap,
    );
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
  if (sources.length === 2) {
    return liveSourceRowCounts(sources.length, bias, options.twoPlateLayout ?? 'horizontal');
  }
  const shortSide = Math.min(resolution.width, resolution.height);
  const margin = shortSide * 0.05;
  const horizontalGap = Math.max(0, options.horizontalGap ?? shortSide * 0.025);
  const verticalGap = Math.max(0, options.verticalGap ?? shortSide * 0.025);
  const ordered = options.reverse === true ? [...sources].reverse() : sources;
  return bestRowCounts(
    ordered.map(({ aspect }) => aspect),
    resolution,
    bias,
    margin,
    horizontalGap,
    verticalGap,
  );
}

/**
 * Produce an axis-aligned, centred arrangement with one common frame height.
 * A common height lets every horizontal and vertical inter-frame gap remain
 * exact even when the selected Live Sources declare different aspect ratios.
 * The outer margin is a minimum; the complete group is centred on both axes.
 */
export function calculateLiveSourceAutoLayout(
  sources: readonly LiveSourceLayoutSource[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options: LiveSourceLayoutOptions = {},
): readonly LiveSourceLayoutItem[] {
  if (sources.length < 2) return [];
  const rowCounts = liveSourceAutoLayoutRowCounts(sources, resolution, bias, options);
  if (rowCounts.length === 0) return [];

  const shortSide = Math.min(resolution.width, resolution.height);
  const margin = shortSide * 0.05;
  const horizontalGap = Math.max(0, options.horizontalGap ?? shortSide * 0.025);
  const verticalGap = Math.max(0, options.verticalGap ?? shortSide * 0.025);
  const ordered = options.reverse === true ? [...sources].reverse() : sources;
  const aspects = ordered.map(({ aspect }) => aspect);
  const commonHeight = commonHeightForRows(
    aspects,
    rowCounts,
    resolution,
    margin,
    horizontalGap,
    verticalGap,
  );
  if (!Number.isFinite(commonHeight) || commonHeight <= 0) return [];

  const groupHeight = commonHeight * rowCounts.length + verticalGap * (rowCounts.length - 1);
  let y = (resolution.height - groupHeight) / 2;
  let offset = 0;
  const result: LiveSourceLayoutItem[] = [];
  for (const rowCount of rowCounts) {
    const rowSources = ordered.slice(offset, offset + rowCount);
    const rowAspects = aspects.slice(offset, offset + rowCount);
    const rowWidth =
      rowAspects.reduce((sum, aspect) => sum + aspect * commonHeight, 0) +
      horizontalGap * Math.max(0, rowCount - 1);
    let x = (resolution.width - rowWidth) / 2;
    rowSources.forEach(({ id, aspect }) => {
      const width = aspect * commonHeight;
      result.push({ id, x, y, width, height: commonHeight });
      x += width + horizontalGap;
    });
    offset += rowCount;
    y += commonHeight + verticalGap;
  }
  return result;
}
