import { WebSocketServer, type WebSocket } from 'ws';
import {
  AppInfoChannel,
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
  StackLoadChannel,
  StackNextChannel,
  StackRestoreChannel,
  StackStopAllChannel,
  StackStopChannel,
  StackOutChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackSetPositionChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  DelimitersChangedChannel,
  DelimitersListChannel,
  DelimitersSetChannel,
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
  reservedLayerNumbers,
  type AnyChannel,
  type AnyPublishChannel,
  type ConnectionConfig,
  type FixedLayerBank,
  type ReservedLayers,
  type WsPublishFrame,
  type WsResponseFrame,
} from '@cg/shared-ipc';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import { CasparRuntime } from './caspar-runtime.js';
import { loadPersistedConnection, savePersistedConnection } from './connection-store.js';
import { loadFixedLayerBank, saveFixedLayerBank, validateFixedBank } from './fixed-layers-store.js';
import { loadReservedLayers } from './reserved-layers-store.js';
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
   * R-021 stage 1 — the fixed operator layer bank, explicit. Precedence
   * mirrors R-010: explicit option > persisted file > no bank. The bank is
   * VALIDATED at boot (`validateFixedBank`) and a violation throws BEFORE the
   * WebSocket binds — conflicts resolve loudly at startup.
   */
  fixedLayers?: FixedLayerBank;
  /**
   * R-021 stage 1 — where the fixed bank persists (JSON). An ABSENT file means
   * no bank; a PRESENT-but-unusable file is a HARD boot failure (see
   * `fixed-layers-store.ts` for why this diverges from connection-store's
   * warn-and-ignore).
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
  const fixedBank =
    options.fixedLayers ??
    (options.fixedLayersPath !== undefined ? loadFixedLayerBank(options.fixedLayersPath) : null);
  const fixedSlots =
    fixedBank !== null && fixedBank !== undefined
      ? // R-028 (2.5) — the candidate ceiling must never intersect the
        // reserved playout range: refused HERE at load, and again at every
        // change (`setFixedLayers` reads the same list). A violation throws
        // BEFORE the WebSocket binds — conflicts resolve loudly at startup.
        validateFixedBank(fixedBank, { policy: layerPolicy, reservedLayers })
      : [];
  const runtime = new CasparRuntime(connection, options.templateServe ?? {}, {
    fixedSlots,
    layerPolicy,
    reservedLayers,
    ...(fixedBank !== null && fixedBank !== undefined ? { fixedBank } : {}),
    ...(options.templatesDir !== undefined ? { templatesDir: options.templatesDir } : {}),
    ...(options.runtimeTuning ?? {}),
  });
  const routes = buildRoutes(runtime, options.persistPath, options.fixedLayersPath);

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
    // Stack ops are async (they await their AMCP ack); await every handler.
    const result = await route.handle(parsedReq.data);
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
    // R-034 — the shared delimiter list.
    backing.delimitersChanged.subscribe((d) => push(DelimitersChangedChannel, d)),
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
  persistPath?: string,
  fixedLayersPath?: string,
): Map<string, Route> {
  const route = (channel: AnyChannel, handle: (req: never) => unknown): Route => ({
    channel,
    handle: handle as (req: unknown) => unknown,
  });

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

    route(UpdateRequestChannel, (r: { version: string; notes?: string }) =>
      b.updateRequest(r.version, r.notes),
    ),
    route(UpdateStateChannel, () => b.updateState()),
    route(UpdateCancelChannel, () => b.updateCancel()),

    // R-034 — the station's delimiter list, bridge-owned so every browser sees one list.
    route(DelimitersListChannel, () => b.delimitersList()),
    route(DelimitersSetChannel, (r: { delimiters: never[] }) => b.delimitersSet(r.delimiters)),

    route(SettingsGetChannel, () => b.settingsGet()),
    route(SettingsSetChannel, (r: Partial<{ telemetry: never }>) => b.settingsSet(r)),
  ];

  return new Map(entries.map((e) => [e.channel.name, e]));
}
