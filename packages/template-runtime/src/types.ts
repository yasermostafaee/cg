import type { Element, ElementAnimation, FieldValues, Scene } from '@cg/shared-schema';

/**
 * Lifecycle events emitted by the runtime. Subscribers attach via
 * `runtime.on(event, cb)` and may unsubscribe via the returned cleanup fn.
 */
export type LifecycleEvent =
  | 'ready'
  | 'play.start'
  | 'play.end'
  | 'update'
  | 'stop.start'
  | 'stop.end'
  | 'error';

export interface ErrorEvent {
  code: string;
  message: string;
  elementId?: string;
}

export type EventListener<E extends LifecycleEvent> = (
  payload: E extends 'error' ? ErrorEvent : void,
) => void;

/**
 * The contract a broadcast HTML template exposes. Lives on `window.cg`
 * inside the .vcg's index.html. Phase 4 §1.1.
 */
export interface TemplateRuntime {
  /** Resolves when fonts, assets, and DOM setup are complete. */
  readonly ready: Promise<void>;

  /**
   * Play the entry animation. In M3.2-α this is a no-op transition —
   * the body's `cg-pending` class is removed and the runtime moves to
   * `on-air`. GSAP animation lands in M3.2-β.
   */
  play(data: FieldValues, opts?: PlayOptions): Promise<void>;

  /**
   * Apply new field values. Default mode is `merge` — only the keys
   * present in `data` are updated. `replace` clears any field that's
   * absent from `data` back to its declared default.
   */
  update(data: Partial<FieldValues>, opts?: UpdateOptions): Promise<void>;

  /** Play the exit animation. Stub for M3.2-α — instant transition. */
  stop(opts?: StopOptions): Promise<void>;

  /**
   * D-020 — freeze playback at the current frame (intro, hold, or outro). The
   * timing orchestrator (auto-out / loop-cycle) is paused too. No args, so a
   * future `CG INVOKE "pause"` can reach it.
   */
  pause(): void;

  /** D-020 — continue playback from the frame `pause()` froze. */
  resume(): void;

  /** Optional. Advance to the next state for paginated templates. */
  next?(): Promise<void>;

  /**
   * Paint every animated element at the given frame, without starting an
   * rAF loop. Used by Designer's timeline scrubber (M12.2) to preview a
   * specific frame; the runtime's on-air play() loop manages its own
   * playhead via FrameDriver.
   */
  tick(frame: number): void;

  /**
   * Hard cleanup. Detaches every DOM node we created and clears
   * `window.cg`. After this, the runtime is unusable.
   */
  remove(): void;

  /** Subscribe to a lifecycle event. */
  on<E extends LifecycleEvent>(event: E, listener: EventListener<E>): () => void;
}

export interface PlayOptions {
  /** Starting frame within the entry animation (unused in M3.2-α). */
  frame?: number;
}

export interface UpdateOptions {
  mode?: 'merge' | 'replace';
}

export interface StopOptions {
  /** Skip the exit animation (unused in M3.2-α; transitions are instant). */
  immediate?: boolean;
}

export interface RuntimeBootOptions {
  /**
   * Where the runtime renders. Defaults to `document.body`. In the
   * designer preview iframe this can be a sub-element instead.
   */
  root?: HTMLElement;

  /**
   * When `false`, the runtime does not install `window.cg` or the
   * CasparCG global adapters. Useful for tests that drive the runtime
   * directly without polluting the global namespace.
   */
  installGlobals?: boolean;

  /**
   * Skip the `document.fonts.ready` await. Useful in test environments
   * (happy-dom doesn't implement the FontFaceSet API).
   */
  skipFontLoad?: boolean;

  /**
   * D-020 — inject the rAF / timer clock so tests can drive lifecycle timing
   * (intro frames, hold timers, auto-out, loop-cycle) deterministically.
   * Defaults to the platform `requestAnimationFrame` / `setTimeout`.
   */
  clock?: RuntimeClock;

  /**
   * D-020 — supplies the hold duration (ms) for the `content-driven` playout
   * mode. The mode + orchestration live here; the width→duration computation is
   * delivered by the ticker item. Absent ⇒ falls back to `playout.holdMs`.
   */
  durationHook?: () => number;
}

/** Injectable rAF + timer clock for deterministic lifecycle/timing tests. */
export interface RuntimeClock {
  raf?: (cb: (timestamp: number) => void) => number;
  cancel?: (handle: number) => void;
  now?: () => number;
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface BuildSceneResult {
  /** Map of top-level `Element.id` → the HTMLElement we created for it. */
  elementMap: Map<string, HTMLElement>;
  /** Original text per text element, before any binding substitutions. */
  textOriginals: Map<string, string>;
  /** Root container we added to `root`. */
  container: HTMLElement;
  /**
   * Animated elements discovered *inside* nested composition instances
   * (already paired with their concrete DOM nodes). Top-level animated
   * elements are collected separately from `elementMap`; the runtime applies
   * both lists each frame so a pre-comp's own animation plays along the parent
   * timeline.
   */
  nestedAnimated: NestedAnimatedEntry[];
}

/** A nested element + its node + animation, collected during comp expansion. */
export interface NestedAnimatedEntry {
  id: string;
  node: HTMLElement;
  source: Element;
  animation: ElementAnimation;
}

/** Hook the lifecycle state machine emits for the runtime to react to. */
export type LifecycleState = 'pending' | 'playing' | 'on-air' | 'exiting' | 'stopped' | 'removed';

export type SceneInput = Scene | unknown;
