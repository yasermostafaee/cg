import { useEffect, useRef, useState } from 'react';
import type { AnimatableProperty, Element, Keyframe } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { RealtimeNumberInput } from '../inspector/controls.js';
import { ColorPicker } from '../inspector/ColorPopover.js';
import { KeyframeIndicator } from './KeyframeIndicator.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import * as s from './TrackRow.css.js';
import {
  effectiveRowValue,
  hasKeyframeAt,
  keyframeVariantFor,
  trackOf,
  type TimelineRow,
} from './keyframe-helpers.js';

export { TRACK_ROW_HEIGHT } from './metrics.js';

/**
 * Shared add/toggle for a property's keyframe at `frame` from a diamond click —
 * the single code path for EVERY animatable property kind (transform numbers,
 * dimensions, opacity, colour). When adding, it CAPTURES the EVALUATED value at
 * the playhead (`effectiveRowValue` — exactly what the row readout shows and the
 * canvas renders), NOT the element's static base. Reading `row.read(element)` (the
 * base, which isn't updated when a keyframe is moved) is what made the diamond add
 * a keyframe with the pre-move value and the shape jump (B-007). Exported for
 * regression coverage.
 */
export function addOrToggleKeyframeAtFrame(
  element: Element,
  row: TimelineRow,
  frame: number,
): void {
  if (hasKeyframeAt(element, row.property, frame)) {
    designerStore.removeKeyframe(element.id, row.property, frame);
    return;
  }
  designerStore.upsertKeyframe(element.id, row.property, frame, effectiveRowValue(element, row, frame));
}

interface Props {
  row: TimelineRow;
  element: Element;
  frameIn: number;
  frameOut: number;
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
  /** All selected keyframes (multi-select) — drives the lane highlight. */
  selectedKeyframes: readonly {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  }[];
}

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
  const { row, element, selectedKeyframe } = props;
  // Only the live value readout + the keyframe-at-playhead highlight depend on
  // the frame, so this is the one piece of a track row that ticks during
  // playback — the lane (diamonds) and the rest of the dock stay put.
  const currentFrame = useDesignerSelector((s) => s.currentFrame);

  function toggleKeyframeHere(): void {
    const existed = hasKeyframeAt(element, row.property, currentFrame);
    addOrToggleKeyframeAtFrame(element, row, currentFrame);
    // Select the freshly-added point (not on removal).
    if (!existed) {
      designerStore.setSelectedKeyframe({
        elementId: element.id,
        property: row.property,
        frame: currentFrame,
      });
    }
  }

  const variant = keyframeVariantFor(element, row.property, currentFrame, selectedKeyframe);

  return (
    <div className={`cg-tl-row ${s.labelCell}`} data-track-property={row.property}>
      <span className={s.labelName}>{row.label}</span>
      <ValueCell
        value={toDisplay(effectiveRowValue(element, row, currentFrame), row.factor)}
        unit={row.unit}
        ariaLabel={row.label}
        onCommit={(v) =>
          designerStore.commitAnimatable(
            element.id,
            row.property,
            typeof v === 'number' ? fromDisplay(v, row.factor) : v,
          )
        }
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
  const { row, element, frameIn, frameOut, selectedKeyframes } = props;
  const isSelectedFrame = (f: number): boolean =>
    selectedKeyframes.some(
      (r) => r.elementId === element.id && r.property === row.property && r.frame === f,
    );
  const laneRef = useRef<HTMLDivElement | null>(null);
  const span = Math.max(1, frameOut - frameIn);
  const track = trackOf(element, row.property);
  const keyframes: readonly Keyframe[] = track?.keyframes ?? [];

  // Points that share a frame are fanned vertically so each stays visible and
  // grabbable (otherwise the diamonds overlap exactly). `stackCount` is how
  // many sit on a frame; `stackIndex` is each point's slot within that group.
  const stackCount = new Map<number, number>();
  for (const k of keyframes) stackCount.set(k.frame, (stackCount.get(k.frame) ?? 0) + 1);
  const stackIndex = new Map<string, number>();
  const stackSeen = new Map<number, number>();
  for (const k of keyframes) {
    const i = stackSeen.get(k.frame) ?? 0;
    if (k.id !== undefined) stackIndex.set(k.id, i);
    stackSeen.set(k.frame, i + 1);
  }

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
    if (el === null) return designerStore.get().currentFrame;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(frameIn + ratio * span);
  }

  return (
    <div
      ref={laneRef}
      className={s.laneCell}
      data-track-property={row.property}
      data-role="lane-empty"
      onContextMenu={(e) => e.preventDefault()}
    >
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
        const isLeftSelected = isSelectedFrame(k.frame);
        return (
          <div
            key={`line-${String(k.frame)}-${String(next.frame)}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${leftPct.toFixed(3)}%`,
              width: `${widthPct.toFixed(3)}%`,
              cursor: 'pointer',
            }}
            data-keyframe-diamond=""
            role="button"
            aria-label={`Segment between frames ${String(k.frame)} and ${String(next.frame)}`}
            onPointerDown={(e) => {
              // Click the segment selects + opens the inspector for its start
              // point; shift/ctrl adds it to the multi-selection.
              e.stopPropagation();
              const ref = { elementId: element.id, property: row.property, frame: k.frame };
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                designerStore.addKeyframeToSelection(ref);
              } else {
                designerStore.openKeyframeInspector(ref);
              }
              designerStore.setCurrentFrame(k.frame);
            }}
          >
            <div
              className={cx(s.interpLine, isLeftSelected && s.interpLineSelected)}
              style={{ left: 0, width: '100%' }}
            />
            {widthPct > 4 && (
              <span className={s.interpGlyphWrap} style={{ left: '50%' }} aria-hidden>
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
      {keyframes.map((k, kIdx) => {
        const pct = ((k.frame - frameIn) / span) * 100;
        const isSelected = isSelectedFrame(k.frame);
        // Fan stacked points vertically around the row centre.
        const count = stackCount.get(k.frame) ?? 1;
        const idx = (k.id !== undefined ? stackIndex.get(k.id) : undefined) ?? 0;
        const offsetPx = count > 1 ? (idx - (count - 1) / 2) * 5 : 0;
        const kfId = k.id;
        return (
          <div
            key={kfId ?? `${row.property}-f${String(k.frame)}-${String(kIdx)}`}
            className={cx(s.keyDiamond, isSelected && s.keyDiamondSelected)}
            style={{ left: `${pct.toFixed(3)}%`, top: `calc(50% + ${String(offsetPx)}px)` }}
            role="button"
            tabIndex={0}
            data-keyframe-diamond=""
            aria-label={`Keyframe at frame ${String(k.frame)}`}
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
              e.preventDefault();
              // Click selects the point and opens the Keyframe Inspector;
              // shift/ctrl-click adds it to the multi-selection (batch
              // easing). A drag then moves this specific point.
              const ref = { elementId: element.id, property: row.property, frame: k.frame };
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                designerStore.addKeyframeToSelection(ref);
              } else {
                designerStore.openKeyframeInspector(ref);
              }
              designerStore.setCurrentFrame(k.frame);
              // Drag to move this specific point (by id) — moving it onto
              // another keeps both (stacking). The listeners live on
              // `window`, not on the diamond, which React unmounts mid-drag
              // as it re-renders. `from` tracks its current frame so a
              // legacy keyframe without an id still drags by frame.
              let from = k.frame;
              const onMove = (mv: PointerEvent): void => {
                const nf = frameAt(mv.clientX);
                if (nf === from) return;
                if (kfId !== undefined) {
                  designerStore.moveKeyframeById(element.id, row.property, kfId, nf);
                } else {
                  designerStore.moveKeyframe(element.id, row.property, from, nf);
                }
                designerStore.setCurrentFrame(nf);
                from = nf;
              };
              const onUp = (): void => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
              window.addEventListener('pointercancel', onUp);
            }}
          />
        );
      })}
      {menu !== null && (
        <div
          className={s.menu}
          // Clamp the menu inside the viewport so it never spawns off-screen
          // when the diamond is near the right / bottom edge.
          style={{
            left: Math.min(menu.x, window.innerWidth - 160),
            top: Math.min(menu.y, window.innerHeight - 80),
          }}
          role="menu"
          aria-label="Keyframe actions"
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className={s.menuHeader}>
            {row.label} · frame {menu.frame}
          </div>
          <div className={s.menuSeparator} role="separator" />
          <Button
            variant="bare"
            role="menuitem"
            className={cx(s.menuItem, s.menuItemDanger)}
            onClick={() => {
              designerStore.removeKeyframe(element.id, row.property, menu.frame);
              setMenu(null);
            }}
          >
            Delete keyframe
          </Button>
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
  unit,
  ariaLabel,
  onCommit,
}: {
  value: number | string;
  unit?: string | undefined;
  ariaLabel: string;
  onCommit: (next: number | string) => void;
}): JSX.Element {
  if (typeof value === 'string') {
    const hex = value.startsWith('#') ? value : `#${value}`;
    const hexLabel = hex.replace(/^#/, '').toUpperCase();
    return (
      <span className={s.colorValue}>
        <ColorPicker value={hex} onChange={(next) => onCommit(next)} ariaLabel={ariaLabel} />
        <input
          type="text"
          defaultValue={hexLabel}
          key={hexLabel}
          className={cx('cg-timeline-num', s.valueHexInput)}
          aria-label={ariaLabel}
          onBlur={(e) => commitHex(e.target.value, onCommit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </span>
    );
  }
  if (unit !== undefined) {
    return (
      <span className={s.valueUnitWrap}>
        <RealtimeNumberInput
          value={value}
          onCommit={onCommit}
          step={1}
          className={cx('cg-timeline-num', 'cg-num-unit', s.valueNumberInputAuto)}
          ariaLabel={ariaLabel}
        />
        <span className="cg-unit">{unit}</span>
      </span>
    );
  }
  return (
    <RealtimeNumberInput
      value={value}
      onCommit={onCommit}
      step={1}
      className={cx('cg-timeline-num', s.valueNumberInput)}
      ariaLabel={ariaLabel}
    />
  );
}

/** Display = stored × factor (so scale / opacity store 0–1, show 0–100). */
function toDisplay(v: number | string, factor: number | undefined): number | string {
  return typeof v === 'number' ? Number((v * (factor ?? 1)).toFixed(4)) : v;
}
function fromDisplay(v: number, factor: number | undefined): number {
  return Number((v / (factor ?? 1)).toFixed(6));
}

function commitHex(raw: string, onCommit: (next: string) => void): void {
  const v = raw.trim();
  const next = v.startsWith('#') ? v : `#${v}`;
  if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(next)) onCommit(next.toUpperCase());
}
