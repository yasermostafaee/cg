import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Pause,
  Play,
  Repeat,
  SkipBack,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { activeRangeOf, hasSoundEffects, type Scene } from '@cg/shared-schema';
import { resumeCanvasSound } from '../canvas/canvasSound.js';
import {
  canvasDisplayFrame,
  canvasDisplayLimitMs,
  rootUsesAuthoredFrameClock,
} from '../fields/preview-elapsed.js';
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
 *
 * D-133 §3.4 — this loop is the PREVIEW's and is labelled "Preview loop": it wraps the
 * EDITOR playhead over the ruler and is stored nowhere, so it never reaches air. The
 * other two loops in this app are the `loop-cycle` playout MODE (repeats the whole
 * in → hold → out) and the Playout panel's HOLD LOOP (replays
 * `[content start → out point]` during a content-driven hold). All three can be true of
 * one composition simultaneously, so none of them is called plain "loop".
 */
export function TransportBar({ scene }: Props): JSX.Element {
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  const playing = useDesignerSelector((s) => s.timelinePlaying);
  const playbackMode = useDesignerSelector((s) => s.timelinePlaybackMode);
  // Playback is bounded by the active region (the resized scene bar), while
  // the readout keeps showing the scene's full total so the operator still
  // sees the kept frame count.
  const { in: frameIn, out: frameOut } = activeRangeOf(scene);
  const totalOut = scene.frameRange.out;
  /*
    DELTA-RUN-NEXT-VERSION-01-G — Play on the timeline plays the sounds at their places (the canvas
    page auditions them); scrubbing and stepping stay silent. The store carries "playing" to the
    canvas, and the ONE sound switch the Preview shares.
  */
  const soundMuted = useDesignerSelector((st) => st.soundMuted);
  const hasSound = useMemo(() => hasSoundEffects(scene, scene.compositions), [scene]);
  useEffect(() => () => designerStore.setTimelinePlayback(null, false), []);
  const [loopMode, setLoopMode] = useState<LoopMode>('off');
  const [hovered, setHovered] = useState<string | null>(null);
  const lastWallRef = useRef<number>(0);
  const accumRef = useRef<number>(0);
  const lifecycleDisplayElapsedRef = useRef<number>(0);
  const lifecycleDisplayWallRef = useRef<number>(0);
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

  // Advance currentFrame at scene.frameRate only for the explicit PLAYHEAD path (reverse,
  // Preview loop, ping-pong). D-175 ordinary forward Play is owned by the runtime lifecycle;
  // CanvasArea reflects the runtime's root frame into this same store instead.
  // reads the latest currentFrame from the store rather than closing
  // over a stale prop, so React re-renders never reset the playhead
  // mid-loop.
  useEffect(() => {
    if (!playing || playbackMode !== 'playhead') return;
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
        designerStore.setTimelinePlayback(null, false);
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
  }, [playing, playbackMode, scene.frameRate, frameIn, frameOut]);

  const authoredLifecycleClock = useMemo(() => rootUsesAuthoredFrameClock(scene), [scene]);
  const authoredLifecycleLimitMs = useMemo(() => canvasDisplayLimitMs(scene), [scene]);

  // B-380 — Runtime intentionally paints an empty/static leg only at its boundaries. Keep that
  // optimisation, but do not expose it as an instantaneous jump in the authoring timeline. This
  // display-only clock changes `currentFrame`; CanvasArea marks those updates runtime-owned, so no
  // scrub/tick is fed back into the lifecycle controller.
  useEffect(() => {
    if (playbackMode !== 'lifecycle') {
      lifecycleDisplayElapsedRef.current = 0;
      lifecycleDisplayWallRef.current = 0;
      return;
    }
    if (!playing || !authoredLifecycleClock) {
      lifecycleDisplayWallRef.current = 0;
      return;
    }

    let raf = 0;
    const tick = (now: number): void => {
      const previous = lifecycleDisplayWallRef.current;
      lifecycleDisplayWallRef.current = now;
      if (previous !== 0) lifecycleDisplayElapsedRef.current += now - previous;
      designerStore.setCurrentFrame(
        canvasDisplayFrame(
          scene,
          designerStore.get().currentFrame,
          lifecycleDisplayElapsedRef.current,
        ),
      );
      if (
        authoredLifecycleLimitMs !== null &&
        lifecycleDisplayElapsedRef.current >= authoredLifecycleLimitMs
      ) {
        designerStore.setCurrentFrame(frameOut);
        designerStore.setTimelinePlayback(null, false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lifecycleDisplayWallRef.current = 0;
    };
  }, [authoredLifecycleClock, authoredLifecycleLimitMs, frameOut, playbackMode, playing, scene]);

  function toggleLoop(mode: 'loop' | 'bounce'): void {
    setLoopMode((m) => (m === mode ? 'off' : mode));
    // Preserve the shipped mid-play toggle: enabling either authoring mode immediately hands the
    // visible playhead back to the rAF path. The iframe tears down the active lifecycle on the first
    // ensuing non-runtime scrub, so content drivers are not reset by each wrap.
    if (designerStore.get().timelinePlaying) {
      designerStore.setTimelinePlayback('playhead', true);
    }
  }

  function playDir(dir: 1 | -1): void {
    playDirRef.current = dir;
    // Inside the user's gesture: make the canvas page's sound output run before any sound plays.
    resumeCanvasSound();
    const mode: 'lifecycle' | 'playhead' =
      dir === 1 && loopModeRef.current === 'off' ? 'lifecycle' : 'playhead';
    const previousMode = designerStore.get().timelinePlaybackMode;
    if (mode === 'lifecycle' && previousMode !== 'lifecycle' && authoredLifecycleClock) {
      lifecycleDisplayElapsedRef.current = 0;
      lifecycleDisplayWallRef.current = 0;
      designerStore.setCurrentFrame(frameIn);
    }
    designerStore.setTimelinePlayback(mode, true);
  }

  function pausePlayback(): void {
    const currentMode = designerStore.get().timelinePlaybackMode;
    if (currentMode !== null) designerStore.setTimelinePlayback(currentMode, false);
  }

  function leavePlaybackAt(frame: number): void {
    designerStore.setTimelinePlayback(null, false);
    designerStore.setCurrentFrame(frame);
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
        pausePlayback();
      } else if (k === 'KeyL') {
        if (kHeldRef.current) {
          leavePlaybackAt(designerStore.get().currentFrame + 1);
        } else {
          playDir(1);
        }
      } else if (k === 'KeyJ') {
        if (kHeldRef.current) {
          leavePlaybackAt(designerStore.get().currentFrame - 1);
        } else {
          playDir(-1);
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
          onClick={() => leavePlaybackAt(frameIn)}
          aria-label="Go to start"
          title="Go to start"
        >
          <Icon icon={SkipBack} size={17} className={s.icon} />
        </Button>
        <Button
          variant="bare"
          className={btnClass('back')}
          {...hoverProps('back')}
          onClick={() => leavePlaybackAt(currentFrame - 1)}
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
            if (playing) pausePlayback();
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
          onClick={() => leavePlaybackAt(currentFrame + 1)}
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
          // D-133 §3.4 — NOT plain "Loop": three different loops can be true of one
          // composition at once (this EDITOR-only playhead wrap, the `loop-cycle` playout
          // mode, and the Playout panel's hold loop `[content start → out point]`), and the
          // spec requires them to be distinguishable on the surface. This one is the
          // preview's, and it never leaves the editor.
          aria-label="Preview loop"
          title="Preview loop — wrap the editor playhead to the start at the end (preview only; not the composition's playout)"
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
        {hasSound && (
          <>
            <span className={s.groupDivider} aria-hidden />
            <Button
              variant="bare"
              className={btnClass('sound', !soundMuted)}
              {...hoverProps('sound')}
              onClick={() => designerStore.setSoundMuted(!soundMuted)}
              aria-pressed={!soundMuted}
              data-testid="transport-sound"
              title="Sound — the timeline and the Preview share this switch"
            >
              <Icon icon={soundMuted ? VolumeX : Volume2} size={17} className={s.icon} />
              {soundMuted ? 'Sound off' : 'Sound on'}
            </Button>
          </>
        )}
      </div>
      <span className={s.frameReadout} aria-label="Current frame">
        frame {currentFrame} / {totalOut}
      </span>
    </div>
  );
}
