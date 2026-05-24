import { EventEmitter } from 'node:events';
import type { StackService } from './StackService.js';

/**
 * UpdateGate — Phase 8 §12 / M9.2.
 *
 * Refuses application auto-update installs while any stack item is
 * `playing` or `on-air`. The actual electron-updater integration lands
 * with the signed-installer pipeline in M11; this service ships the
 * *gate logic* so the auto-updater can be wired without re-deriving
 * the on-air check (which would inevitably drift from the Reconciler's
 * truth).
 *
 * Lifecycle:
 *
 *   request(info) → either:
 *     - accepted=true, deferred=false  → safe to install now
 *     - accepted=true, deferred=true   → queued; auto-fires when off-air
 *     - accepted=false                 → caller policy (shouldn't happen
 *                                        in v1; reserved for future
 *                                        version-gate logic)
 *
 * Emits `install-ready(info)` when a deferred install becomes safe to
 * run. The caller subscribes to this and triggers the underlying
 * `autoUpdater.quitAndInstall()`.
 */

export interface PendingUpdate {
  /** Version string from the updater (e.g. '1.4.2'). */
  version: string;
  /** Optional release notes / changelog snippet. */
  notes?: string;
  /** Timestamp the update was first requested (ISO). */
  requestedAt: string;
}

export interface UpdateGateEvents {
  /** Fired when the pending update is now safe to install. */
  'install-ready': [info: PendingUpdate];
  /** Fired when the gate's pending state changes (UI subscribes here). */
  'state-changed': [pending: PendingUpdate | null];
}

export interface UpdateGateOptions {
  stack: StackService;
  /** Override for tests. */
  now?: () => Date;
}

const ON_AIR_STATUSES: ReadonlySet<string> = new Set(['playing', 'on-air', 'updating', 'exiting']);

export class UpdateGate extends EventEmitter<UpdateGateEvents> {
  private readonly stack: StackService;
  private readonly now: () => Date;
  private pending: PendingUpdate | null = null;

  constructor(options: UpdateGateOptions) {
    super();
    this.stack = options.stack;
    this.now = options.now ?? ((): Date => new Date());
    this.stack.on('state-changed', () => this.checkOnAirAndMaybeFire());
  }

  /**
   * Ask the gate whether `info` can be installed right now.
   *
   * - If nothing is on-air, returns `{ accepted: true, deferred: false }`.
   * - If something is on-air, queues `info` (replacing any earlier
   *   pending update) and returns `{ accepted: true, deferred: true }`.
   *   The caller subscribes to `install-ready` to know when to actually
   *   install.
   */
  request(info: { version: string; notes?: string }): {
    accepted: true;
    deferred: boolean;
    pending: PendingUpdate;
  } {
    const pending: PendingUpdate = {
      version: info.version,
      requestedAt: this.now().toISOString(),
      ...(info.notes !== undefined ? { notes: info.notes } : {}),
    };
    if (!this.isOnAir()) {
      // Clear any prior queue so the next caller starts fresh.
      this.pending = null;
      this.emit('state-changed', null);
      return { accepted: true, deferred: false, pending };
    }
    this.pending = pending;
    this.emit('state-changed', pending);
    return { accepted: true, deferred: true, pending };
  }

  /** Current pending update or null. Synchronous snapshot for IPC. */
  getPending(): PendingUpdate | null {
    return this.pending;
  }

  /** Cancel any pending update — operator-driven. */
  cancel(): void {
    if (this.pending === null) return;
    this.pending = null;
    this.emit('state-changed', null);
  }

  /** True when at least one item is in an on-air status. */
  private isOnAir(): boolean {
    for (const item of this.stack.snapshot()) {
      if (ON_AIR_STATUSES.has(item.status)) return true;
    }
    return false;
  }

  /**
   * Re-checked on every stack snapshot. If we have a pending update AND
   * nothing is on-air, fire `install-ready`. The caller's handler is
   * expected to invoke the actual updater; we don't loop on the event
   * because state-changed only fires once per transition.
   */
  private checkOnAirAndMaybeFire(): void {
    if (this.pending === null) return;
    if (this.isOnAir()) return;
    const ready = this.pending;
    this.pending = null;
    this.emit('install-ready', ready);
    this.emit('state-changed', null);
  }
}
