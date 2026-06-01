import { useEffect, useRef, useState } from 'react';
import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';
import { DisplayRow } from './DisplayRow.js';
import { ElementRow, lifespanColorFor } from './ElementRow.js';
import { FrameRuler } from './FrameRuler.js';
import { LABEL_COL_PX, timelineGroupsFor } from './keyframe-helpers.js';
import { TrackRow } from './TrackRow.js';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

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
  },
  // No nested overflow on the body — both axes scroll on the outer
  // container so `position: sticky` on the left labels (and on the
  // ruler row's top) is evaluated against a single scroll context.
  scrollBody: {
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.3rem 0.5rem',
    borderBottom: `1px solid ${colors.border}`,
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
    marginLeft: 'auto',
    color: colors.textMuted,
    fontSize: '0.7rem',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  rulerRow: {
    display: 'grid',
    gridTemplateColumns: `${String(LABEL_COL_PX)}px 1fr`,
    position: 'sticky' as const,
    top: 0,
    zIndex: 3,
    background: colors.panel,
  },
  rulerLabelGutter: {
    background: colors.panel,
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textMuted,
    fontSize: '0.6rem',
    letterSpacing: '0.06em',
    padding: '0 0.5rem',
    display: 'flex',
    alignItems: 'center',
    position: 'sticky' as const,
    left: 0,
    zIndex: 4,
  },
  hScrollOuter: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: 'auto' as const,
    display: 'block',
  },
  hScrollInner: {
    minWidth: '100%',
    minHeight: '100%',
  },
  empty: {
    padding: '0.6rem',
    color: colors.textMuted,
    fontSize: '0.72rem',
    textAlign: 'center' as const,
  },
  transformHeader: {
    display: 'grid',
    gridTemplateColumns: `${String(LABEL_COL_PX)}px 1fr`,
    alignItems: 'center',
    borderBottom: `1px solid ${colors.border}`,
    height: 18,
  },
  transformHeaderLabel: {
    color: colors.textMuted,
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '0 0.4rem 0 1.7rem',
    background: colors.panel,
    borderRight: `1px solid ${colors.border}`,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    position: 'sticky' as const,
    left: 0,
    zIndex: 2,
  },
  transformHeaderLane: {
    background: colors.panelMuted,
    height: '100%',
  },
  groupChevron: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    padding: 0,
    fontSize: '0.6rem',
    width: 10,
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
}: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  const { timelineZoom } = useDesignerStore();
  const hScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(timelineZoom);
  zoomRef.current = timelineZoom;
  // Ctrl+wheel zooms the timeline; the listener is native (non-passive)
  // because React's synthetic onWheel can't preventDefault.
  useEffect(() => {
    const el = hScrollRef.current;
    if (el === null) return;
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      designerStore.setTimelineZoom(zoomRef.current + delta);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const [playing, setPlaying] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const lastWallRef = useRef<number>(0);
  const accumRef = useRef<number>(0);

  const elements: readonly Element[] = flattenElements(scene);

  // Transport loop: advance currentFrame at `scene.frameRate`.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number): void => {
      const prev = lastWallRef.current === 0 ? now : lastWallRef.current;
      lastWallRef.current = now;
      const dt = now - prev;
      accumRef.current += dt;
      const frameDurMs = 1000 / scene.frameRate;
      let next = designerStore.get().currentFrame;
      while (accumRef.current >= frameDurMs) {
        accumRef.current -= frameDurMs;
        next = next >= frameOut ? frameIn : next + 1;
      }
      designerStore.setCurrentFrame(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastWallRef.current = 0;
      accumRef.current = 0;
    };
  }, [playing, scene.frameRate, frameIn, frameOut]);

  // Delete-key removes the selected keyframe.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEditableTarget(e.target)) return;
      const kf = designerStore.get().selectedKeyframe;
      if (kf === null) return;
      designerStore.removeKeyframe(kf.elementId, kf.property, kf.frame);
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
  function isGroupCollapsed(id: string): boolean {
    return collapsedGroups.has(id);
  }
  function toggleGroupCollapsed(id: string): void {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section style={styles.dock} aria-label="Animation timeline">
      <div style={styles.header}>
        <span style={styles.title}>TIMELINE</span>
        <button
          type="button"
          style={styles.button}
          onClick={() => designerStore.setCurrentFrame(frameIn)}
          aria-label="Go to start"
          title="Go to start"
        >
          ⏮
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={() => designerStore.setCurrentFrame(currentFrame - 1)}
          aria-label="Step back"
          title="Step back one frame"
        >
          ◀
        </button>
        <button
          type="button"
          style={styles.buttonPrimary}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={() => {
            setPlaying(false);
            designerStore.setCurrentFrame(frameIn);
          }}
          aria-label="Stop"
          title="Stop"
        >
          ⏹
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={() => designerStore.setCurrentFrame(currentFrame + 1)}
          aria-label="Step forward"
          title="Step forward one frame"
        >
          ▶
        </button>
        <span style={styles.frameReadout} aria-label="Current frame">
          frame {currentFrame} / {frameOut}
        </span>
      </div>
      <div style={styles.hScrollOuter} ref={hScrollRef}>
        <div style={{ ...styles.hScrollInner, width: `${String(timelineZoom * 100)}%` }}>
          <div style={styles.rulerRow}>
            <div style={styles.rulerLabelGutter}>FRAME</div>
            <FrameRuler
              frameIn={frameIn}
              frameOut={frameOut}
              currentFrame={currentFrame}
              onScrub={(f) => designerStore.setCurrentFrame(f)}
            />
          </div>
          {elements.length === 0 ? (
            <p style={styles.empty}>No elements yet. Add a shape, text, or image to start.</p>
          ) : (
            <div role="list" style={styles.scrollBody}>
          {elements.map((el) => {
            const expanded = !isCollapsed(el.id);
            return (
              <div key={el.id}>
                <ElementRow
                  element={el}
                  expanded={expanded}
                  onToggleExpand={() => toggleCollapsed(el.id)}
                  isSelected={selection.has(el.id)}
                  frameRange={scene.frameRange}
                  lifespanColor={lifespanColorFor(el.id)}
                />
                {expanded &&
                  timelineGroupsFor(el).map((group) => {
                    const groupKey = `${el.id}::${group.title}`;
                    const groupExpanded = !isGroupCollapsed(groupKey);
                    return (
                      <div key={groupKey}>
                        <div style={styles.transformHeader}>
                          <div style={styles.transformHeaderLabel}>
                            <button
                              type="button"
                              style={styles.groupChevron}
                              onClick={() => toggleGroupCollapsed(groupKey)}
                              aria-expanded={groupExpanded}
                              aria-label={`Toggle ${group.title.toLowerCase()} tracks`}
                            >
                              {groupExpanded ? '▾' : '▸'}
                            </button>
                            <span>{group.title}</span>
                          </div>
                          <div style={styles.transformHeaderLane} />
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
                              />
                            ) : (
                              <DisplayRow
                                key={`${el.id}-${entry.row.id}`}
                                row={entry.row}
                                element={el}
                              />
                            ),
                          )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
            </div>
          )}
        </div>
      </div>
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
