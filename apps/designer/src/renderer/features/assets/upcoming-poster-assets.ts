import type { AssetMeta } from '@cg/shared-ipc';
import type { Element, Layer, Scene } from '@cg/shared-schema';
import { collectImageElements } from '@cg/single-file-export';

/** Assets kept for playback but omitted from project browsing and image choices. */
export function hiddenUpcomingPosterAssetIds(
  assets: readonly AssetMeta[],
  scene: Scene | null | undefined,
): ReadonlySet<string> {
  const hidden = new Set<string>();
  const legacy = new Set<string>();
  for (const asset of assets) {
    if (asset.kind !== 'image') continue;
    if (asset.upcomingPosterFor !== undefined) hidden.add(asset.assetId);
    else if (asset.filename.toLowerCase().endsWith(' — poster.png')) legacy.add(asset.assetId);
  }
  if (scene == null || (hidden.size === 0 && legacy.size === 0)) return hidden;

  const posterIds = new Set<string>();
  const independentImages = new Set<string>();
  function stripUpcomingRows(element: Element): Element {
    if (element.type === 'upcomingPrograms') {
      for (const item of element.sampleItems ?? []) {
        if (item.posterAssetId !== undefined) posterIds.add(item.posterAssetId);
        if (item.mediaKind === 'image' && item.mediaAssetId !== undefined) {
          independentImages.add(item.mediaAssetId);
        }
      }
      return { ...element, sampleItems: [] };
    }
    return element.type === 'container'
      ? { ...element, children: element.children.map(stripUpcomingRows) }
      : element;
  }
  function stripLayerRows(layer: Layer): Layer {
    return { ...layer, children: layer.children.map(stripUpcomingRows) };
  }

  // Reuse the image reference collector without counting a Prepared row's own
  // poster as independent use. Rehearsal and Prepared picture choices are handled above.
  const sceneWithoutUpcomingRows: Scene = {
    ...scene,
    layers: scene.layers.map(stripLayerRows),
    compositions: scene.compositions?.map((composition) => ({
      ...composition,
      layers: composition.layers.map(stripLayerRows),
    })),
  };
  for (const { assetId } of collectImageElements(sceneWithoutUpcomingRows)) {
    independentImages.add(assetId);
  }
  for (const assetId of independentImages) hidden.delete(assetId);
  for (const assetId of legacy) {
    if (posterIds.has(assetId) && !independentImages.has(assetId)) hidden.add(assetId);
  }
  return hidden;
}
