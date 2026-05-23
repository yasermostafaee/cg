import { AuditWriter } from '@cg/audit';
import type { AuditEntry } from '@cg/shared-schema';
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
  private readonly actor: string;
  private boundStack: StackService | null = null;
  private stackListener:
    | ((snapshot: readonly { itemId: string; status: string }[]) => void)
    | null = null;
  private prevSnapshot: ReadonlyMap<string, string> = new Map();

  constructor(options: AuditServiceOptions) {
    this.actor = options.actor ?? 'local';
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
      this.diffAndEmit(next).catch((err: unknown) => {
        // append already emits 'error' on the writer; this catch keeps
        // the diff loop alive.
        void err;
      });
      this.prevSnapshot = next;
    };
    stack.on('state-changed', this.stackListener);
  }

  unbindStack(): void {
    if (this.boundStack === null || this.stackListener === null) return;
    this.boundStack.off('state-changed', this.stackListener);
    this.boundStack = null;
    this.stackListener = null;
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
    await this.writer.close();
  }

  private async diffAndEmit(next: ReadonlyMap<string, string>): Promise<void> {
    const writes: Promise<unknown>[] = [];
    for (const [itemId, status] of next) {
      const prev = this.prevSnapshot.get(itemId);
      if (prev === status) continue;
      const action = transitionToAction(prev, status);
      if (action === null) continue;
      writes.push(
        this.writer.append({
          actor: this.actor,
          action,
          itemId,
          outcome: 'ok',
        }),
      );
    }
    for (const itemId of this.prevSnapshot.keys()) {
      if (!next.has(itemId)) {
        writes.push(
          this.writer.append({
            actor: this.actor,
            action: 'remove',
            itemId,
            outcome: 'ok',
          }),
        );
      }
    }
    await Promise.all(writes);
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
