import { useRef } from 'react';
import type { AnimatableProperty, Element, Keyframe } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { KeyframeIndicator } from './KeyframeIndicator.js';
import {
  LABEL_COL_PX,
  hasKeyframeAt,
  keyframeVariantFor,
  trackOf,
  type TimelineRow,
} from './keyframe-helpers.js';

interface Props {
  row: TimelineRow;
  element: Element;
  frameIn: number;
  frameOut: number;
  currentFrame: number;
  /** The full selectedKeyframe pointer from the store (may be on a different row). */
  selectedKeyframe: {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  } | null;
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
  keyDiamond: {
    position: 'absolute' as const,
    top: '50%',
    width: 9,
    height: 9,
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
 * One animatable-property track row. Layout mirrors the Loopic reference:
 *
 *   [ label ][ current value ][ ◆ indicator ] │ lane with keyframe diamonds
 *
 * The label-column indicator shares its visual state with the matching
 * indicator in the right Inspector — single-clicking a keyframe on the
 * lane lights both yellow. Click semantics on a lane diamond:
 *   - single-click → select the point + scrub the playhead to it
 *   - double-click → also open the Keyframe Inspector on the right
 *   - drag         → move the keyframe along the track
 *   - Delete/Backspace (with the diamond selected) → remove it
 */
export function TrackRow(props: Props): JSX.Element {
  const { row, element, frameIn, frameOut, currentFrame, selectedKeyframe } = props;
  const laneRef = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const track = trackOf(element, row.property);
  const keyframes: readonly Keyframe[] = track?.keyframes ?? [];
  const currentValue = formatValue(row.read(element));

  function toggleKeyframeHere(): void {
    if (hasKeyframeAt(element, row.property, currentFrame)) {
      designerStore.removeKeyframe(element.id, row.property, currentFrame);
      return;
    }
    designerStore.upsertKeyframe(element.id, row.property, currentFrame, row.read(element));
    designerStore.setSelectedKeyframe({
      elementId: element.id,
      property: row.property,
      frame: currentFrame,
    });
  }

  function frameAt(clientX: number): number {
    const el = laneRef.current;
    if (el === null) return currentFrame;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(frameIn + ratio * span);
  }

  const variant = keyframeVariantFor(element, row.property, currentFrame, selectedKeyframe);

  return (
    <div style={styles.row} data-track-property={row.property}>
      <div style={styles.label}>
        <span style={styles.labelName}>{row.label}</span>
        <span style={styles.labelValue}>{currentValue}</span>
        <KeyframeIndicator
          variant={variant}
          onClick={toggleKeyframeHere}
          ariaLabel={`Toggle keyframe for ${row.label} at frame ${String(currentFrame)}`}
        />
      </div>
      <div ref={laneRef} style={styles.lane} data-role="lane-empty">
        <div style={styles.laneLine} />
        {keyframes.map((k) => {
          const pct = ((k.frame - frameIn) / span) * 100;
          const isSelected =
            selectedKeyframe !== null &&
            selectedKeyframe.elementId === element.id &&
            selectedKeyframe.property === row.property &&
            selectedKeyframe.frame === k.frame;
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
              onDoubleClick={(e) => {
                e.stopPropagation();
                designerStore.openKeyframeInspector({
                  elementId: element.id,
                  property: row.property,
                  frame: k.frame,
                });
                designerStore.setCurrentFrame(k.frame);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                // Single-click: just select (yellow indicators), keep the
                // Element Inspector visible. Double-click opens the
                // dedicated Keyframe Inspector — see onDoubleClick above.
                designerStore.setSelectedKeyframe({
                  elementId: element.id,
                  property: row.property,
                  frame: k.frame,
                });
                designerStore.setCurrentFrame(k.frame);
                const targetEl = e.currentTarget;
                targetEl.setPointerCapture(e.pointerId);
                let lastFrame = k.frame;
                let from = k.frame;
                const onMove = (mv: PointerEvent): void => {
                  const nf = frameAt(mv.clientX);
                  if (nf === lastFrame) return;
                  designerStore.moveKeyframe(element.id, row.property, from, nf);
                  designerStore.setCurrentFrame(nf);
                  from = nf;
                  lastFrame = nf;
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

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
