export { createBridge } from './bridge.js';
export type { BridgeHandle, BridgeOptions } from './bridge.js';
export {
  loadReservedLayers,
  parseReservedLayersFlag,
  ReservedLayersFileError,
} from './reserved-layers-store.js';
export { CasparRuntime } from './caspar-runtime.js';
export { CommandBuilder } from './command-builder.js';
export type { CommandSlot } from './command-builder.js';
export type { LiveLayerLedger, LiveLayerRecord, NormalizedRect } from './live-layers.js';
// B-145 — the CLI resolves the ledger's default location through this, so the default is
// ONE exported function a test can hold to its answer rather than an inline `path.join`
// buried in a `.mjs` script no test could reach.
export {
  defaultLiveLayersPath,
  resolveLiveLayersPath,
  type LiveLayersPathOption,
} from './live-layers-store.js';
export { TemplateRegistry } from './template-registry.js';
export {
  TemplateHttpServer,
  deriveServeOptions,
  guessLanHost,
  isLoopbackHost,
} from './template-http-server.js';
export type { TemplateServeOptions, TemplateServeOverride } from './template-http-server.js';
