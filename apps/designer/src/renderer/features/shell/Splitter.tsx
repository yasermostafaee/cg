import { colors } from '../../theme.js';

interface Props {
  axis: 'x' | 'y';
  onResize: (delta: number) => void;
  /** Optional aria label. Defaults to a generic separator label. */
  ariaLabel?: string;
}

const THICKNESS = 4;

const baseStyle = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  flex: '0 0 auto',
} as const;

const xStyle = {
  ...baseStyle,
  width: THICKNESS,
  alignSelf: 'stretch' as const,
  cursor: 'col-resize',
  background: `linear-gradient(90deg, transparent 0, transparent ${String(
    THICKNESS / 2 - 0.5,
  )}px, ${colors.border} ${String(THICKNESS / 2 - 0.5)}px, ${colors.border} ${String(
    THICKNESS / 2 + 0.5,
  )}px, transparent ${String(THICKNESS / 2 + 0.5)}px)`,
} as const;

const yStyle = {
  ...baseStyle,
  height: THICKNESS,
  alignSelf: 'stretch' as const,
  cursor: 'row-resize',
  background: `linear-gradient(180deg, transparent 0, transparent ${String(
    THICKNESS / 2 - 0.5,
  )}px, ${colors.border} ${String(THICKNESS / 2 - 0.5)}px, ${colors.border} ${String(
    THICKNESS / 2 + 0.5,
  )}px, transparent ${String(THICKNESS / 2 + 0.5)}px)`,
} as const;

/**
 * Thin draggable bar that turns its own pointer drag into an `onResize`
 * callback in pixels along its axis. Used between Library/center,
 * center/Inspector, and shell/Timeline.
 *
 *   axis="x"  →  vertical bar, drag left/right, delta = +right / -left
 *   axis="y"  →  horizontal bar, drag up/down,  delta = +down  / -up
 */
export function Splitter({ axis, onResize, ariaLabel }: Props): JSX.Element {
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    let last = start;
    const onMove = (ev: PointerEvent): void => {
      const cur = axis === 'x' ? ev.clientX : ev.clientY;
      const delta = cur - last;
      if (delta === 0) return;
      onResize(delta);
      last = cur;
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel ?? 'Resize'}
      style={axis === 'x' ? xStyle : yStyle}
      onPointerDown={onPointerDown}
    />
  );
}
