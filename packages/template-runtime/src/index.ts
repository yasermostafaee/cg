// Public surface of @cg/template-runtime.
//
// Consumers:
//   - The exported .vcg's index.html calls `createRuntime(scene)` and
//     then `installCasparGlobals(runtime)` so CasparCG can drive it.
//   - The designer preview iframe will use the postMessage adapter
//     (M3.2-β) instead of CasparCG globals.

export { createRuntime } from './runtime.js';
export { installCasparGlobals } from './adapters/caspar-globals.js';
export { buildScene } from './scene-builder.js';
export { applyFieldValues } from './bindings.js';
export { applyTransform, stringifyValue } from './transforms.js';
export { LifecycleStateMachine, canTransition } from './lifecycle.js';
export { ensureBaselineCss, BASELINE_CSS } from './css.js';
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
export { buildRepeaterRows, clampRowCount, repeaterItemValues } from './scene-builder.js';
export {
  applyAnimationAtFrame,
  collectAnimatedElements,
  type AnimatedElement,
} from './animation-applier.js';
export { interpolateAtFrame, applyEasing, lerpHexColor, isColorProperty } from './keyframe-eval.js';

export type {
  TemplateRuntime,
  RuntimeBootOptions,
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
} from './types.js';
