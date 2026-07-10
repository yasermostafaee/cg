import {
  LayerManager,
  Reconciler,
  RedundancyAdapter,
  ServerSession,
  UnknownTemplateTypeError,
  type FailoverEvent,
  type ServerLabel,
} from '@cg/caspar-client';
import type { AuditEntry, FieldValues, StackItemState } from '@cg/shared-schema';
import type {
  ConnectionConfig,
  ConnectionHealth,
  LockState,
  PendingUpdate,
  Settings,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CommandBuilder, type CommandSlot } from './command-builder.js';
import { TemplateRegistry } from './template-registry.js';
import {
  TemplateHttpServer,
  deriveServeOptions,
  type TemplateServeOptions,
  type TemplateServeOverride,
} from './template-http-server.js';

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
 * the actual `@cg/caspar-client` stack running in its native Node tier: TWO
 * `ServerSession`s (A/B) under a `RedundancyAdapter` (Phase 3a), a `Reconciler`
 * (the single source of truth for stack state), a `LayerManager` (slot
 * allocation), and the `CommandBuilder` seam.
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

  readonly #config: ConnectionConfig;
  readonly #sessions: Record<ServerLabel, ServerSession>;
  readonly #adapter: RedundancyAdapter;
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
  #seq = 0;
  #lastFailover: ConnectionHealth['lastFailover'] = undefined;

  // Coalescing (Phase-2 NOTE): collapse per-itemId changes into bounded publishes.
  readonly #dirty = new Set<string>();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  // B-044 — per-seq expiry timers for in-flight transient intents (update/out).
  readonly #expiryTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // ── non-playout stub state ──────────────────────────────────────────
  // B-038 Phase 2 — holds each imported template's info + the browser-produced
  // self-contained HTML, keyed by id. B-038 Phase 3 — the HTTP server serves that
  // HTML at `/template/<id>`, so `CG ADD` can reference a real, loadable URL.
  readonly #templates = new TemplateRegistry();
  readonly #templateServer = new TemplateHttpServer((id) => this.#templates.html(id));
  readonly #serveOptions: TemplateServeOptions;
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
    options: { intentTimeoutMs?: number } = {},
  ) {
    this.#intentTimeoutMs = options.intentTimeoutMs ?? INTENT_TIMEOUT_MS;
    this.#config = config;
    // B-038 Phase 3 — serve loopback when CasparCG is local; an opt-in routable
    // host (configured or guessed) when remote. The control WS stays loopback.
    this.#serveOptions = deriveServeOptions(config.servers.A.host, serveOverride);
    const session = (name: ServerLabel, ep: ConnectionConfig['servers']['A']): ServerSession =>
      new ServerSession({
        name,
        host: ep.host,
        port: ep.amcpPort,
        oscPort: ep.oscPort,
        oscBindHost: '127.0.0.1',
        resyncDurationMs: RESYNC_MS,
      });
    this.#sessions = { A: session('A', config.servers.A), B: session('B', config.servers.B) };
    this.#adapter = new RedundancyAdapter({
      strategy: config.strategy,
      sessions: this.#sessions,
      initialPrimary: 'A',
      autoFailoverEnabled: config.autoFailoverEnabled,
    });
  }

  /** Wire the stack and connect both sessions. Idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;

    this.#reconciler.on('item-changed', (state) => this.#markDirty(state.itemId));
    this.#reconciler.on('item-removed', (info) => this.#markDirty(info.itemId));

    // OSC firehose → Reconciler, but only from the **current primary** — the
    // backup mirrors the same commands, so after a failover the new primary's
    // OSC re-confirms state. Each OscTransport already ran interest →
    // rate-limit → change-track and handed us typed events.
    for (const label of ['A', 'B'] as const) {
      this.#sessions[label].osc.on('events', (events) => {
        if (this.#adapter.currentPrimary !== label) return;
        for (const event of events) this.#reconciler.applyOsc(event);
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

    this.#sessions.A.start();
    this.#sessions.B.start();
  }

  /**
   * B-038 Phase 3 — start the template HTTP server (`GET /template/<id>` → the
   * retained HTML). Idempotent. After this, `load()` issues `CG ADD` with the
   * served URL instead of the bare template id.
   */
  async startServing(): Promise<void> {
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
    for (const timer of this.#expiryTimers.values()) clearTimeout(timer);
    this.#expiryTimers.clear();
    await Promise.all([this.#sessions.A.stop(), this.#sessions.B.stop()]);
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

  /** Resolves when BOTH sessions reach HEALTHY (mirror needs both). */
  whenServerHealthy(timeoutMs = 5000): Promise<void> {
    const bothHealthy = (): boolean =>
      this.#sessions.A.state === 'healthy' && this.#sessions.B.state === 'healthy';
    if (bothHealthy()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.#sessions.A.off('healthy', check);
        this.#sessions.B.off('healthy', check);
      };
      const check = (): void => {
        if (bothHealthy()) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('CasparCG servers did not both reach HEALTHY in time'));
      }, timeoutMs);
      this.#sessions.A.on('healthy', check);
      this.#sessions.B.on('healthy', check);
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
    await this.#adoptLayer(slot);

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
    // Interest on BOTH sessions' OSC so whichever is primary, its confirmations
    // pass the filter (survives failover).
    this.#addInterest(slot);

    // B-039 — `CG ADD` only (play-on-load OFF in the builder): the producer is
    // loaded, NOT playing. The operator's take issues the `CG PLAY`.
    const ok = await this.#sendAdd(itemId, slot, templateId, fields, seq);
    return { accepted: ok };
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
    // state is known there (a backup-only ack proves nothing about the primary).
    if (ok && onPrimary) this.#adopted.add(adoptionKey(slot));
    return { accepted: ok };
  }

  async remove(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    // Drop it from the stack immediately (UI responsiveness), then best-effort
    // clear the slot on the server.
    this.#reconciler.applyIntent({ kind: 'remove', itemId }, this.#nextSeq());
    this.#loaded.delete(itemId);
    if (slot !== undefined) {
      this.#slots.delete(itemId);
      this.#removeInterest(slot);
      this.#layers.deallocate(slot);
      const { ok, onPrimary } = await this.#send(
        this.#builder.out(slot),
        this.#nextSeq(),
        'urgent',
      );
      // A CLEAR executed on the CURRENT PRIMARY counts as adoption (see out()).
      if (ok && onPrimary) this.#adopted.add(adoptionKey(slot));
    }
    return { accepted: true };
  }

  // ── connections ─────────────────────────────────────────────────────
  config(): ConnectionConfig {
    return this.#config;
  }

  health(): ConnectionHealth {
    // `primary`/`backup` reflect the current ROLES (after failover, `primary`
    // is the live server). ServerSessionState and ServerHealth.state share the
    // same vocabulary.
    const cur = this.#adapter.currentPrimary;
    const other: ServerLabel = cur === 'A' ? 'B' : 'A';
    const snapshot = (label: ServerLabel): ConnectionHealth['primary'] => {
      const state = this.#sessions[label].state;
      return { label, state, amcpAxisOk: state === 'healthy' };
    };
    return {
      primary: snapshot(cur),
      backup: snapshot(other),
      currentPrimary: cur,
      strategy: this.#config.strategy,
      ...(this.#lastFailover !== undefined ? { lastFailover: this.#lastFailover } : {}),
    };
  }

  /** Manual operator failover (the `connections.failover` channel). Real switch. */
  async failover(): Promise<{ ok: boolean; newPrimary: ServerLabel }> {
    await this.#adapter.failover('manual');
    return { ok: true, newPrimary: this.#adapter.currentPrimary };
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
    const onAir = this.#reconciler.snapshot().some((i) => i.status === 'on-air');
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
   */
  async #adoptLayer(slot: CommandSlot): Promise<void> {
    const key = adoptionKey(slot);
    if (this.#adopted.has(key)) return;
    const { ok, onPrimary } = await this.#send(this.#builder.out(slot), this.#nextSeq(), 'normal');
    // A backup-only success (mirror-sync with the primary momentarily down)
    // did NOT clear the primary's layer — leave it unadopted so a later load
    // retries the CLEAR where the orphan actually lives.
    if (ok && onPrimary) this.#adopted.add(key);
  }

  #addInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.add(slot.channel, slot.layer);
    this.#sessions.B.osc.interest.add(slot.channel, slot.layer);
  }

  #removeInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.remove(slot.channel, slot.layer);
    this.#sessions.B.osc.interest.remove(slot.channel, slot.layer);
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
    const templateArg = this.#templateServer.listening
      ? this.#templateServer.urlFor(templateId)
      : templateId;
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
