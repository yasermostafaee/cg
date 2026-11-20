import type { AssetEntry, Scene } from '@cg/shared-schema';
import { renderVcgThumbnail as renderStill } from '@cg/template-runtime/static-scene';
import { attachRobustVideoPoster } from '../shared/video-poster.js';

export { vcgThumbnailFrame } from '@cg/template-runtime/static-scene';

const FALLBACK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0AQMAAADfKmdSAAAABlBMVEUWICyFn7n4VyNdAAAATUlEQVR4nO3WoRGAQAxFwXRAA8zQxvVfERL3GUo4lQN2RdRTiUkVAAAfcCTJ1RLuzxjCX4RbcjaF9YL1NIYus2roMkLhVNj4zgAAsLwbatNKaBRCkdkAAAAASUVORK5CYII=';

/** A canvas-less Designer export still carries the standard PNG placeholder. */
export async function renderVcgThumbnail(
  scene: Scene,
  assetIndex: readonly AssetEntry[],
  assets: ReadonlyMap<string, Uint8Array>,
  css: string,
): Promise<Uint8Array> {
  return (
    (await renderStill(scene, assetIndex, assets, css, attachRobustVideoPoster)) ??
    Uint8Array.from(atob(FALLBACK_PNG), (byte) => byte.charCodeAt(0))
  );
}
