import type { InputTransitionDirection } from '@cg/shared-schema';

/** The entering silhouette successively covers these edges of the stationary outgoing frame. */
export function focusSlideOcclusion(direction: InputTransitionDirection): string {
  return {
    left: 'inset(0 0 0 100%)',
    right: 'inset(0 100% 0 0)',
    up: 'inset(100% 0 0 0)',
    down: 'inset(0 0 100% 0)',
  }[direction];
}
