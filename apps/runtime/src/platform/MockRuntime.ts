import type { AuditEntry, StackItemState, StackItemStatus } from '@cg/shared-schema';
import type {
  ConnectionConfig,
  ConnectionHealth,
  LockState,
  PendingUpdate,
  Settings,
  TemplateInfo,
} from '@cg/shared-ipc';
import { Emitter } from './emitter.js';
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

  /** Resolve a pending transition to its settled status after a short beat. */
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
