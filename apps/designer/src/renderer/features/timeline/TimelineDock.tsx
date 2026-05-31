import { useEffect, useRef, useState } from 'react';
import type { Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { FrameRuler } from './FrameRuler.js';
import { TIMELINE_ROWS } from './keyframe-helpers.js';
import { TrackRow } from './TrackRow.js';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
  currentFrame: number;
}

const styles = {
  dock: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    margin: '0 0.75rem 0.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: '0.8rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.35rem 0.5rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontWeight: 700,
    color: colors.textMuted,
    fontSize: '0.74rem',
    letterSpacing: '0.05em',
    marginRight: '0.5rem',
  },
  button: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    fontSize: '0.78rem',
    padding: '0.15rem 0.45rem',
    cursor: 'pointer',
  },
  buttonPrimary: {
    background: colors.accent,
    color: '#000',
    border: `1px solid ${colors.accentMuted}`,
    borderRadius: '0.2rem',
    fontSize: '0.78rem',
    padding: '0.15rem 0.5rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  frameReadout: {
    marginLeft: 'auto',
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  empty: {
    padding: '1rem',
    color: colors.textMuted,
    fontSize: '0.82rem',
    textAlign: 'center' as const,
  },
} as const;

/**
 * Animation timeline dock for D-006. Renders a frame ruler + transport at
 * the top and one track row per animatable property of the single selected
 * element. When the selection size ≠ 1, only the ruler/transport show.
 */
export function TimelineDock({ scene, selection, currentFrame }: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  const [playing, setPlaying] = useState(false);
  const [selectedKey, setSelectedKey] = useState<{ property: string; frame: number } | null>(null);
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
    if (selectedKey === null || selected === null) return;
    function onKey(e: KeyboardEvent): void {
      if (selected === null || selectedKey === null) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEditableTarget(e.target)) return;
      designerStore.removeKeyframe(
        selected.id,
        selectedKey.property as Parameters<typeof designerStore.removeKeyframe>[1],
        selectedKey.frame,
      );
      setSelectedKey(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey, selected]);

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
      <FrameRuler
        frameIn={frameIn}
        frameOut={frameOut}
        currentFrame={currentFrame}
        onScrub={(f) => designerStore.setCurrentFrame(f)}
      />
      {selected === null ? (
        <p style={styles.empty}>
          {selection.size === 0
            ? 'Select an element to add keyframes.'
            : 'Select a single element to add keyframes.'}
        </p>
      ) : (
        <div role="list">
          {TIMELINE_ROWS.map((row) => (
            <TrackRow
              key={row.property}
              row={row}
              element={selected}
              frameIn={frameIn}
              frameOut={frameOut}
              currentFrame={currentFrame}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
