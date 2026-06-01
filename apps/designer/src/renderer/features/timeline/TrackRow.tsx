import { useEffect, useRef, useState } from 'react';
import type { AnimatableProperty, Element, Keyframe } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { RealtimeNumberInput } from '../inspector/controls.js';
import { KeyframeIndicator } from './KeyframeIndicator.js';
import {
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
  /** Which half of the row to render — labels and lanes live in
   *  separate scroll columns so the lane scrollbar starts at the
   *  property column's right edge. */
  part: 'label' | 'lane';
  /** The full selectedKeyframe pointer from the store (may be on a different row). */
  selectedKeyframe: {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  } | null;
}

export const TRACK_ROW_HEIGHT = 20;
const ROW_HEIGHT = TRACK_ROW_HEIGHT;

const styles = {
  labelCell: {
    color: colors.textMuted,
    padding: '0 0.4rem 0 2rem',
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    alignItems: 'center',
    gap: '0.35rem',
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panel,
    height: ROW_HEIGHT,
    fontSize: '0.7rem',
    boxSizing: 'border-box' as const,
  },
  laneCell: {
    position: 'relative' as const,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    height: ROW_HEIGHT,
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
  },
  // Editable numeric value — same look as labelValue but interactive.
  valueNumberInput: {
    width: 48,
    background: 'transparent',
    color: colors.text,
    border: `1px solid transparent`,
    borderRadius: '0.18rem',
    padding: '0 0.15rem',
    fontSize: '0.7rem',
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
    outline: 'none',
    cursor: 'text',
  },
  // Editable colour swatch — opens the native colour picker on click.
  valueSwatchWrap: {
    position: 'relative' as const,
    width: 14,
    height: 14,
    borderRadius: '0.15rem',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden' as const,
    cursor: 'pointer',
  },
  valueColorInput: {
    position: 'absolute' as const,
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
    border: 0,
    padding: 0,
    background: 'transparent',
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
  // B-003: lane diamonds are always yellow. When a diamond is
  // selected, its border turns blue (and the interpolation line that
  // follows it is rendered in blue too — see interpLineSelected).
  keyDiamond: {
    position: 'absolute' as const,
    top: '50%',
    width: 9,
    height: 9,
    transform: 'translate(-50%, -50%) rotate(45deg)',
    background: '#FDE047',
    border: `1px solid ${colors.keyframeBorder}`,
    cursor: 'grab',
  },
  keyDiamondSelected: {
    border: `1.5px solid ${colors.accent}`,
    boxShadow: `0 0 0 1px ${colors.accent}`,
  },
  // D-009 / B-003 — line drawn between two adjacent keyframes on the
  // same track. Default colour is muted; if the *earlier* keyframe of
  // the pair is selected, the line is highlighted in accent blue.
  interpLine: {
    position: 'absolute' as const,
    top: '50%',
    height: 1,
    background: colors.textMuted,
    opacity: 0.55,
    transform: 'translateY(-0.5px)',
    pointerEvents: 'none' as const,
  },
  interpLineSelected: {
    background: colors.accent,
    opacity: 1,
    height: 1.5,
  },
  // B-003: replace the "ƒ" letter with a small SVG curve.
  interpGlyphWrap: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 14,
    height: 8,
    background: colors.panelMuted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none' as const,
  },
  menu: {
    position: 'fixed' as const,
    minWidth: 140,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
    padding: '0.25rem 0',
    zIndex: 70,
    fontSize: '0.74rem',
  },
  menuHeader: {
    padding: '0.2rem 0.6rem 0.3rem',
    color: colors.textMuted,
    fontSize: '0.66rem',
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: '0.2rem',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    color: colors.text,
    border: 'none',
    textAlign: 'left' as const,
    padding: '0.3rem 0.7rem',
    fontSize: '0.76rem',
    cursor: 'pointer',
  },
  menuItemDanger: {
    color: '#fda4af',
  },
  menuSeparator: {
    height: 1,
    background: colors.border,
    margin: '0.25rem 0',
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
  if (props.part === 'label') return <TrackRowLabel {...props} />;
  return <TrackRowLane {...props} />;
}

function TrackRowLabel(props: Props): JSX.Element {
  const { row, element, currentFrame, selectedKeyframe } = props;

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

  const variant = keyframeVariantFor(element, row.property, currentFrame, selectedKeyframe);

  return (
    <div style={styles.labelCell} data-track-property={row.property}>
      <span style={styles.labelName}>{row.label}</span>
      <ValueCell
        value={row.read(element)}
        ariaLabel={`${row.label} value`}
        onCommit={(v) => designerStore.commitAnimatable(element.id, row.property, v)}
      />
      <KeyframeIndicator
        variant={variant}
        onClick={toggleKeyframeHere}
        ariaLabel={`Toggle keyframe for ${row.label} at frame ${String(currentFrame)}`}
      />
    </div>
  );
}

function TrackRowLane(props: Props): JSX.Element {
  const { row, element, frameIn, frameOut, currentFrame, selectedKeyframe } = props;
  const laneRef = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const track = trackOf(element, row.property);
  const keyframes: readonly Keyframe[] = track?.keyframes ?? [];

  const [menu, setMenu] = useState<{ x: number; y: number; frame: number } | null>(null);
  useEffect(() => {
    if (menu === null) return;
    function close(): void {
      setMenu(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  function frameAt(clientX: number): number {
    const el = laneRef.current;
    if (el === null) return currentFrame;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(frameIn + ratio * span);
  }

  return (
    <div
      ref={laneRef}
      style={styles.laneCell}
      data-track-property={row.property}
      data-role="lane-empty"
      onContextMenu={(e) => e.preventDefault()}
    >
        <div style={styles.laneLine} />
        {/* Interpolation lines between adjacent keyframes. The line is
            drawn in accent blue when the keyframe on its LEFT (the
            outgoing side) is the selected one — see B-003. */}
        {keyframes.slice(0, -1).map((k, i) => {
          const next = keyframes[i + 1];
          if (next === undefined) return null;
          const leftPct = ((k.frame - frameIn) / span) * 100;
          const rightPct = ((next.frame - frameIn) / span) * 100;
          const widthPct = rightPct - leftPct;
          if (widthPct <= 0) return null;
          const midPct = leftPct + widthPct / 2;
          const isLeftSelected =
            selectedKeyframe !== null &&
            selectedKeyframe.elementId === element.id &&
            selectedKeyframe.property === row.property &&
            selectedKeyframe.frame === k.frame;
          return (
            <div key={`line-${String(k.frame)}-${String(next.frame)}`}>
              <div
                style={{
                  ...styles.interpLine,
                  ...(isLeftSelected ? styles.interpLineSelected : {}),
                  left: `${leftPct.toFixed(3)}%`,
                  width: `${widthPct.toFixed(3)}%`,
                }}
              />
              {widthPct > 4 && (
                <span
                  style={{ ...styles.interpGlyphWrap, left: `${midPct.toFixed(3)}%` }}
                  aria-hidden
                >
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                    <path
                      d="M0 5 C 2.5 5, 2.5 1, 5 1 C 7.5 1, 7.5 5, 10 5"
                      stroke={isLeftSelected ? colors.accent : colors.textMuted}
                      strokeWidth="1"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
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
              onContextMenu={(e) => {
                // Right-click opens a context menu (not a direct
                // delete) so the operator confirms the action via
                // the Delete item.
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, frame: k.frame });
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
      {menu !== null && (
        <div
          style={{
            ...styles.menu,
            // Clamp the menu inside the viewport so it never spawns
            // off-screen when the diamond is near the right / bottom.
            left: Math.min(menu.x, window.innerWidth - 160),
            top: Math.min(menu.y, window.innerHeight - 80),
          }}
          role="menu"
          aria-label="Keyframe actions"
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div style={styles.menuHeader}>
            {row.label} · frame {menu.frame}
          </div>
          <div style={styles.menuSeparator} role="separator" />
          <button
            type="button"
            role="menuitem"
            style={{ ...styles.menuItem, ...styles.menuItemDanger }}
            onClick={() => {
              designerStore.removeKeyframe(element.id, row.property, menu.frame);
              setMenu(null);
            }}
          >
            Delete keyframe
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Inline-editable value cell used in the timeline left column. Numeric
 * properties render as a compact number input (commits on blur / Enter);
 * colour properties render as a tiny swatch that opens the native
 * picker. Either way the commit path is `commitAnimatable`, so the cell
 * behaves identically to its twin in the right Inspector — if a track
 * already exists it upserts a keyframe at the current frame, otherwise
 * it writes the static value.
 */
function ValueCell({
  value,
  ariaLabel,
  onCommit,
}: {
  value: number | string;
  ariaLabel: string;
  onCommit: (next: number | string) => void;
}): JSX.Element {
  if (typeof value === 'string') {
    const hex = value.startsWith('#') ? value : `#${value}`;
    return (
      <span style={{ ...styles.valueSwatchWrap, background: hex }} title={hex.toUpperCase()}>
        <input
          type="color"
          value={hex}
          onChange={(e) => onCommit(e.target.value.toUpperCase())}
          style={styles.valueColorInput}
          aria-label={ariaLabel}
        />
      </span>
    );
  }
  return (
    <RealtimeNumberInput
      value={value}
      onCommit={onCommit}
      step={1}
      style={styles.valueNumberInput}
      ariaLabel={ariaLabel}
    />
  );
}
