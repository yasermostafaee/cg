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
  CATALOGUE_TICK_MS,
  isLoopbackCasparHost,
  PlayoutCatalogue,
  resolveCatalogueHost,
  type CatalogueRow,
  type PlayoutCatalogueOptions,
} from './playout-catalogue.js';
// `DESKTOP-APPS-01` §2F — the connection check, its probes, and the Playout host (A4).
export {
  AMCP_PROBE_TIMEOUT_MS,
  AMCP_TRUST_WINDOW_MS,
  probeAmcp,
  probeRoute,
  realProbes,
  runConnectionCheck,
  type AmcpOutcome,
  type CheckProbes,
  type HttpAnswer,
  type PortHolder,
  type StationPorts,
} from './connection-check.js';
export { playoutHostOf } from './bridge.js';
// `DESKTOP-APPS-01-B` B1.4 — every bridge request to the Playout: server-side, no Origin, no proxy.
export { playoutFetch } from './playout-http.js';
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
  persistAdoptedIssuer,
  playoutEndpointsFor,
  resolvePlayoutSettings,
  writePlayoutAddress,
} from './playout-config.js';
export type {
  PlayoutAuthConfig,
  PlayoutEndpoints,
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
// `DESKTOP-APPS-01` — the console served on its own loopback origin (ADR 0011), and the health
// identity the desktop shell reads. Never on the template origin (ADR 0010 rule 13).
export {
  CONSOLE_DEFAULT_PORT,
  CONSOLE_HEALTH_APP,
  CONSOLE_HEALTH_PATH,
  ConsoleHttpServer,
  resolveConsolePath,
} from './console-http-server.js';
export type { ConsoleHealth, ConsoleServeOptions } from './console-http-server.js';
