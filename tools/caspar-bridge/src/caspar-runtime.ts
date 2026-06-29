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

/** CasparCG video channel the bridge drives (Phase 2: single channel). */
const DEFAULT_CHANNEL = 1;
/** Outbound delta coalescing window (Phase-2 NOTE — bound publishes under churn). */
const COALESCE_MS = 20;
/** Keep the post-reconnect resync window short so the bridge is responsive. */
const RESYNC_MS = 150;

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

  /** itemId → the slot we allocated for it (so take/update/out target it). */
  readonly #slots = new Map<string, CommandSlot>();
  #seq = 0;
  #lastFailover: ConnectionHealth['lastFailover'] = undefined;

  // Coalescing (Phase-2 NOTE): collapse per-itemId changes into bounded publishes.
  readonly #dirty = new Set<string>();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  // ── non-playout stub state ──────────────────────────────────────────
  #templates = new Map<string, TemplateInfo>();
  #lock: LockState = { engaged: false };
  #lockPin: string | null = null;
  #audit: AuditEntry[] = [];
  #settings: Settings = { telemetry: 'off' };
  #pendingUpdate: PendingUpdate | null = null;

  #started = false;

  constructor(config: ConnectionConfig) {
    this.#config = config;
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

  async stop(): Promise<void> {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    await Promise.all([this.#sessions.A.stop(), this.#sessions.B.stop()]);
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

    let slot: CommandSlot;
    try {
      slot = this.#allocate(templateId);
    } catch {
      this.#reconciler.applyAck(seq, false, 'no-layer');
      return { accepted: false };
    }
    this.#slots.set(itemId, slot);
    this.#reconciler.assignSlot(itemId, { ...slot, server: 'primary' });
    // Interest on BOTH sessions' OSC so whichever is primary, its confirmations
    // pass the filter (survives failover).
    this.#addInterest(slot);

    const ok = await this.#send(this.#builder.load(slot, templateId, fields), seq, 'normal');
    return { accepted: ok };
  }

  async take(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false, errorCode: 'unknown-item' };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'take', itemId }, seq);
    const ok = await this.#send(this.#builder.take(slot), seq, 'normal');
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
    const ok = await this.#send(this.#builder.update(slot, merged), seq, 'normal');
    return { accepted: ok };
  }

  async out(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    if (slot === undefined) return { accepted: false };
    const seq = this.#nextSeq();
    this.#reconciler.applyIntent({ kind: 'out', itemId }, seq);
    const ok = await this.#send(this.#builder.out(slot), seq, 'urgent');
    return { accepted: ok };
  }

  async remove(itemId: string): Promise<{ accepted: boolean }> {
    const slot = this.#slots.get(itemId);
    // Drop it from the stack immediately (UI responsiveness), then best-effort
    // clear the slot on the server.
    this.#reconciler.applyIntent({ kind: 'remove', itemId }, this.#nextSeq());
    if (slot !== undefined) {
      this.#slots.delete(itemId);
      this.#removeInterest(slot);
      this.#layers.deallocate(slot);
      await this.#send(this.#builder.out(slot), this.#nextSeq(), 'urgent');
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
    return this.#templates.get(templateId) ?? null;
  }
  templateList(): TemplateInfo[] {
    return [...this.#templates.values()];
  }
  templateImport(template: TemplateInfo): { registered: boolean; templateId: string } {
    this.#templates.set(template.templateId, template);
    return { registered: true, templateId: template.templateId };
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

  #addInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.add(slot.channel, slot.layer);
    this.#sessions.B.osc.interest.add(slot.channel, slot.layer);
  }

  #removeInterest(slot: CommandSlot): void {
    this.#sessions.A.osc.interest.remove(slot.channel, slot.layer);
    this.#sessions.B.osc.interest.remove(slot.channel, slot.layer);
  }

  /**
   * Send an AMCP line through the `RedundancyAdapter` (strategy-aware fan-out to
   * primary/backup; drives the auto-failover triggers), await the ack, and feed
   * it to the Reconciler.
   */
  async #send(line: string, seq: number, priority: 'urgent' | 'normal'): Promise<boolean> {
    try {
      const result = await this.#adapter.send(line, { priority });
      const ok = result.response.kind !== 'err';
      this.#reconciler.applyAck(seq, ok, ok ? undefined : `amcp-${String(result.response.code)}`);
      return ok;
    } catch {
      this.#reconciler.applyAck(seq, false, 'amcp-send-failed');
      return false;
    }
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
