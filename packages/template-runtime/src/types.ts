import type {
  Element,
  ElementAnimation,
  FieldValues,
  FrameRange,
  HoldSource,
  Lifecycle,
  Playout,
  PlayoutMode,
  Scene,
  TickerElement,
} from '@cg/shared-schema';

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
   * D-028 — external override for the root scope's `content-driven` hold (test
   * seam / future rundown): invoked at each hold entry; the hold lasts until
   * the returned promise resolves. Absent ⇒ the runtime self-wires completion
   * from the scope's ticker elements (all finite tickers done; an infinite
   * ticker holds until `stop()`; a scope with no tickers gets a zero-length
   * hold), so preview and the exported HTML need no boot wiring.
   */
  contentHold?: () => Promise<void>;

  /**
   * D-028 — injectable ticker item-width measurement (defaults to
   * `offsetWidth`). Test seam: happy-dom has no layout engine, so runtime-level
   * ticker tests supply deterministic widths.
   */
  tickerMeasure?: (node: HTMLElement) => number;

  /**
   * D-020 — non-persistent playout override. The composition stores its defaults
   * (`scene.playout`, play-once); these knobs override them for a single run
   * without touching the stored template. The designer preview supplies them for
   * session-only testing, and the rundown (the control app) will drive them live
   * on air later — this is the seam that keeps mode + hold + repeat overridable.
   * Absent fields fall back to the stored `scene.playout`. Equivalent to
   * `scopeOverrides['']` (the root scope); if both are given, `scopeOverrides['']`
   * wins.
   */
  playoutOverride?: PlayoutOverride;

  /**
   * D-026 — PER-SCOPE non-persistent playout overrides, keyed by the scope's
   * instance-name PATH within the composition-instance tree: `''` is the root
   * (this composition), `'home'` a direct child instance, `'home.inner'` a
   * grandchild — the same instance names the nested field scopes use. Each entry
   * overrides that scope's stored `playout` (mode / holdMs / repeat) for THIS run
   * only, so a parent can independently test each child's timing (e.g. `home`
   * loops 3×, `away` loops infinitely) without touching any stored template.
   * Absent scopes fall back to their own stored `playout`.
   */
  scopeOverrides?: Record<string, PlayoutOverride>;
}

/**
 * D-020/D-028 — overridable playout knobs (non-persistent). They override the
 * stored `scene.playout` (and the scope's ticker elements' own repeat/boundary)
 * for this run only. There is no continuous-loop flag: a looping playout is
 * `mode: 'loop-cycle'` with `repeat: 'infinite'`.
 */
export interface PlayoutOverride {
  mode?: PlayoutMode;
  holdSource?: HoldSource;
  holdMs?: number;
  repeat?: number | 'infinite';
  /** D-028 — overrides EVERY ticker in the scope (session-only). */
  tickerRepeat?: number | 'infinite';
  tickerBoundary?: 'seamless' | 'drain';
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
   * D-025 — the field-scope tree. Each scope owns the DOM nodes for ONE
   * composition instance (its own `elementMap`/`textOriginals`/container) and
   * lists its nested child instances by namespace, so namespaced (nested) field
   * values route to the right copy even when a child is instanced more than once.
   */
  scopeTree: FieldScope;
}

/**
 * D-025 / D-026 — one composition instance's scope. The root scope is the active
 * document; each nested `composition` instance gets its own child scope so the same
 * child instanced twice (e.g. `home`/`away`) has two independent element maps AND
 * its own lifecycle (D-026 cascade). One scope, two uses: field application
 * (`elementMap`/`textOriginals`) and lifecycle/animation (`animated`/`source`).
 */
export interface FieldScope {
  /** Element id → node, for elements rendered directly in THIS scope. */
  elementMap: Map<string, HTMLElement>;
  /** Original text per text element in this scope. */
  textOriginals: Map<string, string>;
  /** This scope's container (root stage, or an instance's inner box). */
  container: HTMLElement;
  /** Nested child instances, each under its (parent-unique) namespace `name`. */
  children: FieldScopeChild[];
  /** D-026 — animated elements rendered directly in this scope (its own lifecycle). */
  animated: NestedAnimatedEntry[];
  /** D-028 — ticker elements rendered directly in this scope (band + track nodes). */
  tickers: TickerEntry[];
  /** D-026 — the comp/scene this scope renders, for its lifecycle/playout/active. */
  source: LifecycleSource;
}

/** D-028 — one built ticker: its element config + the band/track DOM nodes. */
export interface TickerEntry {
  element: TickerElement;
  /** The clipped band (registered in the scope's elementMap). */
  band: HTMLElement;
  /** The inner track the driver feeds and translates. */
  track: HTMLElement;
}

/** The lifecycle-relevant fields of the comp/scene a scope renders (D-026). */
export interface LifecycleSource {
  frameRange: FrameRange;
  activeRange?: FrameRange | undefined;
  lifecycle?: Lifecycle | undefined;
  playout?: Playout | undefined;
}

export interface FieldScopeChild {
  /** Namespace key — the instance's name (parent-unique). */
  name: string;
  /** The referenced child composition id (resolved against `scene.compositions`). */
  compositionId: string;
  scope: FieldScope;
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
