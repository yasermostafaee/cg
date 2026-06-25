import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Pause, Play, Repeat, SkipBack, StepBack, StepForward } from 'lucide-react';
import { activeRangeOf, type Scene } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './TransportBar.css.js';

interface Props {
  scene: Scene;
}

type LoopMode = 'off' | 'loop' | 'bounce';

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
        <Button
          variant="bare"
          className={btnClass('start')}
          {...hoverProps('start')}
          onClick={() => designerStore.setCurrentFrame(frameIn)}
          aria-label="Go to start"
          title="Go to start"
        >
          <Icon icon={SkipBack} size={17} className={s.icon} />
        </Button>
        <Button
          variant="bare"
          className={btnClass('back')}
          {...hoverProps('back')}
          onClick={() => designerStore.setCurrentFrame(currentFrame - 1)}
          aria-label="Step back"
          title="Step back one frame"
        >
          <Icon icon={StepBack} size={17} className={s.icon} />
        </Button>
        <Button
          variant="bare"
          className={btnClass('play')}
          {...hoverProps('play')}
          onClick={() => {
            if (playing) setPlaying(false);
            else playDir(1);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
        >
          <Icon icon={playing ? Pause : Play} size={22} className={s.icon} />
        </Button>
        <Button
          variant="bare"
          className={btnClass('fwd')}
          {...hoverProps('fwd')}
          onClick={() => designerStore.setCurrentFrame(currentFrame + 1)}
          aria-label="Step forward"
          title="Step forward one frame"
        >
          <Icon icon={StepForward} size={17} className={s.icon} />
        </Button>
        <span className={s.groupDivider} aria-hidden />
        <Button
          variant="bare"
          className={btnClass('loop', loopMode === 'loop')}
          {...hoverProps('loop')}
          onClick={() => toggleLoop('loop')}
          aria-pressed={loopMode === 'loop'}
          aria-label="Loop"
          title="Loop — wrap to start at the end"
        >
          <Icon icon={Repeat} size={17} className={s.icon} />
        </Button>
        <Button
          variant="bare"
          className={btnClass('bounce', loopMode === 'bounce')}
          {...hoverProps('bounce')}
          onClick={() => toggleLoop('bounce')}
          aria-pressed={loopMode === 'bounce'}
          aria-label="Ping-pong"
          title="Ping-pong — reverse direction at each boundary"
        >
          <Icon icon={ArrowLeftRight} size={17} className={s.icon} />
        </Button>
      </div>
      <span className={s.frameReadout} aria-label="Current frame">
        frame {currentFrame} / {totalOut}
      </span>
    </div>
  );
}
