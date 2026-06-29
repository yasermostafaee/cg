import type { AuditEntry, StackItemState, StackItemStatus } from '@cg/shared-schema';
import type {
  ConnectionConfig,
  ConnectionHealth,
  LockState,
  PendingUpdate,
  Settings,
  TemplateInfo,
} from '@cg/shared-ipc';

type FieldValues = StackItemState['fields'];

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
 * **Throwaway** in-memory runtime for C-001 **Phase 1**. It answers the full
 * `@cg/shared-ipc` RuntimeBridge contract from a simple state machine so the
 * browser↔bridge round-trip (request/response + publish) is provable end to end
 * **without any real CasparCG**.
 *
 * Phase 2 deletes this and drops the real `@cg/caspar-client` stack
 * (ServerSession + CommandQueue + OSC pipeline + Reconciler + RedundancyAdapter)
 * behind the unchanged wire. This file MUST NOT import `@cg/caspar-client`.
 *
 * It mirrors `apps/runtime/src/platform/MockRuntime.ts` but is Node-side: no
 * `localStorage` (settings are in-memory) and the lock PIN is held in memory
 * (the real lock/credential handling is not a Phase-1 concern).
 */
export class RuntimeBacking {
  readonly stackChanged = new Emitter<readonly StackItemState[]>();
  readonly healthChanged = new Emitter<ConnectionHealth>();
  readonly lockChanged = new Emitter<LockState>();
  readonly settingsChanged = new Emitter<Settings>();
  readonly updateChanged = new Emitter<PendingUpdate | null>();

  #stack: StackItemState[] = seedStack();
  #templates = new Map<string, TemplateInfo>();
  #config: ConnectionConfig = seedConfig();
  #health: ConnectionHealth = seedHealth('A');
  #lock: LockState = { engaged: false };
  #lockPin: string | null = null;
  #audit: AuditEntry[] = [];
  #settings: Settings = { telemetry: 'off' };
  #pendingUpdate: PendingUpdate | null = null;

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
    this.#patch(itemId, { status: 'on-air', pending: false });
    this.#audit.unshift(auditEntry('take', { itemId, templateId: item.templateId }));
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
    this.#patch(itemId, { fields: merged });
    this.#audit.unshift(auditEntry('update', { itemId, templateId: item.templateId }));
    return { accepted: true };
  }

  out(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    if (item === null) return { accepted: false };
    this.#patch(itemId, { status: 'idle', pending: false });
    this.#audit.unshift(auditEntry('out', { itemId, templateId: item.templateId }));
    return { accepted: true };
  }

  remove(itemId: string): { accepted: boolean } {
    const item = this.#find(itemId);
    this.#stack = this.#stack.filter((i) => i.itemId !== itemId);
    if (item !== null)
      this.#audit.unshift(auditEntry('remove', { itemId, templateId: item.templateId }));
    this.#emitStack();
    return { accepted: true };
  }

  // ── connections ─────────────────────────────────────────────────────
  config(): ConnectionConfig {
    return this.#config;
  }

  health(): ConnectionHealth {
    return this.#health;
  }

  failover(): { ok: boolean; newPrimary: 'A' | 'B' } {
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

  // ── lock ────────────────────────────────────────────────────────────
  lockState(): LockState {
    return this.#lock;
  }

  engage(pin: string): { ok: boolean } {
    this.#lockPin = pin;
    this.#lock = { engaged: true, reason: 'operator', engagedAt: new Date().toISOString() };
    this.#audit.unshift(auditEntry('lock-engage', {}));
    this.lockChanged.emit(this.#lock);
    return { ok: true };
  }

  release(pin: string): { ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' } {
    if (!this.#lock.engaged) return { ok: false, reason: 'not-engaged' };
    if (this.#lockPin !== pin) return { ok: false, reason: 'pin-mismatch' };
    this.#lock = { engaged: false };
    this.#lockPin = null;
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
    return this.#settings;
  }

  settingsSet(patch: Partial<Settings>): Settings {
    this.#settings = { ...this.#settings, ...patch };
    this.settingsChanged.emit(this.#settings);
    return this.#settings;
  }

  // ── update gate ─────────────────────────────────────────────────────
  updateRequest(
    version: string,
    notes?: string,
  ): { accepted: true; deferred: boolean; pending: PendingUpdate } {
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

  #emitStack(): void {
    this.stackChanged.emit(this.stackSnapshot());
  }
}

function auditEntry(action: AuditEntry['action'], extra: Partial<AuditEntry>): AuditEntry {
  return { ts: new Date().toISOString(), actor: 'operator', action, outcome: 'ok', ...extra };
}

// ── seeds (minimal; throwaway) ────────────────────────────────────────────

function seedStack(): StackItemState[] {
  const fields: FieldValues = {};
  return [
    {
      itemId: 'demo-1',
      templateId: 'lower-third',
      fields,
      status: 'idle' as StackItemStatus,
      pending: false,
    },
  ];
}

function seedConfig(): ConnectionConfig {
  const endpoint = { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 };
  return {
    servers: { A: endpoint, B: { ...endpoint, amcpPort: 5251, oscPort: 6251 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

function seedHealth(primary: 'A' | 'B'): ConnectionHealth {
  const session = (label: 'A' | 'B') => ({ label, state: 'healthy', amcpAxisOk: true }) as const;
  return {
    primary: session('A'),
    backup: session('B'),
    currentPrimary: primary,
    strategy: 'mirror-sync',
  };
}
