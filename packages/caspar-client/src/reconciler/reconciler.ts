import { EventEmitter } from 'node:events';
import type {
  FieldValues,
  Intent,
  LayerSlot,
  OscEvent,
  StackItemState,
  StackItemStatus,
} from '@cg/shared-schema';

/**
 * Reconciler — the single source of `StackItemState` for the Runtime UI.
 *
 * Inputs (from the runtime / caspar-client wiring):
 *   - operator intents (load / take / update / out / remove)
 *   - AMCP acks correlated by `intentSeq`
 *   - OSC events (`osc.layer.foreground.producer` etc.)
 *   - failover / split-brain notifications
 *
 * Merge rule (Phase 5 §8.3):
 *
 *   reconciled.status =
 *     if truthStatus and (now - lastOscAt) < truthTtlMs → truthStatus
 *     else if ackedStatus exists                       → ackedStatus
 *     else                                              → intentStatus
 *
 *   reconciled.pending = intentStatus !== reconciled.status
 *
 *   if pending && (now - pendingSince) > divergentAfterMs →
 *     emit 'item-divergent'
 */
export interface ReconcilerOptions {
  /**
   * Maximum age in ms of an OSC observation before we stop trusting it
   * over the AMCP ack. Phase 5 §8.3 says 1000 ms.
   */
  truthTtlMs?: number;
  /**
   * After this many ms of `intent !== reconciled`, emit `'item-divergent'`.
   * Phase 5 §8.3 says 1000 ms.
   */
  divergentAfterMs?: number;
  /** Override for tests. */
  now?: () => number;
}

export interface ReconcilerEvents {
  /** Fired whenever an item's reconciled state changes. */
  'item-changed': [state: StackItemState];
  /** Fired when intent and reconciled diverge for too long. */
  'item-divergent': [
    info: { itemId: string; intent: StackItemStatus; reconciled: StackItemStatus },
  ];
  /** Fired when an item is removed from the stack. */
  'item-removed': [info: { itemId: string }];
  /** Fired when OSC reports a slot occupied for a different item than we expected. */
  'unexpected-onair': [info: { slot: LayerSlot; producer: string }];
}

/** Internal record kept per stack item. */
interface ItemRecord {
  itemId: string;
  templateId: string;
  fields: FieldValues;
  fieldsHash: string;
  intentStatus: StackItemStatus;
  ackedStatus?: StackItemStatus;
  truthStatus?: StackItemStatus;
  slot?: LayerSlot;
  lastIntentSeq?: number;
  lastAckAt?: number;
  lastOscAt?: number;
  pendingSince?: number;
  errorCode?: string;
}

export class Reconciler extends EventEmitter<ReconcilerEvents> {
  private readonly items = new Map<string, ItemRecord>();
  /** itemId indexed by `(channel, layer)` so OSC events route to the right item. */
  private readonly slotIndex = new Map<string, string>();
  /** Intent seq → itemId, populated when ack arrives. */
  private readonly seqIndex = new Map<number, string>();
  private readonly truthTtlMs: number;
  private readonly divergentAfterMs: number;
  private readonly now: () => number;
  private suspended = false;
  private readonly queuedIntents: { intent: Intent; seq: number; at: number }[] = [];

  constructor(options: ReconcilerOptions = {}) {
    super();
    this.truthTtlMs = options.truthTtlMs ?? 1000;
    this.divergentAfterMs = options.divergentAfterMs ?? 1000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Apply an operator intent. Returns the post-intent reconciled state. */
  applyIntent(intent: Intent, seq: number): StackItemState | null {
    if (this.suspended && !isImmediateIntent(intent)) {
      this.queuedIntents.push({ intent, seq, at: this.now() });
      return null;
    }
    return this.applyIntentInternal(intent, seq);
  }

  /**
   * Correlate an AMCP ack to its originating intent (by seq). The merge
   * rule prefers OSC truth, so the ack's effect is to bump `ackedStatus`
   * — which only wins until OSC catches up.
   */
  applyAck(seq: number, ok: boolean, errorCode?: string): StackItemState | null {
    const itemId = this.seqIndex.get(seq);
    if (itemId === undefined) return null;
    const rec = this.items.get(itemId);
    if (rec === undefined) return null;

    rec.lastAckAt = this.now();
    if (ok) {
      rec.ackedStatus = intentToAckedStatus(rec.intentStatus);
      delete rec.errorCode;
    } else {
      rec.ackedStatus = 'error';
      if (errorCode !== undefined) rec.errorCode = errorCode;
    }
    return this.emitChange(rec);
  }

  /**
   * Apply an OSC observation. For layer-state events, updates `truthStatus`
   * via the producer transition (empty ↔ html).
   */
  applyOsc(event: OscEvent): readonly StackItemState[] {
    const at = this.now();
    if (event.kind === 'osc.layer.foreground.producer') {
      const key = slotKey({ channel: event.channel, layer: event.layer, server: 'primary' });
      const itemId = this.slotIndex.get(key);
      if (itemId !== undefined) {
        const rec = this.items.get(itemId);
        if (rec !== undefined) {
          rec.lastOscAt = at;
          rec.truthStatus = event.producer === 'empty' ? 'idle' : 'on-air';
          return [this.emitChange(rec)];
        }
      } else if (event.producer !== 'empty') {
        // We don't own this slot but it's occupied — UNEXPECTED.
        this.emit('unexpected-onair', {
          slot: { channel: event.channel, layer: event.layer, server: 'primary' },
          producer: event.producer,
        });
      }
    }
    // Other OSC kinds don't directly affect per-item state in this milestone.
    return [];
  }

  /** Snapshot the entire stack state for the UI. */
  snapshot(): readonly StackItemState[] {
    return [...this.items.values()].map((rec) => this.toState(rec));
  }

  /** Per-item snapshot, or null if unknown. */
  get(itemId: string): StackItemState | null {
    const rec = this.items.get(itemId);
    return rec === undefined ? null : this.toState(rec);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Resync coordination
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Begin a resync window — incoming non-immediate intents queue up. The
   * caller is expected to drain OSC observations during the resync, then
   * call `endResync()`.
   *
   * Returns the snapshot of currently-allocated slots — the caller uses
   * this to compare against OSC truth (Phase 5 §8.5 step 4).
   */
  beginResync(): readonly { itemId: string; slot: LayerSlot; intent: StackItemStatus }[] {
    this.suspended = true;
    const out: { itemId: string; slot: LayerSlot; intent: StackItemStatus }[] = [];
    for (const rec of this.items.values()) {
      if (rec.slot !== undefined) {
        out.push({ itemId: rec.itemId, slot: rec.slot, intent: rec.intentStatus });
      }
    }
    return out;
  }

  /** Complete the resync window and drain queued intents. */
  endResync(): readonly StackItemState[] {
    this.suspended = false;
    const drained = this.queuedIntents.splice(0, this.queuedIntents.length);
    const out: StackItemState[] = [];
    for (const q of drained) {
      const result = this.applyIntentInternal(q.intent, q.seq);
      if (result !== null) out.push(result);
    }
    return out;
  }

  /** Number of queued intents awaiting drain. Diagnostic. */
  get queueDepth(): number {
    return this.queuedIntents.length;
  }

  /** True iff `beginResync()` has been called and `endResync()` has not. */
  get isSuspended(): boolean {
    return this.suspended;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────

  private applyIntentInternal(intent: Intent, seq: number): StackItemState | null {
    switch (intent.kind) {
      case 'load': {
        const rec: ItemRecord = {
          itemId: intent.itemId,
          templateId: intent.templateId,
          fields: intent.fields,
          fieldsHash: hashFields(intent.fields),
          intentStatus: 'loaded',
          lastIntentSeq: seq,
        };
        this.items.set(rec.itemId, rec);
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'take': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        rec.intentStatus = 'playing';
        rec.lastIntentSeq = seq;
        rec.pendingSince = this.now();
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'update': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        rec.fields =
          intent.mergeMode === 'replace' ? intent.fields : { ...rec.fields, ...intent.fields };
        rec.fieldsHash = hashFields(rec.fields);
        rec.intentStatus = 'updating';
        rec.lastIntentSeq = seq;
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'out': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        rec.intentStatus = intent.immediate === true ? 'idle' : 'exiting';
        rec.lastIntentSeq = seq;
        rec.pendingSince = this.now();
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'remove': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        this.items.delete(intent.itemId);
        if (rec.slot !== undefined) this.slotIndex.delete(slotKey(rec.slot));
        this.emit('item-removed', { itemId: intent.itemId });
        return null;
      }
      case 'failover':
      case 'reconnect': {
        // No per-item state change here; the adapter handles these.
        return null;
      }
    }
  }

  /**
   * Bind an item to a slot. Called by the caller (LayerManager / runtime)
   * after `allocate` returns so OSC events on that slot route correctly.
   */
  assignSlot(itemId: string, slot: LayerSlot): StackItemState | null {
    const rec = this.items.get(itemId);
    if (rec === undefined) return null;
    if (rec.slot !== undefined) this.slotIndex.delete(slotKey(rec.slot));
    rec.slot = slot;
    this.slotIndex.set(slotKey(slot), itemId);
    return this.emitChange(rec);
  }

  private emitChange(rec: ItemRecord): StackItemState {
    if (this.isConfirmed(rec)) {
      delete rec.pendingSince;
    } else if (rec.pendingSince === undefined && !isTerminalStatus(rec.intentStatus)) {
      rec.pendingSince = this.now();
    }
    const state = this.toState(rec);
    this.emit('item-changed', state);
    if (state.pending && rec.pendingSince !== undefined) {
      const elapsed = this.now() - rec.pendingSince;
      if (elapsed > this.divergentAfterMs) {
        this.emit('item-divergent', {
          itemId: rec.itemId,
          intent: rec.intentStatus,
          reconciled: state.status,
        });
      }
    }
    return state;
  }

  private toState(rec: ItemRecord): StackItemState {
    const reconciledStatus = this.reconcileStatus(rec);
    const pending = !isTerminalStatus(rec.intentStatus) && !this.isConfirmed(rec);
    return {
      itemId: rec.itemId,
      templateId: rec.templateId,
      fields: rec.fields,
      status: reconciledStatus,
      pending,
      ...(rec.lastIntentSeq !== undefined && { lastIntentSeq: rec.lastIntentSeq }),
      ...(rec.lastOscAt !== undefined && { lastOscAt: new Date(rec.lastOscAt).toISOString() }),
      ...(rec.slot !== undefined && { slot: rec.slot }),
      ...(rec.errorCode !== undefined && { errorCode: rec.errorCode }),
    };
  }

  private reconcileStatus(rec: ItemRecord): StackItemStatus {
    const fresh = this.freshTruth(rec);
    if (fresh !== null) return fresh;
    if (rec.ackedStatus !== undefined) return rec.ackedStatus;
    return rec.intentStatus;
  }

  /** Returns the truth status if it exists and is fresh, otherwise null. */
  private freshTruth(rec: ItemRecord): StackItemStatus | null {
    if (rec.truthStatus === undefined || rec.lastOscAt === undefined) return null;
    if (this.now() - rec.lastOscAt >= this.truthTtlMs) return null;
    return rec.truthStatus;
  }

  /**
   * True iff downstream evidence (fresh OSC, or AMCP ack) confirms the
   * intent. "Confirms" is structural — truth=`on-air` confirms intent
   * `playing`, truth=`idle` confirms intent `exiting`, etc.
   */
  private isConfirmed(rec: ItemRecord): boolean {
    const fresh = this.freshTruth(rec);
    if (fresh !== null) {
      return truthConfirmsIntent(fresh, rec.intentStatus);
    }
    if (rec.ackedStatus !== undefined) {
      return rec.ackedStatus === rec.intentStatus;
    }
    return false;
  }
}

/**
 * Map an operator-level intent status to the acked-state. Mostly identity,
 * but `playing` → `on-air` is reserved for OSC truth.
 */
function intentToAckedStatus(intent: StackItemStatus): StackItemStatus {
  // We don't promote `playing` → `on-air` on the ack — that requires OSC
  // truth. Everything else echoes the intent.
  return intent;
}

/** Terminal intents don't require physical-state confirmation. */
function isTerminalStatus(status: StackItemStatus): boolean {
  return status === 'idle' || status === 'loaded';
}

/**
 * Map between intent statuses and the OSC-side truth values that confirm
 * them. e.g. intent `playing` is confirmed by truth `on-air` (the wire
 * doesn't report "playing" directly — the producer flipping to non-empty
 * is the signal).
 */
function truthConfirmsIntent(truth: StackItemStatus, intent: StackItemStatus): boolean {
  if (truth === intent) return true;
  if ((intent === 'playing' || intent === 'updating') && truth === 'on-air') return true;
  if (intent === 'exiting' && truth === 'idle') return true;
  return false;
}

/** Intents that are NOT queued during resync (lifecycle / control flow). */
function isImmediateIntent(intent: Intent): boolean {
  return intent.kind === 'failover' || intent.kind === 'reconnect' || intent.kind === 'remove';
}

function slotKey(slot: LayerSlot): string {
  return `${String(slot.channel)}:${String(slot.layer)}`;
}

/**
 * Stable string fingerprint of a FieldValues object. Used by the journal /
 * audit log to detect field changes. Not cryptographic — just stable.
 */
function hashFields(fields: FieldValues): string {
  const keys = Object.keys(fields).sort();
  return keys.map((k) => `${k}=${stringifyValue(fields[k])}`).join('|');
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return '?';
  }
}
