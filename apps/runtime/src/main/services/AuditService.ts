import { AuditWriter } from '@cg/audit';
import type { AuditEntry } from '@cg/shared-schema';
import type { LockState } from '@cg/shared-ipc';
import type { LockService } from './LockService.js';
import type { StackService } from './StackService.js';

/**
 * AuditService — observes operator intents + reconciler outcomes and
 * appends one AuditEntry to disk per air-affecting action.
 *
 * For M5.4 the entries the StackService can supply are limited; we
 * record action + itemId + templateId + outcome. ack-ms and
 * osc-confirm-ms latency tracking lands when the Reconciler grows a
 * per-item event timeline (M7's binding work) — that's a deeper hook
 * than M5 needs.
 *
 * Failure mode: if the writer's append fails, the service emits the
 * error upward but the runtime keeps going. The status bar surfaces
 * `audit not OK` in M9; for now it's a console warning.
 */
export interface AuditServiceOptions {
  /** Absolute path to the NDJSON file. */
  filePath: string;
  /** Identity stamped on every entry. Defaults to `'local'`. */
  actor?: string;
  /** Override for tests. */
  now?: () => Date;
  writer?: AuditWriter;
}

export class AuditService {
  readonly writer: AuditWriter;
  /** Path to the NDJSON file the writer is appending to (M8.5 reader uses this). */
  readonly filePath: string;
  private readonly actor: string;
  private boundStack: StackService | null = null;
  private stackListener:
    | ((snapshot: readonly { itemId: string; status: string }[]) => void)
    | null = null;
  private prevSnapshot: ReadonlyMap<string, string> = new Map();
  private boundLock: LockService | null = null;
  private lockListener: ((state: LockState) => void) | null = null;
  /**
   * Single-writer queue so audit rows land on disk in the order their
   * triggering events fired. Without this serialization, three rapid
   * snapshot pushes could complete `writer.append()` out of order on
   * slow hosts — and the forensic log loses its causal ordering.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(options: AuditServiceOptions) {
    this.actor = options.actor ?? 'local';
    this.filePath = options.filePath;
    this.writer =
      options.writer ??
      new AuditWriter({
        filePath: options.filePath,
        ...(options.now !== undefined ? { now: options.now } : {}),
      });
  }

  /**
   * Subscribe to a `StackService` and write an audit entry for each
   * status transition that crosses a take/out/remove boundary.
   *
   * The mapping from reconciled status changes to AuditAction is
   * lossy by design — multiple OSC ticks during the same take don't
   * produce duplicate audit rows.
   */
  bindStack(stack: StackService): void {
    if (this.boundStack !== null) return;
    this.boundStack = stack;
    this.prevSnapshot = snapshotMap(stack.snapshot());
    this.stackListener = (snapshot) => {
      const next = snapshotMap(snapshot);
      const prev = this.prevSnapshot;
      this.prevSnapshot = next;
      // Capture prev/next on the synchronous tick; chain the disk
      // writes so concurrent snapshot pushes produce serialized rows.
      this.enqueue(() => this.diffAndEmit(prev, next));
    };
    stack.on('state-changed', this.stackListener);
  }

  private enqueue(work: () => Promise<unknown>): void {
    this.writeChain = this.writeChain.then(work, work).catch((err: unknown) => {
      // append already emits 'error' on the writer; this catch keeps
      // the chain alive across failures.
      void err;
    });
  }

  unbindStack(): void {
    if (this.boundStack === null || this.stackListener === null) return;
    this.boundStack.off('state-changed', this.stackListener);
    this.boundStack = null;
    this.stackListener = null;
  }

  /**
   * Subscribe to a `LockService` and emit an audit entry on every
   * engage/release transition (M8.4). Wrong-PIN attempts don't fire
   * 'state-changed' so they're not recorded here — by design, since
   * the lock is for accident-prevention, not auth.
   */
  bindLock(lock: LockService): void {
    if (this.boundLock !== null) return;
    this.boundLock = lock;
    let prevEngaged = lock.getState().engaged;
    this.lockListener = (state) => {
      if (state.engaged === prevEngaged) return;
      prevEngaged = state.engaged;
      const action: AuditEntry['action'] = state.engaged ? 'lock-engage' : 'lock-release';
      this.enqueue(() => this.record({ action, outcome: 'ok' }));
    };
    lock.on('state-changed', this.lockListener);
  }

  unbindLock(): void {
    if (this.boundLock === null || this.lockListener === null) return;
    this.boundLock.off('state-changed', this.lockListener);
    this.boundLock = null;
    this.lockListener = null;
  }

  /** Write an arbitrary entry — for failover/reconnect/import/export. */
  async record(entry: Omit<AuditEntry, 'ts' | 'actor'> & { actor?: string }): Promise<void> {
    await this.writer.append({
      ...entry,
      actor: entry.actor ?? this.actor,
    });
  }

  async close(): Promise<void> {
    this.unbindStack();
    this.unbindLock();
    // Drain pending writes before closing the file handle, otherwise
    // queued appends fire against a closed handle and surface as test
    // flakes.
    await this.flush();
    await this.writer.close();
  }

  /**
   * Wait for any queued audit appends to land on disk. Tests use this
   * to avoid the `setTimeout(30)` heuristic that flaked on slow CI hosts.
   * Production code generally doesn't need to call this — `close()` does.
   */
  async flush(): Promise<void> {
    await this.writeChain.catch(() => undefined);
  }

  private async diffAndEmit(
    prevSnap: ReadonlyMap<string, string>,
    next: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const [itemId, status] of next) {
      const prev = prevSnap.get(itemId);
      if (prev === status) continue;
      const action = transitionToAction(prev, status);
      if (action === null) continue;
      await this.writer.append({
        actor: this.actor,
        action,
        itemId,
        outcome: 'ok',
      });
    }
    for (const itemId of prevSnap.keys()) {
      if (!next.has(itemId)) {
        await this.writer.append({
          actor: this.actor,
          action: 'remove',
          itemId,
          outcome: 'ok',
        });
      }
    }
  }
}

function snapshotMap(
  snapshot: readonly { itemId: string; status: string }[],
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const item of snapshot) out.set(item.itemId, item.status);
  return out;
}

/**
 * Map a reconciled-status transition to the operator-facing action.
 * Returns null when the transition doesn't deserve an audit row
 * (e.g. a transient pending flicker).
 */
function transitionToAction(prev: string | undefined, next: string): AuditEntry['action'] | null {
  if (prev === undefined) return next === 'idle' ? null : 'load';
  if (prev === 'loaded' && (next === 'playing' || next === 'on-air')) return 'take';
  if ((prev === 'playing' || prev === 'on-air') && next === 'updating') return 'update';
  if ((prev === 'playing' || prev === 'on-air' || prev === 'updating') && next === 'exiting')
    return 'out';
  if ((prev === 'exiting' || prev === 'playing' || prev === 'on-air') && next === 'idle')
    return 'out';
  return null;
}
