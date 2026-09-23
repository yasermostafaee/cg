import { WebSocketServer, type WebSocket } from 'ws';
import {
  AppInfoChannel,
  AuditHealthChannel,
  AuditRecentChannel,
  AUTH_NO_TOKEN,
  AUTH_REQUIRED_REFUSAL,
  AuthStateChangedChannel,
  type AuthMode,
  AUTHZ_ROLE_REFUSAL,
  authzChannelRefusal,
  type PermissionClass,
  grantsChannel,
  grantedChannels,
  holdsPermissionClass,
  AuthSignOutChannel,
  AuthStateChannel,
  type AuthState,
  type AuthStatus,
  type WsAuthFrame,
  ConnectionsConfigChangedChannel,
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  ConnectionsSetConfigChannel,
  ConnectionsTemplateServeChannel,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  FixedLayersConfigChangedChannel,
  FixedLayersClearLayerChannel,
  FixedLayersConfigChannel,
  FixedLayersLoadChannel,
  FixedLayersSetConfigChannel,
  FixedLayersStateChangedChannel,
  FixedLayersStateChannel,
  LayersClearChannel,
  LayersOrphansChangedChannel,
  LayersOrphansChannel,
  LayersOwnedOccupancyChangedChannel,
  LayersOwnedOccupancyChannel,
  EmptiedAirDismissChannel,
  EmptiedAirNoticeChangedChannel,
  EmptiedAirNoticeChannel,
  EmptiedAirRestoreChannel,
  LOCK_ENGAGED_REFUSAL,
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  PlayoutLayersClearChannel,
  PlayoutLayersStateChangedChannel,
  PlayoutLayersStateChannel,
  LiveLayersStateChangedChannel,
  LiveLayersStateChannel,
  LivePlateReleasedChannel,
  StackLoadChannel,
  StackNextChannel,
  BridgeCapabilitiesChannel,
  StackRestoreChannel,
  StackStopAllChannel,
  StackStopChannel,
  StackOutChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackSetActiveLookChannel,
  StackSetPassTimingChannel,
  StackSetPlateVolumeChannel,
  StackSetPlateVolumesChannel,
  StackSilenceAllLivePlatesChannel,
  StackSetPositionChannel,
  StackSwapLiveSourceChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  DelimitersChangedChannel,
  DelimitersListChannel,
  DelimitersSetChannel,
  ChannelSettingsChangedChannel,
  ChannelSettingsGetChannel,
  ChannelSettingsSetChannel,
  RehearseEnterChannel,
  RehearseExitChannel,
  RehearseStateChangedChannel,
  RehearseStateChannel,
  SourcesAssignmentsChangedChannel,
  SourcesAssignmentsChannel,
  SourcesConfigChangedChannel,
  SourcesConfigChannel,
  SourcesSetAssignmentsChannel,
  SourcesSetConfigChannel,
  TemplatesChangedChannel,
  TemplatesGetChannel,
  TemplatesImportChannel,
  TemplatesListChannel,
  TemplatesRemoveChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChangedChannel,
  UpdateStateChannel,
  parseWsFrame,
  serializeWsFrame,
  defaultFixedLayerBank,
  reservedLayerNumbers,
  type AnyChannel,
  type AnyPublishChannel,
  type ChannelSettings,
  type ConnectionConfig,
  type FixedLayerBank,
  type LockState,
  type PlayoutPrincipal,
  type ReservedLayers,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
  type WsPublishFrame,
  type WsResponseFrame,
} from '@cg/shared-ipc';
import { DEFAULT_LAYER_POLICY, type LayerPolicy, type LayerSlot } from '@cg/caspar-client';
import { currentAuthSession, runAsActor } from './actor-context.js';
import { CasparRuntime, configuredCasparHosts } from './caspar-runtime.js';
import { loadPersistedConnection, savePersistedConnection } from './connection-store.js';
import {
  FixedLayersConfigError,
  loadFixedLayerBank,
  saveFixedLayerBank,
  validateFixedBank,
} from './fixed-layers-store.js';
import { loadReservedLayers } from './reserved-layers-store.js';
import { loadPersistedLiveLayers, savePersistedLiveLayers } from './live-layers-store.js';
import { resolveCreateMissingConsumers } from './output-check.js';
import {
  resolveSourceCatalog,
  saveSourceCatalog,
  validateSourceCatalog,
  type SourceCatalogSource,
} from './source-catalog-store.js';
import {
  pruneAssignmentsForCatalog,
  resolveSourceAssignments,
  saveSourceAssignments,
  validateSourceAssignments,
  type SourceAssignmentsSource,
} from './source-assignments-store.js';
import {
  hostsUnableToFetchTemplates,
  isLoopbackHost,
  templateServeUnreachableWarning,
  type TemplateServeOverride,
} from './template-http-server.js';
import { normalizeServeHost } from './serve-host-config.js';
import { AuthSession } from './auth-session.js';
import { PlayoutAuth, type PlayoutAuthOptions } from './playout-auth.js';
import {
  AUTH_OFF,
  loadPlayoutFile,
  PLAYOUT_CONTRACT_VERSION,
  resolvePlayoutSettings,
  type PlayoutFlags,
  type PlayoutSettings,
} from './playout-config.js';

export interface BridgeOptions {
  /** Bind host. Defaults to loopback (`127.0.0.1`) — enforced at the socket bind. */
  host?: string;
  /** Bind port. Defaults to the browser-safe `DEFAULT_BRIDGE_PORT`. `0` = ephemeral. */
  port?: number;
  /** CasparCG server(s) + OSC bind. Phase 2 drives server A. */
  connection?: ConnectionConfig;
  /**
   * B-038 Phase 3 — overrides for the template HTTP server (`/template/<id>`).
   * Defaults derive from where CasparCG runs: loopback bind + serve-host when
   * EVERY declared server is local; an opt-in routable bind + guessed/configured
   * serve-host when ANY of them is remote (B-162 — the decision is about the
   * whole configured set, because one URL is handed to all of them). The control
   * WebSocket is unaffected and stays loopback.
   *
   * `serveHost` here is what `--template-serve-host` sets: an EXPLICIT answer
   * that replaces the guess rather than refining it. It is the operator's, not
   * the derivation's — `guessLanHost()` takes the first non-internal IPv4, which
   * on a machine with virtual adapters is routinely the wrong one (C-024).
   */
  templateServe?: TemplateServeOverride;
  /**
   * R-010 — where the applied `ConnectionConfig` persists (JSON). When set,
   * boot loads it (schema-validated; invalid → warned + ignored) unless an
   * explicit `connection` was passed, and every successful
   * `connections.set-config` apply is saved back. Omitted → no persistence.
   */
  persistPath?: string;
  /**
   * R-021 stage 1 — the fixed operator layer bank, explicit. Highest
   * precedence; see {@link resolveFixedBank} for the full order. The bank is
   * VALIDATED at boot (`validateFixedBank`) and a violation throws BEFORE the
   * WebSocket binds — conflicts resolve loudly at startup.
   */
  fixedLayers?: FixedLayerBank;
  /**
   * R-021 stage 1 — where the fixed bank persists (JSON). An ABSENT file at a
   * CONFIGURED path means the BUILT-IN DEFAULT bank (70–99, top five ticked) —
   * the file records a deviation, it does not supply the bank. A
   * PRESENT-but-unusable file is a HARD boot failure (see
   * `fixed-layers-store.ts` for why this diverges from connection-store's
   * warn-and-ignore). Omitting the path entirely still means NO bank — see
   * {@link resolveFixedBank}.
   */
  fixedLayersPath?: string;
  /**
   * R-028 / C-015 — the RESERVED playout layers, explicit. Precedence mirrors
   * the fixed bank: explicit option > persisted file > nothing reserved.
   * Validated against the fixed bank at boot; fenced from allocation for the
   * life of the process.
   */
  /**
   * 🔴 `LAYER-BANDS-16` — **the DEPLOYMENT's dynamic allocation ranges, if it declares any.**
   *
   * The product ships NONE: `DEFAULT_LAYER_POLICY` is empty since the owner retired
   * type-keyed dynamic allocation, because every range it used to carry lay in 1-49 — the
   * span the layer map leaves to the playout server. An installation that genuinely wants
   * `layers.load` to place a graphic by `templateType` declares its own ranges here, and
   * every fence that reads the policy (`overlaps-policy` at config time, `reservedLayers`
   * at allocation time) applies to them unchanged.
   *
   * Absent means absent, not "the old six ranges": a bridge with no policy refuses a dynamic
   * load rather than guessing a layer, which is the whole point of the retirement.
   */
  layerPolicy?: LayerPolicy;
  reservedLayers?: ReservedLayers;
  /**
   * R-028 / C-015 — where the reserved playout layers load from (JSON). An
   * ABSENT file means nothing reserved; a PRESENT-but-unusable file is a HARD
   * boot failure (`reserved-layers-store.ts` — a silently-dropped reservation
   * would let our graphics land on the company's playout layers).
   */
  reservedLayersPath?: string;
  /**
   * R-028 (o1) — where the bridge's template registry persists (one JSON file
   * per template). Absent = in-memory only; a bridge restart then empties the
   * library exactly as before.
   */
  templatesDir?: string;
  /**
   * D-137 / C-015 — the installation's SOURCE CATALOG, explicit. Highest
   * precedence (tests, embedders); see {@link resolveSourceCatalog}.
   */
  sourceCatalog?: SourceCatalog;
  /**
   * D-137 / C-015 — where the source catalog persists (JSON).
   *
   * An ABSENT file means **NO SOURCES**, and there is deliberately no built-in
   * default: a default input definition is a guess about hardware this project
   * cannot see, and a wrong guess puts the wrong camera behind a guest's frame.
   * A PRESENT-but-unusable file is a HARD boot failure — a partially parsed
   * catalog is worse than none.
   *
   * ⚠ It must NOT be inside {@link templatesDir}: the template registry reads
   * every `*.json` there as a template (B-116).
   */
  sourceCatalogPath?: string;
  /**
   * D-137 / C-015 — the per-template, per-plate ASSIGNMENTS, explicit. Highest
   * precedence (tests, embedders); see {@link resolveSourceAssignments}.
   */
  sourceAssignments?: SourceAssignments;
  /**
   * D-137 / C-015 — where the assignments persist (JSON).
   *
   * Same doctrine as the catalog above, with one deliberate difference: an
   * assignment naming a source the catalog does not define is PRUNED loudly at
   * load rather than made a boot failure — it has a clear reading (that plate is
   * unassigned) and an unassigned plate already refuses its take legibly.
   *
   * ⚠ It must NOT be inside {@link templatesDir}, and the trap is closest here
   * because this file is ABOUT templates (B-116).
   */
  sourceAssignmentsPath?: string;
  /**
   * B-145 — where the LIVE LAYER LEDGER persists (JSON).
   *
   * Configured → the ledger is written on every change and ADOPTED at boot, corrected
   * against what the server actually has. Omitted → no persistence, which is the
   * pre-B-145 behaviour: a restart loses the ledger and the seated producers are stranded.
   *
   * 🔴 **A STATION NEVER REACHES THE OMITTED CASE.** `bin/caspar-bridge.mjs` resolves this
   * through `resolveLiveLayersPath`, so an unconfigured station gets
   * `~/.cg-runtime/bridge-live-layers.json` and persistence is ON; omitting it here is the
   * EMBEDDER case the repo already ruled on for the fixed bank — *"`createBridge({})` is
   * not a station"* (`tests/default-bank-boot.integration.test.ts:164`). Defaulting it in
   * this function instead would have every bridge a unit test constructs read, and any
   * test that seats a live layer WRITE, the developer's real station ledger.
   *
   * ⚠ Like {@link sourceAssignmentsPath}, it must NOT live inside {@link templatesDir}
   * (B-116).
   */
  liveLayersPath?: string;
  /**
   * B-141 — the NDJSON audit record. ABSENT = no writer configured, which the
   * operator surface reports AS SUCH rather than as an empty log. Unlike the
   * stores above, an unusable audit file is NEVER a boot failure.
   */
  auditLogPath?: string;
  /**
   * `B-174` — the look switch's mixer hold, in ms (`--look-mixer-hold-ms`). ABSENT means
   * ONE CHANNEL FRAME of the channel's observed video mode (40 ms at the plant's
   * `1080i5000`), which is the measured page lag; `0` disables the hold while keeping the
   * page-first order. A FIRST-CLASS operator knob, not test tuning: the right value is a
   * property of the installation (its mode, its page hardware), so the plant must be able
   * to retune it without a rebuild.
   */
  lookMixerHoldMs?: number;
  /**
   * `C-029` — whether the bridge may `ADD` a consumer that `casparcg.config` declares and
   * CasparCG is not running (`--create-missing-consumers`). **OFF unless explicitly true**:
   * the default is reported-never-created, resolved through ONE exported function
   * (`resolveCreateMissingConsumers`) so a test holds the default to its answer. On, the
   * bridge sends the declaration's OWN parameters once per connection and re-reads; it
   * never names a device the config did not.
   */
  createMissingConsumers?: boolean;
  /**
   * 🔴 `C-037` — the Playout link's CLI/explicit layer: the auth MODE and the
   * `playout.*` addresses. Highest precedence, exactly as `connection` is for `R-010`
   * — flags are session overrides and win without clobbering the file.
   *
   * ⚠ Deliberately NOT part of `ConnectionConfig`: that schema is the
   * `connections.set-config` REQUEST body, so auth configuration living there would be
   * rewritable over the very socket this gate exists to protect. See `playout-config.ts`.
   */
  playout?: PlayoutFlags;
  /**
   * `C-037` — where the `playout.*` group persists (JSON,
   * `~/.cg-runtime/bridge-playout.json` by default in the CLI). ABSENT is normal: a station
   * that does not authenticate has no file. PRESENT-but-unusable is a HARD boot failure
   * (`PlayoutConfigError`) rather than the connection file's warn-and-ignore — a bridge
   * told to authenticate must never fall back to not authenticating.
   */
  playoutConfigPath?: string;
  /**
   * TEST-ONLY seam — clock and `fetch` for the Playout reads, so a suite can drive expiry
   * and the D9 cadence without sleeping for a minute.
   */
  playoutAuthOptions?: PlayoutAuthOptions;
  /**
   * TEST-ONLY seam — pass-through to `CasparRuntime`'s sweep/staleness tuning
   * so integration tests can run fast sweeps. Empty in production.
   */
  runtimeTuning?: { sweepMs?: number; occupancyStaleMs?: number; outputRecheckMs?: number };
}

export interface BridgeHandle {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  /**
   * `C-037` — the RESOLVED auth mode and Playout addresses, so the CLI can say at boot
   * which Playout this bridge trusts and a test can assert the precedence without
   * re-deriving it.
   */
  readonly auth: PlayoutSettings;
  /** The verifier, or `null` when auth is off. Exposed for the D9 cadence test's control. */
  readonly playoutAuth: PlayoutAuth | null;
  /**
   * B-038 Phase 3 — the template HTTP serve address: the base URL CasparCG fetches
   * `/template/<id>` from, plus whether the bind is LAN-exposed (non-loopback).
   */
  readonly templateServe: {
    url: string;
    serveHost: string;
    port: number;
    exposed: boolean;
    /**
     * `B-162` — declared CasparCG hosts that cannot fetch this address. Empty is
     * the healthy case; non-empty means those servers get NO TEMPLATE and
     * nothing else anywhere reports it.
     */
    unreachable: readonly string[];
    /**
     * `C-024` — **WHICH OF THE THREE LAYERS ANSWERED**, so the boot line can name it.
     *
     * The layers are flag > config file > derivation, and only the first and last used to exist.
     * A boot line reporting a value that came from the CONFIG FILE as "the built-in derivation"
     * would be a lie on the one line whose entire job is to answer "why this one, and what do I
     * change?" — and the derivation is a GUESS, so the difference between "this machine guessed"
     * and "you configured this" is exactly what the operator needs to see.
     */
    source: 'flag' | 'config' | 'derived';
  };
  /** The real `@cg/caspar-client`-backed runtime (Reconciler is the truth). */
  readonly runtime: CasparRuntime;
  /**
   * WHERE the candidate-layer bank in force came from, so the CLI can SAY it at
   * boot. Two machines ran different banks for two days and nothing anywhere
   * announced the difference; the bank alone does not answer "why this one?",
   * and the source is the half that does.
   */
  readonly fixedBankSource: { bank: FixedLayerBank | null; source: FixedBankSource };
  /**
   * `C-031` — how many templates the registry loaded at boot, how many persisted
   * files it skipped, and from where, so the CLI can SAY it. The boot line already
   * names the bank, the sources, the assignments, the ledger, the mixer hold and the
   * consumer setting; the one number it did not name is the one every take depends
   * on, and on 2026-09-04 it was the first question with no line to answer it.
   */
  readonly templates: { loaded: number; skipped: number; dir: string | null };
  /**
   * D-137 / C-015 — the source catalog in force AND where it came from, so the
   * CLI can SAY it at boot.
   *
   * Same reason the fixed bank carries its provenance: an installation's source
   * list is exactly the class of config that differs silently between two
   * machines, and the value alone cannot answer "why this one, and what do I
   * change?". Here it also answers a question with no other surface — a station
   * where NOTHING reaches air because the file was never written looks, from
   * every screen, like a station whose sources are simply not configured yet.
   */
  readonly sourceCatalog: { value: SourceCatalog; source: SourceCatalogSource };
  /**
   * D-137 / C-015 — the assignments in force, where they came from, and what
   * the boot PRUNED because the catalog no longer defines its source.
   *
   * `pruned` is not diagnostics: each entry is a plate that was bound and now is
   * not, so the boot line names them. Silence there would be a station starting
   * with a plate the operator believes is assigned.
   */
  readonly sourceAssignments: {
    value: SourceAssignments;
    source: SourceAssignmentsSource;
    pruned: readonly { templateId: string; plateId: string; sourceId: string }[];
  };
  /**
   * B-145 — the LIVE-LAYER LEDGER's provenance, so the CLI can SAY it at boot.
   *
   * Same reason as every sibling above, with one that is sharper here: this is the store
   * whose whole purpose is to be believed after a restart. A bridge that adopted nothing
   * and a bridge that is not persisting at all look identical from every screen — and the
   * second is the pre-B-145 bug, which for one release shipped as the DEFAULT.
   *
   * `path: null` means persistence is deliberately OFF (`--no-live-layers`), never that
   * nobody configured it: absence now resolves to the station default.
   */
  readonly liveLayers: {
    readonly path: string | null;
    readonly source: 'file' | 'absent' | 'unusable' | 'off';
    readonly adopted: number;
    readonly unverified: number;
    readonly dropped: number;
  };
  /** Force-close every client socket — used by tests to simulate a mid-session drop. */
  dropConnections(): void;
  /** Stop the WebSocket server, the CasparCG session, and close all clients. */
  close(): Promise<void>;
}

/**
 * 🔴 `B-229` — **IS THIS CHANNEL REACHABLE WHILE THE CONSOLE IS LOCKED?**
 *
 * Every route declares one of these and the argument is REQUIRED, so a channel cannot be
 * added without someone deciding — and, because the `B-074` route-coverage guard already
 * asserts that every runtime channel is routed here, the classification is total by
 * construction. A hand-maintained list of "locked channels" beside the table would be the
 * second thing to remember, and `B-153`'s note two hundred lines down is about exactly
 * that failure.
 *
 * ── THE OWNER'S ANSWER (2026-09-06), AND ITS REASONING ──────────────────────
 *
 * **The lock refuses EVERYTHING — `CLEAR`, `CLEAR ALL` and `STOP` included.** A lock is a
 * DELIBERATE act with a KNOWN PIN: the operator who engaged it ends it in the time it
 * takes to type four digits, so an emergency verb behind the lock is two seconds away and
 * not unreachable.
 *
 * ⚠ **This is NOT `B-226`'s shape, and the distinction is why they must not be
 * "harmonised".** `B-226` withholds CLEAR on a SYSTEM CONDITION the operator cannot undo —
 * withholding the verb there strands him, so the verb stays. The lock is the opposite
 * situation wearing the same face: `B-226` is "you cannot fix this", the lock is "you
 * already know how".
 *
 * ── WHY FOUR NAMES AND NOT A BOOLEAN ────────────────────────────────────────
 *
 * Three of these mean "reachable", and they are kept apart because the REASON is what a
 * future author needs in order to classify a new channel. A boolean would record the
 * answer and lose the question.
 */
type LockPolicy =
  /** Answers a question and changes nothing. Always reachable — the overlay itself is drawn
   *  from `lock.state`, and a browser reconnecting to a locked bridge must still be able to
   *  SEE the stack it is not allowed to touch. */
  | 'read'
  /** It IS the way out. A lock that refused this would need a bridge restart to escape,
   *  which is strictly worse than the bug being fixed. */
  | 'unlock'
  /**
   * The client's own reconnect machinery, not a press.
   *
   * `WebSocketRuntime.#resync` re-delivers the retained stack on every (re)connect. Refusing
   * it would mean a browser that reloads during a lock comes back with an empty stack and an
   * unfixable error — a state-sync failure caused by a safety gate, which is not safety. It
   * is unreachable from any operator control (`StackRestoreChannel`'s only call site is
   * `#resync`), so exempting it grants the operator nothing.
   */
  | 'resync'
  /** An operator intent. REFUSED while locked. */
  | 'operator'
  /**
   * `templates.import` alone: an operator's real import is an intent, and the SAME channel
   * carries `#resync`'s template re-deliveries, which are marked `redelivery: true`. One
   * channel, two meanings, told apart by the flag the wire already carries — rather than
   * exempting the channel outright and letting a locked console accept a catalogue change.
   */
  | 'operator-unless-redelivery';

/**
 * One request route: a channel, its handler, and the two policy axes that decide whether a
 * given press gets through.
 *
 * ⚠ **`lock` and `perm` are DIFFERENT QUESTIONS and must not be collapsed.** The lock asks
 * _"is this console currently accepting intents at all"_ — a station-level safety gate whose
 * key is a PIN. The permission class asks _"may THIS PRINCIPAL do this"_ — an identity gate
 * whose key is a token. `lock.release` is the sharpest illustration: it is exempt from the
 * lock (it IS the way out) and it still requires the `operator` class, because a viewer must
 * not unlock a console an operator deliberately locked.
 */
interface Route {
  readonly channel: AnyChannel;
  readonly handle: (req: unknown) => unknown;
  readonly lock: LockPolicy;
  /**
   * 🔴 `C-038` — the rung of the principal hierarchy this route sits on. The FOURTH field,
   * and REQUIRED, for the identical reason `lock` is the third: a new channel cannot be
   * routed without answering the question, which is what keeps the claim true a year from
   * now. See `PermissionClass` in `@cg/shared-ipc` for the three values and why `read` is a
   * statement about WHO rather than about what the route writes.
   */
  readonly perm: PermissionClass;
}

/**
 * The single decision. Exported for the lock-policy census in
 * `tests/lock-refuses-intents.integration.test.ts`, which walks every route rather than
 * sampling — "the lock refuses everything" is a claim about each channel, and no sample
 * can make it.
 */
export function refusedWhileLocked(route: Route, req: unknown): boolean {
  switch (route.lock) {
    case 'read':
    case 'unlock':
    case 'resync':
      return false;
    case 'operator':
      return true;
    case 'operator-unless-redelivery':
      return (req as { redelivery?: boolean } | null)?.redelivery !== true;
  }
}

/**
 * 🔴 `B-258` — **IS THIS FRAME THE CONSOLE'S RECONNECT MACHINERY, rather than a press?**
 *
 * The lock exempted exactly these two frames with the reason _"the client's own reconnect
 * machinery, not a press"_, and the classification lives in `LockPolicy` — so this reads it
 * rather than keeping a second list (golden rule 6). The permission gate is right to REFUSE
 * them to a principal without the class; what it must not do is RECORD that refusal as
 * something the principal pressed. A viewer's reconnect wrote `refused · stack.restore` under
 * her name on every connect: a row for an act nobody performed, which is the record's worst
 * failure (`B-141`).
 */
export function isReconnectMachinery(route: Route, req: unknown): boolean {
  if (route.lock === 'resync') return true;
  return (
    route.lock === 'operator-unless-redelivery' &&
    (req as { redelivery?: boolean } | null)?.redelivery === true
  );
}

/**
 * 🔴 `B-257` — **THE CHANNELS A LOCK ENGAGED NOW WOULD COVER: the engager's, and nothing
 * else.** `undefined` means every channel — auth OFF, or an engager holding `'*'` — which is
 * the lock exactly as it was.
 *
 * A principal may only restrict what it holds authority over. It is EXACTLY the engager's
 * `permittedChannels` — the same `grantedChannels` composition `authStateFor` sends the console,
 * over the station's declared channels and hosts as they are at this moment — so the set the
 * lock stores and the set the engaging console displays as its own cannot differ.
 *
 * ⚠ CAPTURED by the caller at engage and stored on the lock. Never re-derived later: a token
 * refresh, a principal swap on the engaging console or a server-list edit must not move what a
 * lock that is already engaged covers.
 */
export function lockScopeAtEngage(
  principal: PlayoutPrincipal | null,
  runtime: CasparRuntime,
): readonly number[] | undefined {
  if (principal === null || principal.channels === '*') return undefined;
  return grantedChannels(
    principal.channels,
    configuredCasparHosts(runtime.config()),
    runtime.declaredChannels(),
  );
}

/**
 * 🔴 `B-257` — **WHICH OF A LOCK'S COVERED CHANNELS THIS PRINCIPAL HOLDS.** An empty answer
 * means the lock does not reach this console at all: it holds nothing the lock covers, so the
 * lock has nothing of its to restrict — and that console must not present itself as locked.
 *
 * `null` (no principal) holds nothing. The every-channel lock never asks this; it refuses as
 * it always has.
 */
export function coveredChannelsHeld(
  covered: readonly number[],
  principal: PlayoutPrincipal | null,
  runtime: CasparRuntime,
): readonly number[] {
  if (principal === null) return [];
  const hosts = configuredCasparHosts(runtime.config());
  return covered.filter((c) => grantsChannel(principal.channels, hosts, c));
}

/**
 * 🔴 `B-257` — **DOES THIS LOCK REACH THIS PRINCIPAL AT ALL?** The every-channel lock reaches
 * everybody; a covered-set lock reaches a principal who holds one of its channels. The ONE
 * answer to "is this console locked", asked by the request gate, by the `auth` frame
 * (`B-259`), and mirrored — from the same two inputs — by the console's lock surfaces.
 */
export function lockReaches(
  lock: LockState,
  principal: PlayoutPrincipal | null,
  runtime: CasparRuntime,
): boolean {
  if (!lock.engaged) return false;
  if (lock.channels === undefined) return true;
  return coveredChannelsHeld(lock.channels, principal, runtime).length > 0;
}

/**
 * 🔴 `B-257` / `B-260` — **DOES THE LOCK REFUSE THIS REQUEST, FROM THIS PRINCIPAL?** The one
 * decision the gate asks. {@link refusedWhileLocked} is kept exactly as it was — the census in
 * `lock-refuses-intents` pins it — and answers "is this an intent at all"; this answers the
 * rest.
 *
 * ── THE EVERY-CHANNEL LOCK — BYTE-IDENTICAL ─────────────────────────────────
 *
 * `lock.channels` absent (auth OFF, or an engager holding `'*'`): every intent is refused, for
 * every socket, exactly as before. `B-229` stands unchanged there, no-carve-out answer and all.
 *
 * ── THE COVERED-SET LOCK ────────────────────────────────────────────────────
 *
 * It refuses an intent only when it touches a covered channel THIS PRINCIPAL HOLDS:
 *
 *   - a principal holding none of the covered channels is not locked at all. An intent of
 *     theirs that touches a covered channel is one they hold no grant for, so the PERMISSION
 *     gate refuses it with the sentence that names the real obstacle — a PIN they do not have
 *     is not it (my audit's B2);
 *   - an intent that resolves to channels is refused iff one of them is covered and held;
 *   - an intent that resolves to NO channel — the station-wide verbs, and a verb on a row with
 *     no layer — touches every channel the principal holds, so it is refused;
 *   - PANIC is judged by where it REACHES: the channels its ledger holds seats on
 *     ({@link CasparRuntime.liveLedgerChannels}). It is not scoped by this — it silences the
 *     whole ledger or nothing (A16) — this only decides whether the lock lets the press through.
 *
 * ── `B-260` (b) — A RE-DELIVERY MAY NOT OVERWRITE UNDER A LOCK ─────────────
 *
 * The re-delivery exemption's reason is "not a press", and on the lock's own axis that reason
 * was false: a re-delivery of a held id REPLACES its HTML, so a locked console could change
 * what the next take airs. Refused when it would `replace` a held copy and the lock reaches
 * this principal; a re-delivery that REGISTERS a missing id, or changes nothing, still passes —
 * the reconnect keeps working under a lock, and nothing held is overwritten.
 */
export function lockRefuses(
  route: Route,
  req: unknown,
  lock: LockState,
  principal: PlayoutPrincipal | null,
  runtime: CasparRuntime,
): boolean {
  if (!lock.engaged) return false;
  const reaches = (): boolean => lockReaches(lock, principal, runtime);

  if (!refusedWhileLocked(route, req)) {
    if (!isReconnectMachinery(route, req) || route.lock !== 'operator-unless-redelivery') {
      return false;
    }
    const r = req as { template?: TemplateInfo; html?: string } | null;
    if (r?.template === undefined || r.html === undefined) return false;
    return reaches() && runtime.templateRedeliveryChange(r.template, r.html) === 'replace';
  }

  if (lock.channels === undefined) return true;
  const held = coveredChannelsHeld(lock.channels, principal, runtime);
  if (held.length === 0) return false;
  const footprint =
    route.channel.name === StackSilenceAllLivePlatesChannel.name
      ? runtime.liveLedgerChannels()
      : channelsForRequest(route, req, runtime);
  if (footprint.length === 0 && route.channel.name !== StackSilenceAllLivePlatesChannel.name) {
    return true;
  }
  return footprint.some((c) => held.includes(c));
}

/**
 * 🔴 `C-037` — **WHAT THE AUTH GATE IS LOOKING AT, as four names.**
 *
 * A boolean would collapse the two that matter most: a socket that has never signed in and a
 * socket whose session stopped holding are different situations with different answers, and
 * ADR 0010 rule 4 spells both — _"a never-authenticated socket gets `bridge.capabilities`
 * and the `auth.*` door, nothing else"_, while an expired one _"refuses NEW operator intents
 * … `read` routes keep answering"_.
 *
 * ⚠ It IS `@cg/shared-ipc`'s `AuthStatus`, aliased rather than redeclared: the same four
 * names travel on `auth.state`, and two spellings of one verdict is how a surface comes to
 * claim a state the gate does not hold.
 */
export type AuthGateState = AuthStatus;

/**
 * ⭐ **THE DOOR ADR 0010 RULE 4 LEAVES OPEN, spelled once.**
 *
 * `bridge.capabilities` because it is asked at CONNECT and is how a console DISCOVERS that it
 * must sign in (`B-153`); `auth.*` because it is the sign-in itself. Both are open in every
 * not-signed-in state, EXPIRED included — the way back in must not need the thing that
 * expired, which is the inverse half `B-229` insisted on for the lock.
 */
export function openToUnauthenticated(channelName: string): boolean {
  return channelName === BridgeCapabilitiesChannel.name || channelName.startsWith('auth.');
}

/**
 * The single decision. Exported for the auth census in
 * `tests/auth-gate.integration.test.ts`, which walks every route rather than sampling —
 * exactly as `refusedWhileLocked` is, and for the same reason: "everything else is refused"
 * is a claim about each channel, and no sample can make it.
 *
 * ⚠ **It reads `route.lock` for the EXPIRED case and that is not a re-derivation.**
 * `LockPolicy` already classifies every route as answering-a-question versus acting, which is
 * the same question the expiry carve-out asks; `C-038` is the item that adds a permission
 * class of its own, and adding a second required argument here would be doing its work with
 * none of its design. What this function does NOT do is treat the two policies as
 * interchangeable: `unlock` is reachable while LOCKED and refused while EXPIRED, because the
 * lock's way out is a PIN and an expired session's way out is signing in — neither strands
 * the operator, and each is answered by its own gate.
 */
export function refusedByAuth(route: Route, state: AuthGateState): boolean {
  if (state === 'off' || state === 'signed-in') return false;
  if (openToUnauthenticated(route.channel.name)) return false;
  if (state === 'absent') return true;
  /*
    🔴 **ONLY `read` SURVIVES AN INVALID SESSION — `resync` DOES NOT, and that is a
    deliberate divergence from `LockPolicy`, not an oversight.**

    The lock exempts `resync` because `StackRestoreChannel` is "unreachable from any operator
    control", which is true and is an argument about WHO can trigger it. Auth asks a different
    question: `stack.restore` is not a read. It seeds the reconciler, publishes a new stack to
    every console and parks items that can reach `CG ADD` on the wire. A principal the bridge
    has stopped accepting must not put anything on air, however it got there — so the carve-out
    that is right for a PIN is wrong for an expired token.

    Nobody is stranded: a console whose token lapsed is refused its restore, shows its sign-in,
    signs in, and restores on the next connect.
  */
  return route.lock !== 'read';
}

/**
 * ⭐ **THE ONE PLACE A SOCKET'S AUTH STATE IS DECIDED.** Golden rule 6: every door — the
 * request gate, the publish gate and `auth.state` — asks THIS, so they cannot come to
 * disagree about what "signed in" means. A second local derivation is how a name comes to lie
 * about what it tests.
 *
 * Read PER REQUEST and never latched, for `B-229`'s reason one axis over: a state captured at
 * connect would leave a console refused for the life of its socket after it signed in, and the
 * inverse half — that a fresh `auth` frame restores every control with no reload — matters as
 * much as the refusal.
 *
 * ⚠ It has a side effect, named rather than hidden: a live principal keeps the D9 bearer
 * fresh and the revocation poller ticking. The poller therefore runs exactly while somebody is
 * signed in, which is correct — with no principal there is no verdict a revocation could
 * change.
 */
export function authGateState(
  session: AuthSession | null,
  playoutAuth: PlayoutAuth | null,
): AuthGateState {
  if (playoutAuth === null) return 'off';
  // No session at all is a request outside a socket — `auth.state` reached from a bare route
  // table in a census, for instance. It has presented nothing, which is `absent`.
  const held = session?.token ?? null;
  if (held === null) return 'absent';
  if (playoutAuth.isExpired(held.expEpochSec)) return 'invalid';
  /*
    🔴 **THE CLOCK KEEPS RUNNING; THE CREDENTIAL DOES NOT CHANGE HANDS.**

    Two failures were possible here and the first two spellings each hit one of them. Checking
    revocation first and returning left nothing to kick the poller, so a station whose last
    signed-in socket went revoked would never poll again and could not learn it was wrong.
    Calling `noteLiveToken` first installed the REVOKED token as the process-wide D9 bearer,
    and the Playout answers `401` to that — which `#pollRevoked` correctly swallows, freezing
    the list for the whole bridge.

    So: a revoked token arms the tick and is never adopted as the credential.
  */
  if (playoutAuth.isRevoked(held.jti)) {
    playoutAuth.noteVerifiedButRevoked();
    return 'invalid';
  }
  playoutAuth.noteLiveToken(held.rawToken);
  return 'signed-in';
}

/**
 * 🔴 `OPERATOR-NAME-SWEEP-01` § 3(a) — **THIS SOCKET'S WHOLE AUTH STATE. The ONE composition.**
 *
 * Extracted so that the `auth.state` READ and the `auth.state-changed` PUBLISH cannot answer
 * differently. They did not, yet — the publish is new — and that is exactly when to make it
 * impossible: two spellings of one verdict is how a surface comes to claim a state the gate
 * does not hold, which `C-037` already had to fix once on this very field.
 *
 * ⚠ It reads the configuration at CALL time, through `configuredCasparHosts`. That is what
 * makes the publish meaningful: the event says "the server list moved", and this recomputes
 * the answer against the list as it now is.
 */
export function authStateFor(
  session: AuthSession | null,
  /**
   * The gate's verdict for this socket, supplied by whichever caller can compute it.
   *
   * ⚠ Taken rather than derived, because the two callers reach `authGateState` by different
   * routes: the publish holds the `PlayoutAuth` directly, while `buildRoutes` is given the
   * verdict as an injected function so a census can build the table with no verifier at all.
   * Passing the ANSWER keeps one predicate with one implementation and lets both in.
   */
  status: AuthGateState,
  mode: AuthMode,
  runtime: CasparRuntime,
): AuthState {
  const principal = session?.token?.principal ?? null;
  return {
    mode,
    principal,
    status,
    /*
      🔴 `C-038` — **THE PERMITTED-CHANNEL LIST, COMPUTED HERE AND NOWHERE ELSE.**

      `grantsChannel` stays the ONE implementation and this is its one caller, because this is
      the side that holds the connection config. A console re-deriving the same verdict would
      need `configuredCasparHosts` in a second package (`B-162`'s hole) and could disagree with
      the gate whenever its config read were stale — a control offered that the bridge refuses.

      ⚠ Gated on `signed-in` rather than on the principal being non-null: a principal survives
      expiry and revocation on purpose (see `AuthStateSchema.principal`), and a session that
      has stopped holding must not go on advertising channels.
    */
    permittedChannels:
      principal === null || status !== 'signed-in'
        ? []
        : [
            ...grantedChannels(
              principal.channels,
              configuredCasparHosts(runtime.config()),
              runtime.declaredChannels(),
            ),
          ],
  };
}

/**
 * 🔴 `C-038` — **WHICH CHANNELS A REQUEST TOUCHES. The ONE resolver.**
 *
 * Exported for the census in `tests/authz-classes.integration.test.ts`, which walks every
 * route rather than sampling — the same discipline `refusedWhileLocked` and `refusedByAuth`
 * are held to, and for the same reason: "every channel-bearing route is scoped" is a claim
 * about each route, and no sample can make it.
 *
 * ── THREE WAYS A REQUEST BECOMES A CHANNEL, AND THEY ARE NOT INTERCHANGEABLE ─
 *
 *   (a) **the request SAYS so** — `layers.clear`, `playoutLayers.clear`, `fixedLayers.load`,
 *       `fixedLayers.clear-layer`, `fixedLayers.set-config`, `channelSettings.set`, and
 *       `stack.restore` (one per item, so N of them);
 *   (b) **an `itemId` resolves through the runtime's ledgers** — every per-item verb, via
 *       {@link CasparRuntime.channelsForItem}, which unions `#slots` and `#liveLayers`;
 *   (c) **the verb's scope is the whole stack** — the bulk verbs, which union every member's
 *       channels and are then decided ALL-OR-NOTHING.
 *
 * ⭐ **AN EMPTY ARRAY MEANS "NOTHING TO AUTHORISE", AND IS NOT A REFUSAL.** See `design.md`
 * §4: `slot` is optional and the unbound state is deliberately reachable, so a `remove` on a
 * row that never bound a layer touches no channel and nothing on air. Refusing it would take
 * away an action that works today and call it a safety property — the exact shape this
 * change exists to prevent. The ROLE check still applies; only the channel check is vacuous.
 *
 * 🔴 **`stack.silence-all-live-plates` IS ABSENT ON PURPOSE.** Owner answer A16 and
 * CLAUDE.md's cadence floor both say it STAYS UNSCOPED. An emergency control must not depend
 * on the bookkeeping whose failure is the emergency — the argument that deleted `B-122`'s
 * status predicate, one door over. Adding it here would be the same defect with a fresh coat.
 */
export function channelsForRequest(
  route: Route,
  req: unknown,
  runtime: CasparRuntime,
): readonly number[] {
  const name = route.channel.name;

  // 🔴 A16 — unscoped, deliberately. Named FIRST so it cannot be reached by a later branch.
  if (name === StackSilenceAllLivePlatesChannel.name) return [];

  // (a) the request carries the coordinate itself.
  const explicit = (req as { channel?: unknown } | null)?.channel;
  if (typeof explicit === 'number') return [explicit];

  // (a′) `stack.restore` carries N items, each with its own optional slot.
  if (name === StackRestoreChannel.name) {
    const items = (req as { items?: readonly { slot?: { channel?: number } }[] } | null)?.items;
    const channels = new Set<number>();
    for (const item of items ?? []) {
      if (typeof item.slot?.channel === 'number') channels.add(item.slot.channel);
    }
    return [...channels];
  }

  // (b) one item, resolved through the runtime's two ledgers.
  const itemId = (req as { itemId?: unknown } | null)?.itemId;
  if (typeof itemId === 'string') return runtime.channelsForItem(itemId);

  // (b′) `air.restore` carries a LIST of item ids; every one of them must be permitted.
  const itemIds = (req as { itemIds?: unknown } | null)?.itemIds;
  if (Array.isArray(itemIds)) {
    const channels = new Set<number>();
    for (const id of itemIds as unknown[]) {
      if (typeof id === 'string') for (const c of runtime.channelsForItem(id)) channels.add(c);
    }
    return [...channels];
  }

  /*
    (c) THE BULK VERBS — the union of every member's channels, decided all-or-nothing by the
    caller. The ordering is the requirement `#removeRefusal` already forces on `removeAll`: a
    gate that refused as it went would act on every permitted row it reached before meeting a
    forbidden one, and then report that the action did not happen — while it had.
  */
  if (
    name === StackRemoveAllChannel.name ||
    name === StackClearAllChannel.name ||
    name === StackStopAllChannel.name
  ) {
    const channels = new Set<number>();
    for (const item of runtime.stackSnapshot()) {
      for (const c of runtime.channelsForItem(item.itemId)) channels.add(c);
    }
    return [...channels];
  }

  return [];
}

/**
 * 🔴 `C-038` — **MAY THIS PRINCIPAL SEND THIS REQUEST? The single decision, and the sentence
 * it is refused with.** `null` means yes.
 *
 * ⚠ **AUTH OFF RETURNS FIRST, BEFORE ANYTHING IS READ.** No role lookup, no channel
 * resolution, no config read. That is what makes "auth OFF is byte-identical" a property of
 * the code rather than a claim about it — and it is why the mode check is here rather than at
 * the call site, where a future second caller could forget it.
 *
 * ⚠ **THE ROLE IS CHECKED BEFORE THE CHANNEL, and the order is the message.** A viewer who
 * presses TAKE should be told their sign-in does not allow that command — not that it does
 * not cover channel 1, which is true, useless, and sends them to ask for a channel they still
 * could not use. The narrower sentence is only right once the broader one passes.
 */
/**
 * A permission refusal: the sentence the operator reads, and — when the refusal was about a
 * CHANNEL rather than the role — which one.
 *
 * ⚠ **The channel rides the verdict rather than being re-derived by the caller**, because the
 * audit row and the sentence must name the SAME channel. Two derivations is how they would come
 * to disagree in exactly the dispute the row exists to settle (golden rule 6).
 */
export interface AuthzRefusal {
  readonly message: string;
  readonly casparChannel?: number;
}

export function authzRefusal(
  route: Route,
  req: unknown,
  session: AuthSession | null,
  playoutAuth: PlayoutAuth | null,
  runtime: CasparRuntime,
): AuthzRefusal | null {
  if (playoutAuth === null) return null;

  /*
    `openToUnauthenticated` names the door that has to be open before there is anybody to
    authorise — `bridge.capabilities` and `auth.*`. A principal-less socket has already been
    refused above for everything else, so what reaches here is the door itself.
  */
  if (openToUnauthenticated(route.channel.name)) return null;

  const principal = session?.token?.principal ?? null;
  if (principal === null) return null; // `refusedByAuth` owns this case; never double-refuse.

  if (!holdsPermissionClass(principal.roles, route.perm)) {
    return { message: AUTHZ_ROLE_REFUSAL };
  }

  const channels = channelsForRequest(route, req, runtime);
  if (channels.length === 0) return null; // nothing here to authorise — `design.md` §4.

  const hosts = configuredCasparHosts(runtime.config());
  const refused = channels.find((c) => !grantsChannel(principal.channels, hosts, c));
  return refused === undefined
    ? null
    : { message: authzChannelRefusal(refused), casparChannel: refused };
}

/**
 * B-038 Phase 2 — generous inbound WS frame cap. A `templates.import` frame
 * carries the rendered self-contained HTML (inlined runtime + scene + base64
 * images) — hundreds of KB to a couple of MB, once per import (not a hot path).
 * Set well above that so a large import is never silently dropped; gzip remains a
 * later tuning, not a contract change (design §4).
 */
const WS_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

/**
 * Default connection — a SINGLE loopback CasparCG on the standard AMCP/OSC
 * ports. B-046: a backup is declared (CLI `--backup-*` flags / explicit
 * config), never assumed — the old phantom `127.0.0.1:5251` default made
 * every send diverge, replayed the journal at a dead queue, and churned
 * health forever.
 */
function defaultConnection(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/**
 * Where the fixed bank in force came from — named in the CLI's boot line and,
 * for the default, in a boot refusal. `none` is the embedder case: no explicit
 * bank and no path, so no bank at all.
 */
export type FixedBankSource = 'explicit' | 'file' | 'built-in default' | 'none';

/**
 * THE fixed-bank boot precedence, in one place and in this order:
 *
 *   1. `options.fixedLayers` — an explicit in-process bank (tests, embedders).
 *      No CLI flag sets this; a flag would be a per-run override, and the whole
 *      point of the default below is that a station needs no per-run anything.
 *   2. the persisted file at `fixedLayersPath` — the station's DEVIATION from
 *      the default. Present-but-unusable is still a hard boot failure
 *      (`loadFixedLayerBank`); only a genuinely ABSENT file falls through.
 *   3. the BUILT-IN DEFAULT (`defaultFixedLayerBank`) — 70–99, top five ticked.
 *
 * STEP 3 IS CONDITIONAL ON A PATH HAVING BEEN CONFIGURED, and that is a
 * contract, not an accident. Passing `fixedLayersPath` is what says "this
 * process is a station, and its bank lives here" — the CLI always passes one
 * (defaulted to `~/.cg-runtime/bridge-fixed-layers.json`), so every real
 * machine reaches step 3. `createBridge({})` with no path at all is an embedder
 * that has declared no config surface whatsoever; it still gets NO bank, which
 * is what `fixed-layers-boot` T18 pins and what every integration test that
 * declares its own layers relies on.
 */
function resolveFixedBank(options: BridgeOptions): {
  bank: FixedLayerBank | null;
  source: FixedBankSource;
} {
  if (options.fixedLayers !== undefined) return { bank: options.fixedLayers, source: 'explicit' };
  if (options.fixedLayersPath === undefined) return { bank: null, source: 'none' };
  const persisted = loadFixedLayerBank(options.fixedLayersPath);
  return persisted !== null
    ? { bank: persisted, source: 'file' }
    : { bank: defaultFixedLayerBank(), source: 'built-in default' };
}

/**
 * `validateFixedBank`, plus the one thing a default bank needs that a declared
 * one does not: a refusal that says WHERE the offending bank came from.
 *
 * A conflict between the built-in default and this station's reserved playout
 * range is still a HARD boot failure — nothing here weakens the disjointness
 * rules, and falling back to "no bank" on a conflict would be the silent
 * config/state divergence `fixed-layers-store.ts` exists to refuse. But the
 * operator would otherwise be sent hunting through a file that does not exist,
 * so the message names the default and the file that overrides it.
 */
function validateDeclaredBank(
  bank: FixedLayerBank,
  source: FixedBankSource,
  fixedLayersPath: string | undefined,
  options: { policy: LayerPolicy; reservedLayers: readonly number[] },
): readonly LayerSlot[] {
  try {
    return validateFixedBank(bank, options);
  } catch (err) {
    if (source !== 'built-in default' || !(err instanceof FixedLayersConfigError)) throw err;
    throw new FixedLayersConfigError(
      err.code,
      `the BUILT-IN DEFAULT candidate bank was refused by this station's own config — ` +
        `${err.message}. No fixed-layers file is present${
          fixedLayersPath !== undefined ? ` at ${fixedLayersPath}` : ''
        }, so the default applied; write a bank there that fits this station to override it.`,
    );
  }
}

/**
 * Start the localhost CasparCG bridge (C-001).
 *
 * A single `ws` WebSocket server speaks the existing `@cg/shared-ipc`
 * request/response + publish contract as JSON frames (see `ws-frame.ts`),
 * backed by the real `@cg/caspar-client` stack (`CasparRuntime`). It binds
 * loopback by default, **enforced at the socket bind** via
 * `new WebSocketServer({ host, port })`.
 *
 * The CasparCG session is started in the background — `createBridge` resolves as
 * soon as the WebSocket is listening, so the bridge serves even while the server
 * is unreachable (commands then fail their AMCP ack). Tests await
 * `handle.runtime.whenServerHealthy()` before driving playout.
 */
export async function createBridge(options: BridgeOptions = {}): Promise<BridgeHandle> {
  const host = options.host ?? DEFAULT_BRIDGE_HOST;
  const requestedPort = options.port ?? DEFAULT_BRIDGE_PORT;
  /*
    🔴 `C-037` — THE PLAYOUT LINK, RESOLVED BEFORE ANYTHING BINDS.

    First, so that a bridge told to authenticate and told nothing else fails with a sentence
    naming the key rather than binding a socket and then discovering it cannot verify
    anything. Same doctrine as the fixed bank and the source catalog: present-but-unusable
    throws BEFORE the port is listening, so a failed boot leaves nothing serving.
  */
  const auth = resolvePlayoutSettings(
    options.playout ?? {},
    options.playoutConfigPath !== undefined ? loadPlayoutFile(options.playoutConfigPath) : null,
    (message) =>
      process.stderr.write(`${message}
`),
  );
  const playoutAuth =
    auth.playout === null ? null : new PlayoutAuth(auth.playout, options.playoutAuthOptions ?? {});
  // R-010 boot precedence: explicit connection (CLI flags) > persisted file >
  // the single-server default. Flags are session overrides — they win without
  // clobbering the persisted file.
  const connection =
    options.connection ??
    (options.persistPath !== undefined ? loadPersistedConnection(options.persistPath) : null) ??
    defaultConnection();
  // R-021 stage 1 — resolve the fixed bank (explicit > persisted file > none)
  // and VALIDATE it before anything binds: a bad bank is a hard boot failure,
  // never a warning (fixed-layers-store.ts header). The policy is resolved
  // ONCE and the SAME object goes to both the validator and the LayerManager —
  // never two copies of the policy.
  const layerPolicy = options.layerPolicy ?? DEFAULT_LAYER_POLICY;
  // R-028 / C-015 — the reserved playout layers, from REAL config (explicit >
  // persisted file > nothing). Resolved ONCE; the SAME list goes to the boot
  // validator, every live-change validation, and the LayerManager's
  // allocation fence — never re-derived.
  const reserved =
    options.reservedLayers ??
    (options.reservedLayersPath !== undefined
      ? loadReservedLayers(options.reservedLayersPath)
      : null);
  const reservedLayers =
    reserved !== null && reserved !== undefined ? reservedLayerNumbers(reserved) : [];
  const { bank: fixedBank, source: fixedBankSource } = resolveFixedBank(options);
  const fixedSlots =
    fixedBank !== null
      ? // R-028 (2.5) — the candidate ceiling must never intersect the
        // reserved playout range: refused HERE at load, and again at every
        // change (`setFixedLayers` reads the same list). A violation throws
        // BEFORE the WebSocket binds — conflicts resolve loudly at startup.
        validateDeclaredBank(fixedBank, fixedBankSource, options.fixedLayersPath, {
          policy: layerPolicy,
          reservedLayers,
        })
      : [];
  // D-137 / C-015 — the installation's Live Source mapping, loaded and
  // VALIDATED here, BEFORE the WebSocket binds and against the SAME bank and
  // reserved list the fixed-bank validator just saw. Both halves are deliberate:
  // an unusable file must stop the boot rather than serve a station that
  // resolves three of its four ids, and a band overlapping the bank or the
  // reservation must resolve loudly at startup rather than at a take.
  const sourceCatalog = resolveSourceCatalog(options);
  validateSourceCatalog(sourceCatalog.value, { fixedBank, reservedLayers });
  // The ASSIGNMENTS half, loaded against the catalog just resolved. A dangling
  // reference is PRUNED rather than fatal — see `source-assignments-store.ts`'s
  // header — but a duplicated plate is still a refusal, because two answers for
  // one hole is not a state anything downstream can read.
  const resolvedAssignments = resolveSourceAssignments(options);
  // PRUNE FIRST, then validate. The order is the doctrine: a dangling reference
  // is dropped (it has a clear reading — that plate is unassigned) while a
  // DUPLICATED plate is still fatal, because two answers for one hole is not a
  // state anything downstream can read. Validating first would make the ordinary
  // restored-file case a boot failure.
  const prunedAssignments = pruneAssignmentsForCatalog(
    resolvedAssignments.value,
    sourceCatalog.value,
  );
  validateSourceAssignments(prunedAssignments.value, { catalog: sourceCatalog.value });
  const runtime = new CasparRuntime(connection, options.templateServe ?? {}, {
    fixedSlots,
    layerPolicy,
    reservedLayers,
    ...(fixedBank !== null ? { fixedBank } : {}),
    ...(options.templatesDir !== undefined ? { templatesDir: options.templatesDir } : {}),
    sourceCatalog: sourceCatalog.value,
    sourceAssignments: prunedAssignments.value,
    ...(options.auditLogPath !== undefined ? { auditLogPath: options.auditLogPath } : {}),
    ...(options.lookMixerHoldMs !== undefined ? { lookMixerHoldMs: options.lookMixerHoldMs } : {}),
    // C-029 — resolved through the ONE default-owning function, never `?? false` here.
    createMissingConsumers: resolveCreateMissingConsumers(options.createMissingConsumers),
    ...(options.runtimeTuning ?? {}),
  });
  // B-145 — adopt the persisted ledger, then keep it written.
  //
  // 🔴 ADOPT BEFORE SUBSCRIBING TO THE CHANGES, and the order is load-bearing: subscribing
  // first would have the adopt's own publish write the file back before it has been
  // corrected, which for one moment persists a claim nothing had verified.
  const liveLayersProvenance: {
    path: string | null;
    source: 'file' | 'absent' | 'unusable' | 'off';
    adopted: number;
    unverified: number;
    dropped: number;
  } = {
    path: options.liveLayersPath ?? null,
    source: options.liveLayersPath === undefined ? 'off' : 'absent',
    adopted: 0,
    unverified: 0,
    dropped: 0,
  };
  if (options.liveLayersPath !== undefined) {
    const loaded = loadPersistedLiveLayers(options.liveLayersPath);
    if (loaded.problem !== undefined) {
      liveLayersProvenance.source = 'unusable';
      process.stderr.write(
        `[caspar-bridge] ⚠ the live-layer ledger at ${loaded.problem.file} is present but ` +
          `unusable (${loaded.problem.reason}) — booting with an EMPTY ledger, so any layers ` +
          `still lit from a previous run are unreachable until they are cleared by hand
`,
      );
    }
    if (loaded.ledger !== null) {
      // Occupancy is not knowable at this point — no session has connected yet — so every
      // record adopts UNVERIFIED rather than being dropped. Absence of knowledge is not
      // knowledge of absence: dropping here would strand exactly the producers this item
      // exists to stop stranding. A later reading corrects the ledger; a wrong drop cannot
      // be undone.
      const adoption = runtime.adoptLiveLayers(loaded.ledger, () => 'unknown');
      liveLayersProvenance.source = 'file';
      liveLayersProvenance.adopted = adoption.adopted.size;
      liveLayersProvenance.unverified = adoption.unverified.length;
      liveLayersProvenance.dropped = adoption.dropped.length;
      process.stderr.write(
        `[caspar-bridge] adopted ${String(adoption.adopted.size)} item(s) of live layers from ` +
          `${options.liveLayersPath} (${String(adoption.unverified.length)} unverified until the ` +
          `first occupancy reading)
`,
      );
    }
    const liveLayersPath = options.liveLayersPath;
    runtime.liveLayersChanged.subscribe((ledger) => {
      try {
        savePersistedLiveLayers(liveLayersPath, ledger);
      } catch (err) {
        process.stderr.write(
          `[caspar-bridge] ⚠ failed to persist the live-layer ledger to ${liveLayersPath}: ` +
            `${err instanceof Error ? err.message : String(err)} — seated layers will not ` +
            `survive a bridge restart
`,
        );
      }
    });
  }

  const routes = buildRoutes(runtime, {
    ...(options.persistPath !== undefined ? { persistPath: options.persistPath } : {}),
    ...(options.fixedLayersPath !== undefined ? { fixedLayersPath: options.fixedLayersPath } : {}),
    ...(options.sourceCatalogPath !== undefined
      ? { sourceCatalogPath: options.sourceCatalogPath }
      : {}),
    ...(options.sourceAssignmentsPath !== undefined
      ? { sourceAssignmentsPath: options.sourceAssignmentsPath }
      : {}),
    auth,
    authState: (session) => authGateState(session, playoutAuth),
    releaseBearer: (rawToken) => playoutAuth?.releaseBearer(rawToken),
  });

  const wss = new WebSocketServer({
    host,
    port: requestedPort,
    maxPayload: WS_MAX_PAYLOAD_BYTES,
  });

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });

  const address = wss.address();
  const port = typeof address === 'object' && address !== null ? address.port : requestedPort;

  /*
    🔴 `C-037` / ADR 0010 rule 11 — **AN UNAUTHENTICATED CONTROL SOCKET THAT IS NOT ON
    LOOPBACK SAYS SO.**

    ⚠ Written NEW, and the acceptance bullet that asks for it says "the existing warning
    prints" — so state plainly what was measured: there was no such warning. The two that
    exist (`bridge.ts` at boot and `caspar-runtime.ts` on reconfigure) are about the TEMPLATE
    HTTP server, a different socket on a different port, and the second of them even ends
    _"Control WebSocket remains loopback-bound"_ — a sentence `--host 0.0.0.0` makes false.
    `--host 0.0.0.0` has been permitted for development since the beginning and nothing
    anywhere announced it.

    The owner's default is unchanged: auth OFF + loopback is today and stays, auth OFF +
    `--host 0.0.0.0` stays PERMITTED. What changes is that it is no longer silent. The
    stricter rule — "an unauthenticated control socket never leaves loopback" — is recorded
    in the ADR as NOT adopted now and as a candidate golden rule once auth ships; this line is
    what makes the interim state visible rather than assumed.
  */
  if (playoutAuth === null && !isLoopbackHost(host)) {
    process.stderr.write(
      `[caspar-bridge] ⚠ control WebSocket is LAN-EXPOSED on ${host}:${String(port)} with ` +
        `auth OFF — any machine that can reach this port can drive this station. Permitted ` +
        `for development (ADR 0010 rule 11); the plant runs with auth ON.
`,
    );
  }

  wss.on('connection', (socket) => {
    /*
      🔴 `C-037` — ONE PRINCIPAL HOLDER PER SOCKET, created here because here is where a
      connection begins. Two browsers are two people; see `auth-session.ts` for why this is
      not a field on the bridge.
    */
    const session = new AuthSession();
    /*
      🔴 **THE PUBLISH GATE — the SECOND door, and it used to be wide open.**

      `wirePublishes` subscribed every socket to stack state, health, the lock, the live-layer
      ledger and the emptied-air notice the instant it connected, before a single frame was
      read. A request-level gate does not touch that path: an unauthenticated socket would be
      refused every command and still be told everything. ADR 0010 rule 4 says a
      never-authenticated socket gets `bridge.capabilities` and the `auth.*` door and
      **nothing else**, and a stream of state is something else.

      ⚠ Spelled as a DELIVERY predicate rather than by deferring the subscription, because
      sign-out has to close it again on the same socket — and a wire/unwire pair is two
      operations that must stay in step, where one predicate read at push time cannot fall out
      of step with itself. The console's own `#resync` re-delivers on sign-in, which is the
      same machinery it already runs on every (re)connect.

      ⚠ Auth OFF returns `true` always, so not one byte of today's behaviour moves.
    */
    const unsubscribers = wirePublishes(
      socket,
      runtime,
      () => authGateState(session, playoutAuth) !== 'absent',
      // § 3(a) — THIS socket's principal, through the one composition `auth.state` answers with.
      () => authStateFor(session, authGateState(session, playoutAuth), auth.mode, runtime),
    );
    socket.on('message', (data) => {
      // `B-229` — the lock is read PER REQUEST from the live runtime, never captured.
      void handleMessage(
        socket,
        routes,
        data.toString(),
        () => runtime.lockState(),
        session,
        playoutAuth,
        runtime,
      );
    });
    const dropSocket = (): void => {
      for (const off of unsubscribers) off();
      /*
        ⚠ A CLOSED TAB IS A SIGN-OUT THE OPERATOR NEVER PRESSED. Without this the bridge keeps
        calling the Playout with that console's token until `exp` — twelve hours — and nothing
        anywhere reports it, because the token is still perfectly valid.
      */
      const raw = session.token?.rawToken;
      if (raw !== undefined) playoutAuth?.releaseBearer(raw);
    };
    socket.on('close', dropSocket);
    socket.on('error', dropSocket);
  });

  runtime.start();
  // B-038 Phase 3 — start the template HTTP server so `CG ADD` can reference a
  // real, loadable `/template/<id>` URL. Awaited so the bound port is known.
  await runtime.startServing();
  const serve = runtime.templateServe;
  const serveHost = serve?.serveHost ?? DEFAULT_BRIDGE_HOST;
  const servePort = serve?.port ?? 0;
  const exposed =
    serve !== null && serve.bindHost !== '127.0.0.1' && serve.bindHost !== 'localhost';
  // B-162 — the CORRECTNESS verdict, from the SAME predicate the apply path
  // uses, over EVERY declared server rather than the primary alone.
  const unreachable =
    serve === null ? [] : hostsUnableToFetchTemplates(configuredCasparHosts(connection), serve);
  /*
    C-024 — WHICH LAYER ANSWERED, computed from the same two inputs the resolution used.

    ⚠ Deliberately NOT inferred from the resulting value. A stored host can be byte-identical to
    the derived one (`127.0.0.1` on an all-local install is the common case), so comparing them
    would report "derived" for a value the operator explicitly configured — and would flip between
    the two labels as the servers changed, with nothing in the address itself having moved.
  */
  const serveSource: 'flag' | 'config' | 'derived' =
    options.templateServe?.serveHost !== undefined
      ? 'flag'
      : normalizeServeHost(connection.templateServeHost) !== undefined
        ? 'config'
        : 'derived';
  const templateServe = {
    url: `http://${serveHost}:${String(servePort)}`,
    serveHost,
    port: servePort,
    exposed,
    unreachable,
    source: serveSource,
  };
  // Loud warning ONLY when the template server is LAN-exposed (remote CasparCG):
  // a wrong serve-host guess must be obvious. Loopback (the common case) is quiet.
  if (exposed) {
    process.stderr.write(
      `[caspar-bridge] ⚠ template HTTP server LAN-EXPOSED on ${serve?.bindHost ?? '0.0.0.0'}:${String(servePort)} ` +
        `— CG ADD URL host is ${serveHost}. Ensure this is the bridge's address as CasparCG sees it.\n`,
    );
  }
  // B-162 — its complement, and the one that costs graphics rather than
  // privacy. Quiet when every declared server can reach us; loud, naming the
  // servers and the flag that fixes it, when one cannot.
  if (unreachable.length > 0 && serve !== null) {
    process.stderr.write(templateServeUnreachableWarning(unreachable, serve));
  }

  return {
    host,
    port,
    url: `ws://${host}:${port}`,
    auth,
    playoutAuth,
    templateServe,
    runtime,
    fixedBankSource: { bank: fixedBank, source: fixedBankSource },
    templates: runtime.templateProvenance,
    sourceCatalog,
    sourceAssignments: {
      value: prunedAssignments.value,
      source: resolvedAssignments.source,
      pruned: prunedAssignments.dropped,
    },
    liveLayers: liveLayersProvenance,
    dropConnections() {
      for (const client of wss.clients) client.terminate();
    },
    async close() {
      for (const client of wss.clients) client.terminate();
      // `C-037` — stop the D9 tick with the bridge. It is `unref`'d, so it never held the
      // process open; clearing it is what keeps a test suite from leaving one per bridge.
      playoutAuth?.dispose();
      await runtime.stop();
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function handleMessage(
  socket: WebSocket,
  routes: Map<string, Route>,
  raw: string,
  lockState: () => LockState,
  session: AuthSession,
  playoutAuth: PlayoutAuth | null,
  runtime: CasparRuntime,
): Promise<void> {
  const frame = parseWsFrame(raw);
  if (frame === null) return;

  /*
    🔴 `C-037` — THE `auth` FRAME, HANDLED BEFORE THE ROUTE TABLE IS EVEN CONSULTED.

    It is not a channel and it deliberately has no route: the gate that refuses every channel
    has to be able to run BEFORE a principal exists, and a door spelled as one of the things
    behind the door is a carve-out somebody has to remember. As a frame type it is outside the
    route table by construction, so the census that walks every route cannot miss it.

    ⚠ The SCHEMA already refused anything but a non-empty string `token` (`parseWsFrame`), so
    the verifier never sees a malformed input — cryptographic code should not be the first
    thing to meet one.
  */
  if (frame.type === 'auth') {
    /*
      ⚠ REGISTERED BEFORE IT IS AWAITED, so a frame dispatched on the very next message event
      already sees it. Registering after the await would be registering after the window it
      exists to cover.
    */
    const verification = handleAuthFrame(socket, frame, session, playoutAuth, runtime);
    session.trackVerification(verification);
    await verification;
    return;
  }

  // Only `request` frames are otherwise inbound to the bridge; ignore anything else.
  if (frame.type !== 'request') return;

  const route = routes.get(frame.channel);
  if (route === undefined) {
    send(socket, errorResponse(frame.id, `unknown channel: ${frame.channel}`));
    return;
  }

  const parsedReq = route.channel.request.safeParse(frame.payload);
  if (!parsedReq.success) {
    send(socket, errorResponse(frame.id, `invalid request for ${frame.channel}`));
    return;
  }

  /*
    🔴 `B-229` — THE LOCK GATE, AT THE ONE CHOKEPOINT EVERY REQUEST PASSES.

    Here and not inside each handler, for the reason `P-013` put the gate lock at the
    single `gate` script and `B-100`/`P-012` keep restating: a rule spelled per call site
    is a rule that is already broken at the site nobody looked at. Sixty routes would have
    been sixty chances to forget, and the sixty-first would arrive next month.

    It reads `isLocked()` PER REQUEST, never latched at connect: a gate armed when the
    socket opened would leave a browser refused for the life of its connection after the
    operator unlocked, and the inverse half of this bug — that unlocking restores every
    control immediately, with no reload — matters as much as the refusal.

    It sits AFTER the request parse so a locked bridge still answers a MALFORMED request
    with the shape error. The alternative tells a page with a genuine skew that the console
    is locked, sending the operator to type a PIN at a problem a PIN cannot fix.

    ⚠ The refusal is an ERROR FRAME, not a channel response. Sixty channels have sixty
    response schemas and most could not carry a refusal without being widened; the frame
    error is the one shape every channel already has. `bridgeErrorFrom` (`B-152`) passes a
    non-skew message through verbatim, so this reaches every existing `err.message` surface
    already worded for an operator, with no renderer change.
  */
  /*
    🔴 `B-257` — a COVERED-SET lock's verdict turns on WHO is asking, so it waits for a
    sign-in that is still landing (see the wait below) before it decides, and re-reads the
    lock after that wait rather than judging on a value from before it. The every-channel
    lock does not depend on the principal and decides at once, exactly as it always did.
  */
  let lock = lockState();
  if (lock.engaged && lock.channels !== undefined) {
    await session.whenSettled();
    lock = lockState();
  }
  if (lockRefuses(route, parsedReq.data, lock, session.token?.principal ?? null, runtime)) {
    send(socket, errorResponse(frame.id, LOCK_ENGAGED_REFUSAL));
    return;
  }

  /*
    🔴 `C-037` / ADR 0010 rule 1 — **THE AUTHORISATION GATE, BESIDE THE LOCK GATE, AT THE
    ONE CHOKEPOINT EVERY REQUEST PASSES.**

    Here for the reason the lock gate is here, quoted in the ADR as the whole argument: _"a
    rule spelled per call site is a rule that is already broken at the site nobody looked
    at."_ Sixty routes would be sixty chances to forget, and the sixty-first arrives next
    month.

    ⚠ **AFTER the lock gate and not before**, deliberately. A locked console is a fact the
    operator already knows and can act on in four keystrokes; being told to sign in when the
    real obstacle is the lock would send them to the wrong remedy. The ORDER is the message.

    ⚠ It reads the state PER REQUEST, never latched at connect — which is what makes a fresh
    `auth` frame on the SAME socket restore every control with no reload.

    🔴 Nothing below this line changes any refusal CONDITION on the path to air: the lock is
    untouched, PANIC is untouched, and golden rule 10's gate has not moved. What changed is
    that a socket without a principal now gets two answers instead of every answer — when,
    and only when, auth is ON.
  */
  /*
    🔴 **WAIT FOR A SIGN-IN THAT IS STILL LANDING, BEFORE JUDGING THIS FRAME.**

    Frames are dispatched concurrently — `socket.on('message')` calls `void handleMessage(…)`
    and nothing serializes them — so a console that writes its `auth` frame and then, in the
    same tick, its whole resync would have every one of those frames gated while the token was
    still being verified. All of them would be refused and the console would come back with an
    empty library and no stack. See `AuthSession.whenSettled`.

    ⚠ AFTER the lock gate and the request parse, and BEFORE the auth gate: a malformed frame
    still gets its shape error without waiting on a network fetch, and a locked console is
    still told it is locked.
  */
  await session.whenSettled();
  const gate = authGateState(session, playoutAuth);
  if (refusedByAuth(route, gate)) {
    send(socket, errorResponse(frame.id, AUTH_REQUIRED_REFUSAL));
    return;
  }

  /*
    🔴 `C-038` — **THE AUTHORISATION GATE, AFTER AUTHENTICATION AND BEFORE THE HANDLER.**

    The order is the requirement, not a style choice. A socket with no principal must be told
    it is not signed in (the gate above), never that its permissions are insufficient — the
    second sentence names a remedy that would send an unauthenticated operator to an account
    manager for a problem a sign-in fixes.

    ⚠ **AUTH OFF RETURNS HERE, BEFORE ANYTHING IS RESOLVED.** `authzRefusal` reads the mode
    first, so a station that has not federated identity does no role lookup, no channel
    resolution and no config read on any request. That is what makes "auth OFF is
    byte-identical" a property of the code rather than a claim about it.
  */
  const authz = authzRefusal(route, parsedReq.data, session, playoutAuth, runtime);
  if (authz !== null) {
    /*
      🔴 `C-038` acceptance — **THE REFUSAL IS RECORDED, WITH THE VERIFIED ACTOR.**

      A permission refusal is the one kind a dispute turns on the next day: somebody says the
      console would not let them do their job, and the log is what settles it. `C-037`'s gate
      and `B-229`'s lock both refuse SILENTLY — that is their own decision and this does not
      change it — but neither of those turns on WHO, and this one does.

      ⚠ Written here rather than inside `authzRefusal`, so that the predicate stays pure and
      the census can walk it without writing rows. The gate acts; the predicate decides.
    */
    const principal = session?.token?.principal;
    /*
      🔴 `B-258` — the console's reconnect machinery is REFUSED, and NOT RECORDED as a press.
      The refusal still goes back on the wire, so the console hears it; what does not happen is
      a row naming a person for an act they never performed.
    */
    if (principal !== undefined && !isReconnectMachinery(route, parsedReq.data)) {
      runtime.recordAuthzRefusal({
        actor: principal.name,
        actorSub: principal.sub,
        channel: route.channel.name,
        ...(authz.casparChannel !== undefined ? { casparChannel: authz.casparChannel } : {}),
      });
    }
    send(socket, errorResponse(frame.id, authz.message));
    return;
  }

  try {
    /*
      Stack ops are async (they await their AMCP ack); await every handler.

      B-141 follow-up — the handler runs inside the acting console's actor context,
      so every audit append it reaches records WHO asked, at any depth and across
      every await, without a single call site taking an actor parameter. Two browsers
      interleaving their requests each keep their own; see `actor-context.ts` for why
      that rules out a mutable "current actor" field.

      ⭐ `BRIDGE-TRUTH-01` §4 — with auth OFF this records `console` (a console did it, nobody
      proved who), with auth ON the verified principal's name. The wire's `actor` field is not
      read: it was the self-declared name `OPERATOR-NAME-SWEEP-01` retired.
    */
    /*
      `C-037` — the session travels into the actor context so a verified name reaches the
      record, `sub` rides beside it, and the `auth.*` routes can reach their own socket's
      principal. One decision, in `actor-context.ts`.
    */
    const result = await runAsActor(session, () => route.handle(parsedReq.data));
    const parsedRes = route.channel.response.safeParse(result);
    if (!parsedRes.success) {
      send(socket, errorResponse(frame.id, `invalid response for ${frame.channel}`));
      return;
    }
    const response: WsResponseFrame = { type: 'response', id: frame.id, payload: parsedRes.data };
    send(socket, response);
  } catch (err) {
    send(socket, errorResponse(frame.id, err instanceof Error ? err.message : 'handler error'));
  }
}

/**
 * 🔴 `C-037` — **VERIFY A PRESENTED TOKEN AND SEAT (OR DROP) THIS SOCKET'S PRINCIPAL.**
 *
 * The reply is an ordinary `response` frame correlated by the frame's own `id`, carrying the
 * `auth.state` payload on success and a sentence on refusal — so a console needs no second
 * mechanism to learn the answer, and `bridgeErrorFrom` (`B-152`) carries the sentence to the
 * surface verbatim.
 *
 * ⚠ **A bridge with auth OFF answers, and answers honestly.** A console that presents a
 * token to a bridge that does not authenticate is not an error: it is a console that has been
 * pointed at a development bridge. It is told `mode: 'off'`, which is exactly what
 * `bridge.capabilities` told it, and it stops offering a sign-in.
 *
 * ⚠ Every failure leaves the PREVIOUS principal in place. A bad second `auth` frame must not
 * sign an operator out mid-shift — that would make a stray frame a way to take a console off
 * the air, which is the shape of defect this whole change exists to remove.
 */
async function handleAuthFrame(
  socket: WebSocket,
  frame: WsAuthFrame,
  session: AuthSession,
  playoutAuth: PlayoutAuth | null,
  runtime: CasparRuntime,
): Promise<void> {
  if (playoutAuth === null) {
    send(socket, {
      type: 'response',
      id: frame.id,
      payload: {
        mode: 'off',
        principal: null,
        status: 'off',
        // Auth off: no principal to scope to, and every control is reachable.
        permittedChannels: [],
      } satisfies AuthState,
    });
    return;
  }
  if (frame.token.trim() === '') {
    send(socket, errorResponse(frame.id, AUTH_NO_TOKEN));
    return;
  }
  const result = await playoutAuth.verify(frame.token);
  if (!result.ok) {
    send(socket, errorResponse(frame.id, result.refusal));
    return;
  }
  /*
    🔴 A ROW WHEN THE PRINCIPAL CHANGES, NOT WHEN A TOKEN ARRIVES.

    The obvious spelling records on every accepted `auth` frame, and it over-counts: the console
    re-presents a REFRESHED token on this same socket about ten minutes before expiry (D2), and
    a reader counting sign-ins would see two people where there was one. A refresh changes
    nobody — same `sub`, same person, same session — so it is silent.

    ⚠ A RECONNECT still records one, and that is correct rather than an inconsistency: a
    reconnect is a new socket, so it is a new connection establishing an identity, which is
    exactly what this row exists to answer.

    Computed BEFORE `adopt`, because after it the previous principal is gone.
  */
  /*
    🔴 `B-259` — **A LOCKED CONSOLE DOES NOT CHANGE HANDS BY TOKEN.**

    A principal change is sign-out plus sign-in in one frame, and sign-out is refused while the
    lock reaches this socket (`B-229`'s no-carve-out answer, pinned at
    `lock-refuses-intents.integration.test.ts:281`). This frame is outside the route table, so
    the request gate never saw it and the swap went through; `B-259` measured it.

    ⚠ **The REFRESH passes — same `sub`.** The console re-presents a refreshed token about ten
    minutes before expiry (D2); refusing that would lapse the session of a console locked across
    a token's lifetime. A FIRST sign-in on a socket passes too (there is nobody to displace) —
    a console reloaded under a lock must still be able to sign in.

    Judged against the socket's CURRENT principal, read AFTER the verification's await.
  */
  const current = session.token?.principal ?? null;
  if (
    current !== null &&
    current.sub !== result.token.principal.sub &&
    lockReaches(runtime.lockState(), current, runtime)
  ) {
    send(socket, errorResponse(frame.id, LOCK_ENGAGED_REFUSAL));
    return;
  }
  session.adopt(result.token);
  playoutAuth.noteLiveToken(result.token.rawToken);
  /*
    🔴 `DELTA B` — **A RESUME IS NOT A SIGN-IN, AND THE RECORD MUST NOT SAY IT IS.**

    Keyed on the TOKEN, not on the socket and not on the person. The previous spelling compared
    `sub` against the socket's previous principal, which is `null` on every new socket — so
    every reconnect wrote a row, and the owner's record showed 37 sign-ins for one password.

    The audit answers WHAT OPERATORS DID. A reconnect is the console's own machinery, the same
    class `LockPolicy`'s `resync` exists to name — _"the client's own reconnect machinery, not a
    press"_ — so it is recorded as nothing at all. There is no `session-resumed` row either:
    one per reconnect over a twelve-hour shift is the network's diary, not the operator's, and
    it would bury the rows that are.
  */
  if (playoutAuth.markAccepted(result.token)) {
    /*
      `actorNameTruncated` rides here and nowhere else: it is a fact about this session, and a
      flag repeated on every take would be noise about something that does not change.
    */
    runtime.recordIdentityEvent({
      action: 'sign-in',
      actor: result.token.principal.name,
      actorSub: result.token.principal.sub,
      ...(result.token.principal.nameTruncated ? { actorNameTruncated: true as const } : {}),
    });
  }
  send(socket, {
    type: 'response',
    id: frame.id,
    payload: {
      mode: 'playout',
      principal: result.token.principal,
      status: 'signed-in',
      /*
        ⭐ Carried on the `auth` REPLY as well as on `auth.state`, so a console knows which
        channels are its the moment it signs in rather than after a second round trip. Both
        come from the same call, so they cannot describe different permissions.
      */
      permittedChannels: [
        ...grantedChannels(
          result.token.principal.channels,
          configuredCasparHosts(runtime.config()),
          runtime.declaredChannels(),
        ),
      ],
    } satisfies AuthState,
  });
}

function errorResponse(id: string, message: string): WsResponseFrame {
  return { type: 'response', id, error: { message } };
}

function send(socket: WebSocket, frame: WsResponseFrame | WsPublishFrame): void {
  if (socket.readyState === socket.OPEN) socket.send(serializeWsFrame(frame));
}

/**
 * Subscribe a connection to every publish channel; returns unsubscribers.
 *
 * 🔴 **EXPORTED FOR THE `B-247` PUBLISH-COVERAGE GUARD, exactly as {@link buildRoutes} is
 * exported for `B-074`'s route-coverage guard.** An emitter `CasparRuntime` declares and this
 * function does not subscribe is invisible in every other way — it is not a type error (the
 * far end is a WebSocket), it breaks no test, and the bridge simply never sends the event. That
 * is how `livePlateReleased` came to be computed, emitted and delivered nowhere for the life of
 * `multibox-layout-switch`. `tests/publish-coverage.test.ts` calls this and asserts every
 * emitter got a subscriber; do not make it private again.
 */
export function wirePublishes(
  socket: WebSocket,
  backing: CasparRuntime,
  /**
   * 🔴 `C-037` — **MAY THIS SOCKET BE TOLD ANYTHING RIGHT NOW?** Read at PUSH time, so
   * signing in opens the stream and signing out closes it on the same socket, with no
   * subscribe/unsubscribe pair that could fall out of step.
   *
   * Defaults to `true`, which is auth OFF and is also what the `B-247` publish-coverage guard
   * calls with — so not one byte of today's behaviour moves and the guard needs no edit.
   */
  deliver: () => boolean = () => true,
  /**
   * 🔴 `OPERATOR-NAME-SWEEP-01` § 3(a) — **THIS SOCKET'S OWN AUTH STATE, recomputed on
   * demand.**
   *
   * Optional and defaulting to `null`, so the `B-247` publish-coverage guard — which calls
   * this function with two arguments to prove every emitter is forwarded — needs no edit, and
   * so a caller that has no session (a census, a test) simply pushes nothing.
   *
   * ⚠ A FUNCTION, not a value. The point is that it is read at PUSH time, exactly as
   * `deliver` is: the configuration that decides the answer changes underneath, which is the
   * whole reason this channel exists.
   */
  authState: (() => AuthState) | null = null,
): (() => void)[] {
  const push = (channel: AnyPublishChannel, payload: unknown): void => {
    if (!deliver()) return;
    const parsed = channel.payload.safeParse(payload);
    if (parsed.success)
      send(socket, { type: 'publish', channel: channel.name, payload: parsed.data });
  };
  return [
    backing.stackChanged.subscribe((s) => push(StackStateChangedChannel, s)),
    backing.healthChanged.subscribe((h) => push(ConnectionsHealthChangedChannel, h)),
    backing.configChanged.subscribe((c) => push(ConnectionsConfigChangedChannel, c)),
    /*
      🔴 `OPERATOR-NAME-SWEEP-01` § 3(a) — **THE PERMITTED CHANNELS FOLLOW THE CONFIG.**

      A second subscription to the SAME emitter, deliberately, rather than folding this into
      the push above. The two say different things to different readers: one is "the server
      list changed", which every console shows; the other is "what YOU may drive changed",
      which is per principal. Merging them would make one channel carry two facts and would
      force every reader of the config to know about permissions.

      ⚠ **Why the config event is the right trigger.** `grantsChannel` resolves a grant's
      host against `configuredCasparHosts(config)`, so the server list is the only input to
      the verdict that can move without the principal changing — a token change already
      re-pushes through `#setPrincipal` on the console side.
    */
    backing.configChanged.subscribe(() => {
      if (authState === null) return;
      const next = authState();
      /*
        🔴 **AUTH OFF PUSHES NOTHING HERE.** A station that does not federate identity must
        gain no traffic it did not have — "byte-identical" is a claim about the wire, not only
        about behaviour, and a spec measured this one: the first spelling pushed
        `{ mode: 'off', permittedChannels: [] }` on every config change, to every console, for
        a station with no principal to scope to.

        ⚠ The check is on the MODE rather than on the list being empty. An empty list is a real
        answer for a signed-in viewer, and suppressing that would leave a strip asserting
        channels the viewer had just lost.
      */
      if (next.mode === 'off') return;
      push(AuthStateChangedChannel, next);
    }),
    backing.orphansChanged.subscribe((o) => push(LayersOrphansChangedChannel, o)),
    backing.ownedOccupancyChanged.subscribe((w) => push(LayersOwnedOccupancyChangedChannel, w)),
    // B-225 — air was emptied under us (or the notice was acted on / dismissed).
    backing.emptiedAirChanged.subscribe((n) => push(EmptiedAirNoticeChangedChannel, n)),
    backing.lockChanged.subscribe((l) => push(LockStateChangedChannel, l)),
    backing.updateChanged.subscribe((u) => push(UpdateStateChangedChannel, u)),
    // R-021 stage 2a — fixed-bank config + per-slot state.
    backing.fixedConfigChanged.subscribe((c) => push(FixedLayersConfigChangedChannel, c)),
    backing.fixedStateChanged.subscribe((s) => push(FixedLayersStateChangedChannel, s)),
    // R-028 (o1) — the bridge-owned template catalogue.
    backing.templatesChanged.subscribe((t) => push(TemplatesChangedChannel, t)),
    // R-028 part B — the declared playout layers' occupancy.
    backing.playoutStateChanged.subscribe((s) => push(PlayoutLayersStateChangedChannel, s)),
    // B-145 (2.8) — the ledger, projected through the SAME projectLiveLayers the
    // pull uses. It rides the emitter the ledger's ONE write path already fires,
    // so the persister and the browser learn of a change from the same call — a
    // surface that polled instead would be free to disagree with the file about
    // what is on air.
    // 🔴 The emitter is the SIGNAL; the payload comes from the runtime’s own
    // `liveLayersState()`, which is now the single caller of `projectLiveLayers`. It
    // holds the unverified marks, so projecting the emitted ledger here instead would
    // be a second projection missing the one field that is always true after a restart.
    backing.liveLayersChanged.subscribe(() =>
      push(LiveLayersStateChangedChannel, backing.liveLayersState()),
    ),
    // R-034 — the shared delimiter list.
    backing.delimitersChanged.subscribe((d) => push(DelimitersChangedChannel, d)),
    // R-030 — the per-channel raster + the configured-vs-real mode reading.
    backing.channelSettingsChanged.subscribe((s) => push(ChannelSettingsChangedChannel, s)),
    // D-137 / C-015 — the installation's Live Source mapping, so a second
    // console sees the binding an operator just made without reloading.
    backing.sourceCatalogChanged.subscribe((c) => push(SourcesConfigChangedChannel, c)),
    // …and the assignments, which a catalog DELETION changes without any
    // browser asking. A console still showing the old binding is a console
    // showing a plate as bound that is not.
    backing.sourceAssignmentsChanged.subscribe((a) => push(SourcesAssignmentsChangedChannel, a)),
    // R-022 — the rehearsing set, so a second browser never sees a rehearsing row
    // as an ordinary loaded one and loads onto it.
    backing.rehearseChanged.subscribe((r) => push(RehearseStateChangedChannel, r)),
    /*
      🔴 `B-247` — WHY a plate left the ledger, beside the ledger change itself.

      The line above it (`liveLayersChanged`) says the seat is GONE; this says whether it was
      HELD or TORN DOWN and what the bridge's reason was. Without it the console can see a
      three-seat row become a one-seat row and has no way to tell a frame that was never seated
      from one that was seated and cleared — which is precisely the state §12.4 promised would
      be observable. It was emitted from the reconcile all along and subscribed by nothing.

      ⚠ It rides the SAME emitter the reconcile already fires, after the wire and the ledger
      agree (`caspar-runtime.ts` emits these only once both are settled), so a browser that
      reads the ledger on this event sees the state the sentence describes.
    */
    backing.livePlateReleased.subscribe((r) => push(LivePlateReleasedChannel, r)),
  ];
}

/**
 * Map every RuntimeBridge channel to its backing handler.
 *
 * Exported for the B-074 route-coverage guard: a channel the UI declares and calls but
 * that is never routed here answers `unknown channel` at runtime and NOTHING in the
 * suite goes red (this is how R-011's `stack.set-position` could silently break). The
 * guard enumerates `@cg/shared-ipc` and asserts this map covers every runtime channel.
 */
export function buildRoutes(
  b: CasparRuntime,
  paths: {
    persistPath?: string;
    fixedLayersPath?: string;
    sourceCatalogPath?: string;
    sourceAssignmentsPath?: string;
    /**
     * `C-037` — the RESOLVED Playout link: what `auth.state` reports as the MODE, and the
     * addresses `bridge.capabilities` advertises. ONE input rather than a mode beside a
     * config, because {@link PlayoutSettings} already makes "mode is `playout`" and "there
     * is a config" the same fact — two inputs would be two things that must agree.
     *
     * ⚠ The PRINCIPAL is per socket and comes from the actor context, never from here: a
     * mode is a property of the bridge, an identity is a property of a connection, and a
     * route reading both from one place would answer one socket's question with another
     * socket's answer.
     */
    auth?: PlayoutSettings;
    /**
     * `C-037` — THE ONE PREDICATE, injected so `auth.state` answers with the same verdict the
     * gate uses rather than deriving a second one. Defaults to `off`, which is what a bridge
     * built with no Playout link is.
     */
    authState?: (session: AuthSession | null) => AuthGateState;
    /** `C-037` — give up the D9 bearer when the socket that supplied it signs out. */
    releaseBearer?: (rawToken: string) => void;
  } = {},
): Map<string, Route> {
  // NAMED, not positional. Four optional string paths in a row is a signature
  // where transposing two of them type-checks and writes each config into the
  // other's file.
  const { persistPath, fixedLayersPath, sourceCatalogPath, sourceAssignmentsPath } = paths;
  const { mode: authMode, playout: playoutUrls } = paths.auth ?? AUTH_OFF;
  const authState = paths.authState ?? ((): AuthGateState => 'off');
  const releaseBearer = paths.releaseBearer ?? ((): void => undefined);
  /*
    `B-229` — `lock` is the THIRD ARGUMENT AND IT IS REQUIRED. A new channel cannot be
    routed without classifying it, which is what keeps "the lock refuses everything"
    true a year from now. See {@link LockPolicy} for the four values and the owner's
    reasoning behind the no-carve-out answer.

    🔴 `C-038` — and `perm` is the FOURTH, required for the identical reason one axis over.
    Deliberately a POSITIONAL argument rather than a field on an options bag with a default:
    a default is the mechanism by which every future route silently becomes `operator`, and
    the compiler refusing to build is the only version of this rule nobody can forget.
  */
  const route = (
    channel: AnyChannel,
    lock: LockPolicy,
    perm: PermissionClass,
    handle: (req: never) => unknown,
  ): Route => ({
    channel,
    handle: handle as (req: unknown) => unknown,
    lock,
    perm,
  });

  /**
   * Persist an accepted config value, NON-FATALLY: the change is already in
   * force in memory and refusing it now would undo an operator action that
   * already succeeded. What must not happen is SILENCE — a station that saves
   * nothing looks identical to one that saves fine, right up until it restarts.
   */
  const persistFailed = (what: string, filePath: string, err: unknown): void => {
    process.stderr.write(
      `[caspar-bridge] ⚠ failed to persist ${what} to ${filePath}: ` +
        `${err instanceof Error ? err.message : String(err)} — the change is live in memory ` +
        `but will not survive a bridge restart\n`,
    );
  };
  const persistCatalog = (filePath: string | undefined, value: SourceCatalog): void => {
    if (filePath === undefined) return;
    try {
      saveSourceCatalog(filePath, value);
    } catch (err) {
      persistFailed('the source catalog', filePath, err);
    }
  };
  const persistAssignments = (filePath: string | undefined, value: SourceAssignments): void => {
    if (filePath === undefined) return;
    try {
      saveSourceAssignments(filePath, value);
    } catch (err) {
      persistFailed('the source assignments', filePath, err);
    }
  };

  const entries: Route[] = [
    /*
      🔴 `C-037` — the `auth.*` door, as ORDINARY ROUTES.

      They could have been special-cased in `handleMessage` beside the frame, and were not, so
      that the route census walks them like everything else and `B-074`'s coverage guard
      requires them to exist. They reach their own socket's principal through the actor
      context, which is what lets a per-connection answer come out of a process-wide table.

      ⚠ `auth.state` is a `read` — it changes nothing and a console reconnecting to a bridge
      it is not signed in to must still be able to ASK. `auth.sign-out` is an `operator`
      intent: the lock refuses everything (the owner's no-carve-out answer) and signing out is
      something the operator does, not something they read.
    */
    route(AuthStateChannel, 'read', 'read', () => {
      /*
        🔴 IT ASKS THE ONE PREDICATE. It used to report `token?.principal` directly, and that
        was a lie a spec MEASURED: with intents already refused for a revoked `jti`, this read
        still answered a full principal. The principal is still reported — a surface has to be
        able to say WHOSE session ended — but the verdict beside it is the gate's own.

        ⭐ `OPERATOR-NAME-SWEEP-01` § 3(a) — and the composition now lives in `authStateFor`,
        which the `auth.state-changed` PUBLISH also calls. A read and a push that answered the
        same question from two places is the drift this file has already paid for once.
      */
      const session = currentAuthSession();
      return authStateFor(session, authState(session), authMode, b);
    }),
    route(AuthSignOutChannel, 'operator', 'read', () => {
      const session = currentAuthSession();
      const leaving = session?.token?.principal ?? null;
      // The bridge must stop calling the Playout with a token whose operator has left.
      const raw = session?.token?.rawToken;
      if (raw !== undefined) releaseBearer(raw);
      if (leaving !== null) {
        b.recordIdentityEvent({
          action: 'sign-out',
          actor: leaving.name,
          actorSub: leaving.sub,
        });
      }
      session?.clear();
      return { ok: true as const };
    }),
    route(AppInfoChannel, 'read', 'read', () => ({
      name: 'cg Bridge',
      version: '0.0.0',
      platform: 'node',
    })),

    route(
      StackLoadChannel,
      'operator',
      'operator',
      (r: { itemId: string; templateId: string; fields: never }) =>
        b.load(r.itemId, r.templateId, r.fields),
    ),
    route(StackTakeChannel, 'operator', 'operator', (r: { itemId: string }) => b.take(r.itemId)),
    // Session BM-2 — the texts AND the row's per-look inputs, in ONE atomic call.
    route(
      StackUpdateChannel,
      'operator',
      'operator',
      (r: {
        itemId: string;
        fields: never;
        mergeMode: 'merge' | 'replace';
        lookBindings?: Readonly<Record<string, Readonly<Record<string, string>>>>;
      }) => b.update(r.itemId, r.fields, r.mergeMode, r.lookBindings),
    ),
    // C-012 — the graceful stop (outro runs, producer stays resident).
    route(StackStopChannel, 'operator', 'operator', (r: { itemId: string }) =>
      b.stopItem(r.itemId),
    ),
    // R-028 (o2 / 5.4) — advance the template's sequence.
    route(StackNextChannel, 'operator', 'operator', (r: { itemId: string }) =>
      b.nextItem(r.itemId),
    ),
    route(StackOutChannel, 'operator', 'operator', (r: { itemId: string }) => b.out(r.itemId)),
    route(StackRemoveChannel, 'operator', 'operator', (r: { itemId: string }) =>
      b.remove(r.itemId),
    ),
    // R-011 — the operator's per-item on-air position override.
    route(
      StackSetPositionChannel,
      'operator',
      'operator',
      (r: { itemId: string; position: never }) => b.setPosition(r.itemId, r.position),
    ),
    // R-048 — the operator repoints ONE plate of ONE row, on air. A per-item
    // override: the template assignment and the installation catalog are untouched.
    // Session BM — and, with a `lookId`, the DELIBERATE per-look composition. One verb, two
    // scopes: absent is the emergency (every look), present is one look's binding.
    route(
      StackSwapLiveSourceChannel,
      'operator',
      'operator',
      (r: { itemId: string; plateId: string; sourceId: string | null; lookId?: string }) =>
        b.swapLiveSource(r.itemId, r.plateId, r.sourceId, r.lookId),
    ),
    // §14 (LOOKS) Stage E — the operator picks a look on the row. ONE seam: the bridge
    // validates the plan, tells the page on the CG UPDATE payload so it moves the HOLES,
    // then moves the FILLS after the B-174 mixer hold. Both halves off the same look id;
    // nothing else switches a look.
    route(
      StackSetActiveLookChannel,
      'operator',
      'operator',
      (r: { itemId: string; lookId: string }) => b.setActiveLook(r.itemId, r.lookId),
    ),
    // `TIMING-WIRE-22` (c) — a CONFIGURATION verb: it carries no Take, and changes what the
    // graphic already on the channel will do next.
    route(
      StackSetPassTimingChannel,
      'operator',
      'operator',
      (r: { itemId: string; passes?: number | 'infinite'; delayMs?: number }) =>
        b.setPassTiming(r.itemId, { passes: r.passes, delayMs: r.delayMs }),
    ),
    // C-015 (6.5f) — the explicit recorded intent that raises a plate's audio.
    route(
      StackSetPlateVolumeChannel,
      'operator',
      'operator',
      (r: { itemId: string; plateId: string; volume: number }) =>
        b.setLivePlateVolume(r.itemId, r.plateId, r.volume),
    ),
    // `add-multibox-audio` — the same intent for SEVERAL plates as ONE action, which is what
    // SOLO and PANIC are. It composes the writer above rather than duplicating it, and holds
    // the item's live-seat lock so a look switch cannot interleave into the middle of a SOLO.
    route(
      StackSetPlateVolumesChannel,
      'operator',
      'operator',
      (r: { itemId: string; volumes: Readonly<Record<string, number>> }) =>
        b.setLivePlateVolumes(r.itemId, r.volumes),
    ),
    // PANIC — the audio sibling of `clearAll`: silence every plate the LEDGER holds a seat
    // for, whatever any status claims. It takes NO arguments, and that is the point: the
    // scope is not the caller's to choose (B-122 — a browser-resolved scope is an emergency
    // control gated on bookkeeping that may not have arrived).
    route(StackSilenceAllLivePlatesChannel, 'operator', 'operator', () => b.silenceAllLivePlates()),
    // R-010 — the sanctioned clear-everything path (unblocks set-config).
    route(StackRemoveAllChannel, 'operator', 'operator', () => b.removeAll()),
    route(StackClearAllChannel, 'operator', 'operator', () => b.clearAll()),
    // C-012 / R-028 — the GRACEFUL bulk: every on-air item runs its own outro.
    route(StackStopAllChannel, 'operator', 'operator', () => b.stopAll()),
    route(StackSnapshotChannel, 'read', 'read', () => b.stackSnapshot()),
    // B-092 — the browser re-delivers its RETAINED stack intent on every
    // (re)connect, so the stack survives a restart of this process. Seeds state
    // and publishes; sends nothing to CasparCG until occupancy is knowable.
    route(StackRestoreChannel, 'resync', 'operator', (r: { items: never }) => b.restore(r.items)),

    route(ConnectionsConfigChannel, 'read', 'read', () => b.config()),
    // R-010 — runtime reconfiguration; persisted only after a successful apply.
    route(ConnectionsSetConfigChannel, 'operator', 'station-admin', async (r: ConnectionConfig) => {
      const result = await b.setConfig(r);
      if (result.ok && persistPath !== undefined) savePersistedConnection(persistPath, r);
      return result;
    }),
    /*
      `C-024` — WHAT IS IN FORCE, as distinct from what is STORED.

      `connections.config` above returns the stored intent the panel edits; this returns the serve
      address actually in effect plus WHY — which fields a command-line flag is masking, and this
      machine's interface candidates. Two reads rather than one because a panel that could only
      learn about a mask by CHANGING something would show a wrong value for as long as the operator
      merely looked at it, and a panel showing an address the bridge is not using is the defect this
      whole item exists to remove.
    */
    route(ConnectionsTemplateServeChannel, 'read', 'read', () => b.templateServeInfo()),
    route(ConnectionsHealthChannel, 'read', 'read', () => b.health()),
    route(ConnectionsFailoverChannel, 'operator', 'operator', () => b.failover()),

    // R-009 — orphan-layer surface + explicit per-layer Clear.
    route(LayersOrphansChannel, 'read', 'read', () => b.orphans()),
    route(LayersClearChannel, 'operator', 'operator', (r: { channel: number; layer: number }) =>
      b.clearLayer(r.channel, r.layer),
    ),
    // B-056 — owned-slot occupancy warnings (no Clear: the remedy is Out/Remove).
    route(LayersOwnedOccupancyChannel, 'read', 'read', () => b.ownedOccupancy()),

    /*
      B-225 — the playout server stopped carrying what this console had put on air. The
      notice is a READ plus TWO deliberate operator acts, and there is no third door: nothing
      on the bridge restores by itself (the owner's 2026-09-05 decision — an unattended
      machine must not put a graphic on air), so `restore` is reachable only from a press.
    */
    route(EmptiedAirNoticeChannel, 'read', 'read', () => b.emptiedAir()),
    route(EmptiedAirRestoreChannel, 'operator', 'operator', (r: { itemIds: string[] }) =>
      b.restoreEmptiedAir(r.itemIds),
    ),
    route(EmptiedAirDismissChannel, 'operator', 'operator', () => b.dismissEmptiedAir()),

    // R-021 stage 2a — the fixed-bank wire contract: config read/update +
    // per-slot state. Order on an applied change: validate → apply → persist
    // (non-fatal, the R-010 savePersistedConnection stance) → publish (the
    // runtime publishes from setFixedLayers itself, after apply).
    route(FixedLayersConfigChannel, 'read', 'read', () => b.fixedLayersConfig()),
    route(FixedLayersSetConfigChannel, 'operator', 'station-admin', (r: FixedLayerBank) => {
      const result = b.setFixedLayers(r);
      if (result.ok && fixedLayersPath !== undefined) {
        try {
          saveFixedLayerBank(fixedLayersPath, r);
        } catch (err) {
          process.stderr.write(
            `[caspar-bridge] ⚠ failed to persist fixed layers to ${fixedLayersPath}: ` +
              `${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
      return result;
    }),
    route(FixedLayersStateChannel, 'read', 'read', () => b.fixedLayersState()),
    // R-021 stage 3 — the EXACT-SLOT load: `bindFixed`, never `reserve`/allocate.
    route(
      FixedLayersLoadChannel,
      'operator',
      'operator',
      (r: { channel: number; layer: number; itemId: string; templateId: string; fields: never }) =>
        b.loadFixed({ channel: r.channel, layer: r.layer }, r.itemId, r.templateId, r.fields),
    ),
    // The BANK-SCOPED clear: permitted by STRUCTURE (in the declared bank, not
    // reserved), never by occupancy — so it still works when occupancy is `unknown`,
    // which is exactly when the operator needs it. The guard lives in
    // `clearBankLayer`, bridge-side, so no UI state can bypass it.
    route(
      FixedLayersClearLayerChannel,
      'operator',
      'operator',
      (r: { channel: number; layer: number }) => b.clearBankLayer(r.channel, r.layer),
    ),

    // R-028 part B — the declared playout layers + the operator's DELIBERATE,
    // kind-gated clear. A separate door from `layers.clear` (which still
    // refuses reserved layers): only an operator who opened the playout tab
    // can reach this, and the bridge holds the html-only gate.
    route(PlayoutLayersStateChannel, 'read', 'read', () => b.playoutLayersState()),
    route(
      PlayoutLayersClearChannel,
      'operator',
      'operator',
      (r: { channel: number; layer: number }) => b.playoutClear(r.channel, r.layer),
    ),

    // B-145 acceptance 1, display half (tasks.md 2.8) — the bridge's OWN Live
    // Source ledger. A READ and nothing else: the sanctioned verbs for a seated
    // layer are item-scoped and already routed (stack.swap-live-source,
    // stack.set-plate-volume, stack.out / stack.remove), and layers.clear refuses
    // a live-source coordinate BY NAME. This channel exists so the operator can
    // SEE which row owns a lit layer, never to add a fourth way to cut one.
    route(LiveLayersStateChannel, 'read', 'read', () => b.liveLayersState()),

    /*
      🔴 `B-257` — the engage CAPTURES the engager's channels. `lockScopeAtEngage` answers
      `undefined` (every channel) with auth OFF — no session, no principal — and for an engager
      holding `'*'`, so both keep today's lock byte for byte.
    */
    route(LockEngageChannel, 'operator', 'operator', (r: { pin: string }) =>
      b.engage(r.pin, lockScopeAtEngage(currentAuthSession()?.token?.principal ?? null, b)),
    ),
    route(LockReleaseChannel, 'unlock', 'operator', (r: { pin: string }) => b.release(r.pin)),
    route(LockStateChannel, 'read', 'read', () => b.lockState()),

    route(TemplatesGetChannel, 'read', 'read', (r: { templateId: string }) =>
      b.templateGet(r.templateId),
    ),
    route(TemplatesListChannel, 'read', 'read', () => b.templateList()),
    // B-038 Phase 2 — retain the browser-produced self-contained HTML alongside
    // the TemplateInfo (held, not served yet).
    route(
      TemplatesImportChannel,
      'operator-unless-redelivery',
      'operator',
      (r: { template: never; html: string; redelivery?: boolean }) =>
        b.templateImport(r.template, r.html, r.redelivery ?? false),
    ),
    // R-005 — the bridge is authoritative for the refusal (refuse-while-referenced).
    route(TemplatesRemoveChannel, 'operator', 'operator', (r: { templateId: string }) =>
      b.templateRemove(r.templateId),
    ),

    route(
      AuditRecentChannel,
      'read',
      'read',
      (r: { limit?: number; action?: never; actor?: string }) =>
        b.auditRecent(r.limit, r.action, r.actor),
    ),
    // B-141 — the POSITIVE CONTROL for the panel's empty state. Without it "no
    // entries" and "no writer" and "the writer is failing" are one indistinguishable
    // sentence, and the operator reads the third as the first.
    route(AuditHealthChannel, 'read', 'read', () => b.auditHealth()),

    route(UpdateRequestChannel, 'operator', 'operator', (r: { version: string; notes?: string }) =>
      b.updateRequest(r.version, r.notes),
    ),
    route(UpdateStateChannel, 'read', 'read', () => b.updateState()),
    route(UpdateCancelChannel, 'operator', 'operator', () => b.updateCancel()),

    // R-034 — the station's delimiter list, bridge-owned so every browser sees one list.
    route(DelimitersListChannel, 'read', 'read', () => b.delimitersList()),
    route(DelimitersSetChannel, 'operator', 'station-admin', (r: { delimiters: never[] }) =>
      b.delimitersSet(r.delimiters),
    ),

    // R-030 — the per-channel output raster, bridge-owned for the same reasons
    // the template catalogue is: several browsers must not disagree about where
    // graphics land, and it has to survive a bridge restart.
    route(ChannelSettingsGetChannel, 'read', 'read', () => b.channelSettingsState()),
    route(ChannelSettingsSetChannel, 'operator', 'station-admin', (r: ChannelSettings) =>
      b.setChannelSettings(r),
    ),

    // D-137 / C-015 — the installation's SOURCE CATALOG. The order on an applied
    // change is the fixed-bank one: validate → apply → persist (non-fatal) →
    // publish (the runtime publishes from `setSourceCatalog` itself, after the
    // apply).
    route(SourcesConfigChannel, 'read', 'read', () => b.sourceCatalog()),
    route(SourcesSetConfigChannel, 'operator', 'station-admin', (r: SourceCatalog) => {
      const result = b.setSourceCatalog(r);
      if (result.ok) {
        persistCatalog(sourceCatalogPath, r);
        // A DELETION cascaded through the assignments, so the OTHER file is
        // stale on disk too. Persisting only the catalog would resurrect the
        // dropped bindings on the next boot — the dangle this cascade exists to
        // prevent, arriving one restart later.
        if (result.droppedAssignments !== undefined) {
          persistAssignments(sourceAssignmentsPath, b.sourceAssignments());
        }
      }
      return result;
    }),
    route(SourcesAssignmentsChannel, 'read', 'read', () => b.sourceAssignments()),
    route(SourcesSetAssignmentsChannel, 'operator', 'station-admin', (r: SourceAssignments) => {
      const result = b.setSourceAssignments(r);
      if (result.ok) persistAssignments(sourceAssignmentsPath, r);
      return result;
    }),

    // R-022 — REHEARSE. Bridge-owned so several browsers agree about which rows
    // are interlocked, and every guard (on-air, not-loaded, mute-failed) lives
    // bridge-side where no UI state can bypass it.
    route(RehearseStateChannel, 'read', 'read', () => b.rehearseState()),
    route(RehearseEnterChannel, 'operator', 'operator', (r: { itemId: string }) =>
      b.enterRehearse(r.itemId),
    ),
    route(RehearseExitChannel, 'operator', 'operator', (r: { itemId: string }) =>
      b.exitRehearse(r.itemId),
    ),
  ];

  const routes = new Map(entries.map((e) => [e.channel.name, e]));
  /*
    🔴 `B-153` — THE CAPABILITY HANDSHAKE, ANSWERED FROM THE MAP ITSELF.

    Added AFTER the map is built and reading `routes.keys()` at CALL time, so what this
    reports is what this process genuinely routes rather than a list somebody maintains
    beside it. Delete a route above and it vanishes from here; add one and it appears. A
    hand-written capability list would be the third thing that has to be remembered — and
    the whole reason this channel exists is that the last thing needing to be remembered
    was not, and an operator found out on air.

    It includes ITSELF, which is correct: a bridge that can answer this question can, in
    fact, answer this question.
  */
  const capabilities = route(BridgeCapabilitiesChannel, 'read', 'read', () => ({
    channels: [...routes.keys()].sort(),
    /*
      🔴 `C-037` / ADR 0010 rule 9 — the auth MODE and the SIGN-IN ADDRESS, answered to a
      socket that has not signed in, because that is the socket that needs them. `B-153`'s own
      reason, quoted: it is asked at connect, "before the operator can press anything".

      ⚠ The addresses are the PLAYOUT's, and the browser calls them DIRECTLY (rule 9: the
      bridge never sees a password; rule 13: never via the template origin). Advertised rather
      than guessed by the console, because the console has no other way to know WHICH Playout
      this bridge trusts — and one that signed in to a different one would be refused here
      with "not for this station" and never find out why.
    */
    auth: authMode,
    ...(playoutUrls !== null
      ? {
          signInUrl: playoutUrls.tokenUrl,
          refreshUrl: playoutUrls.refreshUrl,
          authContractVersion: PLAYOUT_CONTRACT_VERSION,
        }
      : {}),
  }));
  routes.set(capabilities.channel.name, capabilities);
  return routes;
}
