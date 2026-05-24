import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import type { LockState } from '@cg/shared-ipc';

/**
 * LockService — operator-driven input lockout (Phase 6 §8).
 *
 * When engaged, the renderer puts up the lock overlay and blocks all
 * input. The PIN is stored hashed (sha256) so a memory dump doesn't
 * expose it. The full auto-idle behavior + system-initiated lock during
 * software update lands in M9; M5.4 polishes the UI.
 */
export interface LockServiceEvents {
  'state-changed': [state: LockState];
}

export interface LockServiceOptions {
  /** Override for tests. */
  now?: () => Date;
}

export class LockService extends EventEmitter<LockServiceEvents> {
  private engaged = false;
  private reason: LockState['reason'];
  private pinHash: string | null = null;
  private engagedAt: string | undefined;
  private readonly now: () => Date;

  constructor(options: LockServiceOptions = {}) {
    super();
    this.now = options.now ?? ((): Date => new Date());
  }

  /** Engage with a PIN. The PIN is hashed; the raw value is discarded immediately. */
  engage(pin: string, reason: LockState['reason'] = 'operator'): { ok: boolean } {
    if (this.engaged) return { ok: false };
    this.pinHash = sha256Hex(pin);
    this.engaged = true;
    this.reason = reason;
    this.engagedAt = this.now().toISOString();
    this.emit('state-changed', this.getState());
    return { ok: true };
  }

  /**
   * Release with the same PIN. Mismatch returns false and DOES NOT count
   * against any budget (Phase 6 §8 — operators don't get locked OUT;
   * the lock is to prevent accidental clicks, not adversarial attempts).
   */
  release(pin: string): { ok: boolean; reason?: 'pin-mismatch' | 'not-engaged' } {
    if (!this.engaged) return { ok: false, reason: 'not-engaged' };
    if (this.pinHash === null) return { ok: false, reason: 'not-engaged' };
    if (sha256Hex(pin) !== this.pinHash) return { ok: false, reason: 'pin-mismatch' };
    this.engaged = false;
    this.pinHash = null;
    this.reason = undefined;
    this.engagedAt = undefined;
    this.emit('state-changed', this.getState());
    return { ok: true };
  }

  /** Synchronous read for `lock.state` requests. */
  getState(): LockState {
    if (!this.engaged) return { engaged: false };
    const state: LockState = { engaged: true };
    if (this.reason !== undefined) state.reason = this.reason;
    if (this.engagedAt !== undefined) state.engagedAt = this.engagedAt;
    return state;
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}
