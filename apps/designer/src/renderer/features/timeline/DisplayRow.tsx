import type { Element } from '@cg/shared-schema';
import { KeyframeIndicator } from './KeyframeIndicator.js';
import { type DisplayRow as DisplayRowSpec } from './keyframe-helpers.js';
import * as s from './DisplayRow.css.js';

export { DISPLAY_ROW_HEIGHT } from './metrics.js';

interface Props {
  row: DisplayRowSpec;
  element: Element;
  part: 'label' | 'lane';
}

/**
 * D-010 — non-animatable display row in the timeline label column.
 * Renders the property name + current value + an empty indicator and
 * a blank lane (no keyframe diamonds since these properties aren't in
 * the keyframe schema yet).
 */
export function DisplayRow({ row, element, part }: Props): JSX.Element {
  if (part === 'label') {
    const value = row.read(element);
    return (
      <div className={`cg-tl-row ${s.labelCell}`} data-display-row={row.id}>
        <span className={s.labelName}>{row.label}</span>
        <span className={s.labelValue}>{value}</span>
        <KeyframeIndicator
          variant="empty"
          onClick={() => {
            /* not animatable yet — D-010 is visual parity only */
          }}
          ariaLabel={`${row.label} — animation not yet supported`}
        />
      </div>
    );
  }
  return <div className={s.laneCell} data-display-row={row.id} />;
}
