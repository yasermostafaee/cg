import type { AuditEntry, Position, StackItemState, StackItemStatus } from '@cg/shared-schema';
import type {
  ConnectionConfig,
  ConnectionHealth,
  LockState,
  OrphanLayer,
  OwnedOccupancyWarning,
  PendingUpdate,
  Settings,
  TemplateInfo,
} from '@cg/shared-ipc';
import { Emitter } from './emitter.js';
import { isLoopbackHost } from '../shared/loopback.js';
import { seedConfig, seedHealth, seedStack, seedTemplates } from './seed.js';

type FieldValues = StackItemState['fields'];

const SETTINGS_KEY = 'cg-runtime:settings';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * In-memory simulation of the CasparCG playout controller. Replaces the
 * Electron main process for the browser build until the local WebSocket↔TCP
 * bridge lands. Intents drive a simple status state machine; everything the
 * RuntimeBridge contract promises is implemented against mock state so the
 * operator UI is fully interactive.
 */
export class MockRuntime {
  readonly stackChanged = new Emitter<readonly StackItemState[]>();
  readonly healthChanged = new Emitter<ConnectionHealth>();
  readonly configChanged = new Emitter<ConnectionConfig>();
  readonly orphansChanged = new Emitter<OrphanLayer[]>();
  readonly ownedOccupancyChanged = new Emitter<OwnedOccupancyWarning[]>();
  readonly lockChanged = new Emitter<LockState>();
  readonly settingsChanged = new Emitter<Settings>();
  readonly updateChanged = new Emitter<PendingUpdate | null>();

  #stack: StackItemState[] = seedStack();
  #templates = new Map<string, TemplateInfo>(seedTemplates().map((t) => [t.templateId, t]));
  #config: ConnectionConfig = seedConfig();
  #health: ConnectionHealth = seedHealth('A');
  #lock: LockState = { engaged: false };
  #lockHash: string | null = null;
  #audit: AuditEntry[] = [];
  #pendingUpdate: PendingUpdate | null = null;
  // R-009 — the offline mock has no real server, so no orphans, EXCEPT a
  // test-only seed (CG_E2E_ORPHAN) so Playwright can drive the visible flow.
  #orphans: OrphanLayer[] = seedOrphans();
  // B-056 — same shape: no real primary to miss, EXCEPT a test-only seed
  // (CG_E2E_OWNED_OCCUPANCY) so Playwright can drive the warning + remedy.
  #ownedOccupancy: OwnedOccupancyWarning[] = seedOwnedOccupancy();
  // R-011 — per-item operator position overrides (bridge parity).
  readonly #positions = new Map<string, Position>();

  // ── stack ───────────────────────────────────────────────────────────
  stackSnapshot(): StackItemState[] {
    return this.#stack.map((i) => ({ ...i }));
  }

  load(itemId: string, templateId: string, fields: FieldValues): { accepted: boolean } {
    const next: StackItemState = { itemId, templateId, fields, status: 'loaded', pending: false };
    const idx = this.#stack.findIndex((i) => i.itemId === itemId);
    if (idx === -1) this.#stack.push(next);
    else this.#stack[idx] = next;
    this.#audit.unshift(auditEntry('load', { itemId, templateId }));
    this.#emitStack();
    return { accepted: true };
  }

  take(itemId: string): { accepted: boolean; errorCode?: string } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false, errorCode: 'unknown-item' };
    this.#transition(itemId, 'playing', true);
    this.#audit.unshift(auditEntry('take', { itemId, templateId: item.templateId }));
    this.#settle(itemId, 'on-air');
    return { accepted: true };
  }

  update(
    itemId: string,
    fields: FieldValues,
    mergeMode: 'merge' | 'replace',
  ): { accepted: boolean } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false };
    const merged = mergeMode === 'merge' ? { ...item.fields, ...fields } : fields;
    const wasOnAir = item.status === 'on-air' || item.status === 'playing';
    this.#patch(itemId, {
      fields: merged,
      status: wasOnAir ? 'updating' : item.status,
      pending: wasOnAir,
    });
    this.#audit.unshift(auditEntry('update', { itemId, templateId: item.templateId }));
    // B-044 contract: `updating` is transient — it settles to the item's
    // underlying on-air state on the (simulated) ack, never resting.
    if (wasOnAir) this.#settle(itemId, 'on-air');
    else this.#emitStack();
    return { accepted: true };
  }

  out(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false };
    this.#transition(itemId, 'exiting', true);
    this.#audit.unshift(auditEntry('out', { itemId, templateId: item.templateId }));
    this.#settle(itemId, 'idle');
    // B-056 parity — the mock's simulated servers are healthy, so an out's
    // CLEAR "lands on the primary": the item's warning provably resolves.
    this.#resolveOwnedOccupancy(itemId);
    return { accepted: true };
  }

  remove(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    this.#stack = this.#stack.filter((i) => i.itemId !== itemId);
    if (item !== null)
      this.#audit.unshift(auditEntry('remove', { itemId, templateId: item.templateId }));
    this.#emitStack();
    // B-056 parity — the item is gone / its layer deallocated.
    this.#resolveOwnedOccupancy(itemId);
    // R-011 parity — the override dies with the item.
    this.#positions.delete(itemId);
    return { accepted: true };
  }

  /**
   * R-011 parity — the bridge's set-position contract: refused while the
   * item is on air or unsettled (position is fixed once taken), stored
   * otherwise. The offline mock renders nothing, so storing is the whole
   * effect; the on-air runtime behavior is integration-tested bridge-side.
   */
  setPosition(
    itemId: string,
    position: Position,
  ): { ok: boolean; reason?: 'on-air' | 'unknown-item' } {
    const item = this.#find(itemId);
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
    return { ok: true };
  }

  /** R-011 — the stored override for an item (test/diagnostic surface). */
  positionOf(itemId: string): Position | undefined {
    return this.#positions.get(itemId);
  }

  /** R-010 — OUT + REMOVE everything: clears (simulated) air, empties the list. */
  removeAll(): { ok: boolean; removed: number } {
    const removed = this.#stack.length;
    for (const item of this.#stack) {
      this.#audit.unshift(
        auditEntry('remove', { itemId: item.itemId, templateId: item.templateId }),
      );
      // B-056 parity — every item's removal resolves its warning.
      this.#resolveOwnedOccupancy(item.itemId);
    }
    this.#stack = [];
    this.#emitStack();
    return { ok: true, removed };
  }

  // ── connections ─────────────────────────────────────────────────────
  config(): ConnectionConfig {
    return this.#config;
  }

  /**
   * R-010 — mock parity with the bridge's `setConfig`: same on-air gate
   * (playing/on-air/updating/exiting/unconfirmed or pending blocks), health
   * re-derived with/without the backup, and a simulated `exposed` flag for a
   * non-loopback primary. No real sockets — this is the offline mock.
   */
  setConfig(config: ConnectionConfig): {
    ok: boolean;
    // 'apply-in-progress' exists for parity with the serialized bridge apply
    // (fix-setconfig-serve-restart); the synchronous mock can never emit it.
    reason?: 'on-air-block' | 'apply-in-progress' | 'apply-failed';
    message?: string;
    templateServe?: { serveHost: string; port: number; exposed: boolean };
  } {
    const unsettled = this.#stack.filter(
      (i) =>
        i.pending ||
        i.status === 'playing' ||
        i.status === 'on-air' ||
        i.status === 'updating' ||
        i.status === 'exiting' ||
        i.status === 'unconfirmed',
    ).length;
    if (unsettled > 0) {
      return {
        ok: false,
        reason: 'on-air-block',
        message: `${String(unsettled)} item(s) are on air or unsettled — Remove All (or Out each item) first.`,
      };
    }
    this.#config = config;
    this.#health = this.#healthFor(config);
    this.#audit.unshift(auditEntry('reconnect', { server: 'primary' }));
    this.configChanged.emit(config);
    this.healthChanged.emit(this.#health);
    return {
      ok: true,
      templateServe: {
        serveHost: '127.0.0.1',
        port: 0,
        exposed: !isLoopbackHost(config.servers.A.host),
      },
    };
  }

  /** Health derived from the declared servers (backup card only when B exists). */
  #healthFor(config: ConnectionConfig): ConnectionHealth {
    const at = new Date().toISOString();
    return {
      primary: { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: at },
      ...(config.servers.B !== undefined
        ? { backup: { label: 'B' as const, state: 'healthy' as const, amcpAxisOk: true } }
        : {}),
      currentPrimary: 'A',
      strategy: config.strategy,
    };
  }

  health(): ConnectionHealth {
    return this.#health;
  }

  failover(): { ok: boolean; newPrimary: 'A' | 'B' } {
    // B-046 parity — nothing to fail over to without a declared backup.
    if (this.#config.servers.B === undefined) {
      return { ok: false, newPrimary: this.#health.currentPrimary };
    }
    const newPrimary = this.#health.currentPrimary === 'A' ? 'B' : 'A';
    this.#health = {
      ...seedHealth(newPrimary),
      lastFailover: {
        at: new Date().toISOString(),
        reason: 'manual',
        from: this.#health.currentPrimary,
        to: newPrimary,
      },
    };
    this.#audit.unshift(
      auditEntry('failover', { server: newPrimary === 'A' ? 'primary' : 'backup' }),
    );
    this.healthChanged.emit(this.#health);
    return { ok: true, newPrimary };
  }

  // ── layers (R-009) ──────────────────────────────────────────────────
  orphans(): OrphanLayer[] {
    return [...this.#orphans];
  }

  /**
   * R-009 parity — the mock "clears" a surfaced orphan (removes it and
   * publishes the change), matching the bridge's resolve-on-observed-empty
   * from the operator's point of view. Owned-layer refusal can't be
   * modeled (the mock has no layer slots); the bridge integration tests
   * carry that guard.
   */
  clearLayer(channel: number, layer: number): { ok: boolean; reason?: 'owned' | 'amcp-error' } {
    const before = this.#orphans.length;
    this.#orphans = this.#orphans.filter((o) => !(o.channel === channel && o.layer === layer));
    if (this.#orphans.length !== before) this.orphansChanged.emit(this.orphans());
    return { ok: true };
  }

  /** B-056 — the currently surfaced owned-slot warnings (offline: seed-only). */
  ownedOccupancy(): OwnedOccupancyWarning[] {
    return [...this.#ownedOccupancy];
  }

  /**
   * B-056 parity — drop an item's warning and publish the change. In the
   * offline mock the simulated servers are always healthy, so every
   * out/remove counts as a CLEAR provably landing on the primary.
   */
  #resolveOwnedOccupancy(itemId: string): void {
    const before = this.#ownedOccupancy.length;
    this.#ownedOccupancy = this.#ownedOccupancy.filter((w) => w.itemId !== itemId);
    if (this.#ownedOccupancy.length !== before) {
      this.ownedOccupancyChanged.emit(this.ownedOccupancy());
    }
  }

  // ── lock ────────────────────────────────────────────────────────────
  lockState(): LockState {
    return this.#lock;
  }

  async engage(pin: string): Promise<{ ok: boolean }> {
    this.#lockHash = await sha256Hex(pin);
    this.#lock = { engaged: true, reason: 'operator', engagedAt: new Date().toISOString() };
    this.#audit.unshift(auditEntry('lock-engage', {}));
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  async release(pin: string): Promise<{ ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' }> {
    if (!this.#lock.engaged) return { ok: false, reason: 'not-engaged' };
    if (this.#lockHash !== (await sha256Hex(pin))) return { ok: false, reason: 'pin-mismatch' };
    this.#lock = { engaged: false };
    this.#lockHash = null;
    this.#audit.unshift(auditEntry('lock-release', {}));
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  // ── templates ───────────────────────────────────────────────────────
  templateGet(templateId: string): TemplateInfo | null {
    return this.#templates.get(templateId) ?? null;
  }

  templateList(): TemplateInfo[] {
    return [...this.#templates.values()];
  }

  /**
   * Register a verified template (R-001). The renderer has already run
   * `@cg/vcg-format.verify` + `unpack` on the uploaded `.vcg`; we just extend
   * the in-memory registry so `templateGet` / `templateList` surface it (and the
   * Inspector picks up its field schema). A re-imported id overwrites the prior
   * entry. No persistence — the registry resets on reload (see design.md).
   */
  templateImport(template: TemplateInfo): { registered: boolean; templateId: string } {
    this.#templates.set(template.templateId, template);
    return { registered: true, templateId: template.templateId };
  }

  // ── audit ───────────────────────────────────────────────────────────
  auditRecent(limit = 200, action?: AuditEntry['action'], actor?: string): AuditEntry[] {
    let rows = this.#audit;
    if (action !== undefined) rows = rows.filter((r) => r.action === action);
    if (actor !== undefined) rows = rows.filter((r) => r.actor === actor);
    return rows.slice(0, limit);
  }

  // ── settings ────────────────────────────────────────────────────────
  settingsGet(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw !== null) return JSON.parse(raw) as Settings;
    } catch {
      /* fall through to default */
    }
    return { telemetry: 'off' };
  }

  settingsSet(patch: Partial<Settings>): Settings {
    const next: Settings = { ...this.settingsGet(), ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* non-persistent fallback is acceptable */
    }
    this.settingsChanged.emit(next);
    return next;
  }

  // ── update gate ─────────────────────────────────────────────────────
  updateRequest(
    version: string,
    notes?: string,
  ): {
    accepted: true;
    deferred: boolean;
    pending: PendingUpdate;
  } {
    const onAir = this.#stack.some((i) => i.status === 'on-air' || i.status === 'playing');
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
  #find(itemId: string): StackItemState | null {
    return this.#stack.find((i) => i.itemId === itemId) ?? null;
  }

  #patch(itemId: string, patch: Partial<StackItemState>): void {
    this.#stack = this.#stack.map((i) => (i.itemId === itemId ? { ...i, ...patch } : i));
    this.#emitStack();
  }

  #transition(itemId: string, status: StackItemStatus, pending: boolean): void {
    this.#patch(itemId, { status, pending });
  }

  /**
   * Simulated ack-settlement of the B-044 pending-intent contract: a transient
   * intent (`playing`+pending / `updating` / `exiting`) settles to its
   * underlying state when its own round-trip acks — here a 160 ms beat stands
   * in for the WS + AMCP round-trip. Mirrors the bridge Reconciler's
   * settle-on-ack (update → the underlying on-air state; out → `idle`); the
   * real path additionally expires to `unconfirmed` after 5 s without an ack —
   * the mock never loses acks, so it has no unconfirmed path.
   */
  #settle(itemId: string, status: StackItemStatus): void {
    setTimeout(() => {
      const item = this.#find(itemId);
      if (item === null || !item.pending) return;
      this.#patch(itemId, { status, pending: false });
    }, 160);
  }

  #emitStack(): void {
    this.stackChanged.emit(this.stackSnapshot());
  }
}

function auditEntry(action: AuditEntry['action'], extra: Partial<AuditEntry>): AuditEntry {
  return { ts: new Date().toISOString(), actor: 'operator', action, outcome: 'ok', ...extra };
}

/**
 * R-009 — e2e-only orphan seed: with `window.CG_E2E_ORPHAN` armed (via
 * addInitScript, alongside the CG_E2E flag) the offline mock boots with one
 * surfaced orphan so Playwright can drive the banner + Clear flow. The
 * bridge-side truth (real OSC tap + sweep) is integration-tested.
 */
function seedOrphans(): OrphanLayer[] {
  const flagged = (globalThis as { CG_E2E_ORPHAN?: boolean }).CG_E2E_ORPHAN === true;
  return flagged
    ? [{ channel: 1, layer: 60, producer: 'html', since: new Date().toISOString() }]
    : [];
}

/**
 * B-056 — e2e-only owned-slot warning seed: with `window.CG_E2E_OWNED_OCCUPANCY`
 * armed the offline mock boots with one warning against a seeded stack item so
 * Playwright can drive the banner + Out/Remove remedy. The bridge-side truth
 * (load-time detection off the real OSC tap) is integration-tested.
 *
 * The itemId MUST name a row that `seedStack()` actually creates — the remedy
 * the E2E drives is removing that row.
 */
function seedOwnedOccupancy(): OwnedOccupancyWarning[] {
  const flagged =
    (globalThis as { CG_E2E_OWNED_OCCUPANCY?: boolean }).CG_E2E_OWNED_OCCUPANCY === true;
  return flagged
    ? [
        {
          channel: 1,
          layer: 10,
          itemId: 'item-irib-news',
          producer: 'html',
          since: new Date().toISOString(),
        },
      ]
    : [];
}
