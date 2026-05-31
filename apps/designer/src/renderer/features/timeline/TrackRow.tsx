import { useRef } from 'react';
import type { Element, Keyframe } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { trackOf, type TimelineRow } from './keyframe-helpers.js';

interface Props {
  row: TimelineRow;
  element: Element;
  frameIn: number;
  frameOut: number;
  currentFrame: number;
  selectedKey: { property: string; frame: number } | null;
  onSelectKey: (key: { property: string; frame: number } | null) => void;
}

const ROW_HEIGHT = 22;
const LABEL_COL_PX = 130;

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: `${String(LABEL_COL_PX)}px 1fr`,
    alignItems: 'stretch',
    borderBottom: `1px solid ${colors.border}`,
    height: ROW_HEIGHT,
    fontSize: '0.78rem',
  },
  label: {
    color: colors.textMuted,
    paddingLeft: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    borderRight: `1px solid ${colors.border}`,
    background: colors.panel,
  },
  addButton: {
    background: 'transparent',
    color: colors.accent,
    border: `1px solid ${colors.border}`,
    borderRadius: '50%',
    width: 14,
    height: 14,
    lineHeight: '12px',
    fontSize: '0.72rem',
    padding: 0,
    cursor: 'pointer',
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
  },
  keyDiamond: {
    position: 'absolute' as const,
    top: '50%',
    width: 10,
    height: 10,
    transform: 'translate(-50%, -50%) rotate(45deg)',
    background: colors.accent,
    border: `1px solid ${colors.accentMuted}`,
    cursor: 'grab',
  },
  keyDiamondSelected: {
    background: '#FDE047',
    border: '1px solid #CA8A04',
    boxShadow: '0 0 0 1px #CA8A04',
  },
} as const;

/**
 * One animatable-property track row: a label + add-keyframe button on the
 * left and a lane on the right with one diamond per keyframe. Diamonds are
 * draggable to move keyframes and selectable for delete.
 */
export function TrackRow(props: Props): JSX.Element {
  const { row, element, frameIn, frameOut, currentFrame, selectedKey, onSelectKey } = props;
  const laneRef = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const track = trackOf(element, row.property);
  const keyframes: readonly Keyframe[] = track?.keyframes ?? [];

  function addKeyframe(): void {
    const value = row.read(element);
    designerStore.upsertKeyframe(element.id, row.property, currentFrame, value);
  }

  function frameAt(clientX: number): number {
    const el = laneRef.current;
    if (el === null) return currentFrame;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(frameIn + ratio * span);
  }

  return (
    <div style={styles.row} data-track-property={row.property}>
      <div style={styles.label}>
        <button
          type="button"
          style={styles.addButton}
          onClick={addKeyframe}
          aria-label={`Add keyframe for ${row.label} at frame ${String(currentFrame)}`}
          title={`Add keyframe at frame ${String(currentFrame)}`}
        >
          ◆
        </button>
        <span>{row.label}</span>
      </div>
      <div ref={laneRef} style={styles.lane}>
        <div style={styles.laneLine} />
        {keyframes.map((k) => {
          const pct = ((k.frame - frameIn) / span) * 100;
          const isSelected =
            selectedKey !== null &&
            selectedKey.property === row.property &&
            selectedKey.frame === k.frame;
          const style = {
            ...styles.keyDiamond,
            ...(isSelected ? styles.keyDiamondSelected : {}),
            left: `${pct.toFixed(3)}%`,
          };
          return (
            <div
              key={`${row.property}-${String(k.frame)}`}
              style={style}
              role="button"
              tabIndex={0}
              aria-label={`Keyframe at frame ${String(k.frame)}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectKey({ property: row.property, frame: k.frame });
                const targetEl = e.currentTarget;
                targetEl.setPointerCapture(e.pointerId);
                let lastFrame = k.frame;
                let from = k.frame;
                const onMove = (mv: PointerEvent): void => {
                  const nf = frameAt(mv.clientX);
                  if (nf === lastFrame) return;
                  designerStore.moveKeyframe(element.id, row.property, from, nf);
                  from = nf;
                  lastFrame = nf;
                  onSelectKey({ property: row.property, frame: nf });
                };
                const onUp = (): void => {
                  targetEl.removeEventListener('pointermove', onMove);
                  targetEl.removeEventListener('pointerup', onUp);
                };
                targetEl.addEventListener('pointermove', onMove);
                targetEl.addEventListener('pointerup', onUp);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
