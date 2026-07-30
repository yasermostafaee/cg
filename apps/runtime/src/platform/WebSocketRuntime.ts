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
  PlayoutLayersClearChannel,
  PlayoutLayersStateChangedChannel,
  PlayoutLayersStateChannel,
  StackLoadChannel,
  StackNextChannel,
  StackOutChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackStopAllChannel,
  StackRestoreChannel,
  StackStopChannel,
  StackSetPositionChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesChangedChannel,
  DelimitersChangedChannel,
  DelimitersListChannel,
  DelimitersSetChannel,
  type DelimiterOption,
  ChannelSettingsChangedChannel,
  ChannelSettingsGetChannel,
  ChannelSettingsSetChannel,
  type ChannelSettingsState,
  RehearseEnterChannel,
  RehearseExitChannel,
  RehearseStateChangedChannel,
  RehearseStateChannel,
  type Rehearsal,
  TemplatesGetChannel,
  TemplatesImportChannel,
  TemplatesListChannel,
  TemplatesRemoveChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChangedChannel,
  UpdateStateChannel,
  FixedLayersConfigChangedChannel,
  FixedLayersClearLayerChannel,
  FixedLayersConfigChannel,
  FixedLayersLoadChannel,
  FixedLayersSetConfigChannel,
  FixedLayersStateChangedChannel,
  FixedLayersStateChannel,
  parseWsFrame,
  serializeWsFrame,
  type AnyChannel,
  type ChannelRequest,
  type ChannelResponse,
  type ConnectionConfig,
  type ConnectionHealth,
  type FixedLayerBank,
  type FixedSlotState,
  type LockState,
  type OrphanLayer,
  type OwnedOccupancyWarning,
  type PendingUpdate,
  type PlayoutLayerState,
  type Settings,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { MemoryWorkspace } from '@cg/storage';
import type {
  AppInfo,
  BridgeLinkStatus,
  RuntimeBridge,
  Unsubscribe,
} from '../shared/runtime-bridge.js';
import { LibraryStore } from './library/LibraryStore.js';
import { StackRetentionStore } from './stack/StackRetentionStore.js';

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
  /**
   * B-085 — the browser-local template library (source of truth). Injected by
   * `createRuntimeBridge` backed by OPFS (persistent). Defaults to an in-memory
   * store so transport/reconnect tests can construct the runtime with no library
   * and still exercise delivery + reconcile. Must be `hydrate()`-ed before the
   * renderer reads `templates.list()` (the boot path awaits it).
   */
  library?: LibraryStore;
  /**
   * B-092 — the browser-local retention of the operator's stack INTENT, so the
   * stack survives a bridge-process restart. Injected by `createRuntimeBridge`
   * backed by OPFS (persistent). Defaults to an in-memory store so transport
   * tests can construct the runtime with no retention and still exercise
   * delivery + reconcile. Must be `hydrate()`-ed before the first connect for
   * the retention to be re-delivered (the boot path awaits it).
   */
  stackRetention?: StackRetentionStore;
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
   * B-085, re-scoped by R-028 (o1): the browser-local library is now the
   * OFFLINE FALLBACK and the reconnect re-delivery set — the BRIDGE's
   * persisted registry is the catalogue of record (one bridge, many browsers,
   * one library). While live, `templates.list/get` are served from the bridge;
   * with the link down they answer from this retained copy (this browser's own
   * imports), display-only. `#resync()` still re-delivers `#library.entries()`
   * FIRST on every reconnect so an offline import reaches the bridge (per-id
   * conflict policy: local-wins, unchanged).
   */
  readonly #library: LibraryStore;

  /**
   * B-085 — the last stack snapshot seen over the link. Drives the OFFLINE
   * refuse-while-referenced check for `templates.remove`: while disconnected the
   * bridge is the sole mutator of the stack and cannot change it, so the last
   * value the SPA saw IS the current stack (empty before the first connect).
   */
  #lastStack: readonly StackItemState[] = [];

  /**
   * B-092 — the browser-local stack INTENT, mirrored from every snapshot the
   * SPA sees and re-delivered to the bridge on every (re)connect. This is what
   * makes the stack survive a bridge restart: without it a restarted bridge
   * boots empty, the re-pull below returns `[]`, and every row disappears.
   */
  readonly #stackRetention: StackRetentionStore;

  /**
   * B-092 — true while `#resync` is re-delivering retained stack intent and
   * re-pulling the snapshot.
   *
   * Mirroring is SUPPRESSED for that window, and this is load-bearing: the
   * snapshot a freshly-booted bridge publishes before (or instead of) a
   * successful restore is EMPTY, and mirroring it would erase the very
   * retention that fixes the bug — permanently, since the store is persistent.
   * A restore that fails therefore leaves the retention untouched for the next
   * connect. Outside this window an empty snapshot is a real one (Remove All)
   * and is mirrored normally.
   */
  #resyncing = false;

  readonly #stackSubs = new Subs<readonly StackItemState[]>();
  readonly #healthSubs = new Subs<ConnectionHealth>();
  readonly #configSubs = new Subs<ConnectionConfig>();
  readonly #orphanSubs = new Subs<OrphanLayer[]>();
  readonly #ownedOccupancySubs = new Subs<OwnedOccupancyWarning[]>();
  // R-021 stage 2a — fixed-bank config + per-slot state pushes.
  readonly #fixedConfigSubs = new Subs<FixedLayerBank | null>();
  readonly #fixedStateSubs = new Subs<FixedSlotState[]>();
  readonly #lockSubs = new Subs<LockState>();
  readonly #updateSubs = new Subs<PendingUpdate | null>();
  readonly #settingsSubs = new Subs<Settings>();
  /** R-034 — the bridge-owned delimiter list, pushed on every change. */
  readonly #delimiterSubs = new Subs<DelimiterOption[]>();
  /** R-030 — the bridge-owned channel raster + video-mode reading. */
  readonly #channelSettingsSubs = new Subs<ChannelSettingsState>();
  /** R-022 — the bridge-owned rehearsing set, pushed to every client. */
  readonly #rehearseSubs = new Subs<Rehearsal[]>();
  readonly #statusSubs = new Subs<BridgeLinkStatus>();
  // R-028 (o1) — the bridge-owned catalogue push.
  readonly #templatesSubs = new Subs<TemplateInfo[]>();
  // R-028 part B — the declared playout layers' occupancy push.
  readonly #playoutSubs = new Subs<PlayoutLayerState[]>();

  #readyResolve: (() => void) | null = null;
  #readyReject: ((err: Error) => void) | null = null;
  #readySettled = false;

  constructor(url: string, options: WebSocketRuntimeOptions = {}) {
    this.#url = url;
    this.#createWs =
      options.createWebSocket ?? ((u) => new WebSocket(u) as unknown as WebSocketLike);
    this.#onResyncError =
      options.onResyncError ?? ((message) => console.error(`[WebSocketRuntime] ${message}`));
    // Default to an in-memory (unhydrated, empty) library so tests can construct
    // the runtime with no store and still exercise delivery + reconcile. The boot
    // path injects an OPFS-backed, hydrated store.
    this.#library = options.library ?? new LibraryStore(new MemoryWorkspace());
    this.#stackRetention = options.stackRetention ?? new StackRetentionStore(new MemoryWorkspace());
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
      // B-085 — reconcile the browser-local library to the bridge on EVERY connect:
      // deliver the retained templates so the bridge can serve them. On the FIRST
      // connect this delivers a library imported while boot-disconnected (offline
      // import); on a RECONNECT it additionally re-pulls the stack/health/lock
      // snapshots (first-connect snapshots come from the renderer's
      // `useBridgeSnapshot`). Delivery on an empty library is a no-op.
      void this.#resync(reconnected);
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
   * Reconcile on (re)connect: FIRST re-deliver every template in the browser-local
   * library — a bridge restart wiped its in-memory registry, and an offline import
   * never reached it — THEN (on a RECONNECT only) re-pull the full snapshot and
   * push it to subscribers. All re-delivery frames are written before yielding, so
   * single-socket FIFO plus the bridge's synchronous registration guarantee any
   * operator load issued after the connect resolves against a populated registry.
   * A failed re-delivery is surfaced and never aborts the rest.
   */
  async #resync(rePullSnapshots = true): Promise<void> {
    // B-085 — reconcile the bridge to the browser-local library: deliver every
    // retained template FIRST, sourced from the persistent store.
    //
    // R-028 part B — THE RECONCILIATION POLICY, and it is enforced on the
    // BRIDGE, not here. Every frame below is marked `redelivery: true`, which
    // means "restore this if you lost it, but do not resurrect it if you
    // deliberately dropped it": the bridge keeps a removed-id set beside its
    // persisted registry and ignores a re-delivery of anything in it, and it
    // keeps its OWN copy of an id it already holds rather than letting an older
    // local one overwrite it. An operator's real import carries no flag and
    // always wins, clearing the tombstone.
    //
    // Why bridge-side: the bridge is already the catalogue's authority and the
    // only party that persists it. A browser cannot know a removal it was
    // offline for, so client-side filtering would need every browser to learn
    // every removal. Deciding it where the removal HAPPENED needs no
    // replication at all.
    //
    // Why not a pre-flight `templates.list` here: the frames below are written
    // before this method yields, so single-socket FIFO plus the bridge's
    // synchronous registration guarantee an operator load issued right after
    // connect resolves against a populated registry. Awaiting a round-trip
    // first would open exactly that window.
    const redeliveries = this.#library.entries().map(async (req) => {
      try {
        await this.#invoke(TemplatesImportChannel, {
          template: req.template,
          html: req.html,
          redelivery: true,
        });
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

    // B-092 — then re-deliver the retained STACK intent, so a bridge that
    // restarted (and booted with an empty stack) is rebuilt BEFORE the re-pull
    // below reads it. Order is the whole point: templates → stack → snapshot.
    // Without this step the re-pull returns `[]` and blanks every row, which is
    // the bug. The bridge decides adopt-vs-re-ADD against real OSC occupancy,
    // so this can never clear a live layer.
    //
    // `#resyncing` suppresses retention mirroring across the whole window: a
    // failed restore must leave the retention intact for the next connect
    // rather than let an empty snapshot overwrite it.
    this.#resyncing = true;
    let restoreOk = true;
    try {
      const retained = this.#stackRetention.items();
      if (retained.length > 0) {
        await this.#invoke(StackRestoreChannel, { items: [...retained] });
      }
    } catch (err) {
      restoreOk = false;
      if (!(err instanceof BridgeDisconnectedError)) {
        this.#onResyncError(
          `Restoring the retained stack failed on reconnect: ` +
            `${err instanceof Error ? err.message : String(err)}. ` +
            `The stack is kept locally and will be retried on the next connect.`,
        );
      }
    }

    // First connect: the renderer's `useBridgeSnapshot` pulls the initial
    // stack/health/lock, so only a RECONNECT re-pulls them here.
    if (!rePullSnapshots) {
      this.#resyncing = false;
      return;
    }
    try {
      const [stack, health, lock] = await Promise.all([
        this.#invoke(StackSnapshotChannel, undefined),
        this.#invoke(ConnectionsHealthChannel, undefined),
        this.#invoke(LockStateChannel, undefined),
      ]);
      this.#lastStack = stack;
      this.#stackSubs.emit(stack);
      this.#healthSubs.emit(health);
      this.#lockSubs.emit(lock);
      // Only a restore that actually succeeded may re-baseline the retention:
      // after a failure this snapshot may be the empty one that erases it.
      this.#resyncing = false;
      if (restoreOk) this.#mirrorStack(stack);
    } catch {
      /* a fresh drop during resync will re-trigger reconnect */
      this.#resyncing = false;
    }
  }

  /**
   * B-092 — persist the stack INTENT behind a published snapshot (fire and
   * forget: retention must never delay or fail a UI update). Suppressed while
   * `#resyncing`, see that field.
   */
  #mirrorStack(snapshot: readonly StackItemState[]): void {
    if (this.#resyncing) return;
    void this.#stackRetention.mirror(snapshot).catch(() => {
      /* retention is best-effort; a write failure must never break playout */
    });
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
        if (p.success) {
          this.#lastStack = p.data;
          this.#stackSubs.emit(p.data);
          this.#mirrorStack(p.data); // B-092 — keep the browser-local intent current
        }
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
      case FixedLayersConfigChangedChannel.name: {
        const p = FixedLayersConfigChangedChannel.payload.safeParse(payload);
        if (p.success) this.#fixedConfigSubs.emit(p.data);
        break;
      }
      case FixedLayersStateChangedChannel.name: {
        const p = FixedLayersStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#fixedStateSubs.emit(p.data);
        break;
      }
      case LayersOwnedOccupancyChangedChannel.name: {
        const p = LayersOwnedOccupancyChangedChannel.payload.safeParse(payload);
        if (p.success) this.#ownedOccupancySubs.emit(p.data);
        break;
      }
      case TemplatesChangedChannel.name: {
        const p = TemplatesChangedChannel.payload.safeParse(payload);
        if (p.success) this.#templatesSubs.emit(p.data);
        break;
      }
      case PlayoutLayersStateChangedChannel.name: {
        const p = PlayoutLayersStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#playoutSubs.emit(p.data);
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
      case DelimitersChangedChannel.name: {
        const p = DelimitersChangedChannel.payload.safeParse(payload);
        if (p.success) this.#delimiterSubs.emit(p.data);
        break;
      }
      case ChannelSettingsChangedChannel.name: {
        const p = ChannelSettingsChangedChannel.payload.safeParse(payload);
        if (p.success) this.#channelSettingsSubs.emit(p.data);
        break;
      }
      case RehearseStateChangedChannel.name: {
        const p = RehearseStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#rehearseSubs.emit(p.data);
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
    // C-012 — the graceful stop (outro runs, producer stays resident).
    stop: (req: ChannelRequest<typeof StackStopChannel>) => this.#invoke(StackStopChannel, req),
    // R-028 (5.4) — advance the template's sequence.
    next: (req: ChannelRequest<typeof StackNextChannel>) => this.#invoke(StackNextChannel, req),
    out: (req: ChannelRequest<typeof StackOutChannel>) => this.#invoke(StackOutChannel, req),
    remove: (req: ChannelRequest<typeof StackRemoveChannel>) =>
      this.#invoke(StackRemoveChannel, req),
    setPosition: (req: ChannelRequest<typeof StackSetPositionChannel>) =>
      this.#invoke(StackSetPositionChannel, req),
    removeAll: () => this.#invoke(StackRemoveAllChannel, undefined),
    clearAll: () => this.#invoke(StackClearAllChannel, undefined),
    // C-012 / R-028 — the graceful bulk beside the hard one.
    stopAll: () => this.#invoke(StackStopAllChannel, undefined),
    snapshot: async () => {
      // B-092 — with the bridge unreachable, answer from the browser-local
      // retention instead of REFUSING. A cold page load against a dead bridge
      // otherwise shows an EMPTY stack (the pull is refused and nothing re-reads
      // the retention until the bridge returns) — the operator's list vanishing
      // on a refresh, which is the very failure this change exists to end. The
      // library already works this way (B-085); the stack now does too.
      //
      // DISPLAY ONLY: this sends nothing, commands nothing, and makes no
      // restore-vs-reset decision. The occupancy-aware restore still happens on
      // the bridge, on reconnect; the re-pull then replaces this with
      // authoritative truth.
      if (this.#status !== 'live') return this.#retainedProjection();
      const stack = await this.#invoke(StackSnapshotChannel, undefined);
      this.#lastStack = stack; // B-085 — keep the offline remove-reference check current
      this.#mirrorStack(stack); // B-092 — …and the browser-local stack intent
      return stack;
    },
    onStateChanged: (handler: (snapshot: readonly StackItemState[]) => void) =>
      this.#stackSubs.add(handler),
  };

  /**
   * B-092 — the retained stack intent projected into displayable state, for use
   * while the bridge is unreachable. It is a VIEW of intent, not a claim about
   * the wire, so its statuses are the honest ones for "nothing can be verified":
   *
   *   played  → `unverified` — B-086/B-087's muted "WAS ON AIR". NEVER the
   *             broadcast-red `on-air`/`playing`: with no bridge the SPA has no
   *             conduit to CasparCG at all, so a confident red badge would be
   *             the exact lie those two changes exist to kill.
   *   !played → `loaded` — not an air claim, and the same resting status the
   *             bridge itself leaves an item at when no server is reachable
   *             (B-082).
   *
   * `pending` is false throughout: nothing is in flight, so no row spins.
   *
   * The projection round-trips cleanly (`unverified`/`loaded` map back to the
   * same `played`), so it can never corrupt the retention if re-mirrored.
   */
  #retainedProjection(): StackItemState[] {
    const projected = this.#stackRetention.items().map(
      (i): StackItemState => ({
        itemId: i.itemId,
        templateId: i.templateId,
        fields: i.fields,
        status: i.played ? 'unverified' : 'loaded',
        pending: false,
        ...(i.slot !== undefined && { slot: i.slot }),
        ...(i.position !== undefined && { position: i.position }),
      }),
    );
    // B-085 — this IS the stack the SPA currently knows about, so it is also the
    // right basis for the OFFLINE refuse-while-referenced check. Without it a
    // cold boot against a dead bridge counts ZERO references and would let the
    // operator remove a template that the retained (and now visible) rows use.
    this.#lastStack = projected;
    return projected;
  }

  /** B-085 — how many current stack items reference `templateId` (offline R-005 check). */
  #referencedCount(templateId: string): number {
    return this.#lastStack.filter((i) => i.templateId === templateId).length;
  }

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

  // R-021 stage 2a — the fixed-bank wire contract (facts only; verb
  // derivation is the renderer's ONE function, design (f)/(g)).
  readonly fixedLayers = {
    config: () => this.#invoke(FixedLayersConfigChannel, undefined),
    setConfig: (req: ChannelRequest<typeof FixedLayersSetConfigChannel>) =>
      this.#invoke(FixedLayersSetConfigChannel, req),
    // R-021 stage 3 — the exact-slot load. Bridge-owned like `stack.load`: it
    // commands CasparCG, so it round-trips and is refused while the link is
    // down (the browser-local library is the only surface that works offline).
    load: (req: ChannelRequest<typeof FixedLayersLoadChannel>) =>
      this.#invoke(FixedLayersLoadChannel, req),
    // The bank-scoped clear. Round-trips like every command; the two structural
    // guards are held bridge-side.
    clearLayer: (req: ChannelRequest<typeof FixedLayersClearLayerChannel>) =>
      this.#invoke(FixedLayersClearLayerChannel, req),
    state: () => this.#invoke(FixedLayersStateChannel, undefined),
    onConfigChanged: (handler: (bank: FixedLayerBank | null) => void) =>
      this.#fixedConfigSubs.add(handler),
    onStateChanged: (handler: (state: FixedSlotState[]) => void) =>
      this.#fixedStateSubs.add(handler),
  };

  // R-028 part B — the declared playout layers. Bridge-owned throughout: the
  // state is what the bridge's own tap observes, and the clear's kind gate is
  // enforced there, so a disconnected browser simply cannot reach either.
  readonly playoutLayers = {
    state: () => this.#invoke(PlayoutLayersStateChannel, undefined),
    clear: (req: ChannelRequest<typeof PlayoutLayersClearChannel>) =>
      this.#invoke(PlayoutLayersClearChannel, req),
    onStateChanged: (handler: (state: PlayoutLayerState[]) => void) =>
      this.#playoutSubs.add(handler),
  };

  readonly lock = {
    engage: (req: ChannelRequest<typeof LockEngageChannel>) => this.#invoke(LockEngageChannel, req),
    release: (req: ChannelRequest<typeof LockReleaseChannel>) =>
      this.#invoke(LockReleaseChannel, req),
    state: (): Promise<LockState> => this.#invoke(LockStateChannel, undefined),
    onStateChanged: (handler: (state: LockState) => void) => this.#lockSubs.add(handler),
  };

  // R-028 (o1) — the BRIDGE owns the template catalogue: one bridge, many
  // browsers, one library. While the link is LIVE, reads are served from the
  // bridge so every browser sees the same list (including templates other
  // browsers imported); the browser-local `#library` (B-085) remains the
  // OFFLINE fallback and the reconnect re-delivery source — a read that cannot
  // reach the bridge answers from the local retained copy rather than
  // rejecting, the same display-only degradation the stack snapshot uses.
  readonly templates = {
    get: async (req: ChannelRequest<typeof TemplatesGetChannel>) => {
      if (this.#status === 'live') {
        try {
          const fromBridge = await this.#invoke(TemplatesGetChannel, req);
          // A local-only template (imported offline, delivery still pending)
          // must keep resolving — fall through to the local copy on null.
          if (fromBridge !== null) return fromBridge;
        } catch {
          /* mid-flight drop — answer from the retained copy below */
        }
      }
      return this.#library.get(req.templateId);
    },
    list: async () => {
      if (this.#status === 'live') {
        try {
          return await this.#invoke(TemplatesListChannel, undefined);
        } catch {
          /* mid-flight drop — answer from the retained copy below */
        }
      }
      return this.#library.list();
    },
    // R-022 — a LOCAL read. The page is already here; never a bridge round trip.
    html: (templateId: string) => Promise.resolve(this.#library.html(templateId)),
    import: async (req: ChannelRequest<typeof TemplatesImportChannel>) => {
      // Register LOCALLY first (the source of truth) — this is what makes import
      // succeed offline. Then, when live, deliver to the bridge so it can serve
      // the HTML to CasparCG. A non-disconnect delivery failure is swallowed: the
      // template is retained in `#library` and re-delivered by the next `#resync`.
      const res = await this.#library.import(req.template, req.html);
      if (this.#status === 'live') {
        try {
          await this.#invoke(TemplatesImportChannel, req);
        } catch {
          /* retained locally; reconcile heals it on the next connect */
        }
      }
      return res;
    },
    remove: async (req: ChannelRequest<typeof TemplatesRemoveChannel>) => {
      // Live: the bridge is authoritative for refuse-while-referenced (it holds the
      // true stack). On a confirmed removal, drop it from the local store too.
      if (this.#status === 'live') {
        const res = await this.#invoke(TemplatesRemoveChannel, req);
        if (res.ok) await this.#library.delete(req.templateId);
        return res;
      }
      // Disconnected: the removal is local. Enforce R-005 against the last-known
      // stack (exact while disconnected — the bridge cannot mutate it).
      return this.#library.remove(req.templateId, this.#referencedCount(req.templateId));
    },
    // R-028 (o1) — the bridge pushes the full catalogue on every change, so
    // operator B's Library re-lists the moment operator A imports.
    onChanged: (handler: (templates: TemplateInfo[]) => void): Unsubscribe =>
      this.#templatesSubs.add(handler),
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

  /** R-030 — the per-channel output raster, owned and disk-persisted by the bridge. */
  readonly channelSettings = {
    get: () => this.#invoke(ChannelSettingsGetChannel, undefined),
    set: (req: ChannelRequest<typeof ChannelSettingsSetChannel>) =>
      this.#invoke(ChannelSettingsSetChannel, req),
    onChanged: (handler: (state: ChannelSettingsState) => void) =>
      this.#channelSettingsSubs.add(handler),
  };

  /** R-022 — REHEARSE. Bridge-owned; the PLAY interlock is enforced bridge-side. */
  readonly rehearse = {
    state: () => this.#invoke(RehearseStateChannel, undefined),
    enter: (req: ChannelRequest<typeof RehearseEnterChannel>) =>
      this.#invoke(RehearseEnterChannel, req),
    exit: (req: ChannelRequest<typeof RehearseExitChannel>) =>
      this.#invoke(RehearseExitChannel, req),
    onStateChanged: (handler: (rehearsals: Rehearsal[]) => void) => this.#rehearseSubs.add(handler),
  };

  /** R-034 — the station's delimiter list, owned and disk-persisted by the bridge. */
  readonly delimiters = {
    list: () => this.#invoke(DelimitersListChannel, undefined),
    set: (req: ChannelRequest<typeof DelimitersSetChannel>) =>
      this.#invoke(DelimitersSetChannel, req),
    onChanged: (handler: (delimiters: DelimiterOption[]) => void) =>
      this.#delimiterSubs.add(handler),
  };
}
