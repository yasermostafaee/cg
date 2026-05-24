import type { FieldValues, Scene } from '@cg/shared-schema';

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

  /** Optional. Advance to the next state for paginated templates. */
  next?(): Promise<void>;

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
   * Skip ticker installation during play(). Used by the M7.4 preset
   * coverage gate, which constructs every preset combo but doesn't want
   * an rAF loop running for each. Default: false.
   */
  skipTickers?: boolean;
}

export interface BuildSceneResult {
  /** Map of `Element.id` → the HTMLElement we created for it. */
  elementMap: Map<string, HTMLElement>;
  /** Original text per text element, before any binding substitutions. */
  textOriginals: Map<string, string>;
  /** Root container we added to `root`. */
  container: HTMLElement;
}

/** Hook the lifecycle state machine emits for the runtime to react to. */
export type LifecycleState = 'pending' | 'playing' | 'on-air' | 'exiting' | 'stopped' | 'removed';

export type SceneInput = Scene | unknown;
