import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';
import { DisplayRow } from './DisplayRow.js';
import { ElementRow, lifespanColorFor } from './ElementRow.js';
import { FrameRuler, pickStride } from './FrameRuler.js';
import { LayerContextMenu } from './LayerContextMenu.js';
import { LABEL_COL_PX, timelineGroupsFor } from './keyframe-helpers.js';
import { TrackRow } from './TrackRow.js';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  selectedKeyframes: readonly {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  }[];
}

const TIMELINE_BG = '#1c1f2d';

const styles = {
  dock: {
    background: colors.panel,
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: '0.72rem',
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    paddingTop: 16,
    boxSizing: 'border-box' as const,
  },
  body: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden' as const,
  },
  leftCol: {
    width: LABEL_COL_PX,
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
    borderRight: `1px solid ${colors.border}`,
    background: colors.panel,
  },
  leftHeader: {
    background: '#32364b',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textMuted,
    fontSize: '0.85rem',
    fontVariantNumeric: 'tabular-nums' as const,
    padding: '0 0.6rem',
    height: 22,
    display: 'flex',
    alignItems: 'center',
    gap: '0.1rem',
    boxSizing: 'border-box' as const,
  },
  leftBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden' as const,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
  },
  topScroll: {
    overflowX: 'hidden' as const,
    overflowY: 'hidden' as const,
    height: 22,
    borderBottom: `1px solid ${colors.border}`,
    background: '#32364b',
    // Reserve the same gutter as the body so the ruler's inner width
    // matches the lane body's inner width — keeps per-frame grid lines
    // aligned across the two regions.
    scrollbarGutter: 'stable' as const,
  },
  rightBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto' as const,
    scrollbarGutter: 'stable' as const,
  },
  zoomInner: {
    minWidth: '100%',
  },
  rightBodyInner: {
    position: 'relative' as const,
    minWidth: '100%',
    // Fill the whole body height even with no layers, so the frame grid and the
    // playhead run to the bottom of the timeline (not just behind the rows).
    minHeight: '100%',
  },
  bodyPlayhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 0,
    borderLeft: `1.5px solid ${colors.accent}`,
    pointerEvents: 'none' as const,
    zIndex: 3,
  },
  // Top-of-body "Scene" row — single bar covering the active scene
  // range. No chevron, no eye/lock, no keyframe diamonds; the only
  // affordance is the right-edge gripper that resizes the scene
  // duration via the same store action the inspector's duration
  // field uses.
  sceneLabel: {
    height: 22,
    boxSizing: 'border-box' as const,
    background: colors.panel,
  },
  sceneLane: {
    position: 'relative' as const,
    height: 22,
    boxSizing: 'border-box' as const,
  },
  sceneBar: {
    position: 'absolute' as const,
    top: '50%',
    left: 0,
    right: 0,
    height: 20,
    transform: 'translateY(-50%)',
    background: colors.accent,
    opacity: 0.45,
    borderRadius: 2,
    pointerEvents: 'none' as const,
  },
  sceneBarHandle: {
    position: 'absolute' as const,
    top: '50%',
    width: 8,
    height: 20,
    transform: 'translateY(-50%)',
    background: colors.accent,
    borderRadius: 2,
    cursor: 'ew-resize',
    touchAction: 'none' as const,
    pointerEvents: 'auto' as const,
    zIndex: 4,
  },
  // Dimmed overlay over the trailing frames [activeOut .. total]. The scene
  // total (ruler) is unchanged — these frames stay visible but are outside
  // the play / export window. pointerEvents none so the ruler/lanes beneath
  // stay scrubbable/inspectable.
  inactiveTail: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    right: 0,
    background: 'rgba(12, 14, 22, 0.55)',
    borderLeft: `1px dashed ${colors.accentMuted}`,
    pointerEvents: 'none' as const,
    // Above the lifespan bars (incl. a selected bar's zIndex:1) so the inactive
    // region dims the selected layer too, but below the playhead/handle.
    zIndex: 2,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.3rem 0.5rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLeft: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    minWidth: 0,
  },
  headerCenter: {
    flex: 'none' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  headerRight: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end' as const,
    minWidth: 0,
  },
  title: {
    fontWeight: 700,
    color: colors.textMuted,
    fontSize: '0.66rem',
    letterSpacing: '0.05em',
    marginRight: '0.4rem',
  },
  button: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    fontSize: '0.7rem',
    padding: '0.1rem 0.4rem',
    cursor: 'pointer',
  },
  buttonPrimary: {
    background: colors.accent,
    color: '#000',
    border: `1px solid ${colors.accentMuted}`,
    borderRadius: '0.18rem',
    fontSize: '0.7rem',
    padding: '0.1rem 0.45rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  frameReadout: {
    color: colors.textMuted,
    fontSize: '0.7rem',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  empty: {
    padding: '0.6rem',
    color: colors.textMuted,
    fontSize: '0.72rem',
    textAlign: 'center' as const,
  },
  groupHeaderLabel: {
    color: '#bcc2e0',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    padding: '0 0.6rem 0 1.4rem',
    background: colors.panel,
    borderRight: `1px solid ${colors.border}`,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    boxSizing: 'border-box' as const,
  },
  groupHeaderLane: {
    height: 22,
    boxSizing: 'border-box' as const,
  },
  groupChevron: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    padding: 0,
    fontSize: '1rem',
    lineHeight: 1,
    width: 16,
    textAlign: 'center' as const,
  },
} as const;

/**
 * Animation timeline dock — Loopic-style element tree (B-001 redesign).
 *
 *   ┌───── header (transport + frame readout) ─────┐
 *   │   FRAME │ 0   5   10   15  20  25  30 ...    │ ← ruler aligned with lanes
 *   ├─────────┴─────────────────────────────────────┤
 *   │ ▾ loop-element   ◉ 🔒 │ ▆▆▆▆▆▆▆▆▆▆ lifespan │
 *   │     ▾ TRANSFORM       │ (track rows below)  │
 *   │       Position X 960 ◆│   ◆        ◆        │
 *   │       …                                      │
 *   │ ▸ _lowerThird    ◉ 🔒 │ ▆▆▆▆▆▆▆▆▆▆ lifespan │
 *   └───────────────────────────────────────────────┘
 *
 * Each element row carries a colored lifespan bar so the dock reads as
 * a multi-track timeline at a glance. The element rows live in component
 * state for collapse-per-element; the dock auto-expands the selected
 * element so the operator's last selection is the focused one.
 */
export function TimelineDock({
  scene,
  selection,
  currentFrame,
  selectedKeyframe,
  selectedKeyframes,
}: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  const { timelineZoom } = useDesignerStore();
  // `visibleFrames = span / zoom` exactly, because the inner wrappers
  // (ruler's `zoomInner`, body's `rightBodyInner`) are both
  // `width: zoom × 100%` of the scrolling viewport — so the on-screen
  // density only depends on those two numbers. One stride for the
  // ruler labels and the body gridlines keeps the two visually
  // synchronised.
  const span = Math.max(1, frameOut - frameIn);
  // The active region (resized scene bar) within the full total span. The
  // ruler/grid stay on the total `span`; only the scene bar and the dimmed
  // trailing overlay are driven by the active out-point.
  const active = scene.activeRange ?? scene.frameRange;
  const activePct = Math.max(0, Math.min(100, ((active.out - frameIn) / span) * 100));
  const hasInactiveTail = active.out < frameOut;
  const visibleFrames = span / Math.max(1, timelineZoom);
  const tickStride = pickStride(visibleFrames);
  const gridPeriodPct = ((tickStride * 100) / span).toFixed(4);
  const rightBodyRef = useRef<HTMLDivElement | null>(null);
  const leftBodyRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(timelineZoom);
  zoomRef.current = timelineZoom;

  // The right body is the master scroll container; we mirror its scroll
  // into the left label column (vertical only) and the top ruler strip
  // (horizontal only) so the three regions stay aligned. The horizontal
  // scrollbar therefore lives only under the lanes, not under labels.
  function syncScroll(): void {
    const rb = rightBodyRef.current;
    if (rb === null) return;
    if (leftBodyRef.current !== null) leftBodyRef.current.scrollTop = rb.scrollTop;
    if (topScrollRef.current !== null) topScrollRef.current.scrollLeft = rb.scrollLeft;
  }

  // Zoom anchoring: when the timeline zoom changes, adjust the horizontal
  // scroll so a focal point keeps its on-screen position instead of the view
  // jumping to the left edge. Ctrl+wheel anchors to the mouse (set in the wheel
  // handler); the slider / buttons anchor to the playhead. Runs before paint so
  // the lane width (zoom × 100%) is already applied.
  const prevZoomRef = useRef(timelineZoom);
  const wheelAnchorRef = useRef<{ frac: number; vx: number } | null>(null);
  useLayoutEffect(() => {
    const rb = rightBodyRef.current;
    const old = prevZoomRef.current;
    prevZoomRef.current = timelineZoom;
    if (rb === null || old === timelineZoom) return;
    const cw = rb.clientWidth;
    const wheel = wheelAnchorRef.current;
    if (wheel !== null) {
      wheelAnchorRef.current = null;
      rb.scrollLeft = wheel.frac * cw * timelineZoom - wheel.vx; // keep the point under the mouse
    } else {
      const frac = Math.max(0, Math.min(1, (currentFrame - frameIn) / span));
      const viewportX = frac * cw * old - rb.scrollLeft; // playhead x within the viewport
      rb.scrollLeft = frac * cw * timelineZoom - viewportX; // keep the playhead fixed
    }
    syncScroll();
  }, [timelineZoom, currentFrame, frameIn, span]);

  // Forward wheel events from non-scrolling regions to the right body.
  // Ctrl+wheel zooms (native listener so preventDefault works).
  useEffect(() => {
    const rb = rightBodyRef.current;
    const lb = leftBodyRef.current;
    const ts = topScrollRef.current;
    if (rb === null) return;
    function onWheel(e: WheelEvent): void {
      if (e.ctrlKey) {
        e.preventDefault();
        // Anchor the next zoom to the point under the mouse.
        const el = rightBodyRef.current;
        if (el !== null) {
          const vx = e.clientX - el.getBoundingClientRect().left;
          const denom = el.clientWidth * zoomRef.current;
          const frac = denom === 0 ? 0 : (vx + el.scrollLeft) / denom;
          wheelAnchorRef.current = { frac: Math.max(0, Math.min(1, frac)), vx };
        }
        const delta = e.deltaY > 0 ? -1 : 1;
        designerStore.setTimelineZoom(zoomRef.current + delta);
        return;
      }
    }
    function forwardWheel(e: WheelEvent): void {
      if (e.ctrlKey) return; // let the zoom listener handle it
      const target = rightBodyRef.current;
      if (target === null) return;
      target.scrollTop += e.deltaY;
      target.scrollLeft += e.deltaX;
      e.preventDefault();
    }
    rb.addEventListener('wheel', onWheel, { passive: false });
    if (lb !== null) lb.addEventListener('wheel', forwardWheel, { passive: false });
    if (ts !== null) ts.addEventListener('wheel', forwardWheel, { passive: false });
    return () => {
      rb.removeEventListener('wheel', onWheel);
      if (lb !== null) lb.removeEventListener('wheel', forwardWheel);
      if (ts !== null) ts.removeEventListener('wheel', forwardWheel);
    };
  }, []);

  // Clear keyframe selection when the operator clicks anywhere that isn't a
  // keyframe diamond or the Keyframe Inspector itself — otherwise clicking the
  // inspector's own fields would clear the selection and make the form vanish.
  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      const target = e.target as HTMLElement | null;
      if (
        target !== null &&
        target.closest('[data-keyframe-diamond], [data-keyframe-inspector]') !== null
      ) {
        return;
      }
      designerStore.setSelectedKeyframe(null);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  // Second-level groups (TRANSFORM, Path Style, …) start collapsed, so first
  // expanding a layer reveals collapsed group headers. We track the *expanded*
  // ones; absent ⇒ collapsed.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [layerMenu, setLayerMenu] = useState<{ elementId: string; x: number; y: number } | null>(
    null,
  );
  const openLayerMenu = (elementId: string, x: number, y: number): void =>
    setLayerMenu({ elementId, x, y });
  const sceneLaneRef = useRef<HTMLDivElement | null>(null);

  // Newest-first in the timeline: a freshly added shape is appended last in
  // the scene graph (and so paints on top of the canvas), so reversing here
  // lists it as the top row — matching the "top layer = frontmost" convention.
  const elements: readonly Element[] = [...flattenElements(scene)].reverse();

  // Start newly added elements collapsed, so adding a shape doesn't expand its
  // property-track section. Elements present on scene load keep their default
  // (expanded); only ids that appear *after* the baseline get auto-collapsed.
  const sceneId = scene.id;
  const elementIdsKey = elements.map((el) => el.id).join('|');
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenSceneRef = useRef<string | null>(null);
  useEffect(() => {
    const ids = elementIdsKey === '' ? [] : elementIdsKey.split('|');
    if (seenSceneRef.current !== sceneId) {
      // New scene (or first mount): adopt its elements as the baseline.
      seenSceneRef.current = sceneId;
      seenIdsRef.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seenIdsRef.current.has(id));
    seenIdsRef.current = new Set(ids);
    if (added.length > 0) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        for (const id of added) next.add(id);
        return next;
      });
    }
  }, [sceneId, elementIdsKey]);

  // Drag the Scene row's right-edge gripper to resize the *active region*
  // (the play / export window) — NOT the scene total. The store clamps the
  // new out-point to `[activeIn + 1, frameRange.out]` and leaves
  // `frameRange` untouched, so the ruler keeps its full frame count and the
  // trailing frames stay visible. The lane spans the full total, so
  // pxPerFrame is locked from the lane width over the total span.
  function startSceneResize(e: React.PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const lane = sceneLaneRef.current;
    if (lane === null) return;
    const rect = lane.getBoundingClientRect();
    if (rect.width <= 0) return;
    const startX = e.clientX;
    const active = scene.activeRange ?? scene.frameRange;
    const startOut = active.out;
    const totalSpan = Math.max(1, scene.frameRange.out - scene.frameRange.in);
    const pxPerFrame = rect.width / totalSpan;
    function onMove(ev: PointerEvent): void {
      const dframes = (ev.clientX - startX) / pxPerFrame;
      designerStore.setSceneActiveOut(startOut + dframes);
    }
    function onUp(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // Delete-key removes every selected keyframe.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEditableTarget(e.target)) return;
      const kfs = designerStore.get().selectedKeyframes;
      if (kfs.length === 0) return;
      for (const kf of kfs) designerStore.removeKeyframe(kf.elementId, kf.property, kf.frame);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function isCollapsed(id: string): boolean {
    return collapsedIds.has(id);
  }
  function toggleCollapsed(id: string): void {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function isGroupExpanded(id: string): boolean {
    return expandedGroups.has(id);
  }
  function toggleGroupExpanded(id: string): void {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section style={styles.dock} aria-label="Animation timeline">
      <div style={styles.body}>
        <div style={styles.leftCol}>
          <div style={styles.leftHeader}>
            <span style={{ color: colors.text, fontWeight: 700 }}>{currentFrame}</span>
            <span style={{ color: colors.textMuted }}>/{frameOut}</span>
          </div>
          <div style={styles.leftBody} ref={leftBodyRef}>
            <div style={styles.sceneLabel} aria-hidden />
            {elements.length === 0 ? (
              <p style={styles.empty}>No elements yet. Add a shape, text, or image to start.</p>
            ) : (
              elements.map((el) => {
                const expanded = !isCollapsed(el.id);
                return (
                  <div key={el.id}>
                    <ElementRow
                      element={el}
                      expanded={expanded}
                      onToggleExpand={() => toggleCollapsed(el.id)}
                      isSelected={selection.has(el.id)}
                      frameRange={scene.frameRange}
                      lifespanColor={el.timelineColor ?? lifespanColorFor(el)}
                      onContextMenu={openLayerMenu}
                      part="label"
                    />
                    {expanded &&
                      timelineGroupsFor(el).map((group) => {
                        const groupKey = `${el.id}::${group.title}`;
                        const groupExpanded = isGroupExpanded(groupKey);
                        return (
                          <div key={groupKey}>
                            <div className="cg-tl-row" style={styles.groupHeaderLabel}>
                              <button
                                type="button"
                                style={styles.groupChevron}
                                onClick={() => toggleGroupExpanded(groupKey)}
                                aria-expanded={groupExpanded}
                                aria-label={`Toggle ${group.title.toLowerCase()} tracks`}
                              >
                                {groupExpanded ? '▾' : '▸'}
                              </button>
                              <span>{group.title}</span>
                            </div>
                            {groupExpanded &&
                              group.rows.map((entry) =>
                                entry.kind === 'animatable' ? (
                                  <TrackRow
                                    key={`${el.id}-${entry.row.property}`}
                                    row={entry.row}
                                    element={el}
                                    frameIn={frameIn}
                                    frameOut={frameOut}
                                    currentFrame={currentFrame}
                                    selectedKeyframe={selectedKeyframe}
                                    selectedKeyframes={selectedKeyframes}
                                    part="label"
                                  />
                                ) : (
                                  <DisplayRow
                                    key={`${el.id}-${entry.row.id}`}
                                    row={entry.row}
                                    element={el}
                                    part="label"
                                  />
                                ),
                              )}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div style={styles.rightCol}>
          <div style={styles.topScroll} ref={topScrollRef}>
            <div style={{ ...styles.zoomInner, width: `${String(timelineZoom * 100)}%` }}>
              <FrameRuler
                frameIn={frameIn}
                frameOut={frameOut}
                currentFrame={currentFrame}
                stride={tickStride}
                onScrub={(f) => designerStore.setCurrentFrame(f)}
              />
            </div>
          </div>
          <div style={styles.rightBody} ref={rightBodyRef} onScroll={syncScroll}>
            <div
              style={{
                ...styles.rightBodyInner,
                width: `${String(timelineZoom * 100)}%`,
                backgroundColor: TIMELINE_BG,
                // One vertical line per `tickStride` frames, at the same
                // period the ruler labels use. Without this thinning, a
                // 1000-frame scene at default zoom paints ~4px-spaced
                // lines that read as a solid smear.
                backgroundImage: `repeating-linear-gradient(to right, #262a3e 0, #262a3e 1px, transparent 1px, transparent ${gridPeriodPct}%)`,
              }}
            >
              <div
                style={{
                  ...styles.bodyPlayhead,
                  left: `${(((currentFrame - frameIn) / Math.max(1, frameOut - frameIn)) * 100).toFixed(3)}%`,
                }}
              />
              {hasInactiveTail && (
                <div
                  style={{ ...styles.inactiveTail, left: `${activePct.toFixed(3)}%` }}
                  aria-hidden
                />
              )}
              <div style={styles.sceneLane} ref={sceneLaneRef} aria-label="Scene active region">
                <div
                  style={{ ...styles.sceneBar, right: 'auto', width: `${activePct.toFixed(3)}%` }}
                  aria-hidden
                />
                <div
                  style={{
                    ...styles.sceneBarHandle,
                    left: `${activePct.toFixed(3)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={startSceneResize}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize active region"
                  title="Drag to resize the active region (play / export window) — the scene total stays"
                />
              </div>
              {elements.length === 0 ? (
                <p style={styles.empty}>&nbsp;</p>
              ) : (
                elements.map((el) => {
                  const expanded = !isCollapsed(el.id);
                  return (
                    <div key={el.id}>
                      <ElementRow
                        element={el}
                        expanded={expanded}
                        onToggleExpand={() => toggleCollapsed(el.id)}
                        isSelected={selection.has(el.id)}
                        frameRange={scene.frameRange}
                        lifespanColor={el.timelineColor ?? lifespanColorFor(el)}
                        onContextMenu={openLayerMenu}
                        part="lane"
                      />
                      {expanded &&
                        timelineGroupsFor(el).map((group) => {
                          const groupKey = `${el.id}::${group.title}`;
                          const groupExpanded = isGroupExpanded(groupKey);
                          return (
                            <div key={groupKey}>
                              <div style={styles.groupHeaderLane} />
                              {groupExpanded &&
                                group.rows.map((entry) =>
                                  entry.kind === 'animatable' ? (
                                    <TrackRow
                                      key={`${el.id}-${entry.row.property}`}
                                      row={entry.row}
                                      element={el}
                                      frameIn={frameIn}
                                      frameOut={frameOut}
                                      currentFrame={currentFrame}
                                      selectedKeyframe={selectedKeyframe}
                                      selectedKeyframes={selectedKeyframes}
                                      part="lane"
                                    />
                                  ) : (
                                    <DisplayRow
                                      key={`${el.id}-${entry.row.id}`}
                                      row={entry.row}
                                      element={el}
                                      part="lane"
                                    />
                                  ),
                                )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      {layerMenu !== null && (
        <LayerContextMenu
          elementId={layerMenu.elementId}
          x={layerMenu.x}
          y={layerMenu.y}
          onClose={() => setLayerMenu(null)}
        />
      )}
    </section>
  );
}

function flattenElements(scene: Scene): readonly Element[] {
  const out: Element[] = [];
  function walk(children: readonly Element[]): void {
    for (const el of children) {
      out.push(el);
      if (el.type === 'container') walk(el.children);
    }
  }
  for (const layer of scene.layers) walk(layer.children);
  return out;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
