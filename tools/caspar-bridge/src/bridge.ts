import { WebSocketServer, type WebSocket } from 'ws';
import {
  AppInfoChannel,
  AuditHealthChannel,
  AuditRecentChannel,
  ConnectionsConfigChangedChannel,
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  ConnectionsSetConfigChannel,
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
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  SettingsChangedChannel,
  SettingsGetChannel,
  SettingsSetChannel,
  PlayoutLayersClearChannel,
  PlayoutLayersStateChangedChannel,
  PlayoutLayersStateChannel,
  LiveLayersStateChangedChannel,
  LiveLayersStateChannel,
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
  StackSetPlateVolumeChannel,
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
  type ReservedLayers,
  type SourceAssignments,
  type SourceCatalog,
  type WsPublishFrame,
  type WsResponseFrame,
} from '@cg/shared-ipc';
import { DEFAULT_LAYER_POLICY, type LayerPolicy, type LayerSlot } from '@cg/caspar-client';
import { runAsActor } from './actor-context.js';
import { CasparRuntime } from './caspar-runtime.js';
import { loadPersistedConnection, savePersistedConnection } from './connection-store.js';
import {
  FixedLayersConfigError,
  loadFixedLayerBank,
  saveFixedLayerBank,
  validateFixedBank,
} from './fixed-layers-store.js';
import { loadReservedLayers } from './reserved-layers-store.js';
import { loadPersistedLiveLayers, savePersistedLiveLayers } from './live-layers-store.js';
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
import type { TemplateServeOverride } from './template-http-server.js';

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
   * CasparCG is local; an opt-in routable bind + guessed/configured serve-host
   * when remote. The control WebSocket is unaffected and stays loopback.
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
   * TEST-ONLY seam — pass-through to `CasparRuntime`'s sweep/staleness tuning
   * so integration tests can run fast sweeps. Empty in production.
   */
  runtimeTuning?: { sweepMs?: number; occupancyStaleMs?: number };
}

export interface BridgeHandle {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  /**
   * B-038 Phase 3 — the template HTTP serve address: the base URL CasparCG fetches
   * `/template/<id>` from, plus whether the bind is LAN-exposed (non-loopback).
   */
  readonly templateServe: { url: string; serveHost: string; port: number; exposed: boolean };
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

/** One request route: a channel + a (possibly async) handler producing its response. */
interface Route {
  readonly channel: AnyChannel;
  readonly handle: (req: unknown) => unknown;
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
  const layerPolicy = DEFAULT_LAYER_POLICY;
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

  wss.on('connection', (socket) => {
    const unsubscribers = wirePublishes(socket, runtime);
    socket.on('message', (data) => {
      void handleMessage(socket, routes, data.toString());
    });
    socket.on('close', () => {
      for (const off of unsubscribers) off();
    });
    socket.on('error', () => {
      for (const off of unsubscribers) off();
    });
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
  const templateServe = {
    url: `http://${serveHost}:${String(servePort)}`,
    serveHost,
    port: servePort,
    exposed,
  };
  // Loud warning ONLY when the template server is LAN-exposed (remote CasparCG):
  // a wrong serve-host guess must be obvious. Loopback (the common case) is quiet.
  if (exposed) {
    process.stderr.write(
      `[caspar-bridge] ⚠ template HTTP server LAN-EXPOSED on ${serve?.bindHost ?? '0.0.0.0'}:${String(servePort)} ` +
        `— CG ADD URL host is ${serveHost}. Ensure this is the bridge's address as CasparCG sees it.\n`,
    );
  }

  return {
    host,
    port,
    url: `ws://${host}:${port}`,
    templateServe,
    runtime,
    fixedBankSource: { bank: fixedBank, source: fixedBankSource },
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
): Promise<void> {
  const frame = parseWsFrame(raw);
  // Only `request` frames are inbound to the bridge; ignore anything else.
  if (frame === null || frame.type !== 'request') return;

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

  try {
    /*
      Stack ops are async (they await their AMCP ack); await every handler.

      B-141 follow-up — the handler runs inside the acting console's actor context,
      so every audit append it reaches records WHO asked, at any depth and across
      every await, without a single call site taking an actor parameter. Two browsers
      interleaving their requests each keep their own; see `actor-context.ts` for why
      that rules out a mutable "current actor" field, and for what the value is worth
      (self-declared, unverified — which console, not which person).
    */
    const result = await runAsActor(frame.actor, () => route.handle(parsedReq.data));
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

function errorResponse(id: string, message: string): WsResponseFrame {
  return { type: 'response', id, error: { message } };
}

function send(socket: WebSocket, frame: WsResponseFrame | WsPublishFrame): void {
  if (socket.readyState === socket.OPEN) socket.send(serializeWsFrame(frame));
}

/** Subscribe a connection to every publish channel; returns unsubscribers. */
function wirePublishes(socket: WebSocket, backing: CasparRuntime): (() => void)[] {
  const push = (channel: AnyPublishChannel, payload: unknown): void => {
    const parsed = channel.payload.safeParse(payload);
    if (parsed.success)
      send(socket, { type: 'publish', channel: channel.name, payload: parsed.data });
  };
  return [
    backing.stackChanged.subscribe((s) => push(StackStateChangedChannel, s)),
    backing.healthChanged.subscribe((h) => push(ConnectionsHealthChangedChannel, h)),
    backing.configChanged.subscribe((c) => push(ConnectionsConfigChangedChannel, c)),
    backing.orphansChanged.subscribe((o) => push(LayersOrphansChangedChannel, o)),
    backing.ownedOccupancyChanged.subscribe((w) => push(LayersOwnedOccupancyChangedChannel, w)),
    backing.lockChanged.subscribe((l) => push(LockStateChangedChannel, l)),
    backing.updateChanged.subscribe((u) => push(UpdateStateChangedChannel, u)),
    backing.settingsChanged.subscribe((s) => push(SettingsChangedChannel, s)),
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
  } = {},
): Map<string, Route> {
  // NAMED, not positional. Four optional string paths in a row is a signature
  // where transposing two of them type-checks and writes each config into the
  // other's file.
  const { persistPath, fixedLayersPath, sourceCatalogPath, sourceAssignmentsPath } = paths;
  const route = (channel: AnyChannel, handle: (req: never) => unknown): Route => ({
    channel,
    handle: handle as (req: unknown) => unknown,
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
    route(AppInfoChannel, () => ({ name: 'cg Bridge', version: '0.0.0', platform: 'node' })),

    route(StackLoadChannel, (r: { itemId: string; templateId: string; fields: never }) =>
      b.load(r.itemId, r.templateId, r.fields),
    ),
    route(StackTakeChannel, (r: { itemId: string }) => b.take(r.itemId)),
    route(
      StackUpdateChannel,
      (r: { itemId: string; fields: never; mergeMode: 'merge' | 'replace' }) =>
        b.update(r.itemId, r.fields, r.mergeMode),
    ),
    // C-012 — the graceful stop (outro runs, producer stays resident).
    route(StackStopChannel, (r: { itemId: string }) => b.stopItem(r.itemId)),
    // R-028 (o2 / 5.4) — advance the template's sequence.
    route(StackNextChannel, (r: { itemId: string }) => b.nextItem(r.itemId)),
    route(StackOutChannel, (r: { itemId: string }) => b.out(r.itemId)),
    route(StackRemoveChannel, (r: { itemId: string }) => b.remove(r.itemId)),
    // R-011 — the operator's per-item on-air position override.
    route(StackSetPositionChannel, (r: { itemId: string; position: never }) =>
      b.setPosition(r.itemId, r.position),
    ),
    // R-048 — the operator repoints ONE plate of ONE row, on air. A per-item
    // override: the template assignment and the installation catalog are untouched.
    // Session BM — and, with a `lookId`, the DELIBERATE per-look composition. One verb, two
    // scopes: absent is the emergency (every look), present is one look's binding.
    route(
      StackSwapLiveSourceChannel,
      (r: { itemId: string; plateId: string; sourceId: string | null; lookId?: string }) =>
        b.swapLiveSource(r.itemId, r.plateId, r.sourceId, r.lookId),
    ),
    // §14 (LOOKS) Stage E — the operator picks a look on the row. ONE seam: the bridge
    // records it, reconciles the FILLS, then tells the page on the CG UPDATE payload so it
    // moves the HOLES. Both halves off the same look id; nothing else switches a look.
    route(StackSetActiveLookChannel, (r: { itemId: string; lookId: string }) =>
      b.setActiveLook(r.itemId, r.lookId),
    ),
    // C-015 (6.5f) — the explicit recorded intent that raises a plate's audio.
    route(StackSetPlateVolumeChannel, (r: { itemId: string; plateId: string; volume: number }) =>
      b.setLivePlateVolume(r.itemId, r.plateId, r.volume),
    ),
    // R-010 — the sanctioned clear-everything path (unblocks set-config).
    route(StackRemoveAllChannel, () => b.removeAll()),
    route(StackClearAllChannel, () => b.clearAll()),
    // C-012 / R-028 — the GRACEFUL bulk: every on-air item runs its own outro.
    route(StackStopAllChannel, () => b.stopAll()),
    route(StackSnapshotChannel, () => b.stackSnapshot()),
    // B-092 — the browser re-delivers its RETAINED stack intent on every
    // (re)connect, so the stack survives a restart of this process. Seeds state
    // and publishes; sends nothing to CasparCG until occupancy is knowable.
    route(StackRestoreChannel, (r: { items: never }) => b.restore(r.items)),

    route(ConnectionsConfigChannel, () => b.config()),
    // R-010 — runtime reconfiguration; persisted only after a successful apply.
    route(ConnectionsSetConfigChannel, async (r: ConnectionConfig) => {
      const result = await b.setConfig(r);
      if (result.ok && persistPath !== undefined) savePersistedConnection(persistPath, r);
      return result;
    }),
    route(ConnectionsHealthChannel, () => b.health()),
    route(ConnectionsFailoverChannel, () => b.failover()),

    // R-009 — orphan-layer surface + explicit per-layer Clear.
    route(LayersOrphansChannel, () => b.orphans()),
    route(LayersClearChannel, (r: { channel: number; layer: number }) =>
      b.clearLayer(r.channel, r.layer),
    ),
    // B-056 — owned-slot occupancy warnings (no Clear: the remedy is Out/Remove).
    route(LayersOwnedOccupancyChannel, () => b.ownedOccupancy()),

    // R-021 stage 2a — the fixed-bank wire contract: config read/update +
    // per-slot state. Order on an applied change: validate → apply → persist
    // (non-fatal, the R-010 savePersistedConnection stance) → publish (the
    // runtime publishes from setFixedLayers itself, after apply).
    route(FixedLayersConfigChannel, () => b.fixedLayersConfig()),
    route(FixedLayersSetConfigChannel, (r: FixedLayerBank) => {
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
    route(FixedLayersStateChannel, () => b.fixedLayersState()),
    // R-021 stage 3 — the EXACT-SLOT load: `bindFixed`, never `reserve`/allocate.
    route(
      FixedLayersLoadChannel,
      (r: { channel: number; layer: number; itemId: string; templateId: string; fields: never }) =>
        b.loadFixed({ channel: r.channel, layer: r.layer }, r.itemId, r.templateId, r.fields),
    ),
    // The BANK-SCOPED clear: permitted by STRUCTURE (in the declared bank, not
    // reserved), never by occupancy — so it still works when occupancy is `unknown`,
    // which is exactly when the operator needs it. The guard lives in
    // `clearBankLayer`, bridge-side, so no UI state can bypass it.
    route(FixedLayersClearLayerChannel, (r: { channel: number; layer: number }) =>
      b.clearBankLayer(r.channel, r.layer),
    ),

    // R-028 part B — the declared playout layers + the operator's DELIBERATE,
    // kind-gated clear. A separate door from `layers.clear` (which still
    // refuses reserved layers): only an operator who opened the playout tab
    // can reach this, and the bridge holds the html-only gate.
    route(PlayoutLayersStateChannel, () => b.playoutLayersState()),
    route(PlayoutLayersClearChannel, (r: { channel: number; layer: number }) =>
      b.playoutClear(r.channel, r.layer),
    ),

    // B-145 acceptance 1, display half (tasks.md 2.8) — the bridge's OWN Live
    // Source ledger. A READ and nothing else: the sanctioned verbs for a seated
    // layer are item-scoped and already routed (stack.swap-live-source,
    // stack.set-plate-volume, stack.out / stack.remove), and layers.clear refuses
    // a live-source coordinate BY NAME. This channel exists so the operator can
    // SEE which row owns a lit layer, never to add a fourth way to cut one.
    route(LiveLayersStateChannel, () => b.liveLayersState()),

    route(LockEngageChannel, (r: { pin: string }) => b.engage(r.pin)),
    route(LockReleaseChannel, (r: { pin: string }) => b.release(r.pin)),
    route(LockStateChannel, () => b.lockState()),

    route(TemplatesGetChannel, (r: { templateId: string }) => b.templateGet(r.templateId)),
    route(TemplatesListChannel, () => b.templateList()),
    // B-038 Phase 2 — retain the browser-produced self-contained HTML alongside
    // the TemplateInfo (held, not served yet).
    route(TemplatesImportChannel, (r: { template: never; html: string; redelivery?: boolean }) =>
      b.templateImport(r.template, r.html, r.redelivery ?? false),
    ),
    // R-005 — the bridge is authoritative for the refusal (refuse-while-referenced).
    route(TemplatesRemoveChannel, (r: { templateId: string }) => b.templateRemove(r.templateId)),

    route(AuditRecentChannel, (r: { limit?: number; action?: never; actor?: string }) =>
      b.auditRecent(r.limit, r.action, r.actor),
    ),
    // B-141 — the POSITIVE CONTROL for the panel's empty state. Without it "no
    // entries" and "no writer" and "the writer is failing" are one indistinguishable
    // sentence, and the operator reads the third as the first.
    route(AuditHealthChannel, () => b.auditHealth()),

    route(UpdateRequestChannel, (r: { version: string; notes?: string }) =>
      b.updateRequest(r.version, r.notes),
    ),
    route(UpdateStateChannel, () => b.updateState()),
    route(UpdateCancelChannel, () => b.updateCancel()),

    // R-034 — the station's delimiter list, bridge-owned so every browser sees one list.
    route(DelimitersListChannel, () => b.delimitersList()),
    route(DelimitersSetChannel, (r: { delimiters: never[] }) => b.delimitersSet(r.delimiters)),

    // R-030 — the per-channel output raster, bridge-owned for the same reasons
    // the template catalogue is: several browsers must not disagree about where
    // graphics land, and it has to survive a bridge restart.
    route(ChannelSettingsGetChannel, () => b.channelSettingsState()),
    route(ChannelSettingsSetChannel, (r: ChannelSettings) => b.setChannelSettings(r)),

    // D-137 / C-015 — the installation's SOURCE CATALOG. The order on an applied
    // change is the fixed-bank one: validate → apply → persist (non-fatal) →
    // publish (the runtime publishes from `setSourceCatalog` itself, after the
    // apply).
    route(SourcesConfigChannel, () => b.sourceCatalog()),
    route(SourcesSetConfigChannel, (r: SourceCatalog) => {
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
    route(SourcesAssignmentsChannel, () => b.sourceAssignments()),
    route(SourcesSetAssignmentsChannel, (r: SourceAssignments) => {
      const result = b.setSourceAssignments(r);
      if (result.ok) persistAssignments(sourceAssignmentsPath, r);
      return result;
    }),

    // R-022 — REHEARSE. Bridge-owned so several browsers agree about which rows
    // are interlocked, and every guard (on-air, not-loaded, mute-failed) lives
    // bridge-side where no UI state can bypass it.
    route(RehearseStateChannel, () => b.rehearseState()),
    route(RehearseEnterChannel, (r: { itemId: string }) => b.enterRehearse(r.itemId)),
    route(RehearseExitChannel, (r: { itemId: string }) => b.exitRehearse(r.itemId)),

    route(SettingsGetChannel, () => b.settingsGet()),
    route(SettingsSetChannel, (r: Partial<{ telemetry: never }>) => b.settingsSet(r)),
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
  const capabilities = route(BridgeCapabilitiesChannel, () => ({
    channels: [...routes.keys()].sort(),
  }));
  routes.set(capabilities.channel.name, capabilities);
  return routes;
}
