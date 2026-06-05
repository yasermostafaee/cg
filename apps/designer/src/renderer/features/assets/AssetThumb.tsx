import type { AssetMeta } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { useAssetUrl } from './useAssets.js';

interface Props {
  asset: AssetMeta;
  /** Grid = stacked thumbnail card; list = compact single-line row. */
  layout?: 'grid' | 'list';
  onDragStart?: (asset: AssetMeta) => void;
  onContextMenu?: (asset: AssetMeta, clientX: number, clientY: number) => void;
}

const styles = {
  cell: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.7rem',
    color: colors.textMuted,
    textAlign: 'center' as const,
    cursor: 'grab',
    userSelect: 'none' as const,
  },
  // List variant: thumbnail and label on one line, full panel width.
  cellList: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.7rem',
    color: colors.textMuted,
    cursor: 'grab',
    userSelect: 'none' as const,
    padding: '0.15rem 0.3rem',
    borderRadius: '0.25rem',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: '0.3rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
    color: colors.textMuted,
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  thumbList: {
    width: 30,
    height: 30,
    flex: 'none' as const,
    borderRadius: '0.25rem',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
  caption: {
    width: 64,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    fontSize: '0.65rem',
  },
  captionList: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    fontSize: '0.72rem',
    textAlign: 'left' as const,
  },
} as const;

/**
 * D-011 — single asset cell in the project assets grid.
 *
 * For images: shows a thumbnail of the picture itself (via the bridge's
 * blob URL helper). For fonts: shows a stylised "Abc" glyph rendered
 * with the imported font face so the operator can preview it. Drag-and
 * -drop is wired here so the canvas drop target sees the assetId.
 */
export function AssetThumb({ asset, layout = 'grid', onDragStart, onContextMenu }: Props): JSX.Element {
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
      className={isList ? 'cg-asset-row' : undefined}
      style={isList ? styles.cellList : styles.cell}
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
      <div style={isList ? { ...styles.thumb, ...styles.thumbList } : styles.thumb}>
        {isImage && url !== null && <img src={url} alt={asset.filename} style={styles.thumbImg} />}
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
      <span style={isList ? styles.captionList : styles.caption}>{displayName}</span>
    </div>
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}
