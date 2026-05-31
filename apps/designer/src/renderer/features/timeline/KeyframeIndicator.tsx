import { colors } from '../../theme.js';

export type KeyframeIndicatorVariant = 'empty' | 'has-track' | 'at-frame' | 'selected';

interface Props {
  variant: KeyframeIndicatorVariant;
  /** Click handler. Caller decides whether to add, toggle, or no-op. */
  onClick: () => void;
  /** Optional double-click handler — used by the timeline label column. */
  onDoubleClick?: () => void;
  /** Accessible label for screen readers. */
  ariaLabel: string;
}

const SIZE = 9;

const baseStyle = {
  width: SIZE,
  height: SIZE,
  display: 'inline-block',
  padding: 0,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  lineHeight: 0,
  verticalAlign: 'middle',
} as const;

const diamondBase = {
  width: SIZE,
  height: SIZE,
  transform: 'rotate(45deg)',
  display: 'inline-block',
} as const;

/**
 * Small diamond glyph reused in two places (a) the right Inspector,
 * next to each animatable property value and (b) the timeline's left
 * label column, next to each track row's name.
 *
 *   empty       □  outlined gray  →  no track yet
 *   has-track   ◆  dim accent      →  track exists, no keyframe here
 *   at-frame    ◆  bright accent  →  keyframe at the current frame
 *   selected    ◆  bright YELLOW   →  the selected keyframe lives here
 *
 * Both the Inspector indicator and the matching TrackRow indicator for
 * the selected point are rendered in `selected` style at the same time,
 * which is what makes "click a point in the timeline" light the row
 * label AND the right panel together.
 */
export function KeyframeIndicator({
  variant,
  onClick,
  onDoubleClick,
  ariaLabel,
}: Props): JSX.Element {
  const style = { ...diamondBase, ...variantStyle(variant) };
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={ariaLabel}
      style={baseStyle}
      data-variant={variant}
    >
      <span style={style} />
    </button>
  );
}

function variantStyle(variant: KeyframeIndicatorVariant): React.CSSProperties {
  switch (variant) {
    case 'empty':
      return { background: 'transparent', border: `1px solid ${colors.border}` };
    case 'has-track':
      return {
        background: 'transparent',
        border: `1.5px solid ${colors.accentMuted}`,
      };
    case 'at-frame':
      return { background: colors.accent, border: `1px solid ${colors.accentMuted}` };
    case 'selected':
      return {
        background: '#FDE047',
        border: '1px solid #CA8A04',
        boxShadow: '0 0 0 1px #CA8A04',
      };
  }
}
