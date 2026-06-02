import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  scene: Scene;
  currentFrame: number;
}

const styles = {
  bar: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.3rem 0.75rem',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    fontSize: '0.74rem',
    flexShrink: 0,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    gridColumn: 2,
  },
  spacer: { flex: 1 },
  button: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    fontSize: '0.78rem',
    padding: '0.12rem 0.55rem',
    cursor: 'pointer',
  },
  buttonPrimary: {
    background: colors.accent,
    color: '#000',
    border: `1px solid ${colors.accentMuted}`,
    borderRadius: '0.18rem',
    fontSize: '0.78rem',
    padding: '0.12rem 0.65rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  frameReadout: {
    color: colors.textMuted,
    fontSize: '0.72rem',
    fontVariantNumeric: 'tabular-nums' as const,
    paddingLeft: '0.5rem',
    justifySelf: 'end' as const,
    gridColumn: 3,
  },
} as const;

/**
 * Bottom-of-window transport bar — go-to-start / step back / play-pause /
 * stop / step forward, plus a frame readout. Lifted out of the
 * timeline header (D-009) so the playback controls have a dedicated
 * row that the operator can reach without scanning past the
 * timeline's per-element tree.
 */
export function TransportBar({ scene, currentFrame }: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  const [playing, setPlaying] = useState(false);
  const lastWallRef = useRef<number>(0);
  const accumRef = useRef<number>(0);

  // Advance currentFrame at scene.frameRate while playing. The
  // tick reads the latest currentFrame from the store rather than
  // closing over a stale prop, so React re-renders never reset the
  // playhead mid-loop.
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

  return (
    <div style={styles.bar} aria-label="Playback transport">
      <div style={styles.group}>
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
          title={playing ? 'Pause' : 'Play'}
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
      </div>
      <span style={styles.frameReadout} aria-label="Current frame">
        frame {currentFrame} / {frameOut}
      </span>
    </div>
  );
}
