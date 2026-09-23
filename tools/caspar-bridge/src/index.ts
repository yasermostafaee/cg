export { createBridge } from './bridge.js';
// `B-229` — the route table and its lock decision, for the lock-policy census. A test that
// SAMPLED channels could never assert "the lock refuses everything"; it has to walk the table.
export { buildRoutes, refusedWhileLocked } from './bridge.js';
// `C-037` — the AUTH decision, exported for the auth census exactly as `refusedWhileLocked` is
// for the lock's. "Everything else is refused" is a claim about every channel, and a spec that
// SAMPLED them could not make it.
export { authGateState, openToUnauthenticated, refusedByAuth, wirePublishes } from './bridge.js';
// `CHANNEL-AUTHORITY-01` — the STATION fence and the routes exempt from it, for its census; and
// the channel-discovery composition with its D4 reader, for the discovery suite.
export { CHANNEL_DECLARING_ROUTES, stationChannelsFor, stationRefusal } from './bridge.js';
export {
  CATALOGUE_POLL_MS,
  PlayoutCatalogue,
  type CatalogueRow,
  type PlayoutCatalogueOptions,
} from './playout-catalogue.js';
export type { AuthGateState, BridgeHandle, BridgeOptions } from './bridge.js';
// `C-037` — the Playout link: its config precedence (CLI > file > default), the boot failure
// that names a missing key, and the verifier. The CLI resolves the default file path through
// `defaultPlayoutConfigPath` for `live-layers-store`'s reason — a default buried in a `.mjs`
// script is a default no test can reach.
export {
  AUTH_OFF,
  DEFAULT_PLAYOUT_AUDIENCE,
  PLAYOUT_CONTRACT_VERSION,
  PlayoutConfigError,
  PlayoutFileSchema,
  defaultPlayoutConfigPath,
  loadPlayoutFile,
  resolvePlayoutSettings,
} from './playout-config.js';
export type {
  PlayoutAuthConfig,
  PlayoutFile,
  PlayoutFlags,
  PlayoutSettings,
} from './playout-config.js';
export {
  JWKS_COOLDOWN_MS,
  PlayoutAuth,
  REVOCATION_POLL_MS,
  truncateActorName,
} from './playout-auth.js';
export type { VerifiedToken, VerifyResult } from './playout-auth.js';
export { AuthSession } from './auth-session.js';
export {
  loadReservedLayers,
  parseReservedLayersFlag,
  ReservedLayersFileError,
} from './reserved-layers-store.js';
export { CasparRuntime, configuredCasparHosts } from './caspar-runtime.js';
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
// C-029 — the CLI resolves `--create-missing-consumers` through this, so the OFF default is
// ONE exported function a test can hold to its answer (`output-policy.test.ts`).
export {
  OUTPUT_RECHECK_MS,
  creatableMissingConsumer,
  missingConsumerAddCommand,
  resolveCreateMissingConsumers,
} from './output-check.js';
export { TemplateRegistry } from './template-registry.js';
export {
  TemplateHttpServer,
  deriveServeOptions,
  guessLanHost,
  hostsUnableToFetchTemplates,
  isLoopbackHost,
  templateServeUnreachableWarning,
} from './template-http-server.js';
export type { TemplateServeOptions, TemplateServeOverride } from './template-http-server.js';
