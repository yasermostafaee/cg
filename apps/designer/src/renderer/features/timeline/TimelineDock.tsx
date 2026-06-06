import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import * as s from './TimelineDock.css.js';
import { DisplayRow } from './DisplayRow.js';
import { ElementRow, lifespanColorFor } from './ElementRow.js';
import { FrameRuler, pickStride } from './FrameRuler.js';
import { LayerContextMenu } from './LayerContextMenu.js';
import { LABEL_COL_PX, timelineGroupsFor } from './keyframe-helpers.js';
import { TrackRow } from './TrackRow.js';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  selectedKeyframes: readonly {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  }[];
}

const TIMELINE_BG = '#1c1f2d';

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
  selectedKeyframe,
  selectedKeyframes,
}: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  // Deliberately NOT subscribing to currentFrame here: the playhead, the
  // header readout, and the per-row live values are self-subscribing leaves
  // (FrameReadout / BodyPlayhead / RulerPlayhead / TrackRowLabel), so the dock
  // chrome, lanes, and ruler ticks don't re-render on every playback frame.
  const timelineZoom = useDesignerSelector((s) => s.timelineZoom);
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
  // Outer label viewport (overflow:hidden) — used to forward wheel events to
  // the lane body. Its content is offset by `leftBodyInnerRef`'s transform.
  const leftBodyRef = useRef<HTMLDivElement | null>(null);
  const leftBodyInnerRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(timelineZoom);
  zoomRef.current = timelineZoom;

  // The right body is the master scroll container; we mirror its scroll
  // into the left label column (vertical only) and the top ruler strip
  // (horizontal only) so the three regions stay aligned. The horizontal
  // scrollbar therefore lives only under the lanes, not under labels.
  //
  // The label column is driven by a CSS transform rather than its own
  // scrollTop: when the lanes show a horizontal scrollbar, the right body's
  // client height shrinks by the scrollbar thickness, so its max scrollTop
  // exceeds an overflow:hidden label column's max scrollTop. Mirroring
  // scrollTop then *clamps* near the bottom and the labels drift above their
  // lanes. translateY isn't clamped, so the two stay locked at every offset.
  function syncScroll(): void {
    const rb = rightBodyRef.current;
    if (rb === null) return;
    if (leftBodyInnerRef.current !== null)
      leftBodyInnerRef.current.style.transform = `translateY(${String(-rb.scrollTop)}px)`;
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
      // Read the frame lazily (not a reactive dep) — this effect only fires on
      // zoom change, and the dock no longer subscribes to currentFrame.
      const cf = designerStore.get().currentFrame;
      const frac = Math.max(0, Math.min(1, (cf - frameIn) / span));
      const viewportX = frac * cw * old - rb.scrollLeft; // playhead x within the viewport
      rb.scrollLeft = frac * cw * timelineZoom - viewportX; // keep the playhead fixed
    }
    syncScroll();
  }, [timelineZoom, frameIn, span]);

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

  // Layers start collapsed: opening a template with many layers shows a tidy
  // list of names, not every layer's property-track section expanded at once.
  // On scene load we collapse all current elements; newly added shapes are
  // also collapsed so adding one doesn't expand its tracks.
  const sceneId = scene.id;
  const elementIdsKey = elements.map((el) => el.id).join('|');
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seenSceneRef = useRef<string | null>(null);
  useEffect(() => {
    const ids = elementIdsKey === '' ? [] : elementIdsKey.split('|');
    if (seenSceneRef.current !== sceneId) {
      // New scene (or first mount): adopt its elements as the baseline and
      // collapse them all.
      seenSceneRef.current = sceneId;
      seenIdsRef.current = new Set(ids);
      setCollapsedIds(new Set(ids));
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

  // Clicking empty timeline space or the (non-selectable) Scene row clears the
  // layer selection — mirrors the canvas, where clicking the dark area
  // deselects. `clearSelectionOnEmpty` guards on target===currentTarget for the
  // scroll containers so a click that bubbled up from a real row (which already
  // set the selection) doesn't immediately undo it.
  function clearSelection(): void {
    designerStore.setSelection([]);
  }
  function clearSelectionOnEmpty(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) clearSelection();
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
    <section className={s.dock} aria-label="Animation timeline">
      <div className={s.body}>
        <div className={s.leftCol} style={{ width: LABEL_COL_PX }}>
          <div className={s.leftHeader}>
            <FrameReadout frameOut={frameOut} />
          </div>
          <div className={s.leftBody} ref={leftBodyRef} onClick={clearSelectionOnEmpty}>
            <div className={s.leftBodyInner} ref={leftBodyInnerRef}>
              <div className={s.sceneLabel} aria-hidden onClick={clearSelection} />
              {elements.length === 0 ? (
                <p className={s.empty}>No elements yet. Add a shape, text, or image to start.</p>
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
                              <div className={`cg-tl-row ${s.groupHeaderLabel}`}>
                                <button
                                  type="button"
                                  className={s.groupChevron}
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
        </div>
        <div className={s.rightCol}>
          <div className={s.topScroll} ref={topScrollRef}>
            <div className={s.zoomInner} style={{ width: `${String(timelineZoom * 100)}%` }}>
              <FrameRuler
                frameIn={frameIn}
                frameOut={frameOut}
                stride={tickStride}
                onScrub={(f) => designerStore.setCurrentFrame(f)}
              />
            </div>
          </div>
          <div className={s.rightBody} ref={rightBodyRef} onScroll={syncScroll}>
            <div
              onClick={clearSelectionOnEmpty}
              className={s.rightBodyInner}
              style={{
                width: `${String(timelineZoom * 100)}%`,
                backgroundColor: TIMELINE_BG,
                // One vertical line per `tickStride` frames, at the same
                // period the ruler labels use. Without this thinning, a
                // 1000-frame scene at default zoom paints ~4px-spaced
                // lines that read as a solid smear.
                backgroundImage: `repeating-linear-gradient(to right, #2e3247 0, #2e3247 1px, transparent 1px, transparent ${gridPeriodPct}%)`,
              }}
            >
              <BodyPlayhead frameIn={frameIn} frameOut={frameOut} />
              {hasInactiveTail && (
                <div
                  className={s.inactiveTail}
                  style={{ left: `${activePct.toFixed(3)}%` }}
                  aria-hidden
                />
              )}
              <div
                className={s.sceneLane}
                ref={sceneLaneRef}
                aria-label="Scene active region"
                onClick={clearSelection}
              >
                <div
                  className={s.sceneBar}
                  style={{ right: 'auto', width: `${activePct.toFixed(3)}%` }}
                  aria-hidden
                />
                <div
                  className={s.sceneBarHandle}
                  style={{
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
                <p className={s.empty}>&nbsp;</p>
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
                              <div className={s.groupHeaderLane} />
                              {groupExpanded &&
                                group.rows.map((entry) =>
                                  entry.kind === 'animatable' ? (
                                    <TrackRow
                                      key={`${el.id}-${entry.row.property}`}
                                      row={entry.row}
                                      element={el}
                                      frameIn={frameIn}
                                      frameOut={frameOut}
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

/**
 * Big "frame / total" readout in the dock's top-left. Self-subscribing so the
 * frame tick re-renders only this number, not the whole dock.
 */
function FrameReadout({ frameOut }: { frameOut: number }): JSX.Element {
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  return (
    <>
      <span style={{ color: 'rgb(188, 194, 224)', fontSize: '32px', lineHeight: 1 }}>
        {currentFrame}
      </span>
      <span style={{ color: '#858cac' }}>/{frameOut}</span>
    </>
  );
}

/**
 * Vertical playhead line over the lane body. Self-subscribing for the same
 * reason as {@link FrameReadout} — only the moving line re-renders per frame.
 */
function BodyPlayhead({ frameIn, frameOut }: { frameIn: number; frameOut: number }): JSX.Element {
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  const pct = (((currentFrame - frameIn) / Math.max(1, frameOut - frameIn)) * 100).toFixed(3);
  return <div className={s.bodyPlayhead} style={{ left: `${pct}%` }} />;
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
