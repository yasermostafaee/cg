import { WebSocketServer, type WebSocket } from 'ws';
import {
  AppInfoChannel,
  AuditRecentChannel,
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  SettingsChangedChannel,
  SettingsGetChannel,
  SettingsSetChannel,
  StackLoadChannel,
  StackOutChannel,
  StackRemoveChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesGetChannel,
  TemplatesImportChannel,
  TemplatesListChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChangedChannel,
  UpdateStateChannel,
  parseWsFrame,
  serializeWsFrame,
  type AnyChannel,
  type AnyPublishChannel,
  type WsPublishFrame,
  type WsResponseFrame,
} from '@cg/shared-ipc';
import { RuntimeBacking } from './runtime-backing.js';

export interface BridgeOptions {
  /** Bind host. Defaults to loopback (`127.0.0.1`) — enforced at the socket bind. */
  host?: string;
  /** Bind port. Defaults to the browser-safe `DEFAULT_BRIDGE_PORT`. `0` = ephemeral. */
  port?: number;
}

export interface BridgeHandle {
  readonly host: string;
  readonly port: number;
  readonly url: string;
  /** The in-memory Phase-1 backing (throwaway). */
  readonly backing: RuntimeBacking;
  /** Force-close every client socket — used by tests to simulate a mid-session drop. */
  dropConnections(): void;
  /** Stop the server and close all clients. */
  close(): Promise<void>;
}

/** One request route: a channel + a handler producing its response. */
interface Route {
  readonly channel: AnyChannel;
  readonly handle: (req: unknown) => unknown;
}

/**
 * Start the localhost CasparCG bridge (C-001 Phase 1).
 *
 * A single `ws` WebSocket server speaks the existing `@cg/shared-ipc`
 * request/response + publish contract as JSON frames (see `ws-frame.ts`),
 * backed by a throwaway in-memory runtime. It binds loopback by default,
 * **enforced at the socket bind** via `new WebSocketServer({ host, port })`.
 */
export async function createBridge(options: BridgeOptions = {}): Promise<BridgeHandle> {
  const host = options.host ?? DEFAULT_BRIDGE_HOST;
  const requestedPort = options.port ?? DEFAULT_BRIDGE_PORT;
  const backing = new RuntimeBacking();
  const routes = buildRoutes(backing);

  const wss = new WebSocketServer({ host, port: requestedPort });

  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });

  const address = wss.address();
  const port = typeof address === 'object' && address !== null ? address.port : requestedPort;

  wss.on('connection', (socket) => {
    const unsubscribers = wirePublishes(socket, backing);
    socket.on('message', (data) => {
      handleMessage(socket, routes, data.toString());
    });
    socket.on('close', () => {
      for (const off of unsubscribers) off();
    });
    socket.on('error', () => {
      for (const off of unsubscribers) off();
    });
  });

  return {
    host,
    port,
    url: `ws://${host}:${port}`,
    backing,
    dropConnections() {
      for (const client of wss.clients) client.terminate();
    },
    close() {
      for (const client of wss.clients) client.terminate();
      return new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function handleMessage(socket: WebSocket, routes: Map<string, Route>, raw: string): void {
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
    const result = route.handle(parsedReq.data);
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
function wirePublishes(socket: WebSocket, backing: RuntimeBacking): (() => void)[] {
  const push = (channel: AnyPublishChannel, payload: unknown): void => {
    const parsed = channel.payload.safeParse(payload);
    if (parsed.success)
      send(socket, { type: 'publish', channel: channel.name, payload: parsed.data });
  };
  return [
    backing.stackChanged.subscribe((s) => push(StackStateChangedChannel, s)),
    backing.healthChanged.subscribe((h) => push(ConnectionsHealthChangedChannel, h)),
    backing.lockChanged.subscribe((l) => push(LockStateChangedChannel, l)),
    backing.updateChanged.subscribe((u) => push(UpdateStateChangedChannel, u)),
    backing.settingsChanged.subscribe((s) => push(SettingsChangedChannel, s)),
  ];
}

/** Map every RuntimeBridge channel to its backing handler. */
function buildRoutes(b: RuntimeBacking): Map<string, Route> {
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
    route(StackOutChannel, (r: { itemId: string }) => b.out(r.itemId)),
    route(StackRemoveChannel, (r: { itemId: string }) => b.remove(r.itemId)),
    route(StackSnapshotChannel, () => b.stackSnapshot()),

    route(ConnectionsConfigChannel, () => b.config()),
    route(ConnectionsHealthChannel, () => b.health()),
    route(ConnectionsFailoverChannel, () => b.failover()),

    route(LockEngageChannel, (r: { pin: string }) => b.engage(r.pin)),
    route(LockReleaseChannel, (r: { pin: string }) => b.release(r.pin)),
    route(LockStateChannel, () => b.lockState()),

    route(TemplatesGetChannel, (r: { templateId: string }) => b.templateGet(r.templateId)),
    route(TemplatesListChannel, () => b.templateList()),
    route(TemplatesImportChannel, (r: { template: never }) => b.templateImport(r.template)),

    route(AuditRecentChannel, (r: { limit?: number; action?: never; actor?: string }) =>
      b.auditRecent(r.limit, r.action, r.actor),
    ),

    route(UpdateRequestChannel, (r: { version: string; notes?: string }) =>
      b.updateRequest(r.version, r.notes),
    ),
    route(UpdateStateChannel, () => b.updateState()),
    route(UpdateCancelChannel, () => b.updateCancel()),

    route(SettingsGetChannel, () => b.settingsGet()),
    route(SettingsSetChannel, (r: Partial<{ telemetry: never }>) => b.settingsSet(r)),
  ];

  return new Map(entries.map((e) => [e.channel.name, e]));
}
