// Public surface of @cg/template-runtime.
//
// Consumers:
//   - The exported .vcg's index.html calls `createRuntime(scene)` and
//     then `installCasparGlobals(runtime)` so CasparCG can drive it.
//   - The designer preview iframe will use the postMessage adapter
//     (M3.2-β) instead of CasparCG globals.

export { createRuntime } from './runtime.js';
export { installCasparGlobals } from './adapters/caspar-globals.js';
export {
  applyOutputPosition,
  outputTranslate,
  parsePositionQuery,
  resolveOutputPosition,
  // R-030 — the channel raster and the one uniform scale that maps the
  // reference frame onto it. `REFERENCE_FRAME` replaces the old `OUTPUT_FRAME`
  // name, which lied on every channel that was not 1080 (see position.ts).
  REFERENCE_FRAME,
  parseChannelRasterQuery,
  resolveChannelRaster,
  outputScale,
  outputLetterbox,
  type ApplyOutputPositionOptions,
  type Raster,
  type RasterView,
} from './position.js';
export { buildScene } from './scene-builder.js';
export { applyFieldValues } from './bindings.js';
export { applyTransform, stringifyValue } from './transforms.js';
export { LifecycleStateMachine, canTransition } from './lifecycle.js';
export { ensureBaselineCss, BASELINE_CSS } from './css.js';
export {
  assignZoneIndices,
  compileZoneCss,
  ensureZoneCss,
  hasZonedCountdown,
  // D-141 helper 4 (design §1) — the kind → CSS property map D-139's colour effect
  // must honour too, so one element recolours identically whichever drove it.
  zoneColorTargets,
  type ZoneColorTarget,
  type ZoneCssResult,
  type ZoneSlot,
} from './zone-css.js';
export { EventBus } from './event-bus.js';
export { FrameDriver, type FrameDriverOptions } from './frame-driver.js';
export { PlayoutController, type PlayoutControllerOptions } from './playout-controller.js';
export {
  TickerDriver,
  coerceTickerItems,
  tickerDriverFor,
  type TickerDriverItem,
  type TickerDriverOptions,
} from './ticker-driver.js';
export {
  ClockDriver,
  clockInitialText,
  // D-141 helpers 1–3 (design §1) — separately exported and dependency-free so
  // D-139's rule engine REUSES them instead of growing a second copy of the same
  // predicate (CLAUDE.md golden rule 6).
  pickByThreshold,
  remainingMsOf,
  resolveTimeOfDay,
  type ClockDriverMode,
  type ClockDriverOptions,
} from './clock-driver.js';
export { formatCountClock, formatWallClock, type ClockDigits } from './clock-format.js';
export {
  SequenceDriver,
  coerceSequenceItems,
  sequenceDriverFor,
  type SequenceDriverItem,
  type SequenceDriverOptions,
  type RenderedSequenceItem,
  type SequenceCompositionRenderer,
} from './sequence-driver.js';
export {
  edgeOffset,
  sampleTransition,
  transitionTotalMs,
  type SequenceEdge,
  type SequenceTiming,
  type SequenceTransitionSpec,
} from './sequence-motion.js';
export {
  RepeaterDriver,
  coerceRepeaterItems,
  repeaterDriverFor,
  type RepeaterDriverOptions,
  type RepeaterRowHandle,
} from './repeater-driver.js';
export {
  buildRepeaterRows,
  buildSequenceCompositionItem,
  clampRowCount,
  repeaterItemValues,
  type SequenceCompositionItemBuild,
} from './scene-builder.js';
export {
  applyAnimationAtFrame,
  collectAnimatedElements,
  type AnimatedElement,
} from './animation-applier.js';
export { interpolateAtFrame, applyEasing, lerpHexColor, isColorProperty } from './keyframe-eval.js';

export type {
  TemplateRuntime,
  RuntimeBootOptions,
  /** D-137 §9 — `'author'` | `'output'`; every boot site names one. */
  RenderMode,
  PlayOptions,
  UpdateOptions,
  StopOptions,
  LifecycleEvent,
  LifecycleState,
  EventListener,
  ErrorEvent,
  SceneInput,
  BuildSceneResult,
  RuntimeClock,
  PlayoutOverride,
  TickerTimingOverride,
  SequenceTimingOverride,
  CountdownTimingOverride,
  ElementTimingOverrides,
} from './types.js';
