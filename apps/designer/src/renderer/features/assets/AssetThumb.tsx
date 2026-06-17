import type { AssetMeta } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { cx } from '../../cx.js';
import * as s from './AssetThumb.css.js';
import { useAssetUrl } from './useAssets.js';

interface Props {
  asset: AssetMeta;
  /** Grid = stacked thumbnail card; list = compact single-line row. */
  layout?: 'grid' | 'list';
  onDragStart?: (asset: AssetMeta) => void;
  onContextMenu?: (asset: AssetMeta, clientX: number, clientY: number) => void;
}

/**
 * D-011 — single asset cell in the project assets grid.
 *
 * For images: shows a thumbnail of the picture itself (via the bridge's
 * blob URL helper). For fonts: shows a stylised "Abc" glyph rendered
 * with the imported font face so the operator can preview it. Drag-and
 * -drop is wired here so the canvas drop target sees the assetId.
 */
export function AssetThumb({
  asset,
  layout = 'grid',
  onDragStart,
  onContextMenu,
}: Props): JSX.Element {
  const url = useAssetUrl(asset.assetId);
  const displayName = stripExt(asset.filename);
  const isImage = asset.kind === 'image';
  const isFont = asset.kind === 'font';
  const isList = layout === 'list';
  // For fonts we register a CSS font-family scoped by assetId so the
  // sample text in the thumbnail uses the actual face.
  const fontFamily = isFont ? `asset-${asset.assetId}` : undefined;

  return (
    <div
      className={cx(isList ? s.cellList : s.cell, isList && 'cg-asset-row')}
      draggable={isImage}
      onDragStart={
        isImage
          ? (e) => {
              e.dataTransfer.setData('application/x-cg-asset-id', asset.assetId);
              e.dataTransfer.effectAllowed = 'copy';
              onDragStart?.(asset);
            }
          : undefined
      }
      title={asset.filename}
      onContextMenu={
        onContextMenu === undefined
          ? undefined
          : (e) => {
              e.preventDefault();
              onContextMenu(asset, e.clientX, e.clientY);
            }
      }
    >
      <div className={cx(s.thumb, isList && s.thumbList)}>
        {isImage && url !== null && (
          // draggable={false}: the <img> is natively draggable, which would start a
          // browser image-drag (no x-cg-asset-id payload → the canvas drop inserts
          // nothing, ghost = image only). Disabling it makes the cell <div> the SOLE
          // drag source, so grabbing the thumbnail (like the name) starts the cell
          // drag → the payload is set and the default ghost is the whole cell.
          <img src={url} alt={asset.filename} className={s.thumbImg} draggable={false} />
        )}
        {isFont && (
          <span
            style={{
              fontFamily: fontFamily !== undefined ? `"${fontFamily}", sans-serif` : 'sans-serif',
              fontSize: isList ? '0.85rem' : '1.3rem',
              color: colors.text,
            }}
          >
            Abc
          </span>
        )}
        {!isImage && !isFont && asset.kind.toUpperCase().slice(0, 3)}
      </div>
      <span className={isList ? s.captionList : s.caption}>{displayName}</span>
      {isList && (
        <>
          <span className={s.metaType}>{fileExt(asset.filename) || asset.kind}</span>
          <span className={s.metaSize}>{formatBytes(asset.byteSize)}</span>
        </>
      )}
    </div>
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

function fileExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** Human-readable byte size, e.g. 2.1 KB / 80.2 KB / 1.4 MB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit] ?? 'KB'}`;
}
