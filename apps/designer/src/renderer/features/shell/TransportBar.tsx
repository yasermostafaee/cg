import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  scene: Scene;
  currentFrame: number;
}

type LoopMode = 'off' | 'loop' | 'bounce';

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
  groupDivider: {
    width: 1,
    height: 14,
    background: colors.border,
    margin: '0 0.25rem',
  },
  button: {
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    fontSize: '0.78rem',
    padding: '0.12rem 0.55rem',
    cursor: 'pointer',
    lineHeight: 1.2,
  },
  buttonActive: {
    background: 'transparent',
    color: colors.accent,
    border: `1px solid ${colors.accent}`,
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
 * Bottom-of-canvas-column transport bar — go-to-start / step back /
 * play-pause / step forward, then a loop toggle and a bounce
 * (ping-pong) toggle. Frame readout sits on the right. The loop
 * modes are mutually exclusive; whichever the operator activates,
 * the other turns off so the playback behaviour is unambiguous.
 *
 *   off    → play to frameOut, then stop
 *   loop   → wrap to frameIn at frameOut
 *   bounce → reverse direction at every boundary
 */
export function TransportBar({ scene, currentFrame }: Props): JSX.Element {
  const { in: frameIn, out: frameOut } = scene.frameRange;
  const [playing, setPlaying] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>('off');
  const lastWallRef = useRef<number>(0);
  const accumRef = useRef<number>(0);
  const directionRef = useRef<1 | -1>(1);
  // `loopMode` changes mid-playback need to be visible to the running
  // rAF tick without restarting it (restart resets the accumulator
  // and visibly jitters). A ref carries the latest value across renders.
  const loopModeRef = useRef<LoopMode>(loopMode);
  loopModeRef.current = loopMode;

  // Advance currentFrame at scene.frameRate while playing. The tick
  // reads the latest currentFrame from the store rather than closing
  // over a stale prop, so React re-renders never reset the playhead
  // mid-loop.
  useEffect(() => {
    if (!playing) return;
    directionRef.current = 1;
    let raf = 0;
    const tick = (now: number): void => {
      const prev = lastWallRef.current === 0 ? now : lastWallRef.current;
      lastWallRef.current = now;
      const dt = now - prev;
      accumRef.current += dt;
      const frameDurMs = 1000 / scene.frameRate;
      let next = designerStore.get().currentFrame;
      let stop = false;
      while (accumRef.current >= frameDurMs && !stop) {
        accumRef.current -= frameDurMs;
        next += directionRef.current;
        if (next > frameOut) {
          if (loopModeRef.current === 'loop') {
            next = frameIn;
          } else if (loopModeRef.current === 'bounce') {
            directionRef.current = -1;
            next = frameOut - 1 < frameIn ? frameIn : frameOut - 1;
          } else {
            next = frameOut;
            stop = true;
          }
        } else if (next < frameIn) {
          if (loopModeRef.current === 'bounce') {
            directionRef.current = 1;
            next = frameIn + 1 > frameOut ? frameOut : frameIn + 1;
          } else {
            next = frameIn;
          }
        }
      }
      designerStore.setCurrentFrame(next);
      if (stop) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastWallRef.current = 0;
      accumRef.current = 0;
    };
  }, [playing, scene.frameRate, frameIn, frameOut]);

  function toggleLoop(mode: 'loop' | 'bounce'): void {
    setLoopMode((m) => (m === mode ? 'off' : mode));
  }

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
          style={styles.button}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
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
        <span style={styles.groupDivider} aria-hidden />
        <button
          type="button"
          style={loopMode === 'loop' ? { ...styles.button, ...styles.buttonActive } : styles.button}
          onClick={() => toggleLoop('loop')}
          aria-pressed={loopMode === 'loop'}
          aria-label="Loop"
          title="Loop — wrap to start at the end"
        >
          ∞
        </button>
        <button
          type="button"
          style={loopMode === 'bounce' ? { ...styles.button, ...styles.buttonActive } : styles.button}
          onClick={() => toggleLoop('bounce')}
          aria-pressed={loopMode === 'bounce'}
          aria-label="Ping-pong"
          title="Ping-pong — reverse direction at each boundary"
        >
          ⇄
        </button>
      </div>
      <span style={styles.frameReadout} aria-label="Current frame">
        frame {currentFrame} / {frameOut}
      </span>
    </div>
  );
}
