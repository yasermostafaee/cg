import type { StackItemState } from '@cg/shared-schema';
import {
  AuditRecentChannel,
  ConnectionsConfigChangedChannel,
  ConnectionsConfigChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  ConnectionsSetConfigChannel,
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
  StackLoadChannel,
  StackOutChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackSetPositionChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
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
  type AnyChannel,
  type ChannelRequest,
  type ChannelResponse,
  type ConnectionConfig,
  type ConnectionHealth,
  type LockState,
  type OrphanLayer,
  type OwnedOccupancyWarning,
  type PendingUpdate,
  type Settings,
} from '@cg/shared-ipc';
import type {
  AppInfo,
  BridgeLinkStatus,
  RuntimeBridge,
  Unsubscribe,
} from '../shared/runtime-bridge.js';

const APP_INFO: AppInfo = { name: 'cg Runtime', version: '0.0.0', platform: 'browser' };

const WS_OPEN = 1;
const REQUEST_TIMEOUT_MS = 8000;
const RECONNECT_DELAY_MS = 1000;

/** The slice of the browser `WebSocket` API the runtime uses (so tests can inject a fake). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'close', listener: () => void): void;
  addEventListener(type: 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface WebSocketRuntimeOptions {
  /** Inject a WebSocket implementation (default: the global `WebSocket`). */
  createWebSocket?: WebSocketFactory;
  /**
   * Reconnect-reconciliation — called when a retained template's re-delivery
   * fails during the post-reconnect resync (the resync itself continues). The
   * renderer wires this to its command-error surface; default: console.error.
   */
  onResyncError?: (message: string) => void;
}

/** Thrown (as a rejected promise) when a command is issued while the link is down. */
export class BridgeDisconnectedError extends Error {
  constructor() {
    super('Bridge disconnected — command rejected. Not sent to CasparCG.');
    this.name = 'BridgeDisconnectedError';
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class Subs<T> {
  readonly #set = new Set<(value: T) => void>();
  add(handler: (value: T) => void): Unsubscribe {
    this.#set.add(handler);
    return () => {
      this.#set.delete(handler);
    };
  }
  emit(value: T): void {
    for (const h of [...this.#set]) h(value);
  }
}

/**
 * Browser implementation of `RuntimeBridge` that relays each channel call to the
 * local CasparCG bridge over a single WebSocket, using the shared
 * `@cg/shared-ipc` frame envelope (C-001 Phase 1). It uses only the browser
 * `WebSocket` API — no Node imports — so it stays Renderer-tier clean.
 *
 * Resilience (never a silent downgrade): while the link is `live` requests are
 * relayed; on a mid-session drop the status flips to `disconnected`, every
 * in-flight and subsequent command is **rejected** (it never touches a mock and
 * never reports optimistic on-air), and on reconnect the runtime re-pulls a full
 * snapshot (stack / health / lock) and pushes it to subscribers to resync.
 */
export class WebSocketRuntime implements RuntimeBridge {
  readonly #url: string;
  readonly #createWs: WebSocketFactory;
  readonly #onResyncError: (message: string) => void;
  #ws: WebSocketLike | null = null;
  #status: BridgeLinkStatus = 'disconnected';
  #everOpened = false;
  #disposed = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  #nextId = 0;
  readonly #pending = new Map<string, Pending>();

  /**
   * Reconnect-reconciliation — the exact `{ template, html }` payload of every
   * successful `templates.import`, keyed by templateId (a re-import replaces
   * it). The bridge's registry is in-memory and empty after a bridge restart;
   * `#resync()` re-delivers this set FIRST on every reconnect so a subsequent
   * load resolves against a populated registry. Page-lifetime only — a page
   * reload starts empty (the bridge-side registry covers that case).
   */
  readonly #retained = new Map<string, ChannelRequest<typeof TemplatesImportChannel>>();

  readonly #stackSubs = new Subs<readonly StackItemState[]>();
  readonly #healthSubs = new Subs<ConnectionHealth>();
  readonly #configSubs = new Subs<ConnectionConfig>();
  readonly #orphanSubs = new Subs<OrphanLayer[]>();
  readonly #ownedOccupancySubs = new Subs<OwnedOccupancyWarning[]>();
  readonly #lockSubs = new Subs<LockState>();
  readonly #updateSubs = new Subs<PendingUpdate | null>();
  readonly #settingsSubs = new Subs<Settings>();
  readonly #statusSubs = new Subs<BridgeLinkStatus>();

  #readyResolve: (() => void) | null = null;
  #readyReject: ((err: Error) => void) | null = null;
  #readySettled = false;

  constructor(url: string, options: WebSocketRuntimeOptions = {}) {
    this.#url = url;
    this.#createWs =
      options.createWebSocket ?? ((u) => new WebSocket(u) as unknown as WebSocketLike);
    this.#onResyncError =
      options.onResyncError ?? ((message) => console.error(`[WebSocketRuntime] ${message}`));
    this.#connect();
  }

  /** Resolves on first successful connect; rejects if the first connect fails. */
  whenReady(): Promise<void> {
    if (this.#status === 'live') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.#readyResolve = resolve;
      this.#readyReject = reject;
    });
  }

  /** Stop reconnecting and close the socket. */
  dispose(): void {
    this.#disposed = true;
    this.#retained.clear();
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#ws?.close();
  }

  // ── connection lifecycle ────────────────────────────────────────────
  #connect(): void {
    const ws = this.#createWs(this.#url);
    this.#ws = ws;
    ws.addEventListener('open', () => {
      const reconnected = this.#everOpened;
      this.#everOpened = true;
      this.#setStatus('live');
      if (!this.#readySettled) {
        this.#readySettled = true;
        this.#readyResolve?.();
      }
      if (reconnected) void this.#resync();
    });
    ws.addEventListener('message', (ev) => {
      this.#onMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    });
    ws.addEventListener('close', () => this.#onDown());
    ws.addEventListener('error', () => this.#onDown());
  }

  #onDown(): void {
    if (this.#disposed) return;
    // Reject everything in flight — commands are never left dangling or optimistic.
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeDisconnectedError());
    }
    this.#pending.clear();

    if (!this.#readySettled) {
      // First connect failed → let selection fall back to the mock.
      this.#readySettled = true;
      this.#readyReject?.(new BridgeDisconnectedError());
      return;
    }

    this.#setStatus('disconnected');
    if (this.#reconnectTimer === null) {
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        if (!this.#disposed) this.#connect();
      }, RECONNECT_DELAY_MS);
    }
  }

  #setStatus(status: BridgeLinkStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#statusSubs.emit(status);
  }

  /**
   * Post-reconnect resync: FIRST re-deliver every retained template — a bridge
   * restart wiped its in-memory registry — THEN re-pull the full snapshot and
   * push it to subscribers. All re-delivery frames are written before yielding,
   * so single-socket FIFO plus the bridge's synchronous registration guarantee
   * any operator load issued after the reconnect resolves against a populated
   * registry. A failed re-delivery is surfaced and never aborts the rest.
   */
  async #resync(): Promise<void> {
    const redeliveries = [...this.#retained.values()].map(async (req) => {
      try {
        await this.#invoke(TemplatesImportChannel, req);
      } catch (err) {
        // A fresh drop mid-resync re-triggers the whole resync on the next
        // reconnect — stay quiet; only a real per-template rejection surfaces.
        if (err instanceof BridgeDisconnectedError) return;
        this.#onResyncError(
          `Re-delivery of template “${req.template.templateId}” failed on reconnect: ` +
            `${err instanceof Error ? err.message : String(err)}. Re-import it manually.`,
        );
      }
    });
    await Promise.all(redeliveries);
    try {
      const [stack, health, lock] = await Promise.all([
        this.#invoke(StackSnapshotChannel, undefined),
        this.#invoke(ConnectionsHealthChannel, undefined),
        this.#invoke(LockStateChannel, undefined),
      ]);
      this.#stackSubs.emit(stack);
      this.#healthSubs.emit(health);
      this.#lockSubs.emit(lock);
    } catch {
      /* a fresh drop during resync will re-trigger reconnect */
    }
  }

  #onMessage(raw: string): void {
    const frame = parseWsFrame(raw);
    if (frame === null) return;
    if (frame.type === 'response') {
      const pending = this.#pending.get(frame.id);
      if (pending === undefined) return;
      this.#pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.error !== undefined) pending.reject(new Error(frame.error.message));
      else pending.resolve(frame.payload);
      return;
    }
    if (frame.type === 'publish') {
      this.#routePublish(frame.channel, frame.payload);
    }
  }

  #routePublish(channel: string, payload: unknown): void {
    switch (channel) {
      case StackStateChangedChannel.name: {
        const p = StackStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#stackSubs.emit(p.data);
        break;
      }
      case ConnectionsHealthChangedChannel.name: {
        const p = ConnectionsHealthChangedChannel.payload.safeParse(payload);
        if (p.success) this.#healthSubs.emit(p.data);
        break;
      }
      case ConnectionsConfigChangedChannel.name: {
        const p = ConnectionsConfigChangedChannel.payload.safeParse(payload);
        if (p.success) this.#configSubs.emit(p.data);
        break;
      }
      case LayersOrphansChangedChannel.name: {
        const p = LayersOrphansChangedChannel.payload.safeParse(payload);
        if (p.success) this.#orphanSubs.emit(p.data);
        break;
      }
      case LayersOwnedOccupancyChangedChannel.name: {
        const p = LayersOwnedOccupancyChangedChannel.payload.safeParse(payload);
        if (p.success) this.#ownedOccupancySubs.emit(p.data);
        break;
      }
      case LockStateChangedChannel.name: {
        const p = LockStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#lockSubs.emit(p.data);
        break;
      }
      case UpdateStateChangedChannel.name: {
        const p = UpdateStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#updateSubs.emit(p.data);
        break;
      }
      case SettingsChangedChannel.name: {
        const p = SettingsChangedChannel.payload.safeParse(payload);
        if (p.success) this.#settingsSubs.emit(p.data);
        break;
      }
      default:
        break;
    }
  }

  /** Validate the request, relay it, and resolve the validated response. */
  #invoke<C extends AnyChannel>(
    channel: C,
    request: ChannelRequest<C>,
  ): Promise<ChannelResponse<C>> {
    if (this.#status !== 'live' || this.#ws === null || this.#ws.readyState !== WS_OPEN) {
      return Promise.reject(new BridgeDisconnectedError());
    }
    const validatedReq = channel.request.parse(request) as unknown;
    const id = String(++this.#nextId);
    const ws = this.#ws;
    return new Promise<ChannelResponse<C>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Bridge request timed out: ${channel.name}`));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(id, {
        resolve: (value) => resolve(channel.response.parse(value) as ChannelResponse<C>),
        reject,
        timer,
      });
      ws.send(
        serializeWsFrame({ type: 'request', id, channel: channel.name, payload: validatedReq }),
      );
    });
  }

  // ── RuntimeBridge surface ───────────────────────────────────────────
  getAppInfo(): Promise<AppInfo> {
    return Promise.resolve(APP_INFO);
  }

  readonly link = {
    status: (): BridgeLinkStatus => this.#status,
    onStatusChanged: (handler: (status: BridgeLinkStatus) => void): Unsubscribe =>
      this.#statusSubs.add(handler),
  };

  readonly stack = {
    load: (req: ChannelRequest<typeof StackLoadChannel>) => this.#invoke(StackLoadChannel, req),
    take: (req: ChannelRequest<typeof StackTakeChannel>) => this.#invoke(StackTakeChannel, req),
    update: (req: ChannelRequest<typeof StackUpdateChannel>) =>
      this.#invoke(StackUpdateChannel, req),
    out: (req: ChannelRequest<typeof StackOutChannel>) => this.#invoke(StackOutChannel, req),
    remove: (req: ChannelRequest<typeof StackRemoveChannel>) =>
      this.#invoke(StackRemoveChannel, req),
    setPosition: (req: ChannelRequest<typeof StackSetPositionChannel>) =>
      this.#invoke(StackSetPositionChannel, req),
    removeAll: () => this.#invoke(StackRemoveAllChannel, undefined),
    clearAll: () => this.#invoke(StackClearAllChannel, undefined),
    snapshot: () => this.#invoke(StackSnapshotChannel, undefined),
    onStateChanged: (handler: (snapshot: readonly StackItemState[]) => void) =>
      this.#stackSubs.add(handler),
  };

  readonly connections = {
    config: (): Promise<ConnectionConfig> => this.#invoke(ConnectionsConfigChannel, undefined),
    setConfig: (req: ChannelRequest<typeof ConnectionsSetConfigChannel>) =>
      this.#invoke(ConnectionsSetConfigChannel, req),
    health: (): Promise<ConnectionHealth> => this.#invoke(ConnectionsHealthChannel, undefined),
    failover: (req: ChannelRequest<typeof ConnectionsFailoverChannel>) =>
      this.#invoke(ConnectionsFailoverChannel, req),
    onHealthChanged: (handler: (health: ConnectionHealth) => void) => this.#healthSubs.add(handler),
    onConfigChanged: (handler: (config: ConnectionConfig) => void) => this.#configSubs.add(handler),
  };

  readonly layers = {
    orphans: () => this.#invoke(LayersOrphansChannel, undefined),
    clear: (req: ChannelRequest<typeof LayersClearChannel>) =>
      this.#invoke(LayersClearChannel, req),
    onOrphansChanged: (handler: (orphans: OrphanLayer[]) => void) => this.#orphanSubs.add(handler),
    ownedOccupancy: () => this.#invoke(LayersOwnedOccupancyChannel, undefined),
    onOwnedOccupancyChanged: (handler: (warnings: OwnedOccupancyWarning[]) => void) =>
      this.#ownedOccupancySubs.add(handler),
  };

  readonly lock = {
    engage: (req: ChannelRequest<typeof LockEngageChannel>) => this.#invoke(LockEngageChannel, req),
    release: (req: ChannelRequest<typeof LockReleaseChannel>) =>
      this.#invoke(LockReleaseChannel, req),
    state: (): Promise<LockState> => this.#invoke(LockStateChannel, undefined),
    onStateChanged: (handler: (state: LockState) => void) => this.#lockSubs.add(handler),
  };

  readonly templates = {
    get: (req: ChannelRequest<typeof TemplatesGetChannel>) =>
      this.#invoke(TemplatesGetChannel, req),
    list: () => this.#invoke(TemplatesListChannel, undefined),
    import: async (req: ChannelRequest<typeof TemplatesImportChannel>) => {
      const res = await this.#invoke(TemplatesImportChannel, req);
      // Reconnect-reconciliation — retain the exact delivered payload (only
      // after the bridge confirmed it) so a bridge restart is healed by
      // re-delivery on reconnect. Keyed by id: a re-import replaces it.
      this.#retained.set(req.template.templateId, req);
      return res;
    },
    remove: async (req: ChannelRequest<typeof TemplatesRemoveChannel>) => {
      const res = await this.#invoke(TemplatesRemoveChannel, req);
      // R-005 — prune the retention ONLY on a confirmed removal. `#resync()` re-delivers
      // this set on every reconnect, so a registry-only delete would be undone by the very
      // next bridge blip. Symmetrically, a REFUSED removal must keep the payload: the
      // bridge still has the template registered, and dropping it here would make a
      // reconnect silently de-register a template the operator was told they could not
      // remove.
      if (res.ok) this.#retained.delete(req.templateId);
      return res;
    },
  };

  readonly audit = {
    recent: (req: ChannelRequest<typeof AuditRecentChannel>) =>
      this.#invoke(AuditRecentChannel, req),
  };

  readonly update = {
    request: (req: ChannelRequest<typeof UpdateRequestChannel>) =>
      this.#invoke(UpdateRequestChannel, req),
    state: () => this.#invoke(UpdateStateChannel, undefined),
    cancel: () => this.#invoke(UpdateCancelChannel, undefined),
    onStateChanged: (handler: (pending: PendingUpdate | null) => void) =>
      this.#updateSubs.add(handler),
  };

  readonly settings = {
    get: () => this.#invoke(SettingsGetChannel, undefined),
    set: (req: ChannelRequest<typeof SettingsSetChannel>) => this.#invoke(SettingsSetChannel, req),
    onChanged: (handler: (next: Settings) => void) => this.#settingsSubs.add(handler),
  };
}
