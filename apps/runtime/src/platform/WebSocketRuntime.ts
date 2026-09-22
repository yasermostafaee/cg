import type { RetainedAirState, StackItemState } from '@cg/shared-schema';
import {
  AuditHealthChannel,
  AuditRecentChannel,
  ConnectionsConfigChangedChannel,
  ConnectionsConfigChannel,
  ConnectionsTemplateServeChannel,
  ConnectionsFailoverChannel,
  ConnectionsHealthChangedChannel,
  ConnectionsHealthChannel,
  ConnectionsSetConfigChannel,
  LayersClearChannel,
  LayersOrphansChangedChannel,
  LayersOrphansChannel,
  LayersOwnedOccupancyChangedChannel,
  LayersOwnedOccupancyChannel,
  EmptiedAirDismissChannel,
  EmptiedAirNoticeChangedChannel,
  EmptiedAirNoticeChannel,
  EmptiedAirRestoreChannel,
  LockEngageChannel,
  LockReleaseChannel,
  LockStateChangedChannel,
  LockStateChannel,
  PlayoutLayersClearChannel,
  PlayoutLayersStateChangedChannel,
  PlayoutLayersStateChannel,
  LiveLayersStateChannel,
  LiveLayersStateChangedChannel,
  LivePlateReleasedChannel,
  StackLoadChannel,
  StackNextChannel,
  StackOutChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackStopAllChannel,
  StackRestoreChannel,
  StackStopChannel,
  StackSetPlateVolumeChannel,
  StackSetPlateVolumesChannel,
  StackSilenceAllLivePlatesChannel,
  StackSetPositionChannel,
  StackSetActiveLookChannel,
  StackSetPassTimingChannel,
  StackSwapLiveSourceChannel,
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
  SourcesAssignmentsChangedChannel,
  SourcesAssignmentsChannel,
  SourcesConfigChangedChannel,
  SourcesConfigChannel,
  SourcesSetAssignmentsChannel,
  SourcesSetConfigChannel,
  type SourceAssignments,
  type SourceCatalog,
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
  type EmptiedAirNotice,
  type PendingUpdate,
  type PlayoutLayerState,
  type LiveLayerState,
  type LivePlateReleaseState,
  type RestoreMigration,
  type RestoreSkip,
  type TemplateInfo,
  type TemplateReference,
} from '@cg/shared-ipc';
import { MemoryWorkspace } from '@cg/storage';
import type {
  AppInfo,
  AuthCapabilities,
  AuthSessionState,
  BridgeLinkStatus,
  RuntimeBridge,
  Unsubscribe,
} from '../shared/runtime-bridge.js';
import * as ipcChannels from '@cg/shared-ipc';
import { bridgeErrorFrom, BridgeSkewError } from '../shared/bridgeSkew.js';
import { LibraryStore } from './library/LibraryStore.js';
import { getOperatorName, operatorActorForWire, setOperatorName } from './operatorName.js';
import {
  loadPlayoutSession,
  PlayoutSignInError,
  refreshDelayMs,
  refreshPlayoutToken,
  savePlayoutSession,
  sessionExpired,
  signInToPlayout,
  type StoredSession,
} from './playoutSession.js';
import { StackRetentionStore } from './stack/StackRetentionStore.js';

const APP_INFO: AppInfo = { name: 'cg Runtime', version: '0.0.0', platform: 'browser' };

const WS_OPEN = 1;
const REQUEST_TIMEOUT_MS = 8000;
/**
 * ⚠ A FLOOR under the refresh delay. `refreshDelayMs` can legitimately return 0 — a Playout
 * issuing a lifetime shorter than the ten-minute lead, or a session restored from storage that
 * is already inside the window — and 0 on every computation is a POST loop at one round trip
 * per iteration, each rotating the refresh token. It never delays a refresh that had real time
 * left; it only stops the degenerate case being a hot loop.
 */
const MIN_REFRESH_DELAY_MS = 30_000;
/** First retry after a failed refresh; doubled per consecutive failure. */
const REFRESH_RETRY_BASE_MS = 15_000;
/** …and capped, so a long Playout outage settles into a poll rather than growing unbounded. */
const REFRESH_RETRY_MAX_MS = 5 * 60_000;
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
  /**
   * 🔴 **IS A STACK DELIVERY IN FLIGHT?** — the fact that decides whether an EMPTY stack
   * is an answer or a not-yet.
   *
   * It has always existed here to suppress retention mirroring; what it did NOT do was
   * leave this class. That absence is what forced the live-sources surface to treat every
   * empty stack as blindness: `useBridgeSnapshot`'s `ready` latches on the first arrival
   * and never clears, so after a reconnect it reads `true` while this window is open and
   * the renderer had nothing else to ask.
   *
   * Every write goes through {@link #setResyncing} so the five sites cannot drift — the
   * same shape as `#setStatus`, and for the same reason: a second, silently-diverging
   * spelling of the same state is what golden rule 6 forbids.
   */
  #resyncing = false;
  /** B-153 — channels this page needs that the connected bridge does not route. */
  #skew: readonly string[] | null = null;
  /*
    🔴 `R-066` — THE PLAYOUT SESSION, three fields and no fourth.

    `#authCaps` is what the BRIDGE said (mode + addresses); `#principal` is what the bridge
    VERIFIED about this socket; `#session` is the token this console holds. They are kept
    apart because each can be true without the others: a bridge can advertise `playout` with
    nothing held, a token can be held while the socket has not yet presented it, and a
    principal can lapse while the token is still in storage.
  */
  #authCaps: AuthCapabilities | null = null;
  #principal: ipcChannels.PlayoutPrincipal | null = null;
  #session: StoredSession | null = loadPlayoutSession();
  #refreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** Fires AT `exp`, so a session that lapses on an idle page is noticed without an event. */
  #expiryTimer: ReturnType<typeof setTimeout> | null = null;
  /** The bridge's own sentence when it last refused a token this console presented. */
  #authRefusal: string | null = null;
  /**
   * Bumped by every sign-out and every new session. An in-flight refresh compares it after its
   * await and discards itself if it lost — otherwise a refresh that started before a sign-out
   * lands after it and RESURRECTS the session: timer, persisted key and bridge principal.
   */
  #authGeneration = 0;
  /** Consecutive failed refreshes, so the retry backs off instead of hammering the Playout. */
  #refreshFailures = 0;
  /**
   * 🔴 `DELTA A` — **THE CONNECT-TIME HANDSHAKE, AND EVERY OTHER FRAME WAITS BEHIND IT.**
   *
   * Set at the one connect site the instant the `auth` frame is written, and resolved when the
   * bridge has ANSWERED it — accepted or refused. `#invoke` awaits it before writing anything,
   * so the console cannot ask a question the bridge has not yet been given a principal for.
   *
   * ── WHAT THE OWNER SAW, WHICH IS WHY THIS EXISTS ────────────────────────
   *
   * A reloaded console showed `SIGNED IN AS علی رضایی` in the footer AND, at the same
   * moment, a banner saying re-delivery failed because "this console is not signed in", with
   * the layer list stuck on "Loading the layer list…" forever. Sending the `auth` frame FIRST
   * was necessary and not sufficient: the resync and the renderer's initial reads went out in
   * the same tick, reached the gate before the principal was seated, and were refused —
   * correctly. Nothing held them and nothing retried them.
   *
   * ⚠ `null` when this console holds no token: there is nothing to wait for, and making every
   * request on an auth-off station wait for a promise that will never be created is how a
   * guard takes a station off air.
   */
  #authHandshake: Promise<void> | null = null;
  /**
   * 🔴 The bridge has told us it is refusing this console's intents for want of a principal.
   *
   * The only thing that can know about a REVOCATION: the token is unexpired, the socket is up,
   * and nothing else on this side changes. Cleared by a successful sign-in.
   */
  #bridgeRefusesUs = false;
  readonly #authCapsSubs = new Subs<AuthCapabilities | null>();
  readonly #authStateSubs = new Subs<AuthSessionState>();
  /** Subscribers to {@link #resyncing}, so the renderer can stop guessing. */
  readonly #resyncSubs = new Subs<boolean>();
  readonly #skewSubs = new Subs<readonly string[] | null>();

  readonly #stackSubs = new Subs<readonly StackItemState[]>();
  /**
   * B-108 — the rows the last restore could NOT bring back, with the reason.
   *
   * NOT a bridge PUBLISH channel: this is a fact about a call THIS browser made, so
   * it belongs to this client and not to every client attached to the bridge.
   * Broadcasting it would tell a second operator's browser that rows IT never had
   * failed to restore.
   */
  readonly #restoreSkipSubs = new Subs<readonly RestoreSkip[]>();
  readonly #restoreMigrationSubs = new Subs<readonly RestoreMigration[]>();
  /** The latest report, so a late subscriber (the panel mounts after boot) sees it. */
  #lastRestoreSkips: readonly RestoreSkip[] = [];
  #lastRestoreMigrations: readonly RestoreMigration[] = [];
  readonly #healthSubs = new Subs<ConnectionHealth>();
  readonly #configSubs = new Subs<ConnectionConfig>();
  readonly #orphanSubs = new Subs<OrphanLayer[]>();
  readonly #ownedOccupancySubs = new Subs<OwnedOccupancyWarning[]>();
  // B-225 — the standing "air was emptied under us" notice (null when there is none).
  readonly #emptiedAirSubs = new Subs<EmptiedAirNotice | null>();
  // R-021 stage 2a — fixed-bank config + per-slot state pushes.
  readonly #fixedConfigSubs = new Subs<FixedLayerBank | null>();
  readonly #fixedStateSubs = new Subs<FixedSlotState[]>();
  readonly #lockSubs = new Subs<LockState>();
  readonly #updateSubs = new Subs<PendingUpdate | null>();
  /** R-034 — the bridge-owned delimiter list, pushed on every change. */
  readonly #delimiterSubs = new Subs<DelimiterOption[]>();
  /** R-030 — the bridge-owned channel raster + video-mode reading. */
  readonly #channelSettingsSubs = new Subs<ChannelSettingsState>();
  /** D-137 / C-015 — the bridge-owned Live Source mapping, pushed on change. */
  readonly #sourceCatalogSubs = new Subs<SourceCatalog>();
  readonly #sourceAssignmentSubs = new Subs<SourceAssignments>();
  /** R-022 — the bridge-owned rehearsing set, pushed to every client. */
  readonly #rehearseSubs = new Subs<Rehearsal[]>();
  readonly #statusSubs = new Subs<BridgeLinkStatus>();
  // R-028 (o1) — the bridge-owned catalogue push.
  readonly #templatesSubs = new Subs<TemplateInfo[]>();
  // R-028 part B — the declared playout layers' occupancy push.
  readonly #playoutSubs = new Subs<PlayoutLayerState[]>();
  // B-145 (2.8) — the bridge-owned Live Source ledger push.
  readonly #liveLayerSubs = new Subs<LiveLayerState[]>();
  // `B-247` — and WHY a plate left that ledger, which the ledger payload cannot say.
  readonly #plateReleaseSubs = new Subs<LivePlateReleaseState>();

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
    // `R-066` — the refresh timer outlives the socket otherwise, and a disposed runtime that
    // still wakes up in ten minutes to POST at a Playout is a leak with a network hop in it.
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    if (this.#expiryTimer !== null) clearTimeout(this.#expiryTimer);
    this.#expiryTimer = null;
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
      /*
        🔴 `B-153` — THE CAPABILITY HANDSHAKE, ON EVERY CONNECT AND BEFORE ANYTHING ELSE
        MATTERS. Not awaited: the resync below is what the station needs to come up, and a
        guard that can delay or break the connect path is a guard that takes it off air.
        `#checkSkew` never throws, and the banner it drives appears the moment the answer
        lands — which is still long before an operator can find a button to press.

        On EVERY connect, not only the first: the bridge is a separate process and the
        common way skew arises is that IT restarted, not this page.
      */
      /*
        🔴 `R-066` — **THE `auth` FRAME, ON EVERY (RE)CONNECT, FROM THE ONE SITE A
        CONNECTION IS ESTABLISHED.**

        Here and not beside `signIn`, because a reconnect is the common case and the rare
        one: the bridge is a separate process that restarts, the LAN blinks, the laptop
        sleeps. A token presented only at sign-in would leave every reconnected console
        signed out with nothing having happened that an operator could see.

        🔴 **`DELTA A` — FIRST IS NOT ENOUGH; EVERYTHING ELSE WAITS FOR THE ANSWER.**

        The first spelling relied on write order alone, reasoning that single-socket FIFO
        seats the principal ahead of the resync. FIFO orders the READS, not the COMPLETIONS:
        verifying a token suspends (it may fetch a JWKS), so every frame written in this same
        tick reached the gate while the socket still had no principal and was refused. The
        owner saw the result — `SIGNED IN AS علی رضایی` in the footer, a banner saying the
        re-delivery failed because the console is not signed in, and a layer list stuck on
        "Loading…" forever.

        So the handshake is RECORDED here and `#invoke` waits on it. One gate, at the one
        connect site, rather than a retry sprinkled through every caller that happens to ask
        something early.

        ⚠ Still not awaited HERE, for `B-153`'s reason: a guard that can delay or break the
        connect path is a guard that takes the station off air. The waiting is done by the
        frames that would otherwise be refused, not by the connect handler.
      */
      this.#authHandshake = this.#session === null ? null : this.#presentToken();
      void this.#checkSkew();
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

  /**
   * THE ONE WRITE PATH for {@link #resyncing}, publishing on change.
   *
   * ⚠ Publishing on CHANGE rather than on every write is deliberate: `#resync` clears the
   * flag on three separate exit paths, and two of them can run in sequence.
   */
  #setResyncing(value: boolean): void {
    if (this.#resyncing === value) return;
    this.#resyncing = value;
    this.#resyncSubs.emit(value);
  }

  #setSkew(value: readonly string[] | null): void {
    this.#skew = value;
    this.#skewSubs.emit(value);
  }

  #setAuthCaps(value: AuthCapabilities): void {
    this.#authCaps = value;
    this.#authCapsSubs.emit(value);
    /*
      🔴 **RE-ARM THE REFRESH HERE, because the first attempt could not have worked.**
      `#presentToken` runs BEFORE `#checkSkew` (the frame order is deliberate and pinned), so
      its `#scheduleRefresh()` fires while `#authCaps` is still null — no `refreshUrl`, so it
      returned without arming anything. A reloaded console therefore never refreshed and its
      session simply died at `exp`, twelve hours in, mid-shift.
    */
    this.#scheduleRefresh();
    this.#authStateSubs.emit(this.#authState());
  }

  /**
   * 🔴 **THE ONE PLACE A REFUSAL BECOMES A STATE.** `R-017`'s one-string discipline paying
   * for itself: the bridge sends exactly one sentence when a socket has no valid principal, so
   * recognising it is a string comparison against the shared constant rather than a guess.
   *
   * Without this a revoked console stayed reading "signed in as ‹name›" for the rest of the
   * shift while every verb was refused — the bridge knew, and the console never asked.
   */
  #noteAuthRefused(): void {
    if (this.#bridgeRefusesUs) return;
    this.#bridgeRefusesUs = true;
    this.#authStateSubs.emit(this.#authState());
  }

  #setPrincipal(value: ipcChannels.PlayoutPrincipal | null): void {
    this.#principal = value;
    if (value !== null) this.#bridgeRefusesUs = false;
    this.#armExpiryWatch();
    this.#authStateSubs.emit(this.#authState());
  }

  /**
   * 🔴 **NOTICE `exp` WITHOUT AN EVENT.**
   *
   * `#authState()` is a pure read, and it was only ever re-evaluated when something else
   * emitted. On a console that signs in at 09:00 and is left alone, nothing emits again — so
   * at 21:00 the bridge starts refusing every intent while the pill still reads SIGNED IN and
   * the sign-in never appears. The `expired` state was, in a live page, unreachable.
   *
   * One timer, at the instant itself, replaced on every principal change and cleared with the
   * runtime.
   */
  #armExpiryWatch(): void {
    if (this.#expiryTimer !== null) clearTimeout(this.#expiryTimer);
    this.#expiryTimer = null;
    const session = this.#session;
    if (session === null || this.#principal === null) return;
    const delay = Math.max(0, session.expiresAtMs - Date.now());
    // `setTimeout` clamps anything past its 32-bit ceiling to fire immediately, which would be
    // a false "your session ended". A token that far out is not one this console will outlive.
    if (delay > 0x7fffffff) return;
    this.#expiryTimer = setTimeout(() => {
      this.#expiryTimer = null;
      this.#authStateSubs.emit(this.#authState());
    }, delay);
  }

  /**
   * ⭐ **THE ONE PLACE THE CONSOLE'S AUTH STATE IS DERIVED.** Golden rule 6: the sign-in
   * gate, the identity pill and any future reader ask THIS, rather than each combining three
   * fields into its own answer that agrees today.
   *
   * ⚠ `unknown` is not `off`, and the order of these branches is why. A console that has
   * not heard from the bridge must show no verdict at all — presenting every control as live
   * on a bridge that refuses them all is the defect `B-153` exists to close, and presenting a
   * sign-in on a bridge that does not authenticate is the same mistake mirrored.
   */
  #authState(): AuthSessionState {
    const caps = this.#authCaps;
    if (caps === null) return { kind: 'unknown' };
    if (caps.mode === 'off') return { kind: 'off' };
    const principal = this.#principal;
    if (principal === null) {
      return this.#authRefusal === null
        ? { kind: 'signed-out' }
        : { kind: 'signed-out', reason: this.#authRefusal };
    }
    /*
      The BROWSER's view of expiry, which is deliberately not the bridge's. The bridge decides
      for itself per request and refuses with its own sentence; this exists so the surface can
      say "your session ended" the moment it ends rather than only after the operator has
      pressed something and been refused.
    */
    const session = this.#session;
    if (session !== null && sessionExpired(session, Date.now())) {
      return { kind: 'expired', name: principal.name };
    }
    /*
      🔴 …and the bridge's own verdict, which is the half this console cannot compute. A
      REVOKED token is still unexpired here, so without this the pill read "signed in as ‹name›"
      while every verb was refused — a surface claiming a state the system does not hold, which
      is the defect class this whole change exists to remove. It is set by the one place a
      refusal arrives: {@link #noteAuthRefused}.
    */
    if (this.#bridgeRefusesUs) return { kind: 'expired', name: principal.name };
    return { kind: 'signed-in', principal };
  }

  /**
   * 🔴 `R-066` — refresh about ten minutes before `exp`, while the page is open.
   *
   * ⚠ **A FAILED REFRESH DOES NOT SIGN THE OPERATOR OUT.** The access token is still valid
   * until `exp` — twelve hours from issue, one shift — and dropping a working session because
   * the Playout was briefly unreachable is precisely the coupling ADR 0010 refused when it
   * kept the token lifetime long. The state simply stays `signed-in` until `exp`, and the
   * surface says when that is.
   */
  #scheduleRefresh(): void {
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    const session = this.#session;
    const refreshUrl = this.#authCaps?.refreshUrl ?? null;
    if (session === null || session.refreshToken === null || refreshUrl === null) return;
    /*
      ⚠ **A FLOOR, because the natural delay can be ZERO and zero is a loop.** A Playout issuing
      a lifetime shorter than the ten-minute lead — a five-minute token on a tightened station —
      makes `refreshDelayMs` return 0 on every computation: refresh, succeed, schedule 0,
      refresh again, one round trip per iteration, each one rotating the refresh token and
      writing storage. The floor turns that into a poll at a sane rate, and it never delays a
      refresh that had real time left.
    */
    this.#refreshTimer = setTimeout(
      () => {
        this.#refreshTimer = null;
        void this.#refreshNow();
      },
      Math.max(refreshDelayMs(session.expiresAtMs, Date.now()), MIN_REFRESH_DELAY_MS),
    );
  }

  async #refreshNow(): Promise<void> {
    const session = this.#session;
    const refreshUrl = this.#authCaps?.refreshUrl ?? null;
    if (session === null || session.refreshToken === null || refreshUrl === null) return;
    // Which session this refresh belongs to. Compared after the await: a sign-out (or a fresh
    // sign-in) that lands first must not be undone by a reply that was already in flight.
    const generation = this.#authGeneration;
    try {
      // A rotated `refresh_token` replaces the old one — the contract SHOULDs rotation, and a
      // console that kept the spent one would be refused at the next refresh with
      // `invalid_refresh_token` and no way to tell that from a revocation.
      const next = await refreshPlayoutToken(refreshUrl, session.refreshToken);
      /*
        🔴 THE GENERATION GUARD. Without it, a refresh in flight when the operator pressed
        Sign out lands afterwards and RESURRECTS the session: it writes the storage key back,
        re-arms the timer and re-presents a token to a bridge that was just told to drop it —
        so the console reads signed-out while the bridge holds a principal.
      */
      if (generation !== this.#authGeneration) return;
      this.#refreshFailures = 0;
      this.#session = next;
      savePlayoutSession(next);
      await this.#presentToken();
      this.#scheduleRefresh();
    } catch {
      if (generation !== this.#authGeneration) return;
      /*
        🔴 **RETRY, BACKING OFF — one blink must not end the shift.**

        The first spelling re-armed nothing, so a Playout unreachable for thirty seconds at
        T−10min meant no further attempt was ever made and the session simply died at `exp`.
        That is precisely the coupling ADR 0010 refused when it kept the token lifetime long:
        the console must survive the Playout being briefly away.

        Quiet on the surface, because the access token is still valid until `exp` and what the
        operator needs — "this session ends at ⟨time⟩" — is already on the pill's `title`.
      */
      this.#refreshFailures += 1;
      const backoff = Math.min(
        REFRESH_RETRY_BASE_MS * 2 ** (this.#refreshFailures - 1),
        REFRESH_RETRY_MAX_MS,
      );
      if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
      this.#refreshTimer = setTimeout(() => {
        this.#refreshTimer = null;
        void this.#refreshNow();
      }, backoff);
      this.#authStateSubs.emit(this.#authState());
    }
  }

  /**
   * 🔴 **`B-153` — ASK THE BRIDGE WHAT IT CAN DO, AT CONNECT.**
   *
   * `caspar-bridge` is a separate long-lived process and a browser reload updates only the
   * SPA, so a page routinely talks to a bridge older than itself. Nothing checked, and the
   * way an operator found out was a LOOK button answering `unknown channel:
   * stack.set-active-look` in the middle of a live show.
   *
   * ⚠ **A bridge too old to answer this channel is the LOUDEST match, not a miss.** It
   * replies `unknown channel: bridge.capabilities`, which `B-152` has already turned into a
   * `BridgeSkewError` — so the catch below reports skew rather than swallowing it. There is
   * no "too old to check" case that slips through.
   *
   * It REPORTS and does not refuse. A bridge missing one new channel still plays out through
   * the twenty it routes, and taking a working station off air over a feature it never had
   * would be a worse failure than the one this fixes. The missing commands refuse
   * themselves, legibly.
   *
   * Never throws: a guard that can break the connect path is a guard that takes the station
   * off air. Anything unexpected resolves to "no skew known".
   */
  async #checkSkew(): Promise<void> {
    try {
      const caps = await this.#invoke(ipcChannels.BridgeCapabilitiesChannel, {});
      const { channels } = caps;
      /*
        `C-037` — the auth MODE rides the answer this call already makes. A second round trip
        would be a second thing that can fail on the connect path, and `B-153` put this
        question here precisely because it is asked before the operator can press anything.
      */
      this.#setAuthCaps({
        mode: ipcChannels.capabilitiesAuthMode(caps),
        signInUrl: caps.signInUrl ?? null,
        refreshUrl: caps.refreshUrl ?? null,
        contractVersion: caps.authContractVersion ?? null,
      });
      const routed = new Set(channels);
      const missing = ipcChannels
        .runtimeRequestChannelNames(ipcChannels)
        .filter((n) => !routed.has(n));
      this.#setSkew(missing.length === 0 ? null : missing);
    } catch (err) {
      if (err instanceof BridgeSkewError) {
        // The bridge predates the handshake itself. It cannot tell us WHICH channels it
        // lacks, so the honest answer names the channel that proved it rather than
        // inventing a list.
        this.#setSkew([ipcChannels.BridgeCapabilitiesChannel.name]);
        return;
      }
      // A timeout, a disconnect mid-handshake, anything else: we do not KNOW there is skew,
      // and claiming one would be its own false alarm on a healthy station.
      this.#setSkew(null);
    }
  }

  /**
   * 🔴 `R-066` — present the held token on this socket. Never throws.
   *
   * ⚠ A FAILURE HERE IS NOT A SIGN-OUT. The bridge's answer says why the token was refused;
   * the console keeps the stored session and lets the state machine decide what to show
   * — except for a token the bridge could not verify at all, which is dead weight and is
   * dropped so the operator is shown a sign-in rather than a console that silently retries a
   * token that will never work.
   */
  async #presentToken(): Promise<void> {
    const session = this.#session;
    if (session === null) {
      this.#setPrincipal(null);
      return;
    }
    /*
      ⚠ The handshake is released on EVERY exit path below — accepted, refused, or the socket
      going away mid-frame. A latch left set would deadlock every later request on this
      console, which is worse than the refusals it exists to prevent: a console that hangs
      says nothing at all, and `#invoke`'s timeout would not even fire because no frame was
      ever written.
    */
    try {
      const state = await this.#sendAuthFrame(session.accessToken);
      this.#authRefusal = null;
      const wasSignedOut = this.#principal === null;
      this.#setPrincipal(state.principal);
      if (state.principal !== null) {
        this.#scheduleRefresh();
        /*
          🔴 `DELTA A` §A2 — **THE RE-REQUEST, WHERE THE PRINCIPAL IS ESTABLISHED.**

          A read refused for want of a principal must not be the last word. This is the one
          place a principal appears on an ALREADY-OPEN socket, so it is the one place that can
          ask again — rather than a dependency on the sign-in state threaded through every
          snapshot hook in the app.

          ⚠ Only on the transition. A token re-presented by a refresh changes nothing about
          what the bridge will answer, and re-syncing the whole library on every refresh would
          be a twelve-hourly stampede for no reason.
        */
        if (wasSignedOut && this.#everOpened) void this.#resync(true);
      }
    } catch (err) {
      /*
        🔴 **KEEP WHAT THE BRIDGE SAID.** Swallowing it left the operator on a form that
        silently did nothing: with a bridge whose `playout.issuer` carries a typo, the
        credentials are right, D1 succeeds, the bridge answers "that sign-in is not for this
        station", and the console showed a blank sign-in again. `R-017`'s whole point is that
        the bridge's sentence is the one the operator reads.

        ⚠ A DISCONNECT is not a refusal and must not be worded as one — the socket went away
        mid-frame and the token is probably fine.
      */
      this.#authRefusal =
        err instanceof BridgeDisconnectedError || !(err instanceof Error) ? null : err.message;
      /*
        The bridge refused it, or the socket went away mid-frame. Either way this console has
        no principal on this socket, which is what {@link #setPrincipal} records. The stored
        token stays: a socket that dropped mid-frame will retry on the next connect, and
        throwing a valid token away over a network blink would sign an operator out for a
        reason that had nothing to do with them.
      */
      this.#setPrincipal(null);
    }
  }

  /**
   * Write the `auth` frame and resolve the bridge's answer.
   *
   * ⚠ It does NOT go through `#invoke`: that helper writes a `request` frame with a channel
   * name, and this is the one frame type that is not a channel — deliberately, so the gate
   * that refuses every channel can run before a principal exists. The reply IS an ordinary
   * `response` correlated by `id`, so the pending-request machinery is reused verbatim and
   * there is no second correlation scheme to keep in step.
   */
  #sendAuthFrame(token: string): Promise<ipcChannels.AuthState> {
    if (this.#status !== 'live' || this.#ws === null || this.#ws.readyState !== WS_OPEN) {
      return Promise.reject(new BridgeDisconnectedError());
    }
    const id = String(++this.#nextId);
    const ws = this.#ws;
    return new Promise<ipcChannels.AuthState>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('Bridge request timed out: auth'));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(id, {
        resolve: (value) => {
          try {
            resolve(ipcChannels.AuthStateSchema.parse(value));
          } catch {
            reject(bridgeErrorFrom('invalid response for auth'));
          }
        },
        reject,
        timer,
      });
      ws.send(serializeWsFrame({ type: 'auth', id, token }));
    });
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
    /*
      🔴 `DELTA A` — **A GATED CONSOLE DELIVERS NOTHING.** With auth on and no principal
      seated, every frame below would be refused for want of one — which is the gate working,
      and is not something to narrate at the operator one banner per template. The sign-in
      surface is what they should be looking at, and `signIn` runs this same resync the moment
      they are through it.

      ⚠ It reads the state AFTER the connect-time handshake has settled, because `#invoke`
      waits on it and so does this: an early read would see `unknown` on every connect.
    */
    if (this.#authHandshake !== null) await this.#authHandshake;
    const gate = this.#authState();
    if (gate.kind === 'signed-out' || gate.kind === 'expired') return;
    /*
     * 🔴 THE RETENTION GUARD IS RAISED **HERE**, BEFORE THE FIRST `await` — and the
     * reason is a race this change's E2E caught, not a tidy-up.
     *
     * `#resyncing` used to be set further down, just before the restore. Everything
     * above it — the template re-deliveries — contains awaits, so the guard went up
     * one macrotask AFTER the socket opened. In that window `#setStatus('live')` has
     * already fired, the renderer's `useBridgeSnapshot` re-pulls on the link change,
     * and `stack.snapshot()` now takes the LIVE branch: it asks a freshly-booted
     * bridge, gets `[]`, and calls `#mirrorStack([])`.
     *
     * That mirror ERASES THE RETAINED STACK — the exact failure B-092's own
     * `mirror()` docstring warns about ("the bug would erase its own fix") — and it
     * erases it BEFORE the restore reads it, so the restore then re-delivers nothing
     * and the operator's rows are gone for good. It is a RACE, so it lost silently
     * some of the time and looked like flake: a bridge restart that dropped the whole
     * stack on one run and worked on the next.
     *
     * `#resync` is invoked synchronously from the socket's `open` handler, so setting
     * the flag as the FIRST statement closes the window completely: any pull the
     * renderer issues during the resync resolves with the guard already up and
     * mirrors nothing. It is cleared on every exit path below, as before.
     */
    this.#setResyncing(true);
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
        /*
          🔴 `DELTA A` §A3 — **NOTHING IS APPENDED AFTER THE BRIDGE'S SENTENCE.**

          It used to read `…: <sentence>. Re-import it manually.`, and every refusal sentence
          in this tree already ends in a full stop — so the operator was shown
          “… then try again.. Re-import it manually.” A refusal is ONE string under `R-017`;
          joining prose onto its end is editing it at a call site. Our clause goes FIRST and
          the bridge's sentence is last, intact, with nothing after it.
        */
        this.#onResyncError(
          `Re-delivery of template “${req.template.templateId}” failed on reconnect — ` +
            `re-import it manually. ${err instanceof Error ? err.message : String(err)}`,
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
    // `#resyncing` suppresses retention mirroring across the whole window — it was
    // raised at the top of this method (see the note there for the race that
    // requires it): a failed restore must leave the retention intact for the next
    // connect rather than let an empty snapshot overwrite it.
    let restoreOk = true;
    try {
      const retained = this.#stackRetention.items();
      if (retained.length > 0) {
        const result = await this.#invoke(StackRestoreChannel, { items: [...retained] });
        /*
         * B-108 — CONSUME the report. This line is the bug: `#resync` used to
         * `await` this call and DISCARD its return value, so rows the bridge could
         * not re-seat simply disappeared from the operator's stack with nothing
         * said. Silently not restoring something is the same class of lie as
         * falsely restoring it.
         *
         * The BENIGN reason is filtered here rather than at the surface, because it
         * is a fact about the restore and not about presentation: an item the live
         * bridge already holds is a page reload against a healthy bridge — the row
         * is still there, backed by the bridge, and nothing was lost. Reporting it
         * would be an alarm on the most ordinary event there is.
         */
        this.#emitRestoreSkips(result.skipped.filter((s) => s.reason !== 'already-held'));
        /*
          `single-clock-look-switch` — and the MIGRATIONS, on their own seam.

          No benign filter here, and there is nothing to filter: a migration only ever
          happens when the bridge could not honour the retained coordinate, which the
          operator always needs to hear. Emitted unconditionally for the same reason the
          skips are — an empty report is what clears a stale notice.
        */
        this.#emitRestoreMigrations(result.migrated);
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
      this.#setResyncing(false);
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
      this.#setResyncing(false);
      if (restoreOk) this.#mirrorStack(stack);
    } catch {
      /* a fresh drop during resync will re-trigger reconnect */
      this.#setResyncing(false);
    }
  }

  /**
   * B-108 — publish the rows a restore did NOT bring back, so the operator can see
   * what is missing and why.
   *
   * Emitted even when EMPTY, and that is deliberate rather than an oversight: an
   * empty report is what CLEARS a stale notice from a previous, worse reconnect. A
   * surface that can only ever be raised is a surface that eventually lies.
   */
  #emitRestoreSkips(skips: readonly RestoreSkip[]): void {
    this.#lastRestoreSkips = skips;
    this.#restoreSkipSubs.emit(skips);
  }

  /** The migrations half of the same report — see `#emitRestoreSkips` for the empty rule. */
  #emitRestoreMigrations(migrations: readonly RestoreMigration[]): void {
    this.#lastRestoreMigrations = migrations;
    this.#restoreMigrationSubs.emit(migrations);
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
      /*
        `B-152` — THE ONE PLACE A BRIDGE ERROR BECOMES AN `Error`, so it is the one place
        that has to know a wire identifier must never reach a broadcast surface. Every
        channel and every call site is covered from here, including ones not yet written —
        which is the point, because the fourteen call sites that pass a caught `err.message`
        to a toast will never all remember. See `bridgeSkew.ts`.
      */
      if (frame.error !== undefined) {
        /*
          🔴 `C-037` — THE ONE SENTENCE, RECOGNISED IN THE ONE PLACE EVERY REPLY PASSES.

          The bridge answers exactly this when a socket holds no valid principal, so the console
          learns it is no longer signed in FROM THE REFUSAL ITSELF rather than from a poll it
          does not make. It is a comparison against the SHARED constant — which is what
          `R-017`'s one-string discipline is for, and the only way this side can ever notice a
          REVOCATION, whose token is still unexpired and whose socket is still up.
        */
        if (frame.error.message === ipcChannels.AUTH_REQUIRED_REFUSAL) this.#noteAuthRefused();
        pending.reject(bridgeErrorFrom(frame.error.message));
      } else pending.resolve(frame.payload);
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
      case EmptiedAirNoticeChangedChannel.name: {
        const p = EmptiedAirNoticeChangedChannel.payload.safeParse(payload);
        if (p.success) this.#emptiedAirSubs.emit(p.data);
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
      case LiveLayersStateChangedChannel.name: {
        const p = LiveLayersStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#liveLayerSubs.emit(p.data);
        break;
      }
      case LivePlateReleasedChannel.name: {
        const p = LivePlateReleasedChannel.payload.safeParse(payload);
        if (p.success) this.#plateReleaseSubs.emit(p.data);
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
      case SourcesConfigChangedChannel.name: {
        const p = SourcesConfigChangedChannel.payload.safeParse(payload);
        if (p.success) this.#sourceCatalogSubs.emit(p.data);
        break;
      }
      case SourcesAssignmentsChangedChannel.name: {
        const p = SourcesAssignmentsChangedChannel.payload.safeParse(payload);
        if (p.success) this.#sourceAssignmentSubs.emit(p.data);
        break;
      }
      case RehearseStateChangedChannel.name: {
        const p = RehearseStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#rehearseSubs.emit(p.data);
        break;
      }
      default:
        break;
    }
  }

  /** Validate the request, relay it, and resolve the validated response. */
  async #invoke<C extends AnyChannel>(
    channel: C,
    request: ChannelRequest<C>,
  ): Promise<ChannelResponse<C>> {
    /*
      🔴 `DELTA A` — **WAIT FOR THE CONNECT-TIME `auth` ANSWER BEFORE WRITING ANYTHING.**

      One gate, at the one place every request passes, rather than a retry per caller — and
      the callers are the point: the renderer's initial reads are fired from a dozen hooks
      that know nothing about a handshake, and the owner's stuck layer list was one of them.

      ⚠ The validate-and-send below is unchanged and still SYNCHRONOUS once this resolves, so
      the ordering `#resync` depends on ("all re-delivery frames are written before yielding")
      still holds: every redelivery awaits the SAME promise and their continuations run in
      creation order.

      ⚠ The liveness check is re-done AFTER the wait. The socket can drop while a handshake is
      in flight, and a frame written to a closed socket is a request that will never be
      answered — `BridgeDisconnectedError` is the honest answer, as it was before.
    */
    if (this.#authHandshake !== null) await this.#authHandshake;
    if (this.#status !== 'live' || this.#ws === null || this.#ws.readyState !== WS_OPEN) {
      throw new BridgeDisconnectedError();
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
        /*
          🔴 `B-152` — A MALFORMED RESPONSE REJECTS ITS CALLER. It used to CRASH THE MESSAGE
          PUMP.

          `channel.response.parse` throws on a payload that does not match the contract, and
          this callback is invoked from `#onMessage`, inside the socket's `message` listener.
          An unguarded throw there does not reject the promise — it escapes the listener as
          an UNCAUGHT EXCEPTION, so the caller hangs until its timeout while the error
          surfaces somewhere with no connection to the command that caused it.

          Found by `B-153`'s capability handshake, which is the first request issued on EVERY
          connect: any harness or bridge that answers it with something unshaped turned a
          contract mismatch into a process-level crash. The bug is older than that — it
          applies to every channel — and it is exactly the disagreement `B-152` exists to
          word, so it is answered in that vocabulary: `invalid response for <channel>` is one
          of the three shapes `bridgeSkew.ts` already recognises, and the operator gets the
          skew sentence rather than a Zod dump.
        */
        resolve: (value) => {
          try {
            resolve(channel.response.parse(value) as ChannelResponse<C>);
          } catch {
            reject(bridgeErrorFrom(`invalid response for ${channel.name}`));
          }
        },
        reject,
        timer,
      });
      /*
        B-141 follow-up — ONE site puts this console's name on the wire, for the same
        reason the bridge has one site that reads it: every control request goes
        through `#invoke`, so attribution cannot be forgotten on a new channel.

        Read at SEND time, not at construction: the operator may rename the console
        mid-session, and the next request must carry the new name.
      */
      ws.send(
        serializeWsFrame({
          type: 'request',
          id,
          channel: channel.name,
          payload: validatedReq,
          actor: operatorActorForWire(),
        }),
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
    // §4 — is a stack delivery in flight? See `#resyncing`.
    resyncing: (): boolean => this.#resyncing,
    onResyncingChanged: (handler: (value: boolean) => void): Unsubscribe =>
      this.#resyncSubs.add(handler),
    // B-153 — see the contract note on runtime-bridge.ts.
    skew: (): readonly string[] | null => this.#skew,
    onSkewChanged: (handler: (missing: readonly string[] | null) => void): Unsubscribe =>
      this.#skewSubs.add(handler),
  };

  /**
   * 🔴 `R-066` — the Playout sign-in. See the contract note on `runtime-bridge.ts`.
   */
  readonly auth = {
    capabilities: (): AuthCapabilities | null => this.#authCaps,
    onCapabilitiesChanged: (handler: (caps: AuthCapabilities | null) => void): Unsubscribe =>
      this.#authCapsSubs.add(handler),
    state: (): AuthSessionState => this.#authState(),
    onStateChanged: (handler: (state: AuthSessionState) => void): Unsubscribe =>
      this.#authStateSubs.add(handler),
    signIn: async (username: string, password: string): Promise<void> => {
      const signInUrl = this.#authCaps?.signInUrl ?? null;
      if (signInUrl === null) {
        /*
          There is nowhere to sign in to. It is not a credential failure and must not be
          worded as one — the bridge either does not authenticate or has not said yet, and
          sending the operator to re-type a password would be the wrong remedy for both.
        */
        throw new PlayoutSignInError('unexpected');
      }
      // ADR 0010 rule 9 — browser → Playout, DIRECTLY. The bridge never sees the password.
      const { session } = await signInToPlayout(signInUrl, username, password);
      this.#authGeneration += 1;
      this.#refreshFailures = 0;
      this.#session = session;
      savePlayoutSession(session);
      /*
        ⚠ The D1 `principal` echo is NOT adopted as the answer. The bridge trusts only the
        JWT, so what this console displays comes from the bridge's reply to the `auth` frame
        — one round trip later and authoritative. Adopting the echo would mean a console
        showing a name nothing had verified.
      */
      await this.#presentToken();
      /*
        ⚠ A RESYNC AFTER SIGN-IN, and this is not belt-and-braces. With auth ON the bridge
        withholds PUBLISHES from a socket with no principal (ADR 0010 rule 4: "nothing
        else"), so a console that signs in on an already-open socket has missed every state
        change since it connected. This is the SAME machinery a reconnect runs; signing in is
        the same event from the bridge's point of view.
      */
      await this.#resync(true);
      this.#scheduleRefresh();
    },
    signOut: async (): Promise<void> => {
      // Bumped FIRST, so a refresh already in flight discards itself rather than writing the
      // session back after the sign-out has cleared it.
      this.#authGeneration += 1;
      this.#refreshFailures = 0;
      if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
      this.#refreshTimer = null;
      if (this.#expiryTimer !== null) clearTimeout(this.#expiryTimer);
      this.#expiryTimer = null;
      this.#authRefusal = null;
      this.#bridgeRefusesUs = false;
      this.#session = null;
      savePlayoutSession(null);
      /*
        ⚠ The BRIDGE's principal is dropped too, and by asking rather than by reconnecting.
        A fresh socket would also work — a new socket has no principal by construction — but
        it would take this console's live state down with it and make signing out look like a
        link failure. `auth.sign-out` is the one route that says exactly what happened, and
        the bridge records it.

        A failure here still clears THIS console: the token is gone from storage either way,
        and a bridge that did not hear the sign-out refuses the next intent anyway once the
        token stops verifying. What must not happen is a console that looks signed in because
        a round trip failed.
      */
      try {
        await this.#invoke(ipcChannels.AuthSignOutChannel, undefined);
      } catch {
        // See above.
      }
      this.#setPrincipal(null);
    },
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
    swapLiveSource: (req: ChannelRequest<typeof StackSwapLiveSourceChannel>) =>
      this.#invoke(StackSwapLiveSourceChannel, req),
    // §14 (LOOKS) Stage E — the row’s look picker. Bridge-owned throughout: the look is
    // recorded there and the reconcile that follows is AMCP, so a disconnected browser
    // simply cannot reach it.
    setActiveLook: (req: ChannelRequest<typeof StackSetActiveLookChannel>) =>
      this.#invoke(StackSetActiveLookChannel, req),
    setPassTiming: (req: ChannelRequest<typeof StackSetPassTimingChannel>) =>
      this.#invoke(StackSetPassTimingChannel, req),
    setPlateVolume: (req: ChannelRequest<typeof StackSetPlateVolumeChannel>) =>
      this.#invoke(StackSetPlateVolumeChannel, req),
    // `add-multibox-audio` — the MAP door: FADER, ON/OFF and SOLO all arrive here.
    setPlateVolumes: (req: ChannelRequest<typeof StackSetPlateVolumesChannel>) =>
      this.#invoke(StackSetPlateVolumesChannel, req),
    // PANIC — no arguments: the bridge scopes it from its own LEDGER, not the browser's copy.
    silenceAllLivePlates: () => this.#invoke(StackSilenceAllLivePlatesChannel, undefined),
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
    // B-108 — replays the latest report on subscribe. The panel mounts after boot, so
    // a subscribe-only stream would miss precisely the report worth seeing: the one
    // from the reconnect that happened while the UI was coming up.
    onRestoreSkips: (handler: (skips: readonly RestoreSkip[]) => void) => {
      const unsubscribe = this.#restoreSkipSubs.add(handler);
      handler(this.#lastRestoreSkips);
      return unsubscribe;
    },
    onRestoreMigrations: (handler: (migrations: readonly RestoreMigration[]) => void) => {
      const unsubscribe = this.#restoreMigrationSubs.add(handler);
      handler(this.#lastRestoreMigrations);
      return unsubscribe;
    },
  };

  /**
   * B-092 — the retained stack intent projected into displayable state, for use
   * while the bridge is unreachable. It is a VIEW of intent, not a claim about
   * the wire, so its statuses are the honest ones for "nothing can be verified":
   *
   *   `on-air`  → `unverified` — B-086/B-087's muted "WAS ON AIR". NEVER the
   *               broadcast-red `on-air`/`playing`: with no bridge the SPA has no
   *               conduit to CasparCG at all, so a confident red badge would be
   *               the exact lie those two changes exist to kill.
   *   `loaded`  → `loaded` — not an air claim, and the same resting status the
   *               bridge itself leaves an item at when no server is reachable
   *               (B-082).
   *   `cleared` → `idle` — the layer is known empty. NOT `loaded`.
   *   `error`   → `error`, with the code it carried. NOT `loaded`.
   *
   * 🔴 **THE LAST TWO ARE B-107, AND THEY ARE THE WHOLE OF IT.** This method used
   * to read `i.played ? 'unverified' : 'loaded'`, which collapsed a FAILED row and
   * a CLEARED row onto `loaded` — the `airStateVisual` word READY. `useStack` opts
   * into `pullWhileDisconnected`, so the moment the bridge process died every ERROR
   * row on the operator's stack flipped to READY at once, inviting a PLAY on a row
   * that never got a layer, over a link the SPA could no longer use in either
   * direction. **A lost link may never IMPROVE a status** — that is B-086/B-087's
   * demote-on-silence rule, and this was it broken in the opposite direction.
   *
   * `pending` is false throughout: nothing is in flight, so no row spins.
   *
   * The projection still ROUND-TRIPS exactly — `retainedStateFor` maps every status
   * emitted here back to the state it came from (`unverified`→`on-air`,
   * `loaded`→`loaded`, `idle`→`cleared`, `error`→`error`) — so re-mirroring it can
   * never corrupt the retention. That property is asserted, not assumed; do not add
   * a status here without checking it survives.
   */
  #retainedProjection(): StackItemState[] {
    const projected = this.#stackRetention.items().map(
      (i): StackItemState => ({
        itemId: i.itemId,
        templateId: i.templateId,
        fields: i.fields,
        status: projectedStatusFor(i.state),
        pending: false,
        ...(i.errorCode !== undefined && { errorCode: i.errorCode }),
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
  /**
   * `B-212` — WHERE each item still using a template is, from the last-known stack:
   * the item id and the layer it held (absent when it held none). The offline refusal
   * names these; the bridge's own answer names them the same way while live.
   */
  #references(templateId: string): TemplateReference[] {
    return this.#lastStack
      .filter((i) => i.templateId === templateId)
      .map((i) => ({
        itemId: i.itemId,
        ...(i.slot !== undefined && { slot: { channel: i.slot.channel, layer: i.slot.layer } }),
      }));
  }

  readonly connections = {
    config: (): Promise<ConnectionConfig> => this.#invoke(ConnectionsConfigChannel, undefined),
    setConfig: (req: ChannelRequest<typeof ConnectionsSetConfigChannel>) =>
      this.#invoke(ConnectionsSetConfigChannel, req),
    templateServe: () => this.#invoke(ConnectionsTemplateServeChannel, undefined),
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

  // B-225 — the notice, and the two acts an operator may take on it. `restore` is reachable
  // only from a press; nothing here may call it on mount, on reconnect or on a timer.
  readonly emptiedAir = {
    notice: () => this.#invoke(EmptiedAirNoticeChannel, undefined),
    restore: (req: ChannelRequest<typeof EmptiedAirRestoreChannel>) =>
      this.#invoke(EmptiedAirRestoreChannel, req),
    dismiss: () => this.#invoke(EmptiedAirDismissChannel, undefined),
    onNoticeChanged: (handler: (notice: EmptiedAirNotice | null) => void) =>
      this.#emptiedAirSubs.add(handler),
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

  // B-145 (2.8) — the bridge-owned Live Source ledger. READ-ONLY on purpose: the
  // verbs that reach a seated layer are item-scoped and live on `stack`.
  readonly liveLayers = {
    state: () => this.#invoke(LiveLayersStateChannel, undefined),
    onStateChanged: (handler: (state: LiveLayerState[]) => void) =>
      this.#liveLayerSubs.add(handler),
    // `B-247` — the bridge's own sentence for a plate the look reconcile let go.
    onPlateReleased: (handler: (event: LivePlateReleaseState) => void) =>
      this.#plateReleaseSubs.add(handler),
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
      return this.#library.remove(req.templateId, this.#references(req.templateId));
    },
    // R-028 (o1) — the bridge pushes the full catalogue on every change, so
    // operator B's Library re-lists the moment operator A imports.
    onChanged: (handler: (templates: TemplateInfo[]) => void): Unsubscribe =>
      this.#templatesSubs.add(handler),
  };

  readonly audit = {
    recent: (req: ChannelRequest<typeof AuditRecentChannel>) =>
      this.#invoke(AuditRecentChannel, req),
    // B-141 — the positive control the panel reads beside the tail, so an empty
    // list can be reported as a quiet session only when the instrument that
    // produced it is provably live.
    health: () => this.#invoke(AuditHealthChannel, {}),
    // Browser-local, not a channel: the value's whole purpose is to differ per
    // console. See `operatorName.ts` for what it is worth (and what it is not).
    operatorName: () => getOperatorName(),
    setOperatorName: (name: string) => {
      setOperatorName(name);
    },
  };

  readonly update = {
    request: (req: ChannelRequest<typeof UpdateRequestChannel>) =>
      this.#invoke(UpdateRequestChannel, req),
    state: () => this.#invoke(UpdateStateChannel, undefined),
    cancel: () => this.#invoke(UpdateCancelChannel, undefined),
    onStateChanged: (handler: (pending: PendingUpdate | null) => void) =>
      this.#updateSubs.add(handler),
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

  /** D-137 / C-015 — the source catalog and the per-plate assignments, bridge-owned. */
  readonly sources = {
    config: () => this.#invoke(SourcesConfigChannel, undefined),
    setConfig: (req: ChannelRequest<typeof SourcesSetConfigChannel>) =>
      this.#invoke(SourcesSetConfigChannel, req),
    onConfigChanged: (handler: (catalog: SourceCatalog) => void) =>
      this.#sourceCatalogSubs.add(handler),
    assignments: () => this.#invoke(SourcesAssignmentsChannel, undefined),
    setAssignments: (req: ChannelRequest<typeof SourcesSetAssignmentsChannel>) =>
      this.#invoke(SourcesSetAssignmentsChannel, req),
    onAssignmentsChanged: (handler: (assignments: SourceAssignments) => void) =>
      this.#sourceAssignmentSubs.add(handler),
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

/**
 * B-107 — the retained STATE a row is displayed as while the bridge is unreachable.
 *
 * Exhaustive with no `default`, the same discipline as `retainedStateFor` and
 * `seedStatusFor` on the other two legs of this journey: a new retained state must
 * fail to compile here until someone decides what an operator should see for it,
 * rather than falling through to a comfortable guess. That fall-through IS the bug
 * this function exists to close.
 */
function projectedStatusFor(state: RetainedAirState): StackItemState['status'] {
  switch (state) {
    case 'on-air':
      return 'unverified';
    case 'loaded':
      return 'loaded';
    case 'cleared':
      return 'idle';
    case 'error':
      return 'error';
  }
}
