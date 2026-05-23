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
} from './types.js';
