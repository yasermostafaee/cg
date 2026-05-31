import { useEffect, useRef, useState } from 'react';
import type { AnimatableProperty, Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { FrameRuler } from './FrameRuler.js';
import { TIMELINE_ROWS, LABEL_COL_PX } from './keyframe-helpers.js';
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
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    margin: '0 0.75rem 0.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: '0.72rem',
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
  },
  empty: {
    padding: '0.6rem',
    color: colors.textMuted,
    fontSize: '0.72rem',
    textAlign: 'center' as const,
  },
} as const;

/**
 * Animation timeline dock (D-006). Layout mirrors the Loopic reference:
 *
 *   ┌────── header (transport + frame readout) ──────┐
 *   │ ┌── labels ──┐┌── ruler (frame 0 starts HERE)  │
 *   │ ├── Pos X ───┤│   ◆       ◆                    │
 *   │ ├── Pos Y ───┤│      ◆                         │
 *   │ └── ...      ┘└─────────────────────────────────┘
 *
 * The ruler and every lane share the same horizontal coordinate system —
 * frame N renders at the same x in the ruler and in each TrackRow lane.
 */
export function TimelineDock({
  scene,
  selection,
  currentFrame,
  selectedKeyframe,
}: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  const [playing, setPlaying] = useState(false);
  const lastWallRef = useRef<number>(0);
  const accumRef = useRef<number>(0);

  const selected: Element | null =
    selection.size === 1 ? findSingleSelected(scene, selection) : null;

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
      <div style={styles.rulerRow}>
        <div style={styles.rulerLabelGutter}>FRAME</div>
        <FrameRuler
          frameIn={frameIn}
          frameOut={frameOut}
          currentFrame={currentFrame}
          onScrub={(f) => designerStore.setCurrentFrame(f)}
        />
      </div>
      {selected === null ? (
        <p style={styles.empty}>
          {selection.size === 0
            ? 'Select an element to add keyframes.'
            : 'Select a single element to add keyframes.'}
        </p>
      ) : (
        <div role="list" onPointerDown={(e) => deselectOnLaneClick(e, selected.id)}>
          {TIMELINE_ROWS.map((row) => (
            <TrackRow
              key={row.property}
              row={row}
              element={selected}
              frameIn={frameIn}
              frameOut={frameOut}
              currentFrame={currentFrame}
              selectedKeyframe={selectedKeyframe}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function findSingleSelected(scene: Scene, selection: ReadonlySet<string>): Element | null {
  for (const layer of scene.layers) {
    for (const el of layer.children) {
      if (selection.has(el.id)) return el;
    }
  }
  return null;
}

function deselectOnLaneClick(e: React.PointerEvent<HTMLDivElement>, elementId: string): void {
  const target = e.target as HTMLElement | null;
  if (target === null) return;
  // Clicks on a diamond bubble up but we let TrackRow's own pointerdown call
  // setSelectedKeyframe first. Here we only clear when the empty lane was hit.
  if (target.dataset.role === 'lane-empty') {
    const kf = designerStore.get().selectedKeyframe;
    if (kf !== null && kf.elementId === elementId) {
      designerStore.setSelectedKeyframe(null);
    }
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
