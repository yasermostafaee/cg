import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  MonitorPlay,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Square,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { activeRangeOf, hasNextStep, hasSoundEffects, type Scene } from '@cg/shared-schema';
import { resumeCanvasSound } from '../canvas/canvasSound.js';
import { sendCanvasPlayoutCommand } from '../canvas/canvasPlayoutCommands.js';
import {
  canvasDisplayFrame,
  canvasDisplayLimitMs,
  hasAuthoredOutroMotion,
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
 * Bottom-of-canvas-column transport bar. D-199 gives it two explicit, mutually-exclusive
 * meanings: timeline authoring (start / step / Play-Pause / Preview loop / Ping-pong) and
 * lifecycle rehearsal (Play / Next / Stop). Frame readout sits on the right.
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
  const canNext = useMemo(() => hasNextStep(scene, scene.compositions), [scene]);
  useEffect(
    () => () => {
      sendCanvasPlayoutCommand('stop');
      designerStore.setTimelinePlayback(null, false);
    },
    [],
  );
  const [loopMode, setLoopMode] = useState<LoopMode>('off');
  const [playoutPreview, setPlayoutPreview] = useState(false);
  const [playoutStopping, setPlayoutStopping] = useState(false);
  const playoutPreviewRef = useRef(false);
  playoutPreviewRef.current = playoutPreview;
  const previousSceneIdRef = useRef(scene.id);
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

  // The switch is Preview-only. A composition change cannot inherit a running rehearsal or a
  // hidden authoring-loop selection from the document that was previously open.
  useEffect(() => {
    if (previousSceneIdRef.current === scene.id) return;
    previousSceneIdRef.current = scene.id;
    sendCanvasPlayoutCommand('stop');
    designerStore.setTimelinePlayback(null, false);
    designerStore.setCurrentFrame(frameIn);
    setLoopMode('off');
    setPlayoutStopping(false);
    setPlayoutPreview(false);
    playoutPreviewRef.current = false;
  }, [frameIn, scene.id]);

  // Advance currentFrame at scene.frameRate for the explicit authoring PLAYHEAD path (ordinary
  // forward Play, reverse, Preview loop and ping-pong). D-199 reserves the runtime lifecycle for
  // the explicit Rehearse control group; CanvasArea reflects that runtime's root frame into
  // this same store instead.
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
  const authoredStopOutro = useMemo(() => hasAuthoredOutroMotion(scene), [scene]);

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

  // A content-driven root can hold its reported frame at Out point while its coordinated Outro
  // is visibly running, then publish only the final frame. Drive the authoring cursor across the
  // same authored Outro span so the timeline does not wait until the picture is already closed.
  useEffect(() => {
    if (!playoutStopping || playbackMode !== 'lifecycle' || !authoredStopOutro) return;
    const outPoint = scene.lifecycle?.outPoint ?? frameOut;
    const startFrame = Math.max(
      frameIn,
      Math.min(frameOut, Math.max(outPoint, designerStore.get().currentFrame)),
    );
    const startedAt = performance.now();
    let raf = 0;
    designerStore.setCurrentFrame(startFrame);
    const tick = (now: number): void => {
      const elapsedFrames = Math.floor(((now - startedAt) / 1000) * scene.frameRate);
      const next = Math.min(frameOut, startFrame + elapsedFrames);
      designerStore.setCurrentFrame(next);
      if (next < frameOut) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    authoredStopOutro,
    frameIn,
    frameOut,
    playbackMode,
    playoutStopping,
    scene.frameRate,
    scene.lifecycle?.outPoint,
  ]);

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
    const state = designerStore.get();
    // D-199 — ordinary forward Play is a fresh, linear authoring pass. Paused playhead playback
    // resumes in place; a settled/new pass starts at the active range boundary.
    if (dir === 1 && state.timelinePlaybackMode !== 'playhead') {
      designerStore.setCurrentFrame(frameIn);
    }
    designerStore.setTimelinePlayback('playhead', true);
  }

  function playPlayout(): void {
    const state = designerStore.get();
    if (state.timelinePlaybackMode === 'lifecycle' && state.timelinePlaying) return;
    resumeCanvasSound();
    setPlayoutStopping(false);
    if (state.timelinePlaybackMode !== 'lifecycle') {
      lifecycleDisplayElapsedRef.current = 0;
      lifecycleDisplayWallRef.current = 0;
      designerStore.setCurrentFrame(frameIn);
    }
    designerStore.setTimelinePlayback('lifecycle', true);
  }

  function stopPlayout(): void {
    // Pause the normal lifecycle display without sending Pause to the iframe. A real authored
    // Outro gets the dedicated stop clock above; an immediate-clear scene settles deterministically
    // at frameOut instead of racing Runtime completion by a handful of frames.
    if (sendCanvasPlayoutCommand('stop')) {
      setPlayoutStopping(true);
      if (!authoredStopOutro) designerStore.setCurrentFrame(frameOut);
      designerStore.setTimelinePlayback('lifecycle', false);
    }
  }

  function togglePlayoutPreview(): void {
    const leavingRehearse = playoutPreviewRef.current;
    if (leavingRehearse) sendCanvasPlayoutCommand('restore-authoring');
    lifecycleDisplayElapsedRef.current = 0;
    lifecycleDisplayWallRef.current = 0;
    designerStore.setTimelinePlayback(null, false);
    designerStore.setCurrentFrame(frameIn);
    setLoopMode('off');
    setPlayoutStopping(false);
    const next = !playoutPreviewRef.current;
    playoutPreviewRef.current = next;
    setPlayoutPreview(next);
  }

  function pausePlayback(): void {
    const currentMode = designerStore.get().timelinePlaybackMode;
    if (currentMode !== null) designerStore.setTimelinePlayback(currentMode, false);
  }

  function leavePlaybackAt(frame: number): void {
    designerStore.setTimelinePlayback(null, false);
    designerStore.setCurrentFrame(frame);
  }

  function togglePlayback(): void {
    const state = designerStore.get();
    if (playoutPreviewRef.current) {
      if (state.timelinePlaybackMode !== 'lifecycle') playPlayout();
      else if (!playoutStopping) stopPlayout();
    } else if (state.timelinePlaying) {
      pausePlayback();
    } else {
      playDir(1);
    }
  }
  // Keep the window listener on the current transport handlers as the authored Outro changes.
  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;

  // Space toggles the active transport. J / K / L remain authoring-only: L = play forward,
  // J = play backward, K = pause. Holding K turns L/J into single-frame steps.
  useEffect(() => {
    function isEditable(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (e.code === 'Space') {
        if (e.shiftKey || e.isComposing) return;
        if (
          (e.target instanceof Element &&
            e.target.closest('button, [role="button"], [role="menuitem"], summary, a[href]') !==
              null) ||
          document.querySelector(
            '[role="dialog"][aria-modal="true"], [role="menu"], [data-cg-popover]',
          ) !== null
        ) {
          return;
        }
        e.preventDefault();
        if (!e.repeat) togglePlaybackRef.current();
        return;
      }
      // D-199 — hidden authoring controls have no secret keyboard route in Rehearse preview.
      if (playoutPreviewRef.current) return;
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
  }, [frameIn]);

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
        {playoutPreview ? (
          <>
            <Button
              variant="bare"
              className={btnClass('playout-play')}
              {...hoverProps('playout-play')}
              onClick={playPlayout}
              disabled={playbackMode === 'lifecycle'}
              aria-label="Play"
              title="Play"
            >
              <Icon icon={Play} size={19} className={s.icon} />
              Play
            </Button>
            <Button
              variant="bare"
              className={btnClass('playout-next')}
              {...hoverProps('playout-next')}
              onClick={() => {
                if (canNext) sendCanvasPlayoutCommand('next');
              }}
              disabled={!canNext}
              aria-label="Next"
              title="Next"
            >
              <Icon icon={SkipForward} size={17} className={s.icon} />
              Next
            </Button>
            <Button
              variant="bare"
              className={btnClass('playout-stop')}
              {...hoverProps('playout-stop')}
              onClick={stopPlayout}
              disabled={playbackMode !== 'lifecycle' || playoutStopping}
              aria-label="Stop"
              title="Stop and clear"
            >
              <Icon icon={Square} size={17} className={s.icon} />
              Stop
            </Button>
          </>
        ) : (
          <>
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
              onClick={togglePlayback}
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
              aria-label="Preview loop"
              title="Preview loop"
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
              title="Ping-pong"
            >
              <Icon icon={ArrowLeftRight} size={17} className={s.icon} />
            </Button>
          </>
        )}
        <span className={s.groupDivider} aria-hidden />
        <Button
          variant="bare"
          className={btnClass('playout', playoutPreview)}
          {...hoverProps('playout')}
          onClick={(event) => {
            togglePlayoutPreview();
            // Pointer users can press the transport shortcut immediately after choosing its mode.
            // Keyboard users keep focus on the toggle for its native activation and tab order.
            if (event.detail > 0) event.currentTarget.blur();
          }}
          aria-pressed={playoutPreview}
          aria-label="Rehearse preview"
          title="Rehearse preview"
        >
          <Icon icon={MonitorPlay} size={17} className={s.icon} />
          Rehearse
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
