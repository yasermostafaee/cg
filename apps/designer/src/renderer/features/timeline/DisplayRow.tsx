import type { Element } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { KeyframeIndicator } from './KeyframeIndicator.js';
import { type DisplayRow as DisplayRowSpec } from './keyframe-helpers.js';

interface Props {
  row: DisplayRowSpec;
  element: Element;
  part: 'label' | 'lane';
}

export const DISPLAY_ROW_HEIGHT = 20;
const ROW_HEIGHT = DISPLAY_ROW_HEIGHT;

const styles = {
  labelCell: {
    color: colors.textMuted,
    padding: '0 0.4rem 0 2rem',
    display: 'grid',
    gridTemplateColumns: '1fr 78px 16px',
    alignItems: 'center',
    gap: '0.4rem',
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    height: ROW_HEIGHT,
    fontSize: '0.7rem',
    boxSizing: 'border-box' as const,
  },
  labelName: {
    color: colors.textMuted,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  labelValue: {
    color: colors.text,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: '0.7rem',
    textAlign: 'right' as const,
  },
  laneCell: {
    position: 'relative' as const,
    borderBottom: `1px solid ${colors.border}`,
    height: ROW_HEIGHT,
    boxSizing: 'border-box' as const,
  },
} as const;

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
      <div style={styles.labelCell} data-display-row={row.id}>
        <span style={styles.labelName}>{row.label}</span>
        <span style={styles.labelValue}>{value}</span>
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
  return (
    <div style={styles.laneCell} data-display-row={row.id} />
  );
}
