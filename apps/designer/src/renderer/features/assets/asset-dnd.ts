import type { AssetMeta } from '@cg/shared-ipc';

export const ASSET_DND_ID = 'application/x-cg-asset-id';
export const ASSET_DND_KIND = 'application/x-cg-asset-kind';
export const ASSET_DND_SOURCE = 'application/x-cg-asset-source';

export type AssetDragSource = 'project' | 'shared';

/** One payload writer for Project Assets and Shared Library tiles. */
export function writeAssetDrag(
  transfer: DataTransfer,
  asset: Pick<AssetMeta, 'assetId' | 'kind'>,
  source: AssetDragSource,
): void {
  transfer.setData(ASSET_DND_ID, asset.assetId);
  transfer.setData(ASSET_DND_KIND, asset.kind);
  transfer.setData(ASSET_DND_SOURCE, source);
  transfer.effectAllowed = 'copy';
}

/** Old project-asset drags omitted the source key; absence remains project for compatibility. */
export function assetDragSource(transfer: DataTransfer): AssetDragSource {
  return transfer.getData(ASSET_DND_SOURCE) === 'shared' ? 'shared' : 'project';
}
