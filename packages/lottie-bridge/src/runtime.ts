import lottie, { type AnimationItem } from 'lottie-web';

/**
 * Subset of the LottieElement.loopMode enum from `@cg/shared-schema`.
 * Kept local so this package doesn't pull the full schema at runtime.
 */
export type LottieLoopMode = 'none' | 'loop' | 'bounce';

export interface LottiePlayerOptions {
  /** Playback speed multiplier (default 1.0). */
  speed?: number;
  /** Default `'loop'`. `'bounce'` toggles direction on each complete. */
  loopMode?: LottieLoopMode;
  /** Optional [in, out] frame range to play within. */
  segment?: readonly [number, number];
  /** Auto-play on creation. Default `false` — caller drives `play()`. */
  autoplay?: boolean;
}

/**
 * The handle returned by `createLottiePlayer`. Lifecycle methods are
 * idempotent — calling `destroy()` more than once is safe.
 */
export interface LottiePlayerHandle {
  readonly element: HTMLElement;
  play(): void;
  pause(): void;
  stop(): void;
  destroy(): void;
  goToFrame(frame: number): void;
  /** True while a Lottie animation is loaded and not destroyed. */
  readonly isAlive: boolean;
}

/**
 * Render a Lottie animation into `container`. `data` is the parsed JSON
 * exported from Bodymovin/After Effects (or a path-loaded URL — see
 * `path` overload below).
 *
 * Notes / constraints:
 *  - Renderer is fixed to `'svg'` for now. Canvas/HTML renderers are
 *    deferred until we have a real use case for them.
 *  - `bounce` is implemented locally (lottie-web has no built-in toggle).
 *  - `fieldOverrides` (text / color replacement at runtime) is M8.
 */
export function createLottiePlayer(
  container: HTMLElement,
  data: unknown,
  options: LottiePlayerOptions = {},
): LottiePlayerHandle {
  const loopMode = options.loopMode ?? 'loop';
  const autoplay = options.autoplay ?? false;

  const anim: AnimationItem = lottie.loadAnimation({
    container,
    renderer: 'svg',
    // lottie-web treats `loop: true` as infinite; `'bounce'` we manage manually.
    loop: loopMode === 'loop',
    autoplay,
    animationData: data,
  });

  if (options.speed !== undefined) anim.setSpeed(options.speed);

  if (options.segment) {
    // Reset to the segment range. `playSegments(_, true)` forces the player
    // to restrict its in/out points; we set autoplay=false above so this
    // doesn't actually start playback.
    anim.playSegments([options.segment[0], options.segment[1]], true);
    if (!autoplay) anim.pause();
  }

  let bounceListener: (() => void) | null = null;
  if (loopMode === 'bounce') {
    bounceListener = () => {
      anim.setDirection(anim.playDirection === 1 ? -1 : 1);
      anim.play();
    };
    anim.addEventListener('complete', bounceListener);
  }

  let destroyed = false;

  return {
    element: container,
    play() {
      if (destroyed) return;
      anim.play();
    },
    pause() {
      if (destroyed) return;
      anim.pause();
    },
    stop() {
      if (destroyed) return;
      anim.stop();
    },
    goToFrame(frame: number) {
      if (destroyed) return;
      anim.goToAndStop(frame, true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (bounceListener) {
        anim.removeEventListener('complete', bounceListener);
        bounceListener = null;
      }
      anim.destroy();
    },
    get isAlive() {
      return !destroyed;
    },
  };
}
