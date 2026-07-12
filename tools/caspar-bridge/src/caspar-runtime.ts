import {
  LayerManager,
  Reconciler,
  RedundancyAdapter,
  ServerSession,
  UnknownTemplateTypeError,
  type FailoverEvent,
  type ServerLabel,
} from '@cg/caspar-client';
import type { AuditEntry, FieldValues, Position, StackItemState } from '@cg/shared-schema';
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
   * R-011 — itemId → the operator's on-air position override. Appended as a
   * query onto the RESOLVED served URL in #sendAdd (never a bare id — the
   * B-064 serve contract is untouched). Process-memory like #slots; survives
   * setConfig (an operator placement is not server knowledge), deleted at
   * remove. The manifest default stays OPAQUE to the bridge — the runtime
   * reads it from the scene inside the served HTML; the bridge only ever
   * knows explicit operator overrides.
   */
  readonly #positions = new Map<string, Position>();
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

  constructor(
    config: ConnectionConfig,
    serveOverride: TemplateServeOverride = {},
    options: {
      intentTimeoutMs?: number;
      sweepMs?: number;
      occupancyStaleMs?: number;
      /** TEST-ONLY seam: inject a template server (e.g. one whose start() fails). */
      templateServer?: TemplateHttpServer;
    } = {},
  ) {
    this.#intentTimeoutMs = options.intentTimeoutMs ?? INTENT_TIMEOUT_MS;
    this.#sweepMs = options.sweepMs ?? SWEEP_MS;
    this.#occupancyStaleMs = options.occupancyStaleMs ?? OCCUPANCY_STALE_MS;
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
  stackSnapshot(): readonly StackItemState[] {
    return this.#reconciler.snapshot();
  }

  async load(
    itemId: string,
    templateId: string,
    fields: FieldValues,
  ): Promise<{ accepted: boolean }> {
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'load', itemId, templateId, fields }, seq);

    // Reconnect-reconciliation — never blind-ADD a URL the bridge can't serve:
    // an unregistered template is a visible failed load. (Real CasparCG would
    // 202 the ADD without fetching and CEF-load the 404 page — a silent blank
    // on air; the guard is what makes the failure loud.)
    if (!this.#templates.has(templateId)) {
      this.#reconciler.applyAck(seq, false, 'unknown-template');
      return { accepted: false };
    }

    let slot: CommandSlot;
    try {
      slot = this.#allocate(templateId);
    } catch {
      this.#reconciler.applyAck(seq, false, 'no-layer');
      return { accepted: false };
    }

    // Reconnect-reconciliation — adopt the layer BEFORE binding the slot/OSC
    // interest: destroy any producer a previous bridge session orphaned there,
    // so its OSC state can never route to this fresh item.
    const { adopted } = await this.#adoptLayer(slot);

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

    // B-039 — `CG ADD` only (play-on-load OFF in the builder): the producer is
    // loaded, NOT playing. The operator's take issues the `CG PLAY`.
    const ok = await this.#sendAdd(itemId, slot, templateId, fields, seq);
    return { accepted: ok };
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
    const slot = this.#slots.get(itemId);
    if (slot !== undefined && this.#loaded.has(itemId) && this.#templates.has(item.templateId)) {
      await this.#sendAdd(itemId, slot, item.templateId, item.fields, this.#nextSeq());
    }
    return { ok: true };
  }

  async take(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
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

    const { ok } = await this.#send(this.#builder.take(slot), seq, 'normal');
    return ok ? { accepted: true } : { accepted: false, errorCode: 'amcp-error' };
  }

  async update(
    itemId: string,
    fields: FieldValues,
    mergeMode: 'merge' | 'replace',
  ): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'update', itemId, fields, mergeMode }, seq);
    // Send the merged field set the Reconciler now holds.
    const merged = this.#reconciler.get(itemId)?.fields ?? fields;
    this.#armExpiry(seq);
    const { ok } = await this.#send(this.#builder.update(slot, merged), seq, 'normal');
    return { accepted: ok };
  }

  async out(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false };
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
   * operator clicks Clear just as a load claims the layer). Touches no
   * slots and no OSC interest (it owns neither); a CLEAR executed on the
   * current primary counts as adoption (consistent with out/remove). The
   * warning resolves via the next sweep's observed empty — never
   * optimistically, and NEVER without this explicit operator request.
   */
  async clearLayer(
    channel: number,
    layer: number,
  ): Promise<{ ok: boolean; reason?: 'owned' | 'amcp-error' }> {
    for (const slot of this.#slots.values()) {
      if (slot.channel === channel && slot.layer === layer) {
        return { ok: false, reason: 'owned' };
      }
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

  async remove(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    // Drop it from the stack immediately (UI responsiveness), then best-effort
    // clear the slot on the server.
    this.#reconciler.applyIntent({ kind: 'remove', itemId }, this.#nextSeq());
    this.#loaded.delete(itemId);
    // R-011 — the override dies with the ITEM (a re-used itemId starts clean).
    this.#positions.delete(itemId);
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
      return { label, state, amcpAxisOk: state === 'healthy' };
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
  async #adoptLayer(slot: CommandSlot): Promise<{ adopted: boolean }> {
    const key = adoptionKey(slot);
    if (this.#adopted.has(key)) return { adopted: true };
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
  ): Promise<{ ok: boolean; onPrimary: boolean }> {
    try {
      const result = await this.#adapter.send(line, { priority });
      this.#clearExpiry(seq);
      const ok = result.response.kind !== 'err';
      this.#reconciler.applyAck(seq, ok, ok ? undefined : `amcp-${String(result.response.code)}`);
      return { ok, onPrimary: result.winner === this.#adapter.currentPrimary };
    } catch {
      this.#clearExpiry(seq);
      this.#reconciler.applyAck(seq, false, 'amcp-send-failed');
      return { ok: false, onPrimary: false };
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
      this.stackChanged.emit(this.#reconciler.snapshot());
    }, COALESCE_MS);
    timer.unref?.();
    this.#flushTimer = timer;
  }
}

/** Key for the per-process layer-adoption set (reconnect-reconciliation). */
function adoptionKey(slot: CommandSlot): string {
  return `${String(slot.channel)}:${String(slot.layer)}`;
}
