import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';

/**
 * States per B-003 (+ D-054 `partial`):
 *   `empty`    — no keyframe at the current frame on this property
 *   `at-frame` — there IS a keyframe at the current frame
 *   `partial`  — D-054 multi-select AGGREGATE: SOME selected elements have a
 *                keyframe at the current frame and some do not (a distinct colour).
 *                Single-element indicators never use this (one element is binary).
 *
 * Selection state is shown on the lane diamond itself, not on the
 * property-row / label indicator.
 */
export type KeyframeIndicatorVariant = 'empty' | 'at-frame' | 'partial';

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
 * Small diamond glyph reused in two places: (a) the right Inspector,
 * next to each animatable property value and (b) the timeline's left
 * label column, next to each track row's name.
 *
 *   empty     ◇ outlined  → no keyframe at the current frame
 *   at-frame  ◆ yellow    → keyframe at the current frame
 */
export function KeyframeIndicator({
  variant,
  onClick,
  onDoubleClick,
  ariaLabel,
}: Props): JSX.Element {
  const style = { ...diamondBase, ...variantStyle(variant) };
  return (
    <Button
      variant="bare"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={ariaLabel}
      style={baseStyle}
      data-variant={variant}
    >
      <span style={style} />
    </Button>
  );
}

function variantStyle(variant: KeyframeIndicatorVariant): React.CSSProperties {
  switch (variant) {
    case 'empty':
      return { background: 'transparent', border: `1px solid ${colors.keyframeBorder}` };
    case 'at-frame':
      return { background: '#FDE047', border: `1px solid ${colors.keyframeBorder}` };
    case 'partial':
      // D-054 — "some but not all selected" reads as a faded fill, distinct from the
      // solid `at-frame` yellow and the hollow `empty`.
      return {
        background: 'rgba(253, 224, 71, 0.4)',
        border: `1px solid ${colors.keyframeBorder}`,
      };
  }
}
