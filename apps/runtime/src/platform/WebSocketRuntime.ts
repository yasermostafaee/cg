import type { AuditEntry, RetainedAirState, StackItemState } from '@cg/shared-schema';
import {
  AuditHealthChannel,
  AuditAppendedChannel,
  AuditPageChannel,
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
  LayersClearedOutsideChangedChannel,
  LayersClearedOutsideChannel,
  EmptiedAirDismissChannel,
  EmptiedAirNoticeChangedChannel,
  EmptiedAirNoticeChannel,
  EmptiedAirRestoreChannel,
  PgmReturnStatusChangedChannel,
  PgmReturnStatusChannel,
  type PgmReturnStatus,
  LockEngageChannel,
  LockReleaseChannel,
  AuthStateChangedChannel,
  LockStateChangedChannel,
  LockStateChannel,
  PlayoutLayersClearChannel,
  PlayoutLayersStateChangedChannel,
  PlayoutLayersStateChannel,
  LiveLayersStateChannel,
  LiveLayersStateChangedChannel,
  LivePlateReleasedChannel,
  // `MEDIA-PLATES-01` — a clip's settings, its transport on air, and its clock.
  LiveLayersMediaStateChangedChannel,
  LiveLayersMediaStateChannel,
  SourcesSetMediaPlaybackChannel,
  StackMediaPlateTransportChannel,
  type MediaPlateState,
  StackLoadChannel,
  StackNextChannel,
  StackOutChannel,
  StackClearAllChannel,
  StackRemoveAllChannel,
  StackRemoveChannel,
  StackDismissErrorChannel,
  StackStopAllChannel,
  StackRestoreReportChangedChannel,
  StackRestoreReportChannel,
  StackRestoreReportDismissChannel,
  type StackRestoreReport,
  StackStopChannel,
  StackSetPlateVolumeChannel,
  StackSetPlateVolumesChannel,
  StackSilenceAllLivePlatesChannel,
  StackSilenceChannelLivePlatesChannel,
  StackSetPositionChannel,
  StackSetActiveLookChannel,
  StackSetPassTimingChannel,
  StackSwapLiveSourceChannel,
  StackSnapshotChannel,
  StackStateChangedChannel,
  StackTakeChannel,
  StackUpdateChannel,
  TemplatesActedChannel,
  TemplatesChangedChannel,
  type TemplateAct,
  DelimitersChangedChannel,
  DelimitersListChannel,
  DelimitersSetChannel,
  type DelimiterOption,
  ChannelSettingsChangedChannel,
  ChannelSettingsGetChannel,
  ChannelSettingsSetChannel,
  type ChannelSettingsState,
  StationChannelsChangedChannel,
  StationChannelsListChannel,
  type StationChannels,
  SourcesAssignmentsChangedChannel,
  SourcesAssignmentsChannel,
  SourcesConfigChangedChannel,
  SourcesConfigChannel,
  SourcesMediaSearchChannel,
  SourcesRefreshChannel,
  SourcesSetAssignmentsChannel,
  SourcesSetConfigChannel,
  type SourceAssignments,
  type ConsoleSourceCatalog,
  RehearseEnterChannel,
  RehearseExitChannel,
  RehearseStateChangedChannel,
  RehearseStateChannel,
  type Rehearsal,
  TemplatesGetChannel,
  TemplatesImportChannel,
  TemplatesListChannel,
  TemplatesPageChannel,
  TemplatesRemoveChannel,
  UpdateCancelChannel,
  UpdateRequestChannel,
  UpdateStateChangedChannel,
  UpdateStateChannel,
  FixedLayersBanksChangedChannel,
  FixedLayersBanksChannel,
  FixedLayersConfigChangedChannel,
  FixedLayersClearLayerChannel,
  FixedLayersConfigChannel,
  FixedLayersLoadChannel,
  FixedLayersSetBanksChannel,
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
  type ClearedOutsideLayer,
  type OwnedOccupancyWarning,
  type EmptiedAirNotice,
  type PendingUpdate,
  type PlayoutLayerState,
  type LiveLayerState,
  type LivePlateReleaseState,
  type RestoreMigration,
  type RestoreSkip,
  type TemplateInfo,
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
import { pvwPageSource, type BridgePageAnswer, type PvwPage } from '../shared/pvwPage.js';
import { LibraryStore } from './library/LibraryStore.js';
import {
  loadPlayoutSession,
  PlayoutSignInError,
  refreshDelayMs,
  savePlayoutSession,
  sessionExpired,
  signInToPlayout,
  type SignInFailure,
  type StoredSession,
} from './playoutSession.js';
import {
  newTabId,
  pageLocks,
  probePlayout,
  refreshConsoleSession,
  type ConsoleRefreshOutcome,
} from './playoutRefresh.js';
import { StackRetentionStore } from './stack/StackRetentionStore.js';
import {
  insideCgControl,
  nativePlayoutFetch,
  shellKeyboardLanguage,
  shellReportsKeyboardLanguage,
} from './desktop.js';
import { bridgeHostPort, bridgeUrlForStation } from './bridgeUrl.js';
import { loadStationAddress, saveStationAddress, type StationAddress } from './stationAddress.js';

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
/**
 * First retry after a refresh that could not be SENT (the Playout did not answer); doubled per
 * consecutive one. `CENTRAL-BRIDGE-01-A` — only a token that never left is ever retried: one that may
 * have reached the Playout is never sent again (`playoutRefresh.ts`).
 */
const REFRESH_RETRY_BASE_MS = 15_000;
/** …and capped, so a long Playout outage settles into a poll rather than growing unbounded. */
const REFRESH_RETRY_MAX_MS = 5 * 60_000;
/** `CENTRAL-BRIDGE-01-A` A2 — a refresh the Playout refused before using the token: asked again. */
const REFRESH_REFUSED_RETRY_MS = 60_000;
/** Another tab is refreshing the same stored session: look again, and adopt what it stored. */
const REFRESH_BUSY_RETRY_MS = 5_000;
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
   * `CENTRAL-BRIDGE-01` — this console's release version, compared with CG Bridge's by release line
   * at connect. Defaults to the build stamp's (`__CG_BUILD__`, the number `tools/release` stamps);
   * a test sets it to stand for another release.
   */
  consoleVersion?: string;
  /**
   * B-085 — this console's DISPLAY copy of the template library: what it shows while CG Bridge
   * cannot be reached. 🔴 `CENTRAL-BRIDGE-01` (`B-294`): never sent — the bridge keeps the library
   * for every console. Injected by `createRuntimeBridge` backed by OPFS (persistent); defaults to
   * an in-memory store. Must be `hydrate()`-ed before the renderer reads `templates.list()`.
   */
  library?: LibraryStore;
  /**
   * B-092 — this console's DISPLAY copy of the stack: what it shows while CG Bridge cannot be
   * reached (the offline view). 🔴 `CENTRAL-BRIDGE-01` (`B-294`): never sent — the bridge keeps and
   * restores the stack itself. Injected by `createRuntimeBridge` backed by OPFS (persistent);
   * defaults to an in-memory store.
   */
  stackRetention?: StackRetentionStore;
}

/**
 * 🔴 `DESKTOP-APPS-01-C` C2 — **THE BRIDGE DID NOT ANSWER IN TIME: said in the operator's words,
 * with the request's name kept on the object for the log.**
 *
 * It used to be `new Error('Bridge request timed out: setup.check')` — the owner's first installed
 * run put exactly that under the Playout field: an internal channel name, on the operator's screen,
 * as the check's only output. Twenty-seven renderer sites show a caught error's `message`, so the
 * fix is HERE, where the message is made (the `BridgeSkewError` idiom): the message is the
 * operator's sentence, and `channel` is for diagnostics only. It claims nothing about whether the
 * request took effect — it was sent; only the answer is missing.
 */
export class BridgeTimeoutError extends Error {
  constructor(readonly channel: string) {
    super('The bridge did not answer in time.');
    this.name = 'BridgeTimeoutError';
  }
}

/** Thrown (as a rejected promise) when a command is issued while the link is down. */
export class BridgeDisconnectedError extends Error {
  constructor() {
    super('Bridge disconnected — command rejected. Not sent to CasparCG.');
    this.name = 'BridgeDisconnectedError';
  }
}

/**
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`) — a template import or removal needs CG Bridge: it keeps the
 * library for every console, and a console's own copy is only for display. Offline, nothing is
 * changed — said, with the remedy (`R-006`).
 */
export const TEMPLATE_IMPORT_NEEDS_BRIDGE =
  'CG Bridge is not reachable, so the template was not imported — nothing was changed. ' +
  'Import it again once CG Bridge is back.';
export const TEMPLATE_REMOVE_NEEDS_BRIDGE =
  'CG Bridge is not reachable, so the template was not removed — nothing was changed. ' +
  'Remove it again once CG Bridge is back.';

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
  /** `CENTRAL-BRIDGE-01` — not readonly: a console re-aimed at another CG Bridge ({@link retarget}). */
  #url: string;
  readonly #createWs: WebSocketFactory;
  #ws: WebSocketLike | null = null;
  #status: BridgeLinkStatus = 'disconnected';
  #everOpened = false;
  #disposed = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  #nextId = 0;
  readonly #pending = new Map<string, Pending>();

  /**
   * B-085, re-scoped by R-028 (o1) and by `CENTRAL-BRIDGE-01` (`B-294`): the BRIDGE's persisted
   * registry is the one library (one bridge, many consoles). This is the DISPLAY copy: while live,
   * `templates.list/get` are served from the bridge; with the link down they answer from here,
   * display-only. It is written only after the bridge accepted an import or a removal, and it is
   * NEVER sent — an import or a removal needs CG Bridge, and an offline one is refused.
   */
  readonly #library: LibraryStore;

  /**
   * B-092 — this console's DISPLAY copy of the stack, mirrored from every snapshot it sees, so the
   * list stays visible while CG Bridge cannot be reached (the offline view). 🔴 `CENTRAL-BRIDGE-01`
   * (`B-294`): NEVER sent. The bridge keeps and restores the stack itself — with several consoles
   * on one bridge, a re-delivered copy was how an older stack could win.
   */
  readonly #stackRetention: StackRetentionStore;

  /**
   * 🔴 **IS THE CONNECT-TIME RESYNC IN FLIGHT?** — the fact that decides whether an EMPTY stack
   * is an answer or a not-yet, for the live-sources surface (`useBridgeSnapshot`'s `ready`
   * latches on the first arrival and never clears, so after a reconnect it reads `true` while
   * this window is open and the renderer had nothing else to ask).
   *
   * Mirroring into the display copy is suppressed for the window too: the snapshot is re-pulled at
   * its end, and that is the one mirrored. (It used to be load-bearing for the re-delivery — an
   * empty snapshot mirrored before the restore erased the stack being delivered. There is no
   * delivery now: `CENTRAL-BRIDGE-01`.)
   *
   * Every write goes through {@link #setResyncing} so the sites cannot drift — the same shape as
   * `#setStatus`, and for the same reason: a second, silently-diverging spelling of the same state
   * is what golden rule 6 forbids.
   */
  #resyncing = false;
  /** B-153 — channels this page needs that the connected bridge does not route. */
  #skew: readonly string[] | null = null;
  /** `CENTRAL-BRIDGE-01` — this console's release, compared with CG Bridge's at connect. */
  readonly #consoleVersion: string;
  /**
   * 🔴 `CENTRAL-BRIDGE-01` (`R-068`) — **ANOTHER RELEASE THAN CG BRIDGE: the one line, or `null`.**
   * While set, every request but the open doors (`bridge.capabilities`, `auth.*`) is refused HERE,
   * before a frame is written — "one line, no command". Learned at each connect from the
   * capabilities answer; a bridge too old to answer is another release.
   */
  #versionMismatch: string | null = null;
  readonly #versionSubs = new Subs<string | null>();
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
  /**
   * 🔴 `C-038` — the channels this principal may OPERATE on this station, as the BRIDGE
   * computed them.
   *
   * ⚠ **Stored beside `#principal` and written only by {@link #setPrincipal}, because the two
   * always arrive in the same answer and a second setter is how they would come to disagree.**
   * The console never derives this: it would need the connection config and a second copy of
   * `configuredCasparHosts`, and a stale read would let the strip offer a channel the gate
   * then refuses. One judgement, made where the facts are.
   */
  #permittedChannels: readonly number[] = [];
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
  /** Consecutive refreshes that could not be sent, so the retry backs off instead of hammering. */
  #refreshFailures = 0;
  /** `CENTRAL-BRIDGE-01-A` — the refresh this tab has out; a second is never started beside it. */
  #refreshing: Promise<void> | null = null;
  /** `CENTRAL-BRIDGE-01-A` A2 — why the Playout refuses to renew this session, while it does. */
  #renewalRefused: { readonly code: SignInFailure; readonly message: string | null } | null = null;
  /** Tells this tab's in-flight mark from another tab's (`playoutRefresh.ts`). */
  readonly #tabId = newTabId();
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
   * 🔴 `DELTA-MULTI-CHANNEL-01-A` A3 — **THE CAPABILITIES ANSWER, WHICH SAYS WHETHER THIS BRIDGE
   * AUTHENTICATES AT ALL.** Recorded at the one connect site, resolved when `#checkSkew` settles
   * (it never throws: answered, skewed, timed out or dropped).
   *
   * `#resync` waits on it before reading the gate. `#authHandshake` covers a console that HOLDS a
   * token; a console holding none has nothing to wait for there, so it read the state in the tick
   * the socket opened — UNKNOWN, not SIGNED OUT — and re-delivered to a gate with nobody on the
   * socket. The owner then read "this console is not signed in" beside `SIGNED IN AS …`, because
   * the sign-in's own resync delivered it a moment later and nothing took the refusal down.
   *
   * 🔴 `CENTRAL-BRIDGE-01` (`R-068`) — **every request now waits here**, but the capabilities
   * question itself and `auth.*`: the same answer carries the bridge's release, and a request
   * written before it lands would reach a bridge of another release (see `#invoke`). It used to say
   * that only the resync waited, and that a pressed command must not, because a bridge too old to
   * answer is answered by its own skew. That is still how such a bridge is answered — quickly, as
   * `unknown channel` — and it is now also refused as another release.
   */
  #capsHandshake: Promise<void> | null = null;
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
   * B-108 — the rows the bridge's restore could NOT bring back, with the reason, and the rows it
   * brought back on a different row. 🔴 `CENTRAL-BRIDGE-01` (`B-294`): the restore is the BRIDGE's
   * now, made at its start, so its report is standing bridge state — pulled on connect
   * (`stack.restore-report`), pushed on change, dismissed for every console at once. The two
   * halves reach the renderer through the two seams they always had.
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
  readonly #clearedOutsideSubs = new Subs<ClearedOutsideLayer[]>();
  // B-225 — the standing "air was emptied under us" notice (null when there is none).
  readonly #emptiedAirSubs = new Subs<EmptiedAirNotice | null>();
  // C-016 — the programme return's state per watched channel.
  readonly #pgmReturnSubs = new Subs<readonly PgmReturnStatus[]>();
  // R-021 stage 2a — fixed-bank config + per-slot state pushes.
  readonly #fixedConfigSubs = new Subs<FixedLayerBank | null>();
  // `MULTI-CHANNEL-01` — the whole set of banks, which the per-channel views read.
  readonly #fixedBanksSubs = new Subs<FixedLayerBank[]>();
  readonly #fixedStateSubs = new Subs<FixedSlotState[]>();
  readonly #lockSubs = new Subs<LockState>();
  readonly #updateSubs = new Subs<PendingUpdate | null>();
  /** R-034 — the bridge-owned delimiter list, pushed on every change. */
  readonly #delimiterSubs = new Subs<DelimiterOption[]>();
  /** R-030 — the bridge-owned channel raster + video-mode reading. */
  readonly #channelSettingsSubs = new Subs<ChannelSettingsState>();
  readonly #stationChannelsSubs = new Subs<StationChannels>();
  /**
   * `DESKTOP-APPS-01-D` j — subscribers to the strays. (The retention used to keep them so a
   * re-delivery could not forget one; the bridge persists its strays itself now —
   * `CENTRAL-BRIDGE-01`.)
   */
  readonly #straySubs = new Subs<readonly ipcChannels.StationStray[]>();
  /** `CENTRAL-BRIDGE-01` (D7) — CG Bridge's own Playout session, as the bridge last said. */
  readonly #bridgeSessionSubs = new Subs<ipcChannels.BridgeSessionState>();
  readonly #enginesSubs = new Subs<ipcChannels.EngineSessions>();
  /** `PLAYOUT-FEATURES-01` D — the CG license as CG Bridge last read it. */
  readonly #licenseSubs = new Subs<ipcChannels.LicenseState>();
  /** `RELEASE-0113-01` (`R-089`) — each channel's backup line, pushed on change. */
  readonly #backupChannelsSubs = new Subs<ipcChannels.BackupChannelsState>();
  /** `PLAYOUT-FEATURES-01` E — the Playout's meters, one reading at a time. */
  readonly #meterSubs = new Subs<ipcChannels.PgmMeterReading>();
  /** D-137 / C-015 — the bridge-owned Live Source mapping, pushed on change. */
  readonly #sourceCatalogSubs = new Subs<ConsoleSourceCatalog>();
  readonly #sourceAssignmentSubs = new Subs<SourceAssignments>();
  /** R-022 — the bridge-owned rehearsing set, pushed to every client. */
  readonly #rehearseSubs = new Subs<Rehearsal[]>();
  readonly #statusSubs = new Subs<BridgeLinkStatus>();
  // R-028 (o1) — the bridge-owned catalogue push.
  readonly #templatesSubs = new Subs<TemplateInfo[]>();
  // `CONSOLE-POLISH-01` (`B-300`) — who changed the catalogue.
  readonly #templatesActedSubs = new Subs<TemplateAct>();
  // `CONSOLE-POLISH-01` (`R-083`) — each audit row as CG Bridge records it.
  readonly #auditAppendedSubs = new Subs<AuditEntry>();
  // R-028 part B — the declared playout layers' occupancy push.
  readonly #playoutSubs = new Subs<PlayoutLayerState[]>();
  // B-145 (2.8) — the bridge-owned Live Source ledger push.
  readonly #liveLayerSubs = new Subs<LiveLayerState[]>();
  // `B-247` — and WHY a plate left that ledger, which the ledger payload cannot say.
  readonly #plateReleaseSubs = new Subs<LivePlateReleaseState>();
  // `MEDIA-PLATES-01` — each seated clip's remaining time, pause and end.
  readonly #mediaStateSubs = new Subs<MediaPlateState[]>();

  #readyResolve: (() => void) | null = null;
  #readyReject: ((err: Error) => void) | null = null;
  #readySettled = false;

  constructor(url: string, options: WebSocketRuntimeOptions = {}) {
    this.#url = url;
    this.#createWs =
      options.createWebSocket ?? ((u) => new WebSocket(u) as unknown as WebSocketLike);
    this.#consoleVersion = options.consoleVersion ?? __CG_BUILD__.version;
    // Default to in-memory (unhydrated, empty) display copies so tests can construct the runtime
    // with no store. The boot path injects OPFS-backed, hydrated ones.
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

  /**
   * 🔴 `CENTRAL-BRIDGE-01` (D8) — **CONNECT TO ANOTHER CG BRIDGE** (this console's station record
   * changed). The socket that is open is closed; its own close handler reconnects, to the new URL,
   * so this is the reconnect every drop already takes — nothing held is lost, and nothing waits.
   */
  retarget(url: string): void {
    if (url === this.#url) return;
    this.#url = url;
    this.#ws?.close();
  }

  /** Where this console's CG Bridge is — what the "not reachable" line names. */
  bridgeAddress(): string {
    return bridgeHostPort(this.#url);
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
      // `DELTA-MULTI-CHANNEL-01-A` A3 — recorded, not awaited here (B-153): the resync waits on it.
      this.#capsHandshake = this.#checkSkew();
      // On EVERY connect: read the bridge's standing restore report and its strays; on a
      // RECONNECT also re-pull the stack/health/lock snapshots (first-connect snapshots come from
      // the renderer's `useBridgeSnapshot`). `CENTRAL-BRIDGE-01` — nothing is delivered.
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

  /** `CENTRAL-BRIDGE-01` — the ONE write path for {@link #versionMismatch}, publishing on change. */
  #setVersionMismatch(value: string | null): void {
    if (this.#versionMismatch === value) return;
    this.#versionMismatch = value;
    this.#versionSubs.emit(value);
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

  #setPrincipal(
    value: ipcChannels.PlayoutPrincipal | null,
    permittedChannels: readonly number[] = [],
  ): void {
    this.#principal = value;
    this.#permittedChannels = value === null ? [] : permittedChannels;
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
    return {
      kind: 'signed-in',
      principal,
      permittedChannels: this.#permittedChannels,
      ...(this.#renewalRefused !== null ? { renewalRefused: this.#renewalRefused } : {}),
    };
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

  /** `CENTRAL-BRIDGE-01-A` — one refresh at a time in this tab: a second call joins the first. */
  #refreshNow(): Promise<void> {
    if (this.#refreshing === null) {
      this.#refreshing = this.#refreshOnce().finally(() => {
        this.#refreshing = null;
      });
    }
    return this.#refreshing;
  }

  async #refreshOnce(): Promise<void> {
    const session = this.#session;
    const refreshUrl = this.#authCaps?.refreshUrl ?? null;
    if (session === null || session.refreshToken === null || refreshUrl === null) return;
    // Which session this refresh belongs to. Compared after the await: a sign-out (or a fresh
    // sign-in) that lands first must not be undone by a reply that was already in flight.
    const generation = this.#authGeneration;
    let outcome: ConsoleRefreshOutcome;
    try {
      /*
        🔴 `CENTRAL-BRIDGE-01-A` — the Playout's reuse detection (`2.9.2` §8) makes a second send of
        a used token revoke every session of the account. `refreshConsoleSession` serialises across
        tabs, sends only the latest token, marks it before it leaves and sends it only to a Playout
        that answers; it stores the successor itself, BEFORE anything here uses it.
      */
      // `CENTRAL-BRIDGE-01` rule 8 — inside CG Control, D2 from the native side, with no `Origin`.
      const native = nativePlayoutFetch();
      outcome = await refreshConsoleSession(session, {
        refreshUrl,
        tabId: this.#tabId,
        probe: () => probePlayout(refreshUrl),
        locks: pageLocks(),
        ...(native !== null ? { fetchImpl: native } : {}),
      });
    } catch {
      // Not a D2 failure (those are outcomes): the guard itself failed, so nothing is known about
      // the token — it is not sent again from this tab. The access token lives to `exp`.
      outcome = { kind: 'dropped', session: { ...session, refreshToken: null }, why: 'unknown' };
    }
    /*
      🔴 THE GENERATION GUARD. Without it, a refresh in flight when the operator pressed Sign out
      lands afterwards and RESURRECTS the session: re-arms the timer and re-presents a token to a
      bridge that was just told to drop it — so the console reads signed-out while the bridge holds
      a principal. (The store half is `refreshConsoleSession`'s: it writes the successor only while
      the store still carries this tab's own mark, which a sign-out removes.)
    */
    if (generation !== this.#authGeneration) return;
    switch (outcome.kind) {
      case 'rotated':
      case 'adopted':
        this.#refreshFailures = 0;
        this.#renewalRefused = null;
        this.#session = outcome.session;
        await this.#presentToken();
        this.#scheduleRefresh();
        break;
      case 'busy':
        this.#retryRefresh(REFRESH_BUSY_RETRY_MS);
        break;
      case 'not-sent': {
        /*
          🔴 **RETRY, BACKING OFF — one blink must not end the shift.** A Playout unreachable for
          thirty seconds at T−10min must not leave the session to die at `exp`. Safe because the
          token never left: only a refresh that was NOT SENT comes back here.
        */
        this.#refreshFailures += 1;
        this.#retryRefresh(
          Math.min(REFRESH_RETRY_BASE_MS * 2 ** (this.#refreshFailures - 1), REFRESH_RETRY_MAX_MS),
        );
        break;
      }
      case 'refused':
        // `2.9.2` §2 — refused BEFORE use: the token is kept and asked again; the reason is said.
        this.#renewalRefused = { code: outcome.code, message: outcome.message };
        this.#retryRefresh(REFRESH_REFUSED_RETRY_MS);
        break;
      case 'dropped':
        // Spent, or it may have been used: never sent again. The access token lives to `exp`.
        this.#renewalRefused = null;
        this.#session = outcome.session;
        break;
      case 'gone':
        // Signed out in another tab: this tab renews nothing more, and its token lives to `exp`.
        this.#session = { ...session, refreshToken: null };
        break;
    }
    this.#authStateSubs.emit(this.#authState());
  }

  #retryRefresh(delayMs: number): void {
    if (this.#refreshTimer !== null) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = setTimeout(() => {
      this.#refreshTimer = null;
      void this.#refreshNow();
    }, delayMs);
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
        // `DESKTOP-APPS-01` — an installed station still in first-run says so here.
        setupPhase: caps.setup ?? null,
        // `R-081` — CG Bridge's release, for the connection check's Versions line.
        bridgeVersion: caps.bridgeVersion ?? null,
      });
      const routed = new Set(channels);
      const missing = ipcChannels
        .runtimeRequestChannelNames(ipcChannels)
        .filter((n) => !routed.has(n));
      this.#setSkew(missing.length === 0 ? null : missing);
      // `CENTRAL-BRIDGE-01` — the release line, from the same answer (no second round trip).
      this.#setVersionMismatch(
        ipcChannels.sameReleaseLine(this.#consoleVersion, caps.bridgeVersion)
          ? null
          : ipcChannels.versionMismatchRefusal(this.#consoleVersion, caps.bridgeVersion),
      );
    } catch (err) {
      if (err instanceof BridgeSkewError) {
        // The bridge predates the handshake itself. It cannot tell us WHICH channels it
        // lacks, so the honest answer names the channel that proved it rather than
        // inventing a list.
        this.#setSkew([ipcChannels.BridgeCapabilitiesChannel.name]);
        // …and it is, by that very fact, another release (`CENTRAL-BRIDGE-01`).
        this.#setVersionMismatch(
          ipcChannels.versionMismatchRefusal(this.#consoleVersion, undefined),
        );
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
      this.#setPrincipal(state.principal, state.permittedChannels);
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
        reject(new BridgeTimeoutError('auth'));
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
   * Catch up on (re)connect: read the bridge's standing restore report and its strays, THEN (on a
   * RECONNECT only) re-pull the full snapshot and push it to subscribers. 🔴 `CENTRAL-BRIDGE-01`
   * (`B-294`): it DELIVERS nothing — no template, no stack. The bridge is the one store.
   */
  async #resync(rePullSnapshots = true): Promise<void> {
    /*
      🔴 `DELTA A` — **A GATED CONSOLE ASKS NOTHING.** With auth on and no principal seated,
      every frame below would be refused for want of one — which is the gate working. The
      sign-in surface is what they should be looking at, and `signIn` runs this same resync the
      moment they are through it.

      ⚠ It reads the state AFTER the connect-time handshake has settled, because `#invoke`
      waits on it and so does this: an early read would see `unknown` on every connect.

      🔴 `DELTA-MULTI-CHANNEL-01-A` A3 — **AND AFTER THE BRIDGE HAS SAID WHETHER IT
      AUTHENTICATES.** With no token held there is no `auth` handshake to wait for, and the read
      above came back `unknown` — not `signed-out` — so this guard let the resync through to a
      gate with nobody on the socket. ADR 0010 rule 4 gives such a socket the capabilities door and
      `auth.*`, nothing else, so the resync WAITS for a sign-in (the sign-in runs this resync). A
      bridge too old to answer stays `unknown` and is read as it always was.
    */
    if (this.#authHandshake !== null) await this.#authHandshake;
    if (this.#capsHandshake !== null) await this.#capsHandshake;
    const gate = this.#authState();
    if (gate.kind === 'signed-out' || gate.kind === 'expired') return;
    /* The resync flag goes up before the first read below, and is cleared on every exit path. */
    this.#setResyncing(true);
    /*
      🔴 `CENTRAL-BRIDGE-01` (`B-294`) — **NOTHING IS DELIVERED.** This used to re-deliver every
      template in this console's library and then its retained stack (`B-085`, `B-092`), because
      the bridge held the stack only in memory. With one bridge serving several consoles, each
      console's copy was a claim on the truth and a stale one could win. The bridge keeps both
      now and restores its stack itself at start; this console only READS.

      B-108 — the report of that restore is standing bridge state: read here on every connect (a
      console that connects after the start still hears what did not come back), pushed on change.
      A bridge too old to answer leaves the last report in place.
    */
    try {
      this.#applyRestoreReport(await this.#invoke(StackRestoreReportChannel, undefined));
    } catch (err) {
      if (err instanceof BridgeDisconnectedError) {
        this.#setResyncing(false);
        return;
      }
    }
    /*
      `DESKTOP-APPS-01-D` j — the strays Station setup shows. A bridge too old to answer leaves the
      set as it was.
    */
    try {
      this.#straySubs.emit(await this.#invoke(ipcChannels.StationStraysChannel, undefined));
    } catch (err) {
      if (err instanceof BridgeDisconnectedError) {
        this.#setResyncing(false);
        return;
      }
    }
    /*
      `CENTRAL-BRIDGE-01` (D7) — whether CG Bridge holds its own Playout session. Pulled here because
      this runs at every connect AND after every sign-in (the read needs a signed-in socket); a bridge
      too old to answer, or a socket not yet signed in, leaves it as it was.
    */
    try {
      this.#bridgeSessionSubs.emit(
        await this.#invoke(ipcChannels.BridgeSessionStateChannel, undefined),
      );
    } catch (err) {
      if (err instanceof BridgeDisconnectedError) {
        this.#setResyncing(false);
        return;
      }
    }
    // `RELEASE-0112-01` (`R-085`) — and each engine's, by the same rule (a bridge too old to answer
    // leaves it as it was: the console shows the primary alone).
    try {
      this.#enginesSubs.emit(await this.#invoke(ipcChannels.BridgeEnginesChannel, undefined));
    } catch (err) {
      if (err instanceof BridgeDisconnectedError) {
        this.#setResyncing(false);
        return;
      }
    }
    // `PLAYOUT-FEATURES-01` D — and the CG license, by the same rule (a bridge too old to answer
    // leaves it as it was).
    try {
      this.#licenseSubs.emit(await this.#invoke(ipcChannels.LicenseStateChannel, undefined));
    } catch (err) {
      if (err instanceof BridgeDisconnectedError) {
        this.#setResyncing(false);
        return;
      }
    }
    // `RELEASE-0113-01` (`R-089`) — and each channel's backup line, by the same rule.
    try {
      this.#backupChannelsSubs.emit(
        await this.#invoke(ipcChannels.BackupChannelsStateChannel, undefined),
      );
    } catch (err) {
      if (err instanceof BridgeDisconnectedError) {
        this.#setResyncing(false);
        return;
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
      this.#stackSubs.emit(stack);
      this.#healthSubs.emit(health);
      this.#lockSubs.emit(lock);
      this.#setResyncing(false);
      this.#mirrorStack(stack);
    } catch {
      /* a fresh drop during resync will re-trigger reconnect */
      this.#setResyncing(false);
    }
  }

  /**
   * B-108 / `CENTRAL-BRIDGE-01` — the bridge's standing restore report, split onto the two seams
   * the renderer reads. `null` (nothing to say, or both halves dismissed) empties both, and an
   * empty report is what CLEARS a stale notice: a surface that can only ever be raised is a
   * surface that eventually lies.
   */
  #applyRestoreReport(report: StackRestoreReport | null): void {
    this.#emitRestoreSkips(report?.skipped ?? []);
    this.#emitRestoreMigrations(report?.migrated ?? []);
  }

  /** B-108 — publish the rows the restore did NOT bring back, so the operator sees which and why. */
  #emitRestoreSkips(skips: readonly RestoreSkip[]): void {
    this.#lastRestoreSkips = skips;
    this.#restoreSkipSubs.emit(skips);
  }

  /** The migrations half of the same report. */
  #emitRestoreMigrations(migrations: readonly RestoreMigration[]): void {
    this.#lastRestoreMigrations = migrations;
    this.#restoreMigrationSubs.emit(migrations);
  }

  /**
   * B-092 — keep the DISPLAY copy of the stack in step with a published snapshot (fire and forget:
   * it must never delay or fail a UI update). Suppressed while `#resyncing`, see that field.
   * (`DESKTOP-APPS-01-D` j kept the strays in it so a re-delivery could not forget one; the bridge
   * persists its strays itself now, and a stray is on no stack to display — `CENTRAL-BRIDGE-01`.)
   */
  #mirrorStack(snapshot: readonly StackItemState[]): void {
    if (this.#resyncing) return;
    void this.#stackRetention.mirror(snapshot).catch(() => {
      /* the display copy is best-effort; a write failure must never break playout */
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
          this.#stackSubs.emit(p.data);
          this.#mirrorStack(p.data); // B-092 — keep the display copy current
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
      case FixedLayersBanksChangedChannel.name: {
        const p = FixedLayersBanksChangedChannel.payload.safeParse(payload);
        if (p.success) this.#fixedBanksSubs.emit(p.data);
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
      case LayersClearedOutsideChangedChannel.name: {
        const p = LayersClearedOutsideChangedChannel.payload.safeParse(payload);
        if (p.success) this.#clearedOutsideSubs.emit(p.data);
        break;
      }
      case EmptiedAirNoticeChangedChannel.name: {
        const p = EmptiedAirNoticeChangedChannel.payload.safeParse(payload);
        if (p.success) this.#emptiedAirSubs.emit(p.data);
        break;
      }
      // `CENTRAL-BRIDGE-01` (`B-294`) — the bridge's restore report, raised at its start or dismissed.
      case StackRestoreReportChangedChannel.name: {
        const p = StackRestoreReportChangedChannel.payload.safeParse(payload);
        if (p.success) this.#applyRestoreReport(p.data);
        break;
      }
      case PgmReturnStatusChangedChannel.name: {
        const p = PgmReturnStatusChangedChannel.payload.safeParse(payload);
        if (p.success) this.#pgmReturnSubs.emit(p.data);
        break;
      }
      case TemplatesChangedChannel.name: {
        const p = TemplatesChangedChannel.payload.safeParse(payload);
        if (p.success) this.#templatesSubs.emit(p.data);
        break;
      }
      // `CONSOLE-POLISH-01` (`B-300`) — who changed the catalogue.
      case TemplatesActedChannel.name: {
        const p = TemplatesActedChannel.payload.safeParse(payload);
        if (p.success) this.#templatesActedSubs.emit(p.data);
        break;
      }
      // `CONSOLE-POLISH-01` (`R-083`) — a row CG Bridge has just recorded.
      case AuditAppendedChannel.name: {
        const p = AuditAppendedChannel.payload.safeParse(payload);
        if (p.success) this.#auditAppendedSubs.emit(p.data);
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
      case LiveLayersMediaStateChangedChannel.name: {
        const p = LiveLayersMediaStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#mediaStateSubs.emit(p.data);
        break;
      }
      /*
        🔴 `OPERATOR-NAME-SWEEP-01` § 3(a) — **THE BRIDGE SAYS THE PERMISSIONS MOVED.**

        The console does not re-derive anything here; it adopts the answer the gate itself
        computed. That is the whole point of the channel: a station-admin repointing the
        servers changes who may drive which channel, and a strip that learned it only on the
        next reconnect would keep offering a channel the bridge had begun refusing.

        ⚠ It goes through {@link #setPrincipal}, the ONE writer for the pair, rather than
        assigning `#permittedChannels` directly. The principal and its channels always arrive
        together and a second writer is how they would come to disagree — which is the defect
        this channel exists to close, one level down.
      */
      case AuthStateChangedChannel.name: {
        const p = AuthStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#setPrincipal(p.data.principal, p.data.permittedChannels);
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
      // `DESKTOP-APPS-01-D` j — the strays moved.
      // `CENTRAL-BRIDGE-01` (D7) — the bridge's own session moved.
      case ipcChannels.BridgeSessionStateChangedChannel.name: {
        const p = ipcChannels.BridgeSessionStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#bridgeSessionSubs.emit(p.data);
        break;
      }
      // `RELEASE-0112-01` (`R-085`) — either engine's session moved.
      case ipcChannels.BridgeEnginesChangedChannel.name: {
        const p = ipcChannels.BridgeEnginesChangedChannel.payload.safeParse(payload);
        if (p.success) this.#enginesSubs.emit(p.data);
        break;
      }
      // `PLAYOUT-FEATURES-01` D — the CG license moved.
      case ipcChannels.BackupChannelsChangedChannel.name: {
        const p = ipcChannels.BackupChannelsChangedChannel.payload.safeParse(payload);
        if (p.success) this.#backupChannelsSubs.emit(p.data);
        break;
      }
      case ipcChannels.LicenseStateChangedChannel.name: {
        const p = ipcChannels.LicenseStateChangedChannel.payload.safeParse(payload);
        if (p.success) this.#licenseSubs.emit(p.data);
        break;
      }
      // `PLAYOUT-FEATURES-01` E — the meter readings that arrived together, handed on one at a time.
      case ipcChannels.PgmMetersChangedChannel.name: {
        const p = ipcChannels.PgmMetersChangedChannel.payload.safeParse(payload);
        if (p.success) for (const reading of p.data) this.#meterSubs.emit(reading);
        break;
      }
      case ipcChannels.StationStraysChangedChannel.name: {
        const p = ipcChannels.StationStraysChangedChannel.payload.safeParse(payload);
        if (p.success) this.#straySubs.emit(p.data);
        break;
      }
      // `R-062` gap 2 — this console's discovery answer, recomputed by the bridge for its principal.
      case StationChannelsChangedChannel.name: {
        const p = StationChannelsChangedChannel.payload.safeParse(payload);
        if (p.success) this.#stationChannelsSubs.emit(p.data);
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
    /** How long to wait for the answer; the one shared default unless a channel's work is longer. */
    timeoutMs: number = REQUEST_TIMEOUT_MS,
  ): Promise<ChannelResponse<C>> {
    /*
      🔴 `DELTA A` — **WAIT FOR THE CONNECT-TIME `auth` ANSWER BEFORE WRITING ANYTHING.**

      One gate, at the one place every request passes, rather than a retry per caller — and
      the callers are the point: the renderer's initial reads are fired from a dozen hooks
      that know nothing about a handshake, and the owner's stuck layer list was one of them.

      ⚠ The validate-and-send below is unchanged and still SYNCHRONOUS once this resolves, so
      frames written in one tick keep their order: every caller awaits the SAME promise and the
      continuations run in creation order.

      ⚠ The liveness check is re-done AFTER the wait. The socket can drop while a handshake is
      in flight, and a frame written to a closed socket is a request that will never be
      answered — `BridgeDisconnectedError` is the honest answer, as it was before.
    */
    if (this.#authHandshake !== null) await this.#authHandshake;
    /*
      🔴 `CENTRAL-BRIDGE-01` (`R-068`) — ANOTHER RELEASE THAN CG BRIDGE SENDS NOTHING but the
      questions that can put it right: the capabilities it asks at every connect, and `auth.*`.

      ⚠ **AND IT WAITS FOR THE ANSWER FIRST.** Until the capabilities answer lands,
      `#versionMismatch` still holds the PREVIOUS connection's verdict — none, on a first connect —
      so a take pressed in that first round trip reached a bridge of another release: the refusal
      held only after the answer, which is not "before a frame is written". `#checkSkew` never
      throws, so the wait always ends; a timed-out answer leaves nothing known and refuses nothing,
      which is `B-153`'s rule that a guard must not take a working station off air.
    */
    const mayPutItRight =
      channel.name === ipcChannels.BridgeCapabilitiesChannel.name ||
      channel.name.startsWith('auth.');
    if (!mayPutItRight && this.#capsHandshake !== null) await this.#capsHandshake;
    if (this.#versionMismatch !== null && !mayPutItRight) {
      throw new Error(this.#versionMismatch);
    }
    if (this.#status !== 'live' || this.#ws === null || this.#ws.readyState !== WS_OPEN) {
      throw new BridgeDisconnectedError();
    }
    const validatedReq = channel.request.parse(request) as unknown;
    const id = String(++this.#nextId);
    const ws = this.#ws;
    return new Promise<ChannelResponse<C>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new BridgeTimeoutError(channel.name));
      }, timeoutMs);
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
    // `CENTRAL-BRIDGE-01` — another release than CG Bridge: the one line, or `null`.
    versionMismatch: (): string | null => this.#versionMismatch,
    onVersionMismatchChanged: (handler: (line: string | null) => void): Unsubscribe =>
      this.#versionSubs.add(handler),
    bridgeAddress: (): string | null => this.bridgeAddress(),
  };

  /**
   * `CENTRAL-BRIDGE-01` (D9) — an HTTP resource on CG Bridge: the socket's own host and port, over
   * `http:` (`https:` beside a `wss:` socket). The path carries its ticket.
   */
  #bridgeHttpUrl(path: string): string {
    const socket = new URL(this.#url);
    return `${socket.protocol === 'wss:' ? 'https:' : 'http:'}//${socket.host}${path}`;
  }

  /** Open a download from CG Bridge (the logs zip): the page follows a link the bridge answers. */
  #openFromBridge(path: string): void {
    const link = document.createElement('a');
    link.href = this.#bridgeHttpUrl(path);
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

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
      let session: StoredSession;
      try {
        // `CENTRAL-BRIDGE-01` rule 8 — inside CG Control, D1 from the native side, with no `Origin`
        // (no CORS entry is needed for it); a browser keeps its `fetch`.
        const native = nativePlayoutFetch();
        ({ session } = await signInToPlayout(
          signInUrl,
          username,
          password,
          native !== null ? { fetchImpl: native } : {},
        ));
      } catch (err) {
        /*
          `DELTA-MULTI-CHANNEL-01-B` B3 — the Playout's own answer goes to the station's LOG (the
          surface shows this console's sentence for the code, never the Playout's text). Fire and
          forget: the log is a record, and the operator's answer must not wait on it.
        */
        if (err instanceof PlayoutSignInError) {
          void this.#invoke(ipcChannels.AuthSignInFailureChannel, {
            code: err.code,
            status: err.detail?.status ?? null,
            body: err.detail?.body ?? '',
          }).catch(() => undefined);
        }
        throw err;
      }
      this.#authGeneration += 1;
      this.#refreshFailures = 0;
      this.#renewalRefused = null;
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
      this.#renewalRefused = null;
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
    dismissError: (req: ChannelRequest<typeof StackDismissErrorChannel>) =>
      this.#invoke(StackDismissErrorChannel, req),
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
    // `MEDIA-PLATES-01` §1.D — Play/Pause and Restart for one media plate of an on-air row.
    mediaPlateTransport: (req: ChannelRequest<typeof StackMediaPlateTransportChannel>) =>
      this.#invoke(StackMediaPlateTransportChannel, req),
    // PANIC — no arguments: the bridge scopes it from its own LEDGER, not the browser's copy.
    silenceAllLivePlates: () => this.#invoke(StackSilenceAllLivePlatesChannel, undefined),
    // `MULTI-CHANNEL-01` §2 C — PANIC for the channel on screen; the one above silences them all.
    silenceChannelLivePlates: (req: ChannelRequest<typeof StackSilenceChannelLivePlatesChannel>) =>
      this.#invoke(StackSilenceChannelLivePlatesChannel, req),
    // `MULTI-CHANNEL-01` §2 B — bare is every item; `{ channel }` is that channel's items.
    removeAll: (req?: ChannelRequest<typeof StackRemoveAllChannel>) =>
      this.#invoke(StackRemoveAllChannel, req),
    clearAll: (req?: ChannelRequest<typeof StackClearAllChannel>) =>
      this.#invoke(StackClearAllChannel, req),
    // C-012 / R-028 — the graceful bulk beside the hard one.
    stopAll: (req?: ChannelRequest<typeof StackStopAllChannel>) =>
      this.#invoke(StackStopAllChannel, req),
    snapshot: async () => {
      // B-092 — with the bridge unreachable, answer from the browser-local
      // retention instead of REFUSING. A cold page load against a dead bridge
      // otherwise shows an EMPTY stack (the pull is refused and nothing re-reads
      // the retention until the bridge returns) — the operator's list vanishing
      // on a refresh, which is the very failure this change exists to end. The
      // library already works this way (B-085); the stack now does too.
      //
      // DISPLAY ONLY: this sends nothing, commands nothing, and makes no
      // restore-vs-reset decision — the bridge keeps and restores the stack
      // (`CENTRAL-BRIDGE-01`); the re-pull then replaces this with its truth.
      if (this.#status !== 'live') return this.#retainedProjection();
      const stack = await this.#invoke(StackSnapshotChannel, undefined);
      this.#mirrorStack(stack); // B-092 — keep the display copy current
      return stack;
    },
    onStateChanged: (handler: (snapshot: readonly StackItemState[]) => void) =>
      this.#stackSubs.add(handler),
    // B-108 — replays the latest report on subscribe. The panel mounts after boot, so
    // a subscribe-only stream would miss precisely the report worth seeing: the one
    // the resync read while the UI was coming up.
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
    // `CENTRAL-BRIDGE-01` — dismissed on the BRIDGE, so every console stops showing it at once.
    dismissRestoreReport: (req: ChannelRequest<typeof StackRestoreReportDismissChannel>) =>
      this.#invoke(StackRestoreReportDismissChannel, req),
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
    // (`CENTRAL-BRIDGE-01` — no longer the basis of an offline removal check: a removal needs the
    // bridge, which holds the true stack.)
    return this.#stackRetention.items().map(
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
  }

  // `DESKTOP-APPS-01` — first-run and the station's own check. The Playout address goes through
  // CG Control's IPC (`desktop.ts`), never through `#invoke`: auth config is not the socket's.
  readonly setup = {
    // `DESKTOP-APPS-01-C` C2 — waits longer than the check's slowest line, from the one constant;
    // `DELTA-MULTI-CHANNEL-01-A` A2 — and a check that holds its AMCP line, the window on top.
    check: (req: ChannelRequest<typeof ipcChannels.SetupCheckChannel>) =>
      this.#invoke(
        ipcChannels.SetupCheckChannel,
        /*
          `CENTRAL-BRIDGE-01` rule 8 — the check asks what THIS console's sign-in will meet. Where the
          sign-in is native (CG Control: the same `nativePlayoutFetch` it signs in with, never a
          second test), it sends no `Origin`, so there is no CORS list to probe for it.
        */
        nativePlayoutFetch() === null ? req : { ...req, signIn: 'native' as const },
        req.awaitLetIn === true
          ? ipcChannels.SETUP_CHECK_LET_IN_WAIT_MS
          : ipcChannels.SETUP_CHECK_WAIT_MS,
      ),
    routeAddress: (req: ChannelRequest<typeof ipcChannels.SetupRouteAddressChannel>) =>
      this.#invoke(ipcChannels.SetupRouteAddressChannel, req),
    catalogue: () => this.#invoke(ipcChannels.ChannelsCatalogueChannel, undefined),
    // `DESKTOP-APPS-01-D` d — the bridge waits up to 3 s for its tap; the default wait covers it.
    channelOccupancy: (req: ChannelRequest<typeof ipcChannels.SetupChannelOccupancyChannel>) =>
      this.#invoke(ipcChannels.SetupChannelOccupancyChannel, req),
    /*
      🔴 `CENTRAL-BRIDGE-01` (D8) — **THIS CONSOLE'S Playout address, which says where its CG Bridge
      is.** No longer the bridge's configuration (CG Bridge's installer owns that): the console keeps
      the address in its station record and connects to CG Bridge on that host, or where an admin
      said it is — without a reload. Offered inside CG Control; a browser follows the page's host.
    */
    canSetPlayoutAddress: (): boolean => insideCgControl(),
    /*
      `bridgeAddress`: absent keeps this console's CG Bridge address as it is; `''` puts CG Bridge
      back on the Playout's host; `host` / `host:port` is a separate server's (an admin's override).
    */
    setPlayoutAddress: (address: string, bridgeAddress?: string): Promise<string> => {
      const playoutAddress = ipcChannels.normalisePlayoutAddress(address);
      if (playoutAddress === null) {
        return Promise.reject(new Error(ipcChannels.NOT_A_PLAYOUT_ADDRESS));
      }
      const bridge =
        bridgeAddress === undefined
          ? (loadStationAddress()?.bridgeAddress ?? '')
          : ipcChannels.normaliseBridgeAddress(bridgeAddress);
      if (bridge === null) return Promise.reject(new Error(ipcChannels.NOT_A_BRIDGE_ADDRESS));
      const station: StationAddress = {
        playoutAddress,
        ...(bridge === '' ? {} : { bridgeAddress: bridge }),
      };
      const url = bridgeUrlForStation(station);
      if (url === null) return Promise.reject(new Error(ipcChannels.NOT_A_PLAYOUT_ADDRESS));
      if (!saveStationAddress(station)) {
        return Promise.reject(new Error('This console could not save the Playout address.'));
      }
      this.retarget(url);
      return Promise.resolve(
        `Playout address set to ${playoutAddress} - CG Bridge at ${bridgeHostPort(url)}`,
      );
    },
    // `CENTRAL-BRIDGE-01` (D8) — the admin's CG Bridge address this console keeps, if any.
    bridgeOverride: (): string | null =>
      insideCgControl() ? (loadStationAddress()?.bridgeAddress ?? null) : null,
    /*
      `CENTRAL-BRIDGE-01` (D8) — FORGET this console's station, so it asks again: the way back for a
      console that cannot reach the CG Bridge it was pointed at (a mistyped address), where Station
      setup — behind a station admin's sign-in, over that very bridge — cannot be reached. CG Control
      only; the page restarts to ask.
    */
    forgetStation: (): boolean => insideCgControl() && saveStationAddress(null),
  };

  /** `DESKTOP-APPS-01-D` j — items of ours on a channel this station does not declare. */
  readonly strays = {
    list: () => this.#invoke(ipcChannels.StationStraysChannel, undefined),
    onChanged: (handler: (strays: readonly ipcChannels.StationStray[]) => void) =>
      this.#straySubs.add(handler),
    takeOffAir: (req: ChannelRequest<typeof ipcChannels.StationTakeOffAirChannel>) =>
      this.#invoke(ipcChannels.StationTakeOffAirChannel, req),
  };

  /**
   * `CENTRAL-BRIDGE-01` (D7, rule 8) — CG Bridge's own Playout session. The sign-in's password goes
   * out in this one request and this object keeps nothing of it.
   */
  readonly bridgeSession = {
    state: () => this.#invoke(ipcChannels.BridgeSessionStateChannel, undefined),
    onChanged: (handler: (state: ipcChannels.BridgeSessionState) => void) =>
      this.#bridgeSessionSubs.add(handler),
    signIn: (req: ChannelRequest<typeof ipcChannels.BridgeSessionSignInChannel>) =>
      this.#invoke(ipcChannels.BridgeSessionSignInChannel, req),
    // `RELEASE-0112-01` (`R-085`) — each engine's session, and the backup engine's own sign-in.
    engines: () => this.#invoke(ipcChannels.BridgeEnginesChannel, undefined),
    onEnginesChanged: (handler: (sessions: ipcChannels.EngineSessions) => void) =>
      this.#enginesSubs.add(handler),
    signInBackup: (req: ChannelRequest<typeof ipcChannels.BridgeBackupSignInChannel>) =>
      this.#invoke(ipcChannels.BridgeBackupSignInChannel, req),
  };

  /** `PLAYOUT-FEATURES-01` D — the CG license, pulled by its hook and pushed on change. */
  readonly license = {
    state: () => this.#invoke(ipcChannels.LicenseStateChannel, undefined),
    onChanged: (handler: (state: ipcChannels.LicenseState) => void) =>
      this.#licenseSubs.add(handler),
  };

  /** `RELEASE-0113-01` (`R-089`) — each channel's backup line, and a station admin's entries. */
  readonly backupChannels = {
    state: () => this.#invoke(ipcChannels.BackupChannelsStateChannel, undefined),
    onChanged: (handler: (state: ipcChannels.BackupChannelsState) => void) =>
      this.#backupChannelsSubs.add(handler),
    setEntries: (req: ChannelRequest<typeof ipcChannels.BackupChannelEntriesSetChannel>) =>
      this.#invoke(ipcChannels.BackupChannelEntriesSetChannel, req),
  };

  /** `PLAYOUT-FEATURES-01` E — the Playout's meters, pushed by CG Bridge for this socket's channels. */
  readonly meters = {
    onReading: (handler: (reading: ipcChannels.PgmMeterReading) => void) =>
      this.#meterSubs.add(handler),
  };

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
    // `B-292` — a layer of ours cleared outside CG Control.
    clearedOutside: () => this.#invoke(LayersClearedOutsideChannel, undefined),
    onClearedOutsideChanged: (handler: (cleared: ClearedOutsideLayer[]) => void) =>
      this.#clearedOutsideSubs.add(handler),
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

  /*
    C-016 — the programme return. `CENTRAL-BRIDGE-01` (D9): the picture is relayed by CG Bridge on
    its OWN control port — the console is on another machine now — behind a ticket this socket is
    given for the channel (`pgmReturn.ticket`), so every request of the picture asks for a fresh
    one. A refusal (a channel the sign-in does not hold) rejects, and the pane shows no picture.
  */
  readonly pgmReturn = {
    feedUrl: async (channel: number): Promise<string | null> => {
      const { path } = await this.#invoke(ipcChannels.PgmReturnTicketChannel, { channel });
      return this.#bridgeHttpUrl(path);
    },
    // `PLAYOUT-FEATURES-01` E — the SOUND, behind a ticket for the sound.
    audioUrl: async (channel: number): Promise<string | null> => {
      const { path } = await this.#invoke(ipcChannels.PgmReturnTicketChannel, {
        channel,
        stream: 'audio',
      });
      return this.#bridgeHttpUrl(path);
    },
    status: () => this.#invoke(PgmReturnStatusChannel, undefined),
    onStatusChanged: (handler: (status: readonly PgmReturnStatus[]) => void) =>
      this.#pgmReturnSubs.add(handler),
  };

  // R-021 stage 2a — the fixed-bank wire contract (facts only; verb
  // derivation is the renderer's ONE function, design (f)/(g)).
  readonly fixedLayers = {
    config: () => this.#invoke(FixedLayersConfigChannel, undefined),
    setConfig: (req: ChannelRequest<typeof FixedLayersSetConfigChannel>) =>
      this.#invoke(FixedLayersSetConfigChannel, req),
    // `MULTI-CHANNEL-01` — every declared bank, and the plural door that sets them.
    banks: () => this.#invoke(FixedLayersBanksChannel, undefined),
    setBanks: (req: ChannelRequest<typeof FixedLayersSetBanksChannel>) =>
      this.#invoke(FixedLayersSetBanksChannel, req),
    onBanksChanged: (handler: (banks: FixedLayerBank[]) => void) =>
      this.#fixedBanksSubs.add(handler),
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
    // `MEDIA-PLATES-01` §1.E — each seated clip's clock, from the server's own report.
    mediaState: () => this.#invoke(LiveLayersMediaStateChannel, undefined),
    onMediaStateChanged: (handler: (state: MediaPlateState[]) => void) =>
      this.#mediaStateSubs.add(handler),
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
  // browsers imported); the browser-local `#library` (B-085) is the OFFLINE
  // display copy — a read that cannot reach the bridge answers from it rather
  // than rejecting, the same display-only degradation the stack snapshot uses.
  readonly templates = {
    get: async (req: ChannelRequest<typeof TemplatesGetChannel>) => {
      if (this.#status === 'live') {
        try {
          // `CENTRAL-BRIDGE-01` — the bridge's answer stands, `null` included: there is no
          // local-only template any more (an import needs the bridge).
          return await this.#invoke(TemplatesGetChannel, req);
        } catch {
          /* mid-flight drop — answer from the retained copy below */
        }
      }
      return this.#library.get(req.templateId, req.channel);
    },
    // `CHANNEL-TEMPLATES-01` — a channel's own list when one is named; the station-wide one when not.
    list: async (req?: ChannelRequest<typeof TemplatesListChannel>) => {
      if (this.#status === 'live') {
        try {
          return await this.#invoke(TemplatesListChannel, req);
        } catch {
          /* mid-flight drop — answer from the retained copy below */
        }
      }
      return this.#library.list(req?.channel);
    },
    /*
      🔴 `RELEASE-091-01` §1 (`B-288`) — THE BRIDGE FIRST, this browser's copy only when the bridge
      cannot be reached. It was a local read ("the page is already here; never a bridge round
      trip"), which is exactly why a template imported anywhere else could not be rehearsed here.
      Unreachable means: the link is not live, the request failed in flight, or the bridge does not
      know the route (an older bridge) — never a bridge that ANSWERED it holds no page.
    */
    page: async (templateId: string, channel?: number): Promise<PvwPage> => {
      let answer: BridgePageAnswer = 'unreachable';
      if (this.#status === 'live') {
        try {
          answer = await this.#invoke(TemplatesPageChannel, {
            templateId,
            ...(channel !== undefined && { channel }),
          });
        } catch {
          answer = 'unreachable';
        }
      }
      return pvwPageSource(answer, this.#library.html(templateId, channel));
    },
    /*
      🔴 `CENTRAL-BRIDGE-01` (`B-294`) — **AN IMPORT AND A REMOVAL ARE THE BRIDGE'S, OR THEY DO NOT
      HAPPEN.** Both used to land in this console's own library first, "the source of truth", so an
      import worked offline and was re-delivered on the next connect — and with several consoles on
      one bridge, a copy that lands later is a copy that can overwrite. Now the bridge decides; this
      console's copy follows what it accepted, for display. Offline, nothing is changed and the
      operator is told so (`R-006`: an operator who believes a change is queued will not redo it).
    */
    import: async (req: ChannelRequest<typeof TemplatesImportChannel>) => {
      if (this.#status !== 'live') throw new Error(TEMPLATE_IMPORT_NEEDS_BRIDGE);
      const res = await this.#invoke(TemplatesImportChannel, req);
      await this.#library.import(req.template, req.html, req.channel).catch(() => {
        /* the display copy is best-effort; the bridge holds the template */
      });
      return res;
    },
    remove: async (req: ChannelRequest<typeof TemplatesRemoveChannel>) => {
      // The bridge is authoritative for refuse-while-referenced (it holds the true stack).
      if (this.#status !== 'live') throw new Error(TEMPLATE_REMOVE_NEEDS_BRIDGE);
      const res = await this.#invoke(TemplatesRemoveChannel, req);
      if (res.ok) {
        await this.#library.delete(req.templateId, req.channel).catch(() => {
          /* the display copy is best-effort */
        });
      }
      return res;
    },
    // R-028 (o1) — the bridge pushes the full catalogue on every change, so
    // operator B's Library re-lists the moment operator A imports.
    onChanged: (handler: (templates: TemplateInfo[]) => void): Unsubscribe =>
      this.#templatesSubs.add(handler),
    onActed: (handler: (act: TemplateAct) => void): Unsubscribe =>
      this.#templatesActedSubs.add(handler),
  };

  readonly audit = {
    recent: (req: ChannelRequest<typeof AuditRecentChannel>) =>
      this.#invoke(AuditRecentChannel, req),
    // `CONSOLE-POLISH-01` (`R-083`) — the Log, a page at a time, and the rows recorded since.
    page: (req: ChannelRequest<typeof AuditPageChannel>) => this.#invoke(AuditPageChannel, req),
    onAppended: (handler: (entry: AuditEntry) => void): Unsubscribe =>
      this.#auditAppendedSubs.add(handler),
    // B-141 — the positive control the panel reads beside the tail, so an empty
    // list can be reported as a quiet session only when the instrument that
    // produced it is provably live.
    health: () => this.#invoke(AuditHealthChannel, {}),
    /*
      🔴 `CENTRAL-BRIDGE-01` §1 A — **CG BRIDGE'S LOGS, DOWNLOADED.** They live on the Playout
      machine now (`%ProgramData%\CG Bridge\logs\`), so "Open log folder" became a download: a
      station admin asks the bridge for a one-use link and the browser saves `logs.zip`. Offered
      whenever this console is connected; the bridge refuses anyone but a station admin.
    */
    canDownloadLogs: (): boolean => this.#status === 'live',
    downloadLogs: async (): Promise<{ accepted: boolean; message?: string }> => {
      try {
        const { path } = await this.#invoke(ipcChannels.BridgeLogsTicketChannel, undefined);
        this.#openFromBridge(path);
        return { accepted: true };
      } catch (err) {
        return { accepted: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  /** `TEXT-DIGITS-01` — the keyboard language, from CG Control's shell (never the socket). */
  readonly keyboard = {
    reportsLanguage: (): boolean => shellReportsKeyboardLanguage(),
    language: (): Promise<unknown> => shellKeyboardLanguage(),
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

  /** `R-062` gap 2 — the channel-discovery call, and the bridge's per-console push of it. */
  readonly stationChannels = {
    list: () => this.#invoke(StationChannelsListChannel, undefined),
    onChanged: (handler: (state: StationChannels) => void) =>
      this.#stationChannelsSubs.add(handler),
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
    onConfigChanged: (handler: (catalog: ConsoleSourceCatalog) => void) =>
      this.#sourceCatalogSubs.add(handler),
    assignments: () => this.#invoke(SourcesAssignmentsChannel, undefined),
    setAssignments: (req: ChannelRequest<typeof SourcesSetAssignmentsChannel>) =>
      this.#invoke(SourcesSetAssignmentsChannel, req),
    onAssignmentsChanged: (handler: (assignments: SourceAssignments) => void) =>
      this.#sourceAssignmentSubs.add(handler),
    // `PLAYOUT-SOURCES-01` — the picker's two reads.
    mediaSearch: (req: ChannelRequest<typeof SourcesMediaSearchChannel>) =>
      this.#invoke(SourcesMediaSearchChannel, req),
    refresh: () => this.#invoke(SourcesRefreshChannel, undefined),
    // `MEDIA-PLATES-01` §1.A — a bound clip's Loop and When hidden, station-wide.
    setMediaPlayback: (req: ChannelRequest<typeof SourcesSetMediaPlaybackChannel>) =>
      this.#invoke(SourcesSetMediaPlaybackChannel, req),
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
