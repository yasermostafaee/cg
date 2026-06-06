import { useEffect, useRef, useState } from 'react';
import { activeRangeOf, type Scene } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { cx } from '../../cx.js';
import * as s from './TransportBar.css.js';

interface Props {
  scene: Scene;
}

type LoopMode = 'off' | 'loop' | 'bounce';

/**
 * One consistent, monochrome transport icon set drawn inline as SVG so they all
 * share a single style and inherit the button colour via `currentColor` (no
 * font-emoji glyphs, which render coloured / mismatched). 24×24 viewBox.
 */
function ic(children: JSX.Element, size = 17): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={s.icon}
    >
      {children}
    </svg>
  );
}
const IconStart = ic(
  <>
    <rect x="4" y="5" width="2.4" height="14" rx="0.6" fill="currentColor" />
    <path d="M14 5v14l-7-7z" fill="currentColor" />
    <path d="M21 5v14l-7-7z" fill="currentColor" />
  </>,
);
const IconStepBack = ic(
  <>
    <rect x="5" y="5" width="2.6" height="14" rx="0.6" fill="currentColor" />
    <path d="M20 5v14l-10.5-7z" fill="currentColor" />
  </>,
);
// Play / pause render a touch larger so the primary control stands out.
const IconPlay = ic(<path d="M8 5v14l11-7z" fill="currentColor" />, 22);
const IconPause = ic(
  <>
    <rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor" />
  </>,
  22,
);
const IconStepFwd = ic(
  <>
    <path d="M5 5v14l10-7z" fill="currentColor" />
    <rect x="16.4" y="5" width="2.6" height="14" rx="0.6" fill="currentColor" />
  </>,
);
const IconLoop = ic(
  <path
    d="M7 8a4 4 0 1 0 0 8c2 0 3-1.5 5-4s3-4 5-4a4 4 0 1 1 0 8c-2 0-3-1.5-5-4s-3-4-5-4z"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
);
const IconBounce = ic(
  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h14M15 6l3 3-3 3" />
    <path d="M20 15H6M9 12l-3 3 3 3" />
  </g>,
);

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
export function TransportBar({ scene }: Props): JSX.Element {
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  // Playback is bounded by the active region (the resized scene bar), while
  // the readout keeps showing the scene's full total so the operator still
  // sees the kept frame count.
  const { in: frameIn, out: frameOut } = activeRangeOf(scene);
  const totalOut = scene.frameRange.out;
  const [playing, setPlaying] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>('off');
  const [hovered, setHovered] = useState<string | null>(null);
  const lastWallRef = useRef<number>(0);
  const accumRef = useRef<number>(0);
  const directionRef = useRef<1 | -1>(1);
  // Direction the current play was started in (L = forward, J = backward), so
  // the rAF loop doesn't always reset to forward.
  const playDirRef = useRef<1 | -1>(1);
  // True while K is held — turns L/J into single-frame steps (J/K/L editing).
  const kHeldRef = useRef(false);
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
    directionRef.current = playDirRef.current;
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
          if (loopModeRef.current === 'loop') {
            next = frameOut;
          } else if (loopModeRef.current === 'bounce') {
            directionRef.current = 1;
            next = frameIn + 1 > frameOut ? frameOut : frameIn + 1;
          } else {
            next = frameIn;
            stop = true;
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

  function playDir(dir: 1 | -1): void {
    playDirRef.current = dir;
    setPlaying(true);
  }

  // J / K / L transport (video-editor convention): L = play forward, J = play
  // backward, K = stop. Holding K turns L/J into single-frame steps
  // (K+L = next frame, K+J = previous frame). Ignored while typing.
  useEffect(() => {
    function isEditable(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      // Match the physical key (e.code) so J/K/L work on non-English layouts.
      const k = e.code;
      if (k === 'KeyK') {
        kHeldRef.current = true;
        setPlaying(false);
      } else if (k === 'KeyL') {
        if (kHeldRef.current) {
          setPlaying(false);
          designerStore.setCurrentFrame(designerStore.get().currentFrame + 1);
        } else {
          playDirRef.current = 1;
          setPlaying(true);
        }
      } else if (k === 'KeyJ') {
        if (kHeldRef.current) {
          setPlaying(false);
          designerStore.setCurrentFrame(designerStore.get().currentFrame - 1);
        } else {
          playDirRef.current = -1;
          setPlaying(true);
        }
      } else {
        return;
      }
      e.preventDefault();
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'KeyK') kHeldRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function btnClass(id: string, active = false): string {
    return cx(s.button, hovered === id && !active && s.buttonHover, active && s.buttonActive);
  }
  function hoverProps(id: string): {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  } {
    return {
      onMouseEnter: () => setHovered(id),
      onMouseLeave: () => setHovered((h) => (h === id ? null : h)),
    };
  }

  return (
    <div className={s.bar} aria-label="Playback transport">
      <div className={s.group}>
        <button
          type="button"
          className={btnClass('start')}
          {...hoverProps('start')}
          onClick={() => designerStore.setCurrentFrame(frameIn)}
          aria-label="Go to start"
          title="Go to start"
        >
          {IconStart}
        </button>
        <button
          type="button"
          className={btnClass('back')}
          {...hoverProps('back')}
          onClick={() => designerStore.setCurrentFrame(currentFrame - 1)}
          aria-label="Step back"
          title="Step back one frame"
        >
          {IconStepBack}
        </button>
        <button
          type="button"
          className={btnClass('play')}
          {...hoverProps('play')}
          onClick={() => {
            if (playing) setPlaying(false);
            else playDir(1);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? IconPause : IconPlay}
        </button>
        <button
          type="button"
          className={btnClass('fwd')}
          {...hoverProps('fwd')}
          onClick={() => designerStore.setCurrentFrame(currentFrame + 1)}
          aria-label="Step forward"
          title="Step forward one frame"
        >
          {IconStepFwd}
        </button>
        <span className={s.groupDivider} aria-hidden />
        <button
          type="button"
          className={btnClass('loop', loopMode === 'loop')}
          {...hoverProps('loop')}
          onClick={() => toggleLoop('loop')}
          aria-pressed={loopMode === 'loop'}
          aria-label="Loop"
          title="Loop — wrap to start at the end"
        >
          {IconLoop}
        </button>
        <button
          type="button"
          className={btnClass('bounce', loopMode === 'bounce')}
          {...hoverProps('bounce')}
          onClick={() => toggleLoop('bounce')}
          aria-pressed={loopMode === 'bounce'}
          aria-label="Ping-pong"
          title="Ping-pong — reverse direction at each boundary"
        >
          {IconBounce}
        </button>
      </div>
      <span className={s.frameReadout} aria-label="Current frame">
        frame {currentFrame} / {totalOut}
      </span>
    </div>
  );
}
