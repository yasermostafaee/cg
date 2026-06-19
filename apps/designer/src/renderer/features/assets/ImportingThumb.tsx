import { cx } from '../../cx.js';
import * as ts from './AssetThumb.css.js';
import * as s from './ImportingThumb.css.js';

/**
 * D-067 — loading tile for an in-progress asset import. Reuses {@link AssetThumb}'s
 * cell/thumb frame so it sits in the grid/list exactly like a real thumbnail, with
 * a spinner + "Importing…" caption. Shared by both asset panels (Project Assets +
 * Shared Library).
 */
export function ImportingThumb({ layout = 'grid' }: { layout?: 'grid' | 'list' }): JSX.Element {
  const isList = layout === 'list';
  return (
    <div
      className={cx(isList ? ts.cellList : ts.cell)}
      data-role="importing-thumb"
      role="status"
      aria-label="Importing image"
      aria-busy="true"
    >
      <div className={cx(ts.thumb, isList && ts.thumbList)}>
        <span className={s.spinner} aria-hidden />
      </div>
      <span className={isList ? ts.captionList : ts.caption}>Importing…</span>
    </div>
  );
}
