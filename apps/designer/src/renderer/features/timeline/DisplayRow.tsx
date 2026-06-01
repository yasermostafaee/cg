import type { Element } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { KeyframeIndicator } from './KeyframeIndicator.js';
import { LABEL_COL_PX, type DisplayRow as DisplayRowSpec } from './keyframe-helpers.js';

interface Props {
  row: DisplayRowSpec;
  element: Element;
}

const ROW_HEIGHT = 20;

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: `${String(LABEL_COL_PX)}px 1fr`,
    alignItems: 'stretch',
    borderBottom: `1px solid ${colors.border}`,
    height: ROW_HEIGHT,
    fontSize: '0.7rem',
  },
  label: {
    color: colors.textMuted,
    padding: '0 0.4rem 0 2rem',
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    alignItems: 'center',
    gap: '0.35rem',
    borderRight: `1px solid ${colors.border}`,
    background: colors.panel,
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
  },
  lane: {
    position: 'relative' as const,
    background: colors.panelMuted,
  },
  laneLine: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: '50%',
    height: 0,
    borderTop: `1px dashed ${colors.border}`,
    pointerEvents: 'none' as const,
  },
} as const;

/**
 * D-010 — non-animatable display row in the timeline label column.
 * Renders the property name + current value + an empty indicator and
 * a blank lane (no keyframe diamonds since these properties aren't in
 * the keyframe schema yet). Same shape as TrackRow but inert.
 */
export function DisplayRow({ row, element }: Props): JSX.Element {
  const value = row.read(element);
  return (
    <div style={styles.row} data-display-row={row.id}>
      <div style={styles.label}>
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
      <div style={styles.lane}>
        <div style={styles.laneLine} />
      </div>
    </div>
  );
}
