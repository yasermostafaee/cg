// Public surface of @cg/ui.
//
// Design tokens + a small classnames helper. The global theme lives in
// `@cg/ui/theme.css` (imported once per app entry point).

export { chrome, spacing, radius, fontSize, fontStack, tokens } from './tokens.js';
export { TAG_MARKER, tagProps, tag, type TagRole } from './tag.js';
export { clearImageThumbnailCache, imageThumbnailUrl } from './image-thumbnail.js';
export {
  broadcastSafeAreas,
  broadcastGuideRectangles,
  broadcastGuideFrame,
  broadcastCustomGuideLines,
  BROADCAST_SAFE_AREA_TITLE,
  type BroadcastSafeArea,
  type BroadcastGuideRectangle,
  type BroadcastGuideFrame,
  type BroadcastCustomGuideLine,
} from './broadcast-safe-areas.js';
export {
  BROADCAST_GUIDE_ASPECTS,
  broadcastGuideFrameSettings,
  broadcastGuideEditingFrame,
  createBroadcastGuideFrame,
  MAX_BROADCAST_GUIDE_FRAMES,
  type BroadcastGuideFrameSetting,
  type BroadcastGuideBorder,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  DEFAULT_BROADCAST_GUIDE_COLOR,
  DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT,
  MAX_BROADCAST_GUIDE_LINES,
  MAX_BROADCAST_GUIDE_ASPECT_PART,
  parseBroadcastGuideProfile,
  normalizeBroadcastGuideColor,
  normalizeBroadcastGuideCustomAspect,
  broadcastGuideColor,
  createBroadcastGuideStore,
  type BroadcastGuideAspect,
  type BroadcastGuideCustomAspect,
  type BroadcastGuideLine,
  type BroadcastGuideProfile,
} from './broadcast-guide-preferences.js';

/**
 * Join truthy class names. Tiny `clsx` stand-in so feature code can compose
 * conditional classes without a dependency.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}
