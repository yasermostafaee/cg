import type { Resolution, VideoPlaceholderElement } from '@cg/shared-schema';

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

function aspectOf(element: VideoPlaceholderElement): number {
  if (element.expectedAspect !== undefined && element.expectedAspect > 0) {
    return element.expectedAspect;
  }
  const effectiveWidth = Math.abs(element.transform.size.w * element.transform.scale.x);
  const effectiveHeight = Math.abs(element.transform.size.h * element.transform.scale.y);
  return effectiveHeight > 0 ? effectiveWidth / effectiveHeight : 16 / 9;
}

/**
 * Produce an axis-aligned, centred arrangement with one common frame height.
 * A common height lets every horizontal and vertical inter-frame gap remain
 * exact even when the selected Live Sources declare different aspect ratios.
 * The outer margin is a minimum; the complete group is centred on both axes.
 */
export function calculateLiveSourceAutoLayout(
  elements: readonly VideoPlaceholderElement[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options: LiveSourceLayoutOptions = {},
): readonly LiveSourceLayoutItem[] {
  if (elements.length < 2 || resolution.width <= 0 || resolution.height <= 0) return [];

  const shortSide = Math.min(resolution.width, resolution.height);
  const margin = shortSide * 0.05;
  const horizontalGap = Math.max(0, options.horizontalGap ?? shortSide * 0.025);
  const verticalGap = Math.max(0, options.verticalGap ?? shortSide * 0.025);
  const rowCounts = liveSourceRowCounts(
    elements.length,
    bias,
    options.twoPlateLayout ?? 'horizontal',
  );
  const ordered = options.reverse === true ? [...elements].reverse() : elements;
  const aspects = ordered.map(aspectOf);

  const heightLimit =
    (resolution.height - margin * 2 - verticalGap * Math.max(0, rowCounts.length - 1)) /
    rowCounts.length;
  let commonHeight = heightLimit;
  let offset = 0;
  for (const rowCount of rowCounts) {
    const rowAspects = aspects.slice(offset, offset + rowCount);
    const aspectSum = rowAspects.reduce((sum, aspect) => sum + aspect, 0);
    const widthLimit =
      (resolution.width - margin * 2 - horizontalGap * Math.max(0, rowCount - 1)) / aspectSum;
    commonHeight = Math.min(commonHeight, widthLimit);
    offset += rowCount;
  }
  if (!Number.isFinite(commonHeight) || commonHeight <= 0) return [];

  const groupHeight = commonHeight * rowCounts.length + verticalGap * (rowCounts.length - 1);
  let y = (resolution.height - groupHeight) / 2;
  offset = 0;
  const result: LiveSourceLayoutItem[] = [];
  for (const rowCount of rowCounts) {
    const rowElements = ordered.slice(offset, offset + rowCount);
    const rowAspects = aspects.slice(offset, offset + rowCount);
    const rowWidth =
      rowAspects.reduce((sum, aspect) => sum + aspect * commonHeight, 0) +
      horizontalGap * Math.max(0, rowCount - 1);
    let x = (resolution.width - rowWidth) / 2;
    rowElements.forEach((element, index) => {
      const aspect = rowAspects[index] ?? 16 / 9;
      const width = aspect * commonHeight;
      result.push({ id: element.id, x, y, width, height: commonHeight });
      x += width + horizontalGap;
    });
    offset += rowCount;
    y += commonHeight + verticalGap;
  }
  return result;
}
