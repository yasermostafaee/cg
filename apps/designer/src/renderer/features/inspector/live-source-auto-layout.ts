import {
  calculateLiveSourceAutoLayout as calculateLayout,
  liveSourceAutoLayoutRowCounts as layoutRowCounts,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutItem,
  type LiveSourceLayoutOptions,
  type LiveSourceLayoutSource,
  type Resolution,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';

export {
  liveSourceRowCounts,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutItem,
  type LiveSourceLayoutOptions,
  type TwoPlateLayout,
} from '@cg/shared-schema';

function layoutSource(element: VideoPlaceholderElement): LiveSourceLayoutSource {
  const { id, expectedAspect, transform } = element;
  if (expectedAspect !== undefined && expectedAspect > 0) return { id, aspect: expectedAspect };

  const width = Math.abs(transform.size.w * transform.scale.x);
  const height = Math.abs(transform.size.h * transform.scale.y);
  return { id, aspect: height > 0 ? width / height : 16 / 9 };
}

export function liveSourceAutoLayoutRowCounts(
  elements: readonly VideoPlaceholderElement[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options?: LiveSourceLayoutOptions,
): readonly number[] {
  return layoutRowCounts(elements.map(layoutSource), resolution, bias, options);
}

export function calculateLiveSourceAutoLayout(
  elements: readonly VideoPlaceholderElement[],
  resolution: Resolution,
  bias: LiveSourceLayoutBias,
  options?: LiveSourceLayoutOptions,
): readonly LiveSourceLayoutItem[] {
  return calculateLayout(elements.map(layoutSource), resolution, bias, options);
}
