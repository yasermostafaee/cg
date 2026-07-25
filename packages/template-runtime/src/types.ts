import type {
  ClockElement,
  LottieElement,
  RepeaterElement,
  SequenceElement,
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
  VideoElement,
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
   * D-105 — the COORDINATED animated exit ("Out"). The content (ticker / clock /
   * sequence) animates off FIRST (a short opacity fade), then the background plays
   * its outro, then the composition settles cleared — the background never closes
   * over fully-visible content. Distinct from `stop()`, which removes the content
   * IMMEDIATELY and then plays the background outro.
   */
  out(opts?: StopOptions): Promise<void>;

  /**
   * D-020 — freeze playback at the current frame (intro, hold, or outro). The
   * timing orchestrator (auto-out / loop-cycle) is paused too. No args, so a
   * future `CG INVOKE "pause"` can reach it.
   */
  pause(): void;

  /** D-020 — continue playback from the frame `pause()` froze. */
  resume(): void;

  /**
   * D-029 — advance paginated content one step (`CG NEXT`). Implemented by
   * `createRuntime` as a per-scope dispatch, parent-first: today it routes
   * to each scope's sequence drivers (a pre-run or mid-transition next() is
   * the driver's own no-op); the D-031 authored steps model will join the
   * same dispatch. A template with no consumers is a safe no-op. Optional on
   * the interface so minimal runtimes stay conformant.
   */
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
   * D-062 — image `assetId` → resolved URL. After building the scene the runtime
   * sets the `src` of each `<img data-cg-asset-id>` whose id is in this map, so
   * image elements render in exported output (`.vcg`: packaged relative paths;
   * single-file HTML: base64 data URIs — both exporters bake the map). Absent ⇒
   * image `src` is left unset, so the Designer preview (which wires `src`
   * host-side) is unaffected.
   */
  assetUrls?: Readonly<Record<string, string>>;

  /**
   * D-125 — Lottie `assetId` → parsed bodymovin `animationData` (the JSON object,
   * NOT a URL: the player is passed `animationData` inline, never a `path:`). The
   * runtime mounts each `lottie` element's player from this map and drives it
   * frame-by-frame. Both exporters bake it (single-file: inlined as a JS literal;
   * `.vcg`: resolved from the packaged `assets/lottie/*.json`), and the Designer
   * preview passes the imported JSON. Absent ⇒ the element renders as an empty box
   * (mirrors an image whose bytes did not resolve).
   */
  lottieAssets?: Readonly<Record<string, unknown>>;

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
 * D-102 Phase 1 — a single ticker's session-only timing override, addressed by the ticker
 * element's id. Absent fields fall back to the element's authored `repeat` / `cycleBoundary`.
 */
export interface TickerTimingOverride {
  repeat?: number | 'infinite';
  cycleBoundary?: 'seamless' | 'drain';
}

/**
 * D-102 Phase 2 — a single sequence's session-only timing override, addressed by the sequence
 * element's id. `repeat` counts full passes; `dwellMs` is the PER-ITEM display time and wins over
 * BOTH the item's own authored `dwellMs` and the element's `defaultDwellMs` (a preview dwell that
 * skipped items carrying their own dwell would be a dead control). Absent fields fall back to the
 * element's authored values.
 */
export interface SequenceTimingOverride {
  repeat?: number | 'infinite';
  dwellMs?: number;
}

/**
 * D-102 Phase 2 — a single COUNTDOWN clock's session-only timing override, addressed by the clock
 * element's id. `durationMs` replaces the clock's authored `target` — a `duration` OR a `datetime`
 * deadline — with a duration target for this run, which is the only way to rehearse a countdown to
 * an absolute wall-clock time. `wall` / `countup` clocks never complete and are never overridden.
 */
export interface CountdownTimingOverride {
  durationMs?: number;
}

/**
 * D-020/D-028 — overridable playout knobs (non-persistent). They override the
 * stored `scene.playout` (and, per element, each content element's own timing)
 * for this run only. There is no continuous-loop flag: a looping playout is
 * `mode: 'loop-cycle'` with `repeat: 'infinite'`.
 */
export interface PlayoutOverride {
  mode?: PlayoutMode;
  holdSource?: HoldSource;
  holdMs?: number;
  repeat?: number | 'infinite';
  /**
   * D-102 Phase 1 — PER-ELEMENT ticker timing, keyed by the ticker element's id (replaces the
   * old per-scope `tickerRepeat`/`tickerBoundary`, which could only address one ticker per
   * scope). Each ticker's override applies to its OWN driver. Session-only.
   */
  tickers?: Record<string, TickerTimingOverride>;
  /**
   * D-102 Phase 2 — PER-ELEMENT sequence timing, keyed by the sequence element's id. Same shape,
   * keying and session-only lifetime as {@link PlayoutOverride.tickers}.
   */
  sequences?: Record<string, SequenceTimingOverride>;
  /**
   * D-102 Phase 2 — PER-ELEMENT countdown timing, keyed by the clock element's id (countdowns
   * only — `wall`/`countup` have no timing to tune). Session-only.
   */
  countdowns?: Record<string, CountdownTimingOverride>;
}

/**
 * D-102 Phase 2 — the per-element timing maps of a scope override, resolved for one scope. Split
 * out because a STAMPED subtree (a repeater row / a sequence composition item) is wired under a
 * synthetic path no `scopeOverrides` key addresses: it INHERITS its host scope's maps so the
 * authored element's override reaches the stamped element's own driver. Only these ELEMENT maps are
 * inherited — the per-scope LIFECYCLE axes are not, so a stamped row keeps its own lifecycle.
 */
export interface ElementTimingOverrides {
  tickers?: Record<string, TickerTimingOverride>;
  sequences?: Record<string, SequenceTimingOverride>;
  countdowns?: Record<string, CountdownTimingOverride>;
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
  /** D-027 — clock elements rendered directly in this scope (time-span nodes). */
  clocks: ClockEntry[];
  /** D-029 — sequence elements rendered directly in this scope (host boxes). */
  sequences: SequenceEntry[];
  /** D-030 — repeater elements rendered directly in this scope (host boxes). */
  repeaters: RepeaterEntry[];
  /** D-125 — Lottie elements rendered directly in this scope (mount containers). */
  lotties: LottieEntry[];
  /** D-128 — video elements rendered directly in this scope (the `<video>` hosts). */
  videos: VideoEntry[];
  /**
   * B-089 — elements rendered directly in this scope that carry an explicit
   * `lifespan` (a timeline trim). Registered at BUILD time, so every scope — not
   * just the root — has its own gate list to evaluate along its OWN timeline. The
   * trim is authored against the composition's frame range (the Designer clamps to
   * `activeDocOf(scene).frameRange`), which is exactly the frame space this scope's
   * controller runs in.
   */
  lifespanGates: LifespanGateEntry[];
  /** D-026 — the comp/scene this scope renders, for its lifecycle/playout/active. */
  source: LifecycleSource;
}

/**
 * B-089 — one built lifespan gate: the node to toggle and the authored trim.
 *
 * `naturalDisplay` is the display the gate restores when the playhead re-enters range. It
 * is captured at BUILD time (in `buildLayer`, from what the element builder just settled),
 * so it is correct for EVERY scope — including the stamped ones (repeater rows, sequence
 * composition items) that are deliberately absent from `scope.children` and therefore
 * unreachable by any walk of the namespace tree. It is already `none` for a hidden element
 * (B-034), which is what keeps such an element inert through the gate.
 *
 * `snapshotLifespanGates` then REFRESHES this for the scopes the namespace tree does reach,
 * after `applyScopedFieldValues` — a `visibility` binding writes `style.display` directly
 * (see `bindings.ts`), and the pre-B-089 gate restored that post-binding value.
 */
export interface LifespanGateEntry {
  node: HTMLElement;
  lifespan: FrameRange;
  /** Display value the scene-builder settled on, restored when entering range. */
  naturalDisplay: string;
}

/** D-125 — one built Lottie: its element config + the mount container. */
export interface LottieEntry {
  element: LottieElement;
  /** The container div the `lottie_light` SVG mounts into (also in the elementMap). */
  container: HTMLElement;
}

/** D-128 — one built video: its element config + the `<video>` host the driver commands. */
export interface VideoEntry {
  element: VideoElement;
  container: HTMLVideoElement;
}

/** D-028 — one built ticker: its element config + the band/track DOM nodes. */
export interface TickerEntry {
  element: TickerElement;
  /** The clipped band (registered in the scope's elementMap). */
  band: HTMLElement;
  /** The inner track the driver feeds and translates. */
  track: HTMLElement;
}

/** D-027 — one built clock: its element config + the inner time span the driver repaints. */
export interface ClockEntry {
  element: ClockElement;
  /** The LTR-isolated time span inside the clock box (the box is in the elementMap). */
  node: HTMLElement;
}

/** D-029 — one built sequence: its element config + the clipped host box. */
export interface SequenceEntry {
  element: SequenceElement;
  /** The clipped grid box the driver renders items into (also in the elementMap). */
  host: HTMLElement;
  /** B-016 — composed `background` for a gradient text colour, applied per item node. */
  glyphGradientCss?: string | undefined;
  /** D-083 — composition recursion depth at the build site (comp items build at depth+1). */
  depth: number;
  /** D-083 — composition ids on the build path (the cycle guard for comp-item rendering). */
  visited: ReadonlySet<string>;
}

/** D-030 — one built repeater: element config + host box + the build-context guards. */
export interface RepeaterEntry {
  element: RepeaterElement;
  /** The clipped box rows are stamped into (also in the elementMap). */
  host: HTMLElement;
  /** Composition recursion depth at the build site (rows stamp at depth+1). */
  depth: number;
  /** Composition ids on the build path (the cycle guard for row stamping). */
  visited: ReadonlySet<string>;
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
  /**
   * B-034 — the instance element's own `visible`. A HIDDEN instance (`false`) makes its WHOLE subtree
   * inert: the parent's hold aggregation skips it entirely (no descendant — visible or not — drives the
   * parent), mirroring render's `display: none`. Absent ⇒ visible.
   */
  visible?: boolean | undefined;
  /**
   * D-112 — the instance element's per-instance hold overrides (keyed by nested content element id).
   * Applied by the PARENT's content-wait aggregation to this child's OWN content; absent key ⇒ the
   * element's own `drivesHold`. Lives on the instance, so two instances of the same child differ.
   */
  holdOverrides?: Readonly<Record<string, boolean>> | undefined;
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
