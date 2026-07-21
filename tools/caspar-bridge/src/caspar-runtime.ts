import {
  isLiveState,
  LayerManager,
  OutOfLayersError,
  Reconciler,
  RedundancyAdapter,
  ServerSession,
  UnknownTemplateTypeError,
  type FailoverEvent,
  type ServerLabel,
} from '@cg/caspar-client';
import type {
  AuditEntry,
  FieldValues,
  Position,
  RetainedStackItem,
  StackItemState,
} from '@cg/shared-schema';
import type {
  ChannelResponse,
  ConnectionConfig,
  ConnectionHealth,
  ConnectionsSetConfigChannel,
  LockState,
  OrphanLayer,
  OwnedOccupancyWarning,
  PendingUpdate,
  Settings,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CommandBuilder, type CommandSlot } from './command-builder.js';
import { OrphanTracker } from './orphan-tracker.js';
import { TemplateRegistry } from './template-registry.js';
import {
  TemplateHttpServer,
  deriveServeOptions,
  isLoopbackHost,
  type TemplateServeOptions,
  type TemplateServeOverride,
} from './template-http-server.js';

/** R-010 — the `connections.set-config` response shape. */
type SetConfigResult = ChannelResponse<typeof ConnectionsSetConfigChannel>;

/**
 * R-010 — where the OSC UDP ingest binds, derived from the declared server's
 * locality exactly like the template serve path: a LOCAL CasparCG pushes OSC
 * to loopback; a REMOTE one pushes across the LAN, so the ingest must bind a
 * routable interface or confirmations never arrive (render-but-never-confirm,
 * the half-plumbed-remote gap found in the R-010 diagnosis). Data plane only —
 * the control WebSocket bind is not derived from any of this.
 */
export function deriveOscBindHost(serverHost: string): string {
  return isLoopbackHost(serverHost) ? '127.0.0.1' : '0.0.0.0';
}

/** CasparCG video channel the bridge drives (Phase 2: single channel). */
const DEFAULT_CHANNEL = 1;
/** Outbound delta coalescing window (Phase-2 NOTE — bound publishes under churn). */
const COALESCE_MS = 20;
/** Keep the post-reconnect resync window short so the bridge is responsive. */
const RESYNC_MS = 150;
/**
 * B-044 — bounded completion for transient intents (update/out): if the
 * command's AMCP ack has not arrived within this window, the Reconciler
 * expires the intent to the explicit `unconfirmed` state (never a stuck
 * `updating`/`exiting` badge, never a silent revert).
 */
const INTENT_TIMEOUT_MS = 5000;
/**
 * R-009 — orphan-sweep cadence: how often the bridge samples the primary's
 * OSC occupancy tap and compares it against the layers it owns. Zero AMCP
 * traffic per sweep (the tap is passive); an orphan surfaces within two
 * cycles (~10 s worst case at the default).
 */
const SWEEP_MS = 5000;
/**
 * R-009 — an occupancy entry older than this is treated as unoccupied: real
 * CasparCG goes SILENT for a CLEARed layer (B-053) rather than reporting
 * `empty`, so ageing-out IS the empty signal. Far above the wire's per-tick
 * repetition (~50 Hz), far below the sweep cadence doubling.
 */
const OCCUPANCY_STALE_MS = 2500;

/** Minimal typed pub-sub backing the bridge's `on*` publish channels. */
class Emitter<T> {
  readonly #handlers = new Set<(value: T) => void>();
  subscribe(handler: (value: T) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }
  emit(value: T): void {
    for (const handler of [...this.#handlers]) handler(value);
  }
}

/**
 * **Real** C-001 backing. Replaces the throwaway in-memory `RuntimeBacking` with
 * the actual `@cg/caspar-client` stack running in its native Node tier: one
 * `ServerSession` per DECLARED server (A always, B only when the config
 * declares a backup — B-046) under a `RedundancyAdapter` (Phase 3a), a
 * `Reconciler` (the single source of truth for stack state), a `LayerManager`
 * (slot allocation), and the `CommandBuilder` seam.
 *
 * Browser-side everything is unchanged: this answers the same `@cg/shared-ipc`
 * contract `bridge.ts` routes, exposes the same `*Changed` emitters, and the
 * `Reconciler.snapshot()` is published over `StackStateChangedChannel`.
 *
 * Stack state comes from the Reconciler, driven by AMCP acks AND real OSC
 * confirmations from the **current primary** — NOT a hand-rolled state machine.
 * Failover (auto per the strategy's triggers, or manual via `connections.failover`)
 * switches the live server; the published `ConnectionHealth` reflects the real
 * current primary + last failover, and the new primary's OSC re-confirms state.
 * Non-playout channels (lock / templates / audit / settings / update gate) stay
 * simple in-memory stubs.
 *
 * Integration-tested ONLY against `tools/amcp-mock` (NOT real hardware — the
 * on-hardware AMCP-sequence validation is Phase 3b).
 */
export class CasparRuntime {
  readonly stackChanged = new Emitter<readonly StackItemState[]>();
  readonly healthChanged = new Emitter<ConnectionHealth>();
  readonly lockChanged = new Emitter<LockState>();
  readonly settingsChanged = new Emitter<Settings>();
  readonly updateChanged = new Emitter<PendingUpdate | null>();
  /** R-010 — emitted after every successful `setConfig` apply. */
  readonly configChanged = new Emitter<ConnectionConfig>();
  /** R-009 — emitted ONLY when the surfaced orphan-layer set changes. */
  readonly orphansChanged = new Emitter<OrphanLayer[]>();
  /** B-056 — emitted ONLY when the owned-slot warning set changes. */
  readonly ownedOccupancyChanged = new Emitter<OwnedOccupancyWarning[]>();

  // R-010 — mutable: `setConfig` swaps the whole connection layer at runtime.
  #config: ConnectionConfig;
  /** One session per DECLARED server (B-046: B exists only when configured). */
  #sessions: { A: ServerSession; B?: ServerSession };
  #adapter: RedundancyAdapter;
  readonly #reconciler = new Reconciler();
  readonly #layers = new LayerManager();
  readonly #builder = new CommandBuilder();

  /**
   * itemId → the slot RESERVED for it (so take/update/out target it). Set at load,
   * retained through out (the item is still on the stack, idle), deleted at remove.
   */
  readonly #slots = new Map<string, CommandSlot>();
  /**
   * B-039 — itemIds whose slot currently has a LIVE producer (a `CG ADD` succeeded
   * and no later `CLEAR` destroyed it). The prescriptive signal: `take` plays when
   * present, else re-issues `CG ADD` (a fresh load) before `CG PLAY`. Server-agnostic
   * (mirror-sync fans out ADD/CLEAR to both, so existence matches on each).
   * B-054 — invalidated wholesale whenever a declared session completes an AMCP
   * reconnect cycle (see #wireAdapter): a restarted CasparCG comes back with
   * EMPTY layers, so this memory would otherwise be a lie and the next take
   * would bare-PLAY nothing.
   */
  readonly #loaded = new Set<string>();
  /**
   * Reconnect-reconciliation — layers this process has CLEARed at least once
   * (adoption, out, remove), i.e. layers whose producer state the bridge KNOWS.
   * The first `CG ADD` onto a layer not in this set is preceded by a `CLEAR`
   * ("adoption"), destroying any producer a previous bridge session orphaned
   * there BEFORE the item's slot/OSC interest bind — the orphan's state can
   * never route to the fresh item. Deliberately NOT a startup sweep: an orphan
   * on a layer no load targets stays on air (on-air safety — a cold bridge
   * cannot tell junk from a graphic ridden through a controller restart).
   */
  readonly #adopted = new Set<string>();
  /**
   * B-056 — owned-slot occupancy warnings, keyed `ch:layer` (a layer has at
   * most one owner). Raised at load time when the adopt-CLEAR missed the
   * current primary while the primary's occupancy tap OBSERVED the layer
   * non-empty; resolved only on provable events (a CLEAR landing on the
   * primary — every `#markAdoptedOnPrimary` site — the item's removal, or a
   * server swap). Never resolved optimistically; never triggers a CLEAR.
   */
  readonly #ownedOccupancy = new Map<string, OwnedOccupancyWarning>();
  /**
   * B-094 — the last PUBLISHED answer to "have we ever heard OSC from the current
   * primary?", so the sweep can re-publish health when it flips.
   *
   * Health is otherwise emitted only on adapter health / failover / setConfig
   * events, and OSC starting or stopping is none of those — so without this the
   * NO OSC indicator would appear or clear only when something unrelated happened
   * to change. `null` = nothing published yet.
   */
  #lastPublishedOscHeard: boolean | null = null;
  /**
   * R-011 — itemId → the operator's on-air position override. Appended as a
   * query onto the RESOLVED served URL in #sendAdd (never a bare id — the
   * B-064 serve contract is untouched). Process-memory like #slots; survives
   * setConfig (an operator placement is not server knowledge), deleted at
   * remove. The manifest default stays OPAQUE to the bridge — the runtime
   * reads it from the scene inside the served HTML; the bridge only ever
   * knows explicit operator overrides.
   */
  readonly #positions = new Map<string, Position>();
  /**
   * B-092 — restored items awaiting their adopt-vs-re-ADD decision.
   *
   * Retained stack intent arrives when the SPA reconnects, which on a bridge
   * restart is BEFORE the fresh CasparCG session has handshaken — and the OSC
   * occupancy tap (the only thing that can tell "the graphic is still on air"
   * from "the layer is empty") is empty until the session drains its resync.
   * So `restore()` seeds state and parks the item here; the decision is taken
   * where occupancy is knowable — the transition INTO `healthy`, or inline when
   * the session is already healthy and the tap is warm.
   *
   * Nothing is sent to CasparCG for an item while it sits here: the row is back
   * on the operator's stack, and the wire is untouched until we can prove what
   * is on the layer.
   */
  readonly #pendingRestore = new Map<
    string,
    { slot: CommandSlot; templateId: string; fields: FieldValues }
  >();
  #seq = 0;
  #lastFailover: ConnectionHealth['lastFailover'] = undefined;

  // Coalescing (Phase-2 NOTE): collapse per-itemId changes into bounded publishes.
  readonly #dirty = new Set<string>();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  // B-044 — per-seq expiry timers for in-flight transient intents (update/out).
  readonly #expiryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // R-009 — the periodic orphan sweep: unref'd interval armed in start(),
  // cleared in stop() (the B-053 dispose caution); the tick reads the
  // CURRENT primary dynamically, so failover/setConfig need no rewiring.
  #sweepTimer: ReturnType<typeof setInterval> | null = null;
  readonly #sweepMs: number;
  readonly #occupancyStaleMs: number;
  readonly #orphanTracker = new OrphanTracker();

  // ── non-playout stub state ──────────────────────────────────────────
  // B-038 Phase 2 — holds each imported template's info + the browser-produced
  // self-contained HTML, keyed by id. B-038 Phase 3 — the HTTP server serves that
  // HTML at `/template/<id>`, so `CG ADD` can reference a real, loadable URL.
  readonly #templates = new TemplateRegistry();
  readonly #templateServer: TemplateHttpServer;
  #serveOptions: TemplateServeOptions;
  /** Kept for `setConfig`'s serve re-derivation (explicit overrides keep winning). */
  readonly #serveOverride: TemplateServeOverride;
  /**
   * fix-setconfig-serve-restart — TRUE once `startServing()` has run for
   * this process: serving is INTENDED, so every apply must leave the
   * template server genuinely listening (or say `apply-failed`), and a load
   * while it is down must fail loudly — never ship a bare id. Replaces the
   * old transient `listening` snapshot, which read FALSE mid-teardown and
   * let a concurrent apply skip the restart entirely.
   */
  #servingDesired = false;
  /** fix-setconfig-serve-restart — applies are SERIALIZED; see setConfig(). */
  #applyInFlight = false;
  #lock: LockState = { engaged: false };
  #lockPin: string | null = null;
  #audit: AuditEntry[] = [];
  #settings: Settings = { telemetry: 'off' };
  #pendingUpdate: PendingUpdate | null = null;

  #started = false;
  readonly #intentTimeoutMs: number;
  /**
   * TEST-ONLY seam (B-100): per-`ServerSession` health-timer overrides. Empty in
   * production, so the ServerSession defaults apply. A test uses it to drive and
   * HOLD a session in `degraded` (OSC-silent, AMCP up) deterministically — the
   * state the reachability predicate must count as reachable.
   */
  readonly #sessionTuning: {
    oscDegradedAfterMs?: number;
    oscDownAfterMs?: number;
    watcherIntervalMs?: number;
  };

  constructor(
    config: ConnectionConfig,
    serveOverride: TemplateServeOverride = {},
    options: {
      intentTimeoutMs?: number;
      sweepMs?: number;
      occupancyStaleMs?: number;
      /** TEST-ONLY seam: inject a template server (e.g. one whose start() fails). */
      templateServer?: TemplateHttpServer;
      /** TEST-ONLY seam (B-100): override each session's OSC health timers. */
      sessionTuning?: {
        oscDegradedAfterMs?: number;
        oscDownAfterMs?: number;
        watcherIntervalMs?: number;
      };
    } = {},
  ) {
    this.#intentTimeoutMs = options.intentTimeoutMs ?? INTENT_TIMEOUT_MS;
    this.#sweepMs = options.sweepMs ?? SWEEP_MS;
    this.#occupancyStaleMs = options.occupancyStaleMs ?? OCCUPANCY_STALE_MS;
    this.#sessionTuning = options.sessionTuning ?? {};
    this.#templateServer =
      options.templateServer ?? new TemplateHttpServer((id) => this.#templates.html(id));
    this.#config = config;
    this.#serveOverride = serveOverride;
    // B-038 Phase 3 — serve loopback when CasparCG is local; an opt-in routable
    // host (configured or guessed) when remote. The control WS stays loopback.
    this.#serveOptions = deriveServeOptions(config.servers.A.host, serveOverride);
    // B-046 — only DECLARED servers get a session: no phantom backup, no
    // reconnect churn, no divergence noise under the single-server default.
    this.#sessions = this.#buildSessions(config);
    this.#adapter = new RedundancyAdapter({
      strategy: config.strategy,
      sessions: this.#sessions,
      initialPrimary: 'A',
      autoFailoverEnabled: config.autoFailoverEnabled,
    });
  }

  /**
   * Construct one `ServerSession` per declared server. Pure (no I/O —
   * connecting happens in `start()`). R-010 — the OSC bind derives from each
   * server's locality exactly like the template serve path: a LOCAL CasparCG
   * pushes OSC to loopback; a REMOTE one pushes across the LAN, so the ingest
   * must bind a routable interface or confirmations never arrive
   * (render-but-never-confirm). Data-plane only; the control WS bind is
   * untouched by any of this.
   */
  #buildSessions(config: ConnectionConfig): { A: ServerSession; B?: ServerSession } {
    const session = (name: ServerLabel, ep: ConnectionConfig['servers']['A']): ServerSession =>
      new ServerSession({
        name,
        host: ep.host,
        port: ep.amcpPort,
        oscPort: ep.oscPort,
        oscBindHost: deriveOscBindHost(ep.host),
        resyncDurationMs: RESYNC_MS,
        // TEST-ONLY (B-100): empty in production, so ServerSession defaults hold.
        ...this.#sessionTuning,
      });
    return {
      A: session('A', config.servers.A),
      ...(config.servers.B !== undefined ? { B: session('B', config.servers.B) } : {}),
    };
  }

  /**
   * Bind the CURRENT sessions/adapter to the Reconciler + health surface.
   * Called from `start()` and again after every `setConfig` rebuild (the old
   * listeners die with the old session/adapter objects).
   */
  #wireAdapter(): void {
    // OSC firehose → Reconciler, but only from the **current primary** — the
    // backup mirrors the same commands, so after a failover the new primary's
    // OSC re-confirms state. Each OscTransport already ran interest →
    // rate-limit → change-track and handed us typed events.
    for (const label of ['A', 'B'] as const) {
      const session = this.#sessions[label];
      if (session === undefined) continue;
      session.osc.on('events', (events) => {
        if (this.#adapter.currentPrimary !== label) return;
        for (const event of events) this.#reconciler.applyOsc(event);
      });
      // B-054 — 'healthy' fires only when a session completes a full AMCP
      // (re)connect cycle (never on degraded→healthy OSC recovery): the
      // server behind it may have restarted with EMPTY layers, so producer
      // existence can no longer be vouched for. Clear wholesale — commands
      // fan out to every declared server, so the next take's B-039 re-ADD
      // heals whichever side lost its producers and benignly stage-replaces
      // on one that kept them. Sends nothing itself; #adopted stays (a
      // restarted server's layers are empty — the skipped adopt-CLEAR is a
      // no-op by construction).
      session.on('healthy', () => {
        if (this.#sessions[label] !== session) return; // torn-down era
        this.#loaded.clear();
      });
      // B-086 — honest ON AIR across a CasparCG link-loss. The CURRENT PRIMARY's
      // OSC is what verifies on-air claims, so its link state drives the
      // reconciler's "unverifiable" display. B-100 note: this demote keys on the
      // primary LEAVING `healthy` (OSC silence included), which since B-100 is a
      // DIFFERENT condition from the on-air REFUSAL `#noServerReachable()` (which
      // stays false while a `degraded` server is still reachable). They coincided
      // under the old predicate; now honesty is the display's job and reachability
      // is the refusal's — the operator is WARNED on silence, not BLOCKED:
      //   LEFT 'healthy'  → on-air/played items re-publish as UNVERIFIED
      //                     ("WAS ON AIR", muted) — the wire can't back them.
      //   INTO 'healthy'  → clear the flag AND reconcile against real occupancy
      //                     (this fires AFTER the RESYNCING OSC drain, and on a
      //                     degraded→healthy recovery — both have occupancy
      //                     populated): a still-occupied layer restores ON AIR
      //                     via resumed OSC; a silent layer (producer gone) resets
      //                     to IDLE. The two calls coalesce into one publish, so an
      //                     emptied item never flashes red.
      session.on('state-change', ({ from, to }) => {
        if (this.#sessions[label] !== session) return; // torn-down era
        if (this.#adapter.currentPrimary !== label) return; // only the primary feeds the reconciler
        if (to === 'healthy') {
          this.#reconciler.setLinkDown(false);
          const occupiedKeys = new Set(
            session.osc.occupancy
              .occupied(this.#occupancyStaleMs)
              .map((o) => `${String(o.channel)}:${String(o.layer)}`),
          );
          // B-092 — decide the pending RESTORES here, against this same drained
          // occupancy sample, and BEFORE `reconcileOnReconnect`. This is the
          // only point where the answer exists: the tap resets on resync and
          // refills during the RESYNCING drain, so at the SPA's reconnect (when
          // the intent arrived) it was empty. Ordering is load-bearing twice
          // over: `transitionTo` emits this BEFORE `emit('healthy')`, so we run
          // before that handler clears `#loaded`; and every record mutation
          // inside is SYNCHRONOUS (only the CG ADD is awaited), so the
          // `reconcileOnReconnect` on the next line iterates a settled
          // reconciler — a re-ADDed item already reads `played: false` and is
          // correctly left alone by it.
          const heard = session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs);
          void this.#decidePendingRestores(occupiedKeys, heard);
          // The SAME blind-tap distinction applies here, and this path had the
          // bug too: `reconcileOnReconnect` resets a `played` item to IDLE when
          // its slot is not in `occupiedKeys`, treating silence as proof the
          // producer is gone (B-053). From a tap that has never heard any OSC
          // that is not proof of anything — it would report a genuinely LIVE
          // graphic as idle, on a link that is UP. Skipping is the honest move:
          // items keep their last known state (B-086's `unverified` demotion
          // from the drop still stands) rather than being falsely reset, and the
          // sweep reconciles for real once OSC arrives.
          if (heard) {
            this.#reconciler.reconcileOnReconnect(occupiedKeys);
          } else {
            // …and while blind, NO on-air claim is verifiable — not just the
            // restored ones. Skipping the reconcile alone would leave a played
            // item that is genuinely gone sitting on a confident red ON AIR
            // (its ack floor), because `setLinkDown(false)` has just cleared the
            // only demotion that was covering it. The link being UP is exactly
            // what makes that insidious: a green health pill beside a red claim
            // nothing can back. Mark every played item unverifiable instead —
            // the same honest answer B-086 gives when the link drops, for the
            // same reason: the verification channel is dead.
            for (const item of this.#reconciler.snapshot()) {
              if (item.status === 'on-air' || item.status === 'playing') {
                this.#reconciler.setUnverifiable(item.itemId, true);
                this.#markDirty(item.itemId);
              }
            }
          }
        } else if (from === 'healthy') {
          this.#reconciler.setLinkDown(true);
        }
      });
    }

    // Real health + failover from the adapter — replaces the Phase-1/2 mock health.
    this.#adapter.on('health', () => this.healthChanged.emit(this.health()));
    this.#adapter.on('failover-complete', (event: FailoverEvent) => {
      this.#lastFailover = {
        at: new Date(event.at).toISOString(),
        reason: event.reason,
        from: event.from,
        to: event.to,
      };
      this.healthChanged.emit(this.health());
    });
  }

  /** Wire the stack and connect the declared sessions. Idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;

    this.#reconciler.on('item-changed', (state) => this.#markDirty(state.itemId));
    this.#reconciler.on('item-removed', (info) => this.#markDirty(info.itemId));

    this.#wireAdapter();

    // R-009 — arm the orphan sweep. Unref'd so it never keeps the process
    // alive; the tick self-gates on the primary session's health.
    this.#sweepTimer = setInterval(() => {
      this.#sweepOccupancy();
    }, this.#sweepMs);
    this.#sweepTimer.unref?.();

    this.#sessions.A.start();
    this.#sessions.B?.start();
  }

  /**
   * B-038 Phase 3 — start the template HTTP server (`GET /template/<id>` → the
   * retained HTML). Idempotent. After this, `load()` issues `CG ADD` with the
   * served URL instead of the bare template id.
   */
  async startServing(): Promise<void> {
    // Serving is now INTENDED for the life of the process — every later
    // apply must restart it (or fail loudly), and #sendAdd must never fall
    // back to a bare id (fix-setconfig-serve-restart).
    this.#servingDesired = true;
    await this.#templateServer.start(this.#serveOptions);
  }

  /** The template HTTP serve address once serving (B-038 Phase 3), else null. */
  get templateServe(): { serveHost: string; port: number; bindHost: string } | null {
    return this.#templateServer.listening
      ? {
          serveHost: this.#templateServer.serveHost,
          port: this.#templateServer.port,
          bindHost: this.#serveOptions.bindHost,
        }
      : null;
  }

  /** The served URL for a template id (the `CG ADD` arg), or null if not serving. */
  templateServeUrl(templateId: string): string | null {
    return this.#templateServer.listening ? this.#templateServer.urlFor(templateId) : null;
  }

  async stop(): Promise<void> {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    if (this.#sweepTimer !== null) clearInterval(this.#sweepTimer);
    this.#sweepTimer = null;
    for (const timer of this.#expiryTimers.values()) clearTimeout(timer);
    this.#expiryTimers.clear();
    await Promise.all([this.#sessions.A.stop(), this.#sessions.B?.stop() ?? Promise.resolve()]);
    await this.#templateServer.stop();
  }

  /** Which server is currently the live primary. */
  get currentPrimary(): ServerLabel {
    return this.#adapter.currentPrimary;
  }

  /** The current primary's bound OSC port (0 until bound). Diagnostic. */
  get oscPort(): number {
    return this.#adapter.primarySession.osc.port;
  }

  /**
   * Resolves when ALL DECLARED sessions reach HEALTHY — A alone under a
   * single-server config, both under a mirror pair (B-046: the old
   * both-always contract could never resolve without a real backup).
   */
  whenServerHealthy(timeoutMs = 5000): Promise<void> {
    const sessions: ServerSession[] = [
      this.#sessions.A,
      ...(this.#sessions.B !== undefined ? [this.#sessions.B] : []),
    ];
    const allHealthy = (): boolean => sessions.every((s) => s.state === 'healthy');
    if (allHealthy()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        for (const s of sessions) s.off('healthy', check);
      };
      const check = (): void => {
        if (allHealthy()) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('declared CasparCG server(s) did not reach HEALTHY in time'));
      }, timeoutMs);
      for (const s of sessions) s.on('healthy', check);
      check();
    });
  }

  // ── stack (real: Reconciler + AMCP via the seam) ────────────────────

  /**
   * B-072 — the item state as PUBLISHED to the renderer: the Reconciler's
   * snapshot joined with the operator's stored position overrides.
   *
   * Ownership deliberately does not move. The Reconciler owns reconciled item
   * state (it answers to acks and OSC, and a position override is neither);
   * `#positions` stays operator UI state owned here. They meet only at the
   * point of publication, which is the ONLY place both are needed. Every
   * renderer-facing exit — `stackSnapshot()` and the `stackChanged` push —
   * goes through here; internal `#reconciler.snapshot()` callers stay raw.
   *
   * `remove()` already drops the override, so a removed item's state simply
   * has no `position`: delete-on-remove is inherited, not re-implemented.
   */
  #published(): readonly StackItemState[] {
    return this.#reconciler.snapshot().map((item) => {
      const position = this.#positions.get(item.itemId);
      return position === undefined ? item : { ...item, position };
    });
  }

  stackSnapshot(): readonly StackItemState[] {
    return this.#published();
  }

  async load(
    itemId: string,
    templateId: string,
    fields: FieldValues,
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'load', itemId, templateId, fields }, seq);

    // Reconnect-reconciliation — never blind-ADD a URL the bridge can't serve:
    // an unregistered template is a visible failed load. (Real CasparCG would
    // 202 the ADD without fetching and CEF-load the 404 page — a silent blank
    // on air; the guard is what makes the failure loud.)
    if (!this.#templates.has(templateId)) {
      this.#reconciler.applyAck(seq, false, 'unknown-template');
      return { accepted: false, errorCode: 'unknown-template' };
    }

    let slot: CommandSlot;
    try {
      slot = this.#allocate(templateId);
    } catch (err) {
      // C-014 — say WHY the range is exhausted: a range eaten by QUARANTINED
      // (foreign-occupied) layers is a different operator situation from a
      // genuinely full range — the former cannot be freed from this console
      // (R-015 forbids clearing foreign layers), the latter can (Remove
      // something). The code rides the ack AND the response (B-070) so the
      // Library's Load toast can say it.
      const foreignBlocked = err instanceof OutOfLayersError && err.quarantinedInRange > 0;
      const code = foreignBlocked ? 'no-layer-foreign-occupied' : 'no-layer';
      this.#reconciler.applyAck(seq, false, code);
      return { accepted: false, errorCode: code };
    }

    // B-100 — evaluate reachability ONCE, here, and gate BOTH the destructive
    // adopt-CLEAR and the constructive pre-roll ADD on this single value. The two
    // used to be independent reads of the predicate with an await between them, so
    // a session slipping state in the gap could land the CLEAR yet skip the ADD —
    // CLEAR-then-nothing, a BLACK layer. One evaluation makes the pairing structural:
    // if the CLEAR can reach the wire, the ADD is attempted; neither, or both.
    const reachable = !this.#noServerReachable();

    // Reconnect-reconciliation — adopt the layer BEFORE binding the slot/OSC
    // interest: destroy any producer a previous bridge session orphaned there,
    // so its OSC state can never route to this fresh item. The CLEAR is issued
    // ONLY when a server is reachable (B-100): a CLEAR that lands with no following
    // ADD is exactly the black-layer window this pairing exists to close.
    const { adopted } = await this.#adoptLayer(slot, reachable);

    // The adopt-CLEAR awaited a real AMCP round-trip — a remove() may have
    // landed meanwhile and, finding no slot yet, cleaned up nothing. If the
    // item is gone, release the layer and bail instead of binding a ghost
    // slot/interest and ADDing an ownerless producer.
    if (this.#reconciler.get(itemId) === null) {
      this.#layers.deallocate(slot);
      return { accepted: false };
    }

    this.#slots.set(itemId, slot);
    this.#reconciler.assignSlot(itemId, { ...slot, server: 'primary' });
    // Interest on every declared session's OSC so whichever is primary, its
    // confirmations pass the filter (survives failover).
    this.#addInterest(slot);

    // B-056 — the adopt-CLEAR did NOT land on the current primary (backup-only
    // success, or a failed CLEAR): if the primary's occupancy tap OBSERVES the
    // layer non-empty, a previous session's producer is visibly live on the
    // primary output under this item's own layer — warn the operator. Sampled
    // BEFORE our own ADD (after it, an owned-layer producer report is
    // indistinguishable from our own). Purely additive: the load proceeds
    // exactly as before either way. Unknown occupancy (tap silent/stale)
    // deliberately does NOT warn — observed occupancy only (design §3).
    if (!adopted) this.#detectOwnedOccupancy(slot, itemId);

    // B-082 — a load is NOT an on-air action, so a dead link is not a load FAILURE.
    // With no reachable server there is simply nothing to pre-roll: skip the `CG ADD`
    // instead of attempting it and failing. Attempting it acked `amcp-send-failed` and
    // parked the row in ERROR — which told the operator "this item is broken" when the
    // only true statement was "the server isn't there". The item stays on the stack at
    // the `loaded` its intent already set, and nothing is on air to hide (no server is
    // reachable), so the Reconciler's "never claim idle/loaded over a live graphic"
    // doctrine is untouched.
    //
    // This is NOT the deferral R-006 forbids: nothing is queued for later delivery. The
    // item just has no live producer — the SAME condition every item is in after a
    // reconnect (`#loaded` is per-server and cleared on drop, :314/:924). `take`/`update`
    // already recover from it by lazily re-issuing the `CG ADD` before the `CG PLAY`
    // (B-039, :606/:660), pulling template + current fields from the Reconciler at the
    // moment of use rather than replaying a stored command. So the item plays normally
    // once the link is back, and until then the on-air verbs stay REFUSED by
    // `#noServerReachable()`. No AMCP verb is added and the ADD→PLAY order is preserved.
    //
    // B-100 — this reads the SAME `reachable` captured above the adopt-CLEAR, so the two
    // decisions can never split: with no server reachable the adopt-CLEAR was skipped too,
    // so we can never leave a layer cleared-and-empty.
    if (!reachable) return { accepted: true };

    // B-039 — `CG ADD` only (play-on-load OFF in the builder): the producer is
    // loaded, NOT playing. The operator's take issues the `CG PLAY`.
    const ok = await this.#sendAdd(itemId, slot, templateId, fields, seq);
    return { accepted: ok };
  }

  /**
   * B-092 — rebuild the stack from the browser's RETAINED intent.
   *
   * The stack otherwise lives ONLY in this process's Reconciler and dies with
   * it: a restarted bridge boots empty, the SPA re-pulls that empty snapshot,
   * and every row the operator built disappears. The browser owns the intent
   * across the death; this puts it back.
   *
   * This method deliberately does NOT go through `load()`. `load()` ADOPTS the
   * layer first — a hard `CLEAR` before its first `CG ADD` there — and on a
   * bridge-ONLY restart (CasparCG still rendering) that CLEAR lands on the LIVE
   * layer: the graphic flashes OFF AIR and comes back merely loaded. That is
   * the broadcast-safety lie this codebase forbids, so the restore is
   * occupancy-aware instead, and it is split in two:
   *
   *   1. HERE: seed the Reconciler, take the retained layer, bind OSC interest,
   *      restore the position override, publish. The rows are back immediately
   *      — before CasparCG is even reachable — and NOTHING is sent to the wire.
   *   2. `#decidePendingRestores`: once real occupancy is knowable, adopt the
   *      layer without clearing it (a producer survived) or re-ADD onto it (the
   *      layer is empty). Neither branch can ever clear a live layer.
   *
   * Skipped, never fatal: an item this bridge ALREADY holds (local intent must
   * never clobber a live bridge's own state — a page reload against a healthy
   * bridge changes nothing), an unregistered template (the SPA re-delivers its
   * library first, so this means the template is genuinely gone), or an
   * exhausted layer range.
   */
  async restore(items: readonly RetainedStackItem[]): Promise<{
    restored: number;
    skipped: number;
  }> {
    // B-086 honesty, applied to seeded records: the reconciler learns `linkDown`
    // from session TRANSITIONS, and a bridge whose CasparCG session has never
    // been healthy has fired none — so without this a restored on-air item
    // would publish the broadcast-red `playing` on a link that reaches nothing.
    // (No ordinary path can hit that: `take` is refused while the link is down,
    // so only a restore can seed play evidence there.)
    //
    // DEMOTE-ONLY, and on the PRIMARY's state — the same signal B-086 demotes
    // on, because only the current primary's OSC can verify an on-air claim.
    // Never the reachability predicate `#noServerReachable()` (which is false whenever
    // ANY server is reachable): in a mirror pair with the primary down and the
    // backup up, clearing the flag here would UN-demote B-086's `unverified`
    // rows back to a confident red ON AIR that nothing verifies. Lifting the
    // flag stays where it belongs — the healthy transition.
    if (this.#adapter.primarySession.state !== 'healthy') this.#reconciler.setLinkDown(true);

    let restored = 0;
    let skipped = 0;
    for (const item of items) {
      // The live bridge wins over the retained copy — never clobber.
      if (this.#reconciler.get(item.itemId) !== null) {
        skipped++;
        continue;
      }
      if (!this.#templates.has(item.templateId)) {
        skipped++;
        continue;
      }
      const slot = this.#slotForRestore(item);
      if (slot === null) {
        skipped++;
        continue;
      }
      if (
        this.#reconciler.restoreItem({
          itemId: item.itemId,
          templateId: item.templateId,
          fields: item.fields,
          played: item.played,
        }) === null
      ) {
        this.#layers.deallocate(slot);
        skipped++;
        continue;
      }
      this.#slots.set(item.itemId, slot);
      this.#reconciler.assignSlot(item.itemId, { ...slot, server: 'primary' });
      this.#addInterest(slot);
      // R-011 — the operator's placement is intent too, and #sendAdd reads it
      // off #positions, so it must be back BEFORE any re-ADD decision runs.
      if (item.position !== undefined) this.#positions.set(item.itemId, item.position);
      this.#pendingRestore.set(item.itemId, {
        slot,
        templateId: item.templateId,
        fields: item.fields,
      });
      this.#markDirty(item.itemId);
      restored++;
    }

    // If the primary session is ALREADY healthy the `to === 'healthy'`
    // transition fired long ago and will not fire again (the late-page-reload
    // case) — but the tap has been filling ever since, so the answer is
    // available right now. Without this branch those items would sit pending
    // forever, visible but never adopted or re-ADDed.
    if (restored > 0 && this.#adapter.primarySession.state === 'healthy') {
      const occupiedKeys = new Set(
        this.#adapter.primarySession.osc.occupancy
          .occupied(this.#occupancyStaleMs)
          .map((o) => `${String(o.channel)}:${String(o.layer)}`),
      );
      await this.#decidePendingRestores(
        occupiedKeys,
        this.#adapter.primarySession.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs),
      );
    }
    return { restored, skipped };
  }

  /**
   * B-092 — the layer a restored item takes. The RETAINED slot is preferred and
   * reserved exactly: it is the layer the surviving producer is actually on, so
   * it is the layer whose occupancy decides adopt-vs-re-ADD. Re-allocating some
   * other free layer would consult the wrong layer's occupancy and could ADD a
   * second producer beside a live one. Falls back to normal allocation when the
   * intent carries no slot or the layer is already taken; `null` when the range
   * is exhausted (the item is skipped, exactly as a load would fail).
   */
  #slotForRestore(item: RetainedStackItem): CommandSlot | null {
    if (item.slot !== undefined) {
      const slot = { channel: item.slot.channel, layer: item.slot.layer };
      if (this.#layers.reserve(slot, item.templateId)) return slot;
    }
    try {
      return this.#allocate(item.templateId);
    } catch {
      return null;
    }
  }

  /**
   * B-092 — resolve every pending restore against REAL occupancy. This is the
   * broadcast-safety core of the change: `occupiedSlotKeys` comes from the OSC
   * occupancy tap (the same sample B-086's reconnect reconcile uses), and
   * silence means unoccupied — real CasparCG goes SILENT for a cleared layer
   * rather than reporting `empty` (B-053), the same contract the orphan sweep
   * relies on.
   *
   *   OCCUPIED → ADOPT WITHOUT CLEARING. A producer survived the bridge's
   *     death: the item is genuinely still on air, so the correct action is to
   *     touch NOTHING. Marking the layer adopted is what guarantees no later
   *     adoption issues the CLEAR that would flash it off air; resumed OSC
   *     re-derives `on-air` by itself from the record's play evidence.
   *   SILENT → RE-ADD as loaded. The producer is gone (bridge AND CasparCG
   *     restarted), so a fresh `CG ADD` puts the item back — still with NO
   *     adopt-CLEAR in front of it.
   *
   *   TAP NEVER HEARD ANY OSC → REFUSE TO DECIDE. Send nothing at all and
   *     publish the item as `unverified`. See below.
   *
   * No branch sends a CLEAR. But "no CLEAR" was never the property worth
   * protecting on its own — KEEPING THE GRAPHIC ON AIR was, and the original
   * design lost it in one case. This comment used to argue that a wrong
   * "silent" verdict was acceptable because a `CG ADD` is only a stage replace.
   * Hardware disproved that (PR #353's probe, captured on the wire): the re-ADD
   * carries play-on-load `0`, so replacing a LIVE producer with a non-playing
   * one takes the graphic OFF AIR. Silently, with no error and no operator
   * signal — the safe path degrading into the unsafe one.
   *
   * The root cause was that an empty tap has two meanings — "this layer is
   * empty" and "I have never heard from the server" — that demand OPPOSITE
   * actions. `hasReceivedOsc` separates them: silence is evidence of emptiness
   * ONLY from a tap that is actually hearing OSC. Otherwise it is evidence of
   * no evidence, and the honest move is to do nothing and say so.
   *
   * Record mutations are synchronous; only the ADD is awaited. The caller at
   * the healthy transition relies on that (see `#wireAdapter`).
   */
  async #decidePendingRestores(
    occupiedSlotKeys: ReadonlySet<string>,
    tapHasReceivedOsc: boolean,
  ): Promise<void> {
    if (this.#pendingRestore.size === 0) return;

    // BLIND TAP — refuse to decide. The items stay pending (so the periodic
    // sweep can decide them if OSC starts arriving), nothing is sent, and every
    // affected row publishes the honest `unverified` instead of an on-air claim
    // nothing can back.
    if (!tapHasReceivedOsc) {
      for (const [itemId, { slot }] of this.#pendingRestore) {
        if (this.#reconciler.get(itemId) === null) continue;
        this.#reconciler.setUnverifiable(itemId, true);
        this.#markDirty(itemId);
        // The one line whoever debugs a blind install will grep for. Says what was
        // NOT done and why, and names the fix — an install in this state looks
        // healthy on AMCP, so the cause is not otherwise discoverable.
        process.stderr.write(
          `[caspar-bridge] restore REFUSED for ${itemId} on ${adoptionKey(slot)}: ` +
            `no OSC has ever arrived, so the layer cannot be verified. Nothing was sent ` +
            `(a re-ADD here would take a live graphic off air). ` +
            `Enable OSC in casparcg.config (predefined-client / UDP port).
`,
        );
      }
      return;
    }

    const pending = [...this.#pendingRestore];
    this.#pendingRestore.clear();

    const adds: Promise<boolean>[] = [];
    for (const [itemId, { slot, templateId, fields }] of pending) {
      // A remove landed between the restore and this decision — the item is
      // gone; its slot was already released by remove(). Nothing to do.
      if (this.#reconciler.get(itemId) === null) continue;
      // We can decide now, so any earlier blind-tap doubt is resolved: drop the
      // `unverified` marker before settling the item either way. (No-op unless a
      // previous, blind pass had set it.)
      this.#reconciler.setUnverifiable(itemId, false);

      if (occupiedSlotKeys.has(adoptionKey(slot))) {
        // Adopted by OBSERVATION, not by a CLEAR — so this deliberately does
        // NOT go through `#markAdoptedOnPrimary`, whose owned-occupancy
        // resolution means "provably cleared". We proved the opposite: there IS
        // a producer, and it is ours.
        this.#adopted.add(adoptionKey(slot));
        continue;
      }

      // Silent layer: no producer survived, so the honest state is `loaded`.
      // Re-creating the record through the ordinary `load` intent is what makes
      // it honest — it resets play evidence, so the item can no longer claim
      // air, and `reconcileOnReconnect` (which runs right after us) correctly
      // leaves it alone. The slot must be re-assigned: a fresh `load` record
      // carries none.
      const seq = this.#nextSeq();
      this.#reconciler.applyIntent({ kind: 'load', itemId, templateId, fields }, seq);
      this.#reconciler.assignSlot(itemId, { ...slot, server: 'primary' });
      adds.push(this.#sendAdd(itemId, slot, templateId, fields, seq));
    }
    await Promise.all(adds);
  }

  /**
   * R-011 — store the operator's per-item position override. Refused while
   * the item is on air or unsettled (the R-010 predicate — `unconfirmed`
   * blocks because the on-air result is UNKNOWN); position is fixed once
   * taken (Option A can't reposition on air without a re-serve flash). A
   * LOADED-not-taken item is re-ADDed immediately — an invisible re-serve
   * with the new query, on a non-intent seq (the take re-ADD precedent) so
   * the item's status is never perturbed; the re-ADD is best-effort (the
   * override is stored regardless and the next ADD carries it). An idle
   * item just stores it for the next load.
   */
  async setPosition(
    itemId: string,
    position: Position,
  ): Promise<{ ok: boolean; reason?: 'on-air' | 'unknown-item' }> {
    const item = this.#reconciler.get(itemId);
    if (item === null) return { ok: false, reason: 'unknown-item' };
    if (
      item.pending ||
      item.status === 'playing' ||
      item.status === 'on-air' ||
      item.status === 'updating' ||
      item.status === 'exiting' ||
      item.status === 'unconfirmed'
    ) {
      return { ok: false, reason: 'on-air' };
    }
    this.#positions.set(itemId, position);
    // B-072 — republish so the renderer learns the applied override. Essential
    // for an IDLE item, whose set-position sends nothing to CasparCG and would
    // otherwise never reach the SPA: the picker would re-seed from the manifest
    // default on the next reselect and an innocent re-Apply would revert it.
    // This is a STATE publish only — no intent, no status change, no wire
    // traffic (the R-011 refusal predicate and the AMCP path are untouched).
    this.#markDirty(itemId);
    const slot = this.#slots.get(itemId);
    if (slot !== undefined && this.#loaded.has(itemId) && this.#templates.has(item.templateId)) {
      await this.#sendAdd(itemId, slot, item.templateId, item.fields, this.#nextSeq());
    }
    return { ok: true };
  }

  /**
   * R-006 — the connection gate the on-air verbs never had.
   *
   * `take`/`update`/`out` must reach CasparCG to mean anything. Issuing one at a dead
   * primary used to apply the intent OPTIMISTICALLY and only then discover the send had
   * failed — which is how an item ends up wearing a status no wire ever confirmed. The
   * orphan sweep has gated on exactly this predicate all along (`#sweepOccupancy`); the
   * verbs simply never did.
   *
   * Refusing BEFORE `applyIntent` is the load-bearing part: an intent that is never applied
   * cannot produce an optimistic status, so there is nothing to lie about. And it is a
   * REFUSAL, not a deferral — a queued command would be stranded (reconnect-reconciliation
   * re-delivers template HTML, never stack intents), which is the same false belief one
   * step later.
   *
   * The predicate is "**no declared server is reachable**", NOT "the primary is down"
   * and NOT "no session is `healthy`". Two distinctions are load-bearing:
   *
   *   - B-056 — in a mirror pair whose PRIMARY's AMCP link is dead while the BACKUP is
   *     healthy (auto-failover off — the human-in-the-loop scenario), every send still
   *     lands backup-only on a real, rendering CasparCG. Something genuinely IS on air
   *     there, so refusing would be both a regression of the redundancy contract and a
   *     lie in the opposite direction. We refuse only when the command can reach NO
   *     server at all.
   *   - B-100 — a `degraded` server (OSC-silent past the threshold, AMCP socket still
   *     up) is REACHABLE: OSC is the CONFIRMATION channel, AMCP is the COMMAND channel,
   *     and a command reaches CasparCG over AMCP regardless of OSC. Refusing on OSC
   *     silence would turn a monitoring fault into a total playout outage (B-094's
   *     wrong-OSC-port install would go off air entirely). Reachability therefore reuses
   *     the caspar-client's own `isLiveState` (`healthy` OR `degraded`) rather than
   *     re-deriving the state list here — a second local copy is how the name came to
   *     lie about the predicate in the first place. Honesty under silence is preserved by
   *     the surfaces that already exist (B-086 demotes on-air rows to `unverified`,
   *     B-094 renders `⚠ NO OSC`), not by refusal.
   */
  #noServerReachable(): boolean {
    const sessions = [this.#sessions.A, this.#sessions.B].filter(
      (s): s is ServerSession => s !== undefined,
    );
    return sessions.every((s) => !isLiveState(s.state));
  }

  /**
   * Retire a pending restore because the OPERATOR has acted on the item.
   *
   * Load-bearing since the blind-tap refusal (B-093) made a pending restore able
   * to OUTLIVE the decision pass: before it, every pending entry was consumed on
   * the first decision, so it could never be stale. Now an item can sit pending
   * across reconnects while the operator takes it, edits its fields, or clears
   * it — and the parked entry still holds the RESTORE-TIME template, fields and
   * slot. Deciding it later would replay that stale snapshot over live state:
   * re-ADDing (play-on-load 0) over a producer the operator has since taken to
   * air, and reverting their field edits.
   *
   * The operator's action is newer evidence than anything the restore was
   * waiting to infer, so it simply retires the restore.
   */
  #retirePendingRestore(itemId: string): void {
    if (this.#pendingRestore.delete(itemId)) {
      // The doubt is resolved by the operator's own command; drop the marker so
      // the row stops reading `unverified` on the strength of it.
      this.#reconciler.setUnverifiable(itemId, false);
    }
  }

  async take(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'take', itemId }, seq);

    // B-039 — PRESCRIPTIVE: `CG PLAY` only renders if a live producer exists on the
    // slot. If a prior out destroyed it, re-issue `CG ADD` (a fresh load) FIRST so
    // the take re-renders instead of playing an empty layer. The re-ADD recovers the
    // template id + current (merged) fields from the Reconciler, and rides a
    // non-intent seq so its ack doesn't perturb the take's status.
    if (!this.#loaded.has(itemId)) {
      const item = this.#reconciler.get(itemId);
      const templateId = item?.templateId ?? itemId;
      // Reconnect-reconciliation — the re-ADD is a fresh load: the same
      // unknown-template guard applies (never blind-ADD an unservable URL).
      if (!this.#templates.has(templateId)) {
        this.#reconciler.applyAck(seq, false, 'unknown-template');
        return { accepted: false, errorCode: 'unknown-template' };
      }
      const addedOk = await this.#sendAdd(
        itemId,
        slot,
        templateId,
        item?.fields ?? {},
        this.#nextSeq(),
      );
      if (!addedOk) {
        this.#reconciler.applyAck(seq, false, 'amcp-error');
        return { accepted: false, errorCode: 'amcp-error' };
      }
    }

    // B-079 — bounded completion for a take, which it never had: #armExpiry was called for
    // update and out only, so a take whose ack never settled rested on its optimistic
    // playing/on-air claim forever, with nothing to bound it.
    this.#armExpiry(seq);
    const { ok } = await this.#send(this.#builder.take(slot), seq, 'normal');
    return ok ? { accepted: true } : { accepted: false, errorCode: 'amcp-error' };
  }

  async update(
    itemId: string,
    fields: FieldValues,
    mergeMode: 'merge' | 'replace',
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    // R-006 — see #noServerReachable(): refuse before the intent exists.
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'update', itemId, fields, mergeMode }, seq);

    // B-070 — PRESCRIPTIVE, the rule `update` never had (take has it since
    // B-039; setPosition checks the same set). `CG UPDATE` needs a live
    // PRODUCER, not air: real CasparCG 403s it on a layer whose producer is
    // empty. When the slot holds no producer — a prior `out` destroyed it, a
    // reconnect/setConfig cleared the bookkeeping — the operator's edit is
    // COMMITTED to the authoritative field-set and NOTHING goes on the wire.
    // The next take's B-039 re-ADD replays exactly these fields through
    // `CG ADD`'s data payload, so the edit reaches air.
    //
    // The intent is settled IN-PROCESS: a no-send path has no wire ack, and
    // B-044 forbids resting non-terminal (an unsettled `updating` is precisely
    // the zombie `pending` that used to block R-011's setPosition forever).
    if (!this.#loaded.has(itemId)) {
      this.#reconciler.applyAck(seq, true);
      return { accepted: true };
    }

    // Send the merged field set the Reconciler now holds.
    const merged = this.#reconciler.get(itemId)?.fields ?? fields;
    this.#armExpiry(seq);
    const { ok, errorCode } = await this.#send(this.#builder.update(slot, merged), seq, 'normal');
    return ok ? { accepted: true } : { accepted: false, errorCode: errorCode ?? 'amcp-error' };
  }

  /**
   * C-012 — GRACEFUL stop: run the template's own outro and leave the producer
   * RESIDENT on the layer.
   *
   * The distinction from `out()` is the whole point, and it is hardware-verified
   * (PR #353's probe, CasparCG 2.3.2 `4de6d18f`):
   *
   *   out()  -> `CLEAR <ch>-<layer>`  — OSC goes SILENT, the producer is DESTROYED,
   *             and a later take must re-ADD before it can play.
   *   stop() -> `CG <ch>-<layer> STOP` — 202 CG OK, the template's `window.stop`
   *             fires (its graceful outro, NOT `remove()`'s synchronous kill), OSC
   *             still reports `html`, and a bare `CG PLAY` RESUMES it with no re-ADD.
   *
   * So `#loaded` is deliberately NOT cleared here — that set means "a live producer
   * exists on this slot", which after a STOP is still true. Keeping it is what makes
   * the resume work: `take()` sees the producer and issues a bare `CG PLAY` instead
   * of the B-039 re-ADD. Deleting it would force a pointless re-load and throw away
   * the very property that makes STOP worth having.
   *
   * `#adopted` is likewise untouched: a STOP proves nothing about the layer being
   * clear — it leaves a producer there — so it must not count as adoption the way a
   * landed CLEAR does.
   *
   * Nothing waits on the outro. The ack means CasparCG accepted the command, not
   * that the animation finished, and outro completion is not observable from here
   * (B-030). No timer chases it.
   */
  // NB `stop()` on this class is the PROCESS shutdown, so the item verb is
  // `stopItem` — the AMCP verb it sends is still `CG … STOP`.
  async stopItem(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    // R-006 — STOP takes a graphic off air, so it is an on-air-affecting command and
    // is refused with the link down exactly like take/update/out. Claiming a stop
    // succeeded when nothing reached CasparCG is the same lie in the other direction.
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'stop', itemId }, seq);
    this.#armExpiry(seq);
    // Urgent lane, like out(): an air-affecting verb does not queue behind loads.
    const { ok } = await this.#send(this.#builder.stop(slot), seq, 'urgent');
    return { accepted: ok };
  }

  async out(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    // B-093 — the operator is acting; any parked restore for this item is stale.
    this.#retirePendingRestore(itemId);
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false };
    // R-006 — see #noServerReachable(). An out cannot reach a dead server either; claiming it
    // succeeded would be the mirror-image lie (an operator believing a graphic came OFF).
    if (this.#noServerReachable()) return { accepted: false, errorCode: 'disconnected' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'out', itemId }, seq);
    this.#armExpiry(seq);
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), seq, 'urgent');
    // B-039 — `CLEAR` DESTROYS the producer: record that no producer exists on the
    // slot so a subsequent take re-ADDs (instead of `CG PLAY`-ing an empty layer).
    // The slot stays RESERVED (the item is still on the stack, idle) until remove —
    // retake re-ADDs onto the same slot; OSC interest stays put so idle confirms.
    this.#loaded.delete(itemId);
    // A CLEAR executed on the CURRENT PRIMARY counts as adoption — the layer's
    // state is known there (a backup-only ack proves nothing about the primary)
    // — and provably resolves any B-056 owned-slot warning; a backup-only out
    // leaves the warning standing (the primary's orphan may still be live).
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    return { accepted: ok };
  }

  // ── R-009: orphan-layer sweep + explicit per-layer Clear ────────────

  /** The currently surfaced orphan layers (stable-sorted). */
  orphans(): OrphanLayer[] {
    return this.#orphanTracker.orphans();
  }

  /** B-056 — the currently surfaced owned-slot warnings (stable-sorted). */
  ownedOccupancy(): OwnedOccupancyWarning[] {
    return [...this.#ownedOccupancy.values()].sort(
      (a, b) => a.channel - b.channel || a.layer - b.layer,
    );
  }

  /**
   * One sweep tick: sample the CURRENT primary's passive OSC occupancy tap
   * and diff it against the layers this bridge owns (#slots). Reads the
   * primary dynamically — after a failover or setConfig the next tick
   * sweeps the new primary with zero rewiring. Skips unless the primary
   * session is healthy: while disconnected the sweep neither runs nor
   * resolves — existing warnings FREEZE (absence of knowledge is not
   * knowledge of absence). Publishes only when the surfaced set changes;
   * no per-tick logging.
   */
  #sweepOccupancy(): void {
    const session = this.#adapter.primarySession;
    if (session.state !== 'healthy') return;

    // B-094 — re-publish health when the OSC-heard bit flips, so the operator's
    // NO OSC indicator appears and clears on its own. Cheap: this tick already
    // runs, and it publishes only on a CHANGE, never per tick.
    const heard = session.osc.occupancy.lastOscTrafficAt !== null;
    if (this.#lastPublishedOscHeard !== heard) {
      this.#lastPublishedOscHeard = heard;
      this.healthChanged.emit(this.health());
    }

    // A restore that refused to decide (blind tap) left its items pending. If
    // OSC has started arriving since, decide them now — otherwise a tap that
    // came up a moment after the healthy transition would strand those rows as
    // `unverified` for the life of the process. Cheap: this tick already runs
    // and already samples occupancy.
    if (
      this.#pendingRestore.size > 0 &&
      session.osc.occupancy.hasFreshOsc(this.#occupancyStaleMs)
    ) {
      const occupiedKeys = new Set(
        session.osc.occupancy
          .occupied(this.#occupancyStaleMs)
          .map((o) => `${String(o.channel)}:${String(o.layer)}`),
      );
      void this.#decidePendingRestores(occupiedKeys, true);
    }

    // C-014 — keep the allocation quarantine in step with what the tap sees;
    // the same tick that surfaces orphans withdraws foreign layers from the
    // allocatable pool (and returns them when the foreign producer leaves).
    this.#reconcileForeignQuarantine();

    const occupied = session.osc.occupancy.occupied(this.#occupancyStaleMs);
    const owned = new Set<string>();
    for (const slot of this.#slots.values()) {
      owned.add(`${String(slot.channel)}:${String(slot.layer)}`);
    }
    const { changed } = this.#orphanTracker.update(occupied, owned);
    if (changed) this.orphansChanged.emit(this.orphans());
  }

  /**
   * Explicit operator Clear of a surfaced (UNOWNED) layer: sends an urgent
   * `CLEAR <ch>-<layer>` through the adapter (mirror-sync fans it out so a
   * real pair clears everywhere). REFUSED for a layer the bridge owns —
   * clearing owned layers is Out/Remove's job (guards a UI race where the
   * operator clicks Clear just as a load claims the layer).
   *
   * R-015 — REFUSED (`foreign`) unless the current primary's occupancy tap
   * has a FRESH observation of this exact layer reporting an `html`
   * producer. This system only ever places HTML producers, so `html` is the
   * one kind that can plausibly be our own orphaned graphic (R-009's case);
   * a non-`html` kind — a video played by another system, a program feed,
   * or anything unrecognised ("not html" fails safe, video kinds are never
   * enumerated) — is PROVABLY not ours, and clearing it must be impossible
   * from ANY caller, not merely unoffered by the UI. No fresh observation
   * refuses too: silence is evidence of nothing (the B-093 lesson), so it
   * cannot license a CLEAR — which also covers the B-094 AMCP-alive/OSC-dead
   * install, where every layer would otherwise read clearable blind.
   *
   * Touches no slots and no OSC interest (it owns neither); a CLEAR executed
   * on the current primary counts as adoption (consistent with out/remove).
   * The warning resolves via the next sweep's observed empty — never
   * optimistically, and NEVER without this explicit operator request.
   */
  async clearLayer(
    channel: number,
    layer: number,
  ): Promise<{ ok: boolean; reason?: 'owned' | 'foreign' | 'amcp-error' }> {
    for (const slot of this.#slots.values()) {
      if (slot.channel === channel && slot.layer === layer) {
        return { ok: false, reason: 'owned' };
      }
    }
    const observed = this.#adapter.primarySession.osc.occupancy
      .occupied(this.#occupancyStaleMs)
      .find((o) => o.channel === channel && o.layer === layer);
    if (observed === undefined || observed.producer !== 'html') {
      return { ok: false, reason: 'foreign' };
    }
    const slot: CommandSlot = { channel, layer };
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'urgent');
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    return ok ? { ok: true } : { ok: false, reason: 'amcp-error' };
  }

  /**
   * R-010 — Remove-All: OUT + REMOVE every stack item, clearing air and
   * emptying the list. Sequentially reuses the per-item `remove()` (urgent
   * CLEAR, interest removal, dealloc, adoption mark — B-039 CLEAR-destroys
   * semantics): layer-ordered, no command burst, and a per-item failure
   * doesn't abort the rest (`remove` drops the item regardless). The
   * sanctioned path to unblock a server reconfiguration.
   */
  async removeAll(): Promise<{ ok: boolean; removed: number }> {
    const items = this.#reconciler.snapshot();
    for (const item of items) {
      await this.remove(item.itemId);
    }
    return { ok: true, removed: items.length };
  }

  /**
   * Take every ON-AIR item off air, and KEEP them on the stack (they settle to idle).
   *
   * **BROADCAST SAFETY — this is per-LAYER, never per-channel.**
   *
   * It clears ONLY the layers this app itself allocated, and only each item's OWN layer:
   * `CLEAR <ch>-<layer>` per on-air item (`CLEAR 1-10`, `CLEAR 1-20`, …). It MUST NEVER emit
   * a channel-level `CLEAR <channel>` — that wipes the ENTIRE channel, including the
   * program/background signal this app does not manage and must never touch. Taking our
   * graphics off air must leave the program feed on air.
   *
   * The iteration is therefore over items that actually HOLD a slot. An item with no slot
   * holds no layer of ours, so there is nothing for us to clear and nothing is sent. (`out()`
   * refuses a slotless item anyway, but the safety property should be visible HERE, not
   * inherited from a guard three call-levels away.)
   *
   * NO new AMCP verb: it issues the SAME per-item `out()` the row's Clear button sends, on
   * the urgent (air-safety) lane, with the same B-039 CLEAR-destroys bookkeeping — so the
   * slot stays reserved and a later take re-ADDs. Sequential, like `removeAll`: no command
   * burst. A per-item failure does not abort the rest — a stuck item must not strand the
   * graphics behind it on air.
   *
   * The status predicate mirrors the row's Clear gating exactly (everything that is not
   * `idle` or `loaded`), so this IS "press Clear on every row where Clear is enabled".
   */
  async clearAll(): Promise<{ ok: boolean; cleared: number }> {
    const clearable = this.#reconciler
      .snapshot()
      .filter(
        (i) =>
          i.status !== 'idle' && i.status !== 'loaded' && this.#slots.get(i.itemId) !== undefined,
      );
    for (const item of clearable) {
      // → `CLEAR <ch>-<layer>` for THIS item's own slot. Never a channel-wide clear.
      await this.out(item.itemId);
    }
    return { ok: true, cleared: clearable.length };
  }

  async remove(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    // Drop it from the stack immediately (UI responsiveness), then best-effort
    // clear the slot on the server.
    this.#reconciler.applyIntent({ kind: 'remove', itemId }, this.#nextSeq());
    this.#loaded.delete(itemId);
    // R-011 — the override dies with the ITEM (a re-used itemId starts clean).
    this.#positions.delete(itemId);
    // B-092 — a restore awaiting its occupancy decision dies with the item too:
    // the operator removed it, so there is nothing left to adopt or re-ADD (the
    // urgent CLEAR below is the removal's own, and it is unconditional).
    this.#pendingRestore.delete(itemId);
    if (slot !== undefined) {
      this.#slots.delete(itemId);
      this.#removeInterest(slot);
      this.#layers.deallocate(slot);
      // B-056 — the layer is deallocated: resolve its warning REGARDLESS of
      // the CLEAR below landing. The layer is unowned from here — whatever
      // survives on the primary is the R-009 sweep's to surface (as a
      // regular, clearable orphan) once the primary is observable again.
      this.#resolveOwnedOccupancy(slot);
      const { ok, onPrimary } = await this.#send(
        this.#builder.out(slot),
        this.#nextSeq(),
        'urgent',
      );
      // A CLEAR executed on the CURRENT PRIMARY counts as adoption (see out()).
      if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    }
    return { accepted: true };
  }

  // ── connections ─────────────────────────────────────────────────────
  config(): ConnectionConfig {
    return this.#config;
  }

  /**
   * R-010 — apply a new `ConnectionConfig` to the RUNNING bridge: tear down
   * the declared sessions/adapter, rebuild from `next`, and reconnect —
   * without restarting the WS bridge or dropping clients. Ordered so
   * everything fallible happens as late as possible; failure semantics are
   * LAND-ON-NEW-CONFIG (see the R-010 design): an unreachable host is NOT an
   * error (sessions retry with backoff; health honestly reports
   * disconnected), and the only `apply-failed` case is the template server
   * failing to bind even after a loopback retry — sessions still run on the
   * new config, a defined non-crashing degraded state.
   *
   * SECURITY invariant: this method touches ONLY the CasparCG-facing data
   * plane (AMCP sessions out, template HTTP out, OSC UDP in). The control
   * WebSocket's loopback bind lives in `createBridge` and is unreachable
   * from here by construction — no ConnectionConfig, remote or not, can
   * expose it.
   */
  async setConfig(next: ConnectionConfig): Promise<SetConfigResult> {
    // 0. SERIALIZE (fix-setconfig-serve-restart) — two applies interleaving
    //    was the regression's root cause: the second read the mid-teardown
    //    `listening=false`, skipped the serve restart, and could leave the
    //    adapter holding already-stopped sessions. At most one apply runs;
    //    a concurrent request is refused loudly with nothing changed.
    if (this.#applyInFlight) {
      return {
        ok: false,
        reason: 'apply-in-progress',
        message: 'Another apply is still in progress — wait for it and retry.',
      };
    }
    this.#applyInFlight = true;
    try {
      return await this.#applyConfig(next);
    } finally {
      this.#applyInFlight = false;
    }
  }

  async #applyConfig(next: ConnectionConfig): Promise<SetConfigResult> {
    // 1. On-air gate — bridge-authoritative (the UI mirrors it; races lose here).
    const unsettled = this.#onAirCount();
    if (unsettled > 0) {
      return {
        ok: false,
        reason: 'on-air-block',
        message:
          `${String(unsettled)} item(s) are on air or unsettled — ` +
          `Remove All (or Out each item) first.`,
      };
    }

    // 2. Construct the new sessions first (pure — nothing torn down yet;
    //    connecting happens at start()).
    const sessions = this.#buildSessions(next);

    // 3. Teardown: old sessions (rejects their queued commands — safe,
    //    nothing is on air), the old adapter (its listeners die with the old
    //    objects), and the template server (bounded: held CEF sockets are
    //    force-destroyed in stop()).
    await Promise.all([this.#sessions.A.stop(), this.#sessions.B?.stop() ?? Promise.resolve()]);
    await this.#templateServer.stop();

    // 4. Rebuild + rewire. The Reconciler, template registry, and #slots
    //    survive (stack rows and imported templates are not
    //    connection-scoped). #loaded/#adopted do NOT: both are per-server
    //    knowledge — a producer/adoption on the OLD server says nothing
    //    about the new one — so a later Take heals via adopt-CLEAR + re-ADD
    //    (B-039 / reconnect-reconciliation semantics). OSC interest is
    //    re-registered for every retained slot on the NEW sessions.
    this.#config = next;
    this.#sessions = sessions;
    this.#adapter = new RedundancyAdapter({
      strategy: next.strategy,
      sessions,
      initialPrimary: 'A',
      autoFailoverEnabled: next.autoFailoverEnabled,
    });
    this.#wireAdapter();
    for (const slot of this.#slots.values()) this.#addInterest(slot);
    this.#loaded.clear();
    this.#adopted.clear();
    // The last failover described the old server pair — a new era starts clean.
    this.#lastFailover = undefined;
    // R-009 — surfaced orphans described the OLD server too; the new
    // sessions' taps re-accumulate and the sweep re-surfaces what's real.
    if (this.#orphanTracker.reset().changed) this.orphansChanged.emit([]);
    // C-014 — the allocation quarantine described the OLD server's occupancy;
    // release it wholesale and let the new taps re-quarantine what's real.
    for (const slot of this.#layers.quarantined()) this.#layers.deallocate(slot);
    // B-056 — owned-slot warnings described the OLD primary; drop wholesale.
    if (this.#ownedOccupancy.size > 0) {
      this.#ownedOccupancy.clear();
      this.ownedOccupancyChanged.emit([]);
    }

    // 5. Template serve — re-derive from the new primary's locality; the only
    //    realistically fallible step (bind conflict). Retry ONCE on safe
    //    loopback-ephemeral options; if that also fails, land on the new
    //    config with serving down (loads fail loudly via the serve guards).
    //    fix-setconfig-serve-restart: gate on the PROCESS-LEVEL intent
    //    (#servingDesired, set once by startServing()) — never on the
    //    transient `listening`, which reads false during any in-flight
    //    teardown and previously let a concurrent apply skip this step.
    this.#serveOptions = deriveServeOptions(next.servers.A.host, this.#serveOverride);
    let serveError: string | null = null;
    if (this.#servingDesired) {
      try {
        await this.#templateServer.start(this.#serveOptions);
      } catch {
        this.#serveOptions = { bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' };
        try {
          await this.#templateServer.start(this.#serveOptions);
        } catch (retryErr) {
          serveError = retryErr instanceof Error ? retryErr.message : String(retryErr);
        }
      }
      // Belt-and-braces: whatever the path above did, an apply may never
      // conclude ok with serving desired but down.
      if (serveError === null && !this.#templateServer.listening) {
        serveError = 'template server is not listening after restart';
      }
    }

    // 6. Connect + surface: every client sees the new config and fresh health.
    this.#sessions.A.start();
    this.#sessions.B?.start();
    this.#audit.unshift({
      ts: new Date().toISOString(),
      actor: 'operator',
      action: 'reconnect',
      server: 'primary',
      outcome: serveError === null ? 'ok' : 'failed',
    });
    this.configChanged.emit(next);
    this.healthChanged.emit(this.health());

    if (serveError !== null) {
      return {
        ok: false,
        reason: 'apply-failed',
        message: `connected, but the template server failed to bind: ${serveError}`,
      };
    }
    const serve = this.templateServe;
    const exposed =
      serve !== null && serve.bindHost !== '127.0.0.1' && serve.bindHost !== 'localhost';
    if (exposed && serve !== null) {
      process.stderr.write(
        `[caspar-bridge] ⚠ template HTTP server LAN-EXPOSED on ` +
          `${serve.bindHost}:${String(serve.port)} — CG ADD URL host is ${serve.serveHost}. ` +
          `Control WebSocket remains loopback-bound.\n`,
      );
    }
    return {
      ok: true,
      ...(serve !== null
        ? { templateServe: { serveHost: serve.serveHost, port: serve.port, exposed } }
        : {}),
    };
  }

  /**
   * R-010 — the on-air gate: anything visibly on air OR unsettled blocks a
   * server switch. Stricter than the updateRequest precedent on purpose:
   * `updating`/`exiting` ride an on-air producer, and B-044's `unconfirmed`
   * means the on-air result is UNKNOWN — unknown must block. `idle`/`loaded`/
   * `error`/`disconnected` rest states don't.
   */
  #onAirCount(): number {
    return this.#reconciler
      .snapshot()
      .filter(
        (i) =>
          i.pending ||
          i.status === 'playing' ||
          i.status === 'on-air' ||
          i.status === 'updating' ||
          i.status === 'exiting' ||
          i.status === 'unconfirmed',
      ).length;
  }

  health(): ConnectionHealth {
    // `primary`/`backup` reflect the current ROLES (after failover, `primary`
    // is the live server). ServerSessionState and ServerHealth.state share the
    // same vocabulary. `backup` is absent under a single-server config.
    const cur = this.#adapter.currentPrimary;
    const other: ServerLabel = cur === 'A' ? 'B' : 'A';
    const snapshot = (label: ServerLabel, session: ServerSession): ConnectionHealth['primary'] => {
      const state = session.state;
      // B-094 — publish WHEN we last heard OSC from this server, so the operator
      // surface can tell "answering AMCP but silent on OSC" apart from "down".
      // The two look identical on the AMCP axis (`amcpAxisOk`) yet call for
      // opposite remedies: one is a CasparCG config fix, the other is a dead
      // server. Absent means never heard from in this session.
      //
      // The SAME signal B-093's restore guard reads — source-filtered to this
      // declared server, so another box's OSC cannot make this look healthy.
      // Deliberately not a second, divergent source of truth.
      const heardAt = session.osc.occupancy.lastOscTrafficAt;
      return {
        label,
        state,
        amcpAxisOk: state === 'healthy',
        ...(heardAt !== null ? { oscFreshAt: new Date(heardAt).toISOString() } : {}),
      };
    };
    const primarySession = this.#sessions[cur];
    const backupSession = this.#sessions[other];
    return {
      // The current primary is always a declared session (failover refuses
      // to swap onto an undeclared backup); fall back to A defensively.
      primary: snapshot(cur, primarySession ?? this.#sessions.A),
      ...(backupSession !== undefined ? { backup: snapshot(other, backupSession) } : {}),
      currentPrimary: cur,
      strategy: this.#config.strategy,
      ...(this.#lastFailover !== undefined ? { lastFailover: this.#lastFailover } : {}),
    };
  }

  /**
   * Manual operator failover (the `connections.failover` channel). Real
   * switch; refused (`ok: false`) when no backup is declared (B-046).
   */
  async failover(): Promise<{ ok: boolean; newPrimary: ServerLabel }> {
    const ok = await this.#adapter.failover('manual');
    return { ok, newPrimary: this.#adapter.currentPrimary };
  }

  // ── lock / templates / audit / settings / update (in-memory stubs) ──
  lockState(): LockState {
    return this.#lock;
  }
  engage(pin: string): { ok: boolean } {
    this.#lockPin = pin;
    this.#lock = { engaged: true, reason: 'operator', engagedAt: new Date().toISOString() };
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }
  release(pin: string): { ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' } {
    if (!this.#lock.engaged) return { ok: false, reason: 'not-engaged' };
    if (this.#lockPin !== pin) return { ok: false, reason: 'pin-mismatch' };
    this.#lock = { engaged: false };
    this.#lockPin = null;
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  templateGet(templateId: string): TemplateInfo | null {
    return this.#templates.get(templateId);
  }
  templateList(): TemplateInfo[] {
    return this.#templates.list();
  }
  /**
   * B-038 Phase 2 — register a template AND retain its browser-produced
   * self-contained HTML, keyed by id. Re-import replaces both. The HTML is held,
   * not served yet (Phase 3 serves it over HTTP; Phase 4 `CG ADD`s its URL).
   */
  templateImport(
    template: TemplateInfo,
    html: string,
  ): { registered: boolean; templateId: string } {
    return this.#templates.import(template, html);
  }
  /** The retained HTML for a template id, or `null` (the Phase 3 serve seam). */
  templateHtml(templateId: string): string | null {
    return this.#templates.html(templateId);
  }

  /**
   * R-005 — remove a template from the library. Refused while ANY stack item references it.
   *
   * The predicate is deliberately "any reference", not "any ON-AIR reference" (the R-010
   * gate's shape). Removal never takes a graphic off air — CasparCG already pulled the
   * self-contained HTML into CEF — so the damage is invisible at the click and deferred:
   * `load()` and `take()`'s B-039 re-ADD both guard on `#templates.has(...)` and would
   * refuse with `unknown-template` forever, and `setPosition`'s re-ADD would silently stop
   * re-ADDing. An `idle`/`loaded` row is poisoned exactly as badly as an on-air one, so
   * both block. Removing the referencing items (stack.remove / Remove-All) is the unblock
   * path — the same one R-010 points at.
   */
  templateRemove(templateId: string): {
    ok: boolean;
    reason?: 'in-use' | 'unknown-template';
    message?: string;
  } {
    if (!this.#templates.has(templateId)) {
      return {
        ok: false,
        reason: 'unknown-template',
        message: `Template “${templateId}” is not registered.`,
      };
    }

    const referencing = this.#reconciler
      .snapshot()
      .filter((i) => i.templateId === templateId).length;
    if (referencing > 0) {
      return {
        ok: false,
        reason: 'in-use',
        message: `${String(referencing)} stack item(s) still use this template — remove them (or Remove All) first.`,
      };
    }

    this.#templates.remove(templateId);
    return { ok: true };
  }

  auditRecent(limit = 200, action?: AuditEntry['action'], actor?: string): AuditEntry[] {
    let rows = this.#audit;
    if (action !== undefined) rows = rows.filter((r) => r.action === action);
    if (actor !== undefined) rows = rows.filter((r) => r.actor === actor);
    return rows.slice(0, limit);
  }

  settingsGet(): Settings {
    return this.#settings;
  }
  settingsSet(patch: Partial<Settings>): Settings {
    this.#settings = { ...this.#settings, ...patch };
    this.settingsChanged.emit(this.#settings);
    return this.#settings;
  }

  updateRequest(
    version: string,
    notes?: string,
  ): { accepted: true; deferred: boolean; pending: PendingUpdate } {
    // B-053 parity — count acked 'playing' as on air (matches MockRuntime):
    // post-fix 'on-air' exists only while OSC truth is fresh on a TAKEN item,
    // and a playing item whose truth decayed must still defer the update.
    const onAir = this.#reconciler
      .snapshot()
      .some((i) => i.status === 'on-air' || i.status === 'playing');
    const pending: PendingUpdate = {
      version,
      requestedAt: new Date().toISOString(),
      ...(notes !== undefined ? { notes } : {}),
    };
    this.#pendingUpdate = pending;
    this.updateChanged.emit(pending);
    return { accepted: true, deferred: onAir, pending };
  }
  updateState(): PendingUpdate | null {
    return this.#pendingUpdate;
  }
  updateCancel(): { ok: boolean } {
    this.#pendingUpdate = null;
    this.updateChanged.emit(null);
    return { ok: true };
  }

  // ── internals ───────────────────────────────────────────────────────
  #nextSeq(): number {
    return ++this.#seq;
  }

  /** Allocate a slot, falling back to the `custom` range for unknown types. */
  #allocate(templateId: string): CommandSlot {
    // C-014 — point-in-time freshness: the sweep's cadence alone would leave a
    // window where a just-arrived foreign producer gets allocated over. Same
    // sample, same predicate, run synchronously before the scan.
    this.#reconcileForeignQuarantine();
    try {
      return this.#layers.allocate(templateId, DEFAULT_CHANNEL);
    } catch (err) {
      // Unknown template type → fall back to the `custom` range. An exhausted
      // range (OutOfLayersError) propagates to the caller as a failed load.
      if (err instanceof UnknownTemplateTypeError) {
        return this.#layers.allocate('custom', DEFAULT_CHANNEL);
      }
      throw err;
    }
  }

  /**
   * Reconnect-reconciliation — the first `CG ADD` per layer per process is
   * preceded by a `CLEAR` of that layer ("adoption"): deterministic allocation
   * makes a collision with a dead session's orphan near-certain, and real
   * CasparCG's `CG ADD` would destroy that producer anyway (stage replace) —
   * the explicit CLEAR just does it BEFORE the fresh item binds its slot/OSC
   * interest, versions/producer-types independent and mock-testable. Rides a
   * non-intent seq so the item's status is settled only by its own ADD. A
   * failed CLEAR (e.g. server down) leaves the layer unadopted — the next
   * load retries; the ADD's own failure settles the intent honestly.
   *
   * B-056 — returns the primary-landing result it already computes
   * (`adopted`: the layer is in `#adopted` after the call), so `load()` can
   * warn when the CLEAR missed the primary. Return value only — the CLEAR,
   * the `ok && onPrimary` gate, and the backup-only-stays-unadopted rule are
   * behaviorally unchanged.
   */
  async #adoptLayer(slot: CommandSlot, reachable: boolean): Promise<{ adopted: boolean }> {
    const key = adoptionKey(slot);
    if (this.#adopted.has(key)) return { adopted: true };
    // B-100 — never issue the adopt-CLEAR when no server is reachable. With a live
    // AMCP link the CLEAR lands, and load()'s pre-roll ADD reads this SAME `reachable`,
    // so a landed CLEAR is always paired with an attempted ADD — never black-then-nothing.
    // With nothing reachable the CLEAR could not land anyway; skipping it keeps the
    // pairing structural rather than relying on the transport to fail.
    if (!reachable) return { adopted: this.#adopted.has(key) };
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'normal');
    // A backup-only success (mirror-sync with the primary momentarily down)
    // did NOT clear the primary's layer — leave it unadopted so a later load
    // retries the CLEAR where the orphan actually lives.
    if (ok && onPrimary) this.#markAdoptedOnPrimary(slot);
    return { adopted: this.#adopted.has(key) };
  }

  /**
   * B-056 — a CLEAR for this layer executed on the CURRENT PRIMARY: mark it
   * adopted (reconnect-reconciliation bookkeeping, unchanged) AND resolve any
   * owned-slot occupancy warning — the primary's layer state is now provably
   * clean. Shared by every adoption-marking site (adopt / out / remove /
   * operator clearLayer) so "adopted" and "provably cleared" can never drift.
   */
  #markAdoptedOnPrimary(slot: CommandSlot): void {
    this.#adopted.add(adoptionKey(slot));
    this.#resolveOwnedOccupancy(slot);
  }

  /**
   * B-056 — load-time, one-shot detection (deliberately NOT a sweep: only
   * between a failed/backup-only adopt and our own ADD is a producer report
   * on this layer provably FOREIGN). Warns only on occupancy OBSERVED fresh
   * on the current primary's passive tap — the same freshness contract as
   * the R-009 sweep (an aged-out entry is the empty signal, B-053).
   */
  #detectOwnedOccupancy(slot: CommandSlot, itemId: string): void {
    const occupied = this.#adapter.primarySession.osc.occupancy.occupied(this.#occupancyStaleMs);
    const hit = occupied.find((o) => o.channel === slot.channel && o.layer === slot.layer);
    if (hit === undefined) return;
    this.#ownedOccupancy.set(adoptionKey(slot), {
      channel: slot.channel,
      layer: slot.layer,
      itemId,
      producer: hit.producer,
      since: new Date().toISOString(),
    });
    this.ownedOccupancyChanged.emit(this.ownedOccupancy());
  }

  /** B-056 — drop a layer's warning (provable resolution only); publish on change. */
  #resolveOwnedOccupancy(slot: CommandSlot): void {
    if (this.#ownedOccupancy.delete(adoptionKey(slot))) {
      this.ownedOccupancyChanged.emit(this.ownedOccupancy());
    }
  }

  /**
   * C-014 — reconcile the LayerManager's QUARANTINE set against the current
   * primary's fresh non-`html` occupancy, so allocation can never land on —
   * and adopt-CLEAR — another system's output.
   *
   * The discriminator is R-015's, verbatim: this system only places `html`
   * producers, so a fresh non-`html` observation (video, or anything
   * unrecognised — "not html" fails safe) is provably foreign. A layer with NO
   * fresh observation stays allocatable: allocation fails OPEN on silence,
   * deliberately opposite to `clearLayer`'s refusal — a blind (B-094) install
   * must still be able to play out, and on a hearing tap silence genuinely
   * means empty (B-053, aged-out entries ARE the empty signal).
   *
   * Runs at every sweep tick AND at allocation time (the sweep's cadence alone
   * would leave a TOCTOU window). Frozen while the primary is not healthy —
   * the same absence-of-knowledge discipline as the R-009 warnings — and
   * dropped wholesale on setConfig (old-server knowledge). Owned (#slots) and
   * pinned slots are never quarantined: a foreign producer under an OWNED
   * layer is B-056's warning, not an allocation concern.
   *
   * Release goes through `deallocate()`, not `observe('empty')`: observe()'s
   * explicit-empty release contract predates B-053 (real CasparCG goes SILENT
   * for a cleared layer), so the bridge reconciles from aged-out occupancy
   * instead of feeding it synthetic empties.
   */
  #reconcileForeignQuarantine(): void {
    const session = this.#adapter.primarySession;
    if (session.state !== 'healthy') return;

    const foreign = new Map<string, { slot: CommandSlot; producer: string }>();
    for (const occ of session.osc.occupancy.occupied(this.#occupancyStaleMs)) {
      if (occ.producer === 'html') continue;
      foreign.set(adoptionKey(occ), {
        slot: { channel: occ.channel, layer: occ.layer },
        producer: occ.producer,
      });
    }

    const quarantinedNow = new Set(this.#layers.quarantined().map((s) => adoptionKey(s)));

    for (const [key, { slot, producer }] of foreign) {
      if (quarantinedNow.has(key)) continue;
      // Allocated (ours or pinned) — not quarantine's to touch; B-056 owns it.
      if (this.#layers.isAllocated(slot)) continue;
      this.#layers.quarantine(slot);
      // The one line whoever wonders why a layer is being skipped will grep for.
      process.stderr.write(
        `[caspar-bridge] layer ${String(slot.channel)}-${String(slot.layer)} quarantined from ` +
          `allocation: a foreign producer (${producer}) is on it. It will not be allocated or ` +
          `cleared; it returns to the pool when the producer leaves.
`,
      );
    }

    for (const key of quarantinedNow) {
      if (foreign.has(key)) continue;
      const sep = key.indexOf(':');
      this.#layers.deallocate({
        channel: Number(key.slice(0, sep)),
        layer: Number(key.slice(sep + 1)),
      });
    }
  }

  #addInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.add(slot.channel, slot.layer);
    this.#sessions.B?.osc.interest.add(slot.channel, slot.layer);
  }

  #removeInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.remove(slot.channel, slot.layer);
    this.#sessions.B?.osc.interest.remove(slot.channel, slot.layer);
  }

  /**
   * B-044 — arm the bounded-completion timer for a transient intent
   * (update/out). Cleared when the ack lands (`#send`); on fire the Reconciler
   * expires the intent to the explicit `unconfirmed` state (a no-op if a newer
   * intent superseded it or the ack already settled it).
   */
  #armExpiry(seq: number): void {
    const timer = setTimeout(() => {
      this.#expiryTimers.delete(seq);
      this.#reconciler.expireIntent(seq);
    }, this.#intentTimeoutMs);
    timer.unref?.();
    this.#expiryTimers.set(seq, timer);
  }

  #clearExpiry(seq: number): void {
    const timer = this.#expiryTimers.get(seq);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#expiryTimers.delete(seq);
    }
  }

  /**
   * Send an AMCP line through the `RedundancyAdapter` (strategy-aware fan-out to
   * primary/backup; drives the auto-failover triggers), await the ack, and feed
   * it to the Reconciler. `onPrimary` reports whether the server that is NOW the
   * current primary executed the command — in mirror-sync a backup-only success
   * still acks `ok`, but the primary's layer state was NOT touched (the
   * adoption bookkeeping must not trust it).
   */
  async #send(
    line: string,
    seq: number,
    priority: 'urgent' | 'normal',
  ): Promise<{ ok: boolean; onPrimary: boolean; errorCode?: string }> {
    try {
      const result = await this.#adapter.send(line, { priority });
      // A response ARRIVED, so the B-044 bounded timeout no longer applies —
      // and the ack below settles the intent either way (B-070: a failed ack
      // settles too), so no expiry is needed to rescue it.
      this.#clearExpiry(seq);
      const ok = result.response.kind !== 'err';
      // B-070 — surface the REAL AMCP code so a refusal can explain itself
      // (`stack.update` used to answer a bare `{ accepted: false }`, which the
      // Inspector could only render as the generic "Not accepted.").
      const errorCode = ok ? undefined : `amcp-${String(result.response.code)}`;
      this.#reconciler.applyAck(seq, ok, errorCode);
      return {
        ok,
        onPrimary: result.winner === this.#adapter.currentPrimary,
        ...(errorCode !== undefined && { errorCode }),
      };
    } catch {
      this.#clearExpiry(seq);
      this.#reconciler.applyAck(seq, false, 'amcp-send-failed');
      return { ok: false, onPrimary: false, errorCode: 'amcp-send-failed' };
    }
  }

  /**
   * B-039 — issue `CG ADD` (play-on-load OFF) for an item's slot and, on success,
   * record that a live producer now exists (`#loaded`). Shared by `load` and the
   * `take` re-ADD path. Uses the SERVED `/template/<id>` URL when the HTTP server is
   * up (B-038 Phase 3), else the bare id (isolated unit tests).
   */
  async #sendAdd(
    itemId: string,
    slot: CommandSlot,
    templateId: string,
    fields: FieldValues,
    seq: number,
  ): Promise<boolean> {
    // fix-setconfig-serve-restart — the loud-failure contract: when serving
    // is INTENDED for this process but the server is down, a load must fail
    // with a clear reason (mirroring the unknown-template guard) — NEVER
    // ship a bare template id (real CasparCG 404s it: a silent blank ADD).
    // The bare-id fallback survives ONLY for the never-served unit-test path.
    if (!this.#templateServer.listening && this.#servingDesired) {
      this.#reconciler.applyAck(seq, false, 'template-serve-down');
      return false;
    }
    let templateArg = this.#templateServer.listening
      ? this.#templateServer.urlFor(templateId)
      : templateId;
    // R-011 — a stored operator position rides the RESOLVED served URL's
    // query (the single permitted touch in the B-064 serve path: the guard
    // above already ran, and a bare id — the never-served unit-test branch —
    // is NEVER given a query). Both load's ADD and take's B-039 re-ADD flow
    // through here, so both inherit the override. The position never touches
    // the data payload — the AMCP escape rule is unaffected.
    const position = this.#positions.get(itemId);
    if (position !== undefined && this.#templateServer.listening) {
      templateArg +=
        `?pos=${position.anchor}` +
        `&dx=${String(position.offset.x)}&dy=${String(position.offset.y)}`;
    }
    const { ok } = await this.#send(this.#builder.load(slot, templateArg, fields), seq, 'normal');
    if (ok) this.#loaded.add(itemId);
    return ok;
  }

  #markDirty(itemId: string): void {
    this.#dirty.add(itemId);
    if (this.#flushTimer !== null) return;
    const timer = setTimeout(() => {
      this.#flushTimer = null;
      this.#dirty.clear();
      this.stackChanged.emit(this.#published());
    }, COALESCE_MS);
    timer.unref?.();
    this.#flushTimer = timer;
  }
}

/** Key for the per-process layer-adoption set (reconnect-reconciliation). */
function adoptionKey(slot: CommandSlot): string {
  return `${String(slot.channel)}:${String(slot.layer)}`;
}
