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
 *
 * B-053 — truthStatus is DERIVED at read time from the raw observation plus
 * intent-side play evidence, because producer existence is not play evidence:
 * CasparCG stage-plays the html producer at `CG ADD` (page hidden until the
 * template's play()), and `CG PLAY` causes no OSC-observable transition — a
 * load-only producer is wire-identical to a played one. So:
 *
 *   truthStatus = lastProducer === 'empty' ? 'idle'
 *               : played ? 'on-air' : 'loaded'
 *
 * Deriving at read time keeps the optimistic take (a take inside the fresh
 * window re-reads the same observation as 'on-air') and makes the value
 * published at observation time equal the post-decay ladder value — the badge
 * never reverts-and-sticks.
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
  /**
   * B-053 — the raw last OSC observation for the slot ('empty' vs any
   * producer). Stored raw, NOT pre-mapped to a status: what a non-empty
   * producer means depends on `played` and is derived at read time
   * (see the header merge-rule comment).
   */
  lastProducer?: 'empty' | 'present';
  /**
   * B-053 — intent-side play evidence: set by the `take` intent (at intent
   * time, before the ack), false when a `load` creates the fresh record, and
   * NEVER reset by update/out/unconfirmed — once taken, a surviving producer
   * reads on-air (broadcast-safe; also load-bearing when an out-CLEAR landed
   * only on the backup and the primary's producer is re-observed at resync).
   */
  played: boolean;
  /**
   * B-079 — the play evidence the CURRENT take intent overwrote, so a take whose command
   * FAILED can give back the claim it made and nothing more.
   *
   * Play evidence is set at INTENT time (B-053's contract, deliberately). But the truth
   * derivation sits ABOVE the ack in the merge ladder, and OSC keeps arriving across a dead
   * AMCP link — so a take that set `played` and then failed on the wire would read `on-air`
   * off an unrelated producer (an orphan, or the producer from an earlier ADD). A solid red
   * ON AIR badge for a `CG PLAY` that never reached CasparCG.
   *
   * Restoring the PRIOR value (rather than forcing `false`) is what keeps this safe in both
   * directions: a failed re-take of an item that is genuinely on air must NOT demote it —
   * a false `loaded`/`idle` would HIDE a live graphic, which this file's own doctrine calls
   * the more dangerous error.
   */
  playedBeforeIntent?: boolean;
  slot?: LayerSlot;
  lastIntentSeq?: number;
  lastAckAt?: number;
  lastOscAt?: number;
  pendingSince?: number;
  errorCode?: string;
  /**
   * B-044 — where a TRANSIENT intent (`updating`/`exiting`) settles when its
   * own command's OK ack arrives. `updating`/`exiting` are never resting
   * states — OSC cannot complete them (a CG UPDATE causes no producer
   * transition, and the change-tracker suppresses repeats), so the ack is the
   * completion signal ("accepted by CasparCG" — NOT proof the template
   * applied the value; see the fix-pending-update-completion design).
   *
   * `evidenced` carries the target's provenance: an update captures the item's
   * OBSERVED resting status (evidenced) while an out records its TARGET
   * (`idle`, unevidenced — the CLEAR may not have executed yet). An update
   * applied mid-intent inherits only an EVIDENCED target; otherwise it falls
   * back to `playing` — the broadcast-safe error direction (a false ON AIR
   * badge prompts the operator to check the output; a false IDLE would hide a
   * live graphic).
   */
  settle?: { to: StackItemStatus; evidenced: boolean };
  /**
   * The item was restored from retained intent, but the occupancy tap had never
   * received any OSC, so the bridge REFUSED to decide whether its layer is live.
   * Nothing was sent for it and nothing can confirm it — so an on-air-ish base
   * publishes as the honest `unverified` rather than a red claim.
   *
   * Per-item, unlike `linkDown`: the link is UP in this state (that is what makes
   * it insidious — a green health pill beside an unverifiable row), so demoting
   * globally would misreport every other item.
   */
  unverifiable?: boolean;
}

/**
 * The machine-readable cause published on an item the bridge REFUSED to decide
 * because its occupancy tap has never heard any OSC. Distinguishes this from a
 * link-loss `unverified`, which calls for different operator wording.
 */
export const OSC_UNVERIFIABLE = 'osc-unverifiable';

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
  /**
   * B-086 — the CURRENT-PRIMARY CasparCG link state, driven by the bridge from
   * the session FSM. While DOWN, an item whose reconciled status would be
   * on-air/playing is published as the honest `unverified` ("WAS ON AIR")
   * instead — the wire can no longer confirm the claim.
   */
  private linkDown = false;
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
    // A fresh operator intent supersedes any restore-time doubt: whatever the
    // tap could not tell us, the item is now being commanded and settles on its
    // own evidence.
    const targeted = this.items.get((intent as { itemId?: string }).itemId ?? '');
    if (targeted !== undefined) delete targeted.unverifiable;
    return this.applyIntentInternal(intent, seq);
  }

  /**
   * B-092 — seed an item from RETAINED intent after a bridge restart, without
   * an operator intent behind it. The browser owns the stack intent across the
   * bridge's death; this rebuilds the record the dead process lost.
   *
   * Returns `null` when the item already exists — the caller must NEVER clobber
   * a live bridge's own state with a retained copy (a page reload against a
   * healthy bridge must change nothing).
   *
   * `played` is reconstructed play evidence, and it decides how the record is
   * seeded:
   *
   *   played  → `playing` AND `ackedStatus: 'playing'`, i.e. exactly what a
   *             settled, confirmed take left behind before the process died.
   *             The ack matters: without it `pending` is true and the row spins
   *             forever on a link that may never come back. The item is NOT
   *             claimed `on-air` here — only OSC may promote it there, and it
   *             will, as soon as the wire confirms a live producer.
   *   !played → the terminal `loaded`, resting and unconfirmed by anything.
   *
   * No OSC observation and no slot are seeded — the caller assigns the slot
   * (`assignSlot`) and real OSC supplies the truth. Until then the merge ladder
   * falls through to these values, and while the CasparCG link is down B-086's
   * `unverified` demotion applies to the played case exactly as it would to a
   * record that never died.
   */
  restoreItem(input: {
    itemId: string;
    templateId: string;
    fields: FieldValues;
    played: boolean;
  }): StackItemState | null {
    if (this.items.has(input.itemId)) return null;
    const rec: ItemRecord = {
      itemId: input.itemId,
      templateId: input.templateId,
      fields: input.fields,
      fieldsHash: hashFields(input.fields),
      intentStatus: input.played ? 'playing' : 'loaded',
      ...(input.played && { ackedStatus: 'playing' as StackItemStatus }),
      played: input.played,
    };
    this.items.set(rec.itemId, rec);
    return this.emitChange(rec);
  }

  /**
   * Mark (or clear) a restored item as UNVERIFIABLE — the bridge could not
   * decide what is on its layer because the occupancy tap has never received
   * OSC. Returns the re-published state, or `null` if the item is unknown or
   * the flag did not change.
   *
   * Set when a restore refuses to decide; cleared the moment the decision can
   * finally be made (OSC arrived) or the operator issues a fresh intent, so the
   * state can never outlive the doubt that caused it.
   */
  setUnverifiable(itemId: string, unverifiable: boolean): StackItemState | null {
    const rec = this.items.get(itemId);
    if (rec === undefined) return null;
    if ((rec.unverifiable ?? false) === unverifiable) return null;
    if (unverifiable) {
      rec.unverifiable = true;
      // Publish the CAUSE, not just the state. `errorCode` already rides
      // `StackItemState`, so the renderer can tell this apart from a link-loss
      // `unverified` — which needs opposite wording — with no new IPC and no
      // extra subscription per row.
      rec.errorCode = OSC_UNVERIFIABLE;
    } else {
      delete rec.unverifiable;
      // Only ever clear OUR sentinel; a real refusal reason must survive.
      if (rec.errorCode === OSC_UNVERIFIABLE) delete rec.errorCode;
    }
    return this.emitChange(rec);
  }

  /**
   * Correlate an AMCP ack to its originating intent (by seq). The merge
   * rule prefers OSC truth, so the ack's effect is to bump `ackedStatus`
   * — which only wins until OSC catches up.
   *
   * B-044 — transient intents COMPLETE here: an OK ack with a `settleTo`
   * pending settles `intentStatus`/`ackedStatus` to the underlying state
   * (update → the pre-update status; out → `idle`). This also rescues a late
   * ack after expiry (`unconfirmed` → settled — the ack DID arrive). A stale
   * ack (an older seq than the item's latest intent) never mutates state:
   * with AMCP pipelining, an earlier update's ack must not settle a newer
   * in-flight one.
   */
  applyAck(seq: number, ok: boolean, errorCode?: string): StackItemState | null {
    const itemId = this.seqIndex.get(seq);
    if (itemId === undefined) return null;
    const rec = this.items.get(itemId);
    if (rec === undefined) return null;
    if (rec.lastIntentSeq !== seq) return null; // stale ack — superseded intent

    rec.lastAckAt = this.now();
    if (ok) {
      // B-079 — the command landed, so the take's claim is now proven: there is nothing
      // left to retract.
      delete rec.playedBeforeIntent;
      if (rec.settle !== undefined) {
        rec.intentStatus = rec.settle.to;
        rec.ackedStatus = rec.settle.to;
        delete rec.settle;
      } else {
        rec.ackedStatus = intentToAckedStatus(rec.intentStatus);
      }
      delete rec.errorCode;
    } else {
      // B-070 — a FAILED ack SETTLES the intent too. Pre-B-070 only
      // `ackedStatus` moved to `error` while `intentStatus` stayed at the
      // TRANSIENT `updating`/`playing`/`exiting` forever, so `pending` never
      // cleared: ONE refused command poisoned the item for the rest of its life
      // — and R-011's `setPosition`, which refuses while `pending`, was blocked
      // for good. B-044's rule is that no intent may rest non-terminal; an
      // error is a SETTLEMENT, not limbo.
      //
      // The errored command did not take effect, so the item lands back on the
      // resting status it came from when that target is evidenced-terminal;
      // otherwise the honest landing is `unconfirmed` — B-044's explicit "we
      // cannot claim what the wire did" state — never a silent claim.
      // B-079 — a FAILED take RETRACTS the play evidence it claimed. `freshTruth` sits
      // ABOVE the ack in the merge ladder and OSC keeps arriving across a dead AMCP link,
      // so without this the item reads `on-air` off an unrelated producer even though its
      // `CG PLAY` never reached the wire. Restoring the PRIOR value (not forcing `false`)
      // is what makes it safe both ways: a failed RE-take of a genuinely on-air item leaves
      // it on air — a false `loaded` would hide a live graphic, the worse error direction.
      // Only a take is retracted; a failed update/out never touched play evidence.
      if (rec.intentStatus === 'playing') {
        rec.played = rec.playedBeforeIntent ?? false;
      }
      // C-012 — and symmetrically for a failed graceful STOP, which retracted play
      // evidence at intent time. An `out` never records `playedBeforeIntent`, so it is
      // untouched here; only a stop reaches this with the field set.
      if (rec.intentStatus === 'exiting' && rec.playedBeforeIntent !== undefined) {
        rec.played = rec.playedBeforeIntent;
      }
      delete rec.playedBeforeIntent;

      const settleTo = rec.settle?.to;
      rec.intentStatus =
        settleTo !== undefined && isTerminalStatus(settleTo) ? settleTo : 'unconfirmed';
      rec.ackedStatus = 'error';
      delete rec.settle;
      if (errorCode !== undefined) rec.errorCode = errorCode;
    }
    return this.emitChange(rec);
  }

  /**
   * B-044 — bounded-timeout expiry for a transient intent. Called by the
   * bridge's per-send timer when no ack arrived within the bound. Only the
   * item's LATEST intent can expire, and only while it is still in flight
   * (`updating`/`exiting`): the item lands in the explicit `unconfirmed`
   * resting state (never a silent revert, never an indefinite spinner).
   * `ackedStatus` is cleared so the reconcile ladder cannot fall back to a
   * stale acked value. A later OK ack (see `applyAck`) or any new operator
   * intent replaces `unconfirmed`.
   */
  expireIntent(seq: number): StackItemState | null {
    const itemId = this.seqIndex.get(seq);
    if (itemId === undefined) return null;
    const rec = this.items.get(itemId);
    if (rec === undefined) return null;
    if (rec.lastIntentSeq !== seq) return null; // a newer intent owns the item
    // B-079 — an IN-FLIGHT take joins the expirable set. A take used to arm no timer at
    // all, and this guard refused to expire one anyway, so an unsettled take rested on its
    // optimistic `playing`/`on-air` claim FOREVER with nothing to bound it.
    //
    // "In flight" must be `ackedStatus === undefined`, NOT merely `intentStatus === 'playing'`:
    // a settled UPDATE legitimately RESTS at `playing` (that is its settle target), and
    // expiring that would break B-044's "a settled intent is never expirable" invariant.
    // `applyIntent` deletes `ackedStatus`, so only a command still awaiting its ack qualifies.
    const takeInFlight = rec.intentStatus === 'playing' && rec.ackedStatus === undefined;
    if (rec.intentStatus !== 'updating' && rec.intentStatus !== 'exiting' && !takeInFlight) {
      return null;
    }

    // B-079 — an expired take never proved its claim either: retract it, exactly as a
    // failed ack does (restore the prior evidence, so a real on-air item is never demoted).
    if (rec.intentStatus === 'playing') {
      rec.played = rec.playedBeforeIntent ?? false;
    }
    // C-012 — an expired STOP never proved it landed either: give back the play
    // evidence it retracted, so an item that is still on air keeps saying so.
    if (rec.intentStatus === 'exiting' && rec.playedBeforeIntent !== undefined) {
      rec.played = rec.playedBeforeIntent;
    }
    delete rec.playedBeforeIntent;

    rec.intentStatus = 'unconfirmed';
    delete rec.ackedStatus;
    rec.errorCode = 'unconfirmed';
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
          // B-053 — store the raw observation; the status is derived at read
          // time (freshTruth) from `played`, because a non-empty producer is
          // NOT play evidence (CG ADD stage-plays the hidden page).
          rec.lastProducer = event.producer === 'empty' ? 'empty' : 'present';
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

  // ──────────────────────────────────────────────────────────────────────
  // B-086 — honest ON AIR across a CasparCG link-loss
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Set the CURRENT-PRIMARY CasparCG link state (the bridge drives this from the
   * session FSM: the primary LEAVING `healthy`). Under B-100 this is a DIFFERENT
   * condition from the on-air refusal, which gates on `#noServerReachable()`
   * (`healthy` OR `degraded`) — a `degraded` primary demotes the DISPLAY here yet
   * still accepts commands. The two coincided before B-100 separated honesty
   * (the display's job) from reachability (the refusal's).
   *
   * While DOWN, an item whose reconciled status is on-air/`playing` publishes as
   * the honest `unverified` ("WAS ON AIR") — the wire can no longer confirm it.
   * The reconciler is event-driven and emits nothing on OSC silence, so this
   * SUPPLIES the missing re-publish on the transition. Only items whose reconciled
   * status actually changes are re-emitted (a bounded, deduped burst). Returns
   * the changed states (for the caller / tests).
   */
  setLinkDown(down: boolean): readonly StackItemState[] {
    if (this.linkDown === down) return [];
    const before = new Map<string, StackItemStatus>();
    for (const rec of this.items.values()) before.set(rec.itemId, this.reconcileStatus(rec));
    this.linkDown = down;
    const changed: StackItemState[] = [];
    for (const rec of this.items.values()) {
      if (this.reconcileStatus(rec) !== before.get(rec.itemId)) changed.push(this.emitChange(rec));
    }
    return changed;
  }

  /** True iff the reconciler currently treats the CasparCG link as down. */
  get isLinkDown(): boolean {
    return this.linkDown;
  }

  /**
   * On reconnect (the link back to `healthy`, after the session's RESYNCING OSC
   * drain), reconcile still-on-air items against what CasparCG actually reports on
   * their layer. `occupiedSlotKeys` holds `channel:layer` for every layer observed
   * occupied within the staleness bound (the bridge's OSC occupancy tap).
   *
   * A `played` item whose slot is occupied is LEFT ALONE — resumed continuous OSC
   * re-derives `freshTruth = 'on-air'` on its own (the bridge clears the link-down
   * flag first). A `played` item whose slot is SILENT (no fresh producer — it is
   * gone, e.g. CasparCG restarted with empty layers) is RESET to `idle`: real
   * CasparCG never reports `empty`, so silence IS the empty signal (mirrors the
   * orphan sweep's "absence of knowledge is not knowledge of absence"). The
   * coalesced publish reads the final state, so an emptied item never flashes red
   * between the flag-clear and this reset.
   */
  reconcileOnReconnect(occupiedSlotKeys: ReadonlySet<string>): readonly StackItemState[] {
    const changed: StackItemState[] = [];
    for (const rec of this.items.values()) {
      if (!rec.played) continue;
      const key = rec.slot !== undefined ? slotKey(rec.slot) : undefined;
      if (key !== undefined && occupiedSlotKeys.has(key)) continue; // still on air — OSC restores it
      // Silent layer — the producer is gone. Reset to the honest idle.
      rec.played = false;
      rec.intentStatus = 'idle';
      delete rec.ackedStatus;
      delete rec.settle;
      rec.lastProducer = 'empty';
      rec.lastOscAt = this.now();
      changed.push(this.emitChange(rec));
    }
    return changed;
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
          // B-053 — a fresh load carries no play evidence.
          played: false,
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
        // B-053 — play evidence, set at intent time: a still-fresh load-time
        // producer observation immediately re-derives as 'on-air'.
        // B-079 — remember what it OVERWROTE, so a take that fails on the wire can hand
        // back exactly the claim it made (and not one made by an earlier, successful take).
        rec.playedBeforeIntent = rec.played;
        rec.played = true;
        rec.lastIntentSeq = seq;
        rec.pendingSince = this.now();
        // A new intent invalidates the PREVIOUS command's ack — without this
        // the reconcile ladder shows the stale acked value mid-flight (B-044).
        delete rec.ackedStatus;
        delete rec.settle;
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'update': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        rec.fields =
          intent.mergeMode === 'replace' ? intent.fields : { ...rec.fields, ...intent.fields };
        rec.fieldsHash = hashFields(rec.fields);
        // B-044 — `updating` is TRANSIENT: remember where the OK ack settles
        // it. From a RESTING status the observed status is captured
        // (evidenced). Mid-intent (`updating`/`exiting`/`unconfirmed`) only an
        // EVIDENCED prior target is inherited (back-to-back updates keep the
        // true underlying state); an out's unevidenced `idle` TARGET never
        // leaks into an update's completion — the fallback is `playing`, the
        // broadcast-safe error direction (never claim off-air without
        // evidence).
        const midIntent =
          rec.intentStatus === 'updating' ||
          rec.intentStatus === 'exiting' ||
          rec.intentStatus === 'unconfirmed';
        rec.settle = midIntent
          ? rec.settle?.evidenced === true
            ? rec.settle
            : { to: 'playing', evidenced: false }
          : { to: rec.intentStatus, evidenced: true };
        rec.intentStatus = 'updating';
        rec.lastIntentSeq = seq;
        delete rec.ackedStatus;
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'stop': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        // C-012 — the graceful stop. The template runs its own outro and the
        // producer STAYS RESIDENT (hardware-verified on 2.3.2), so this settles
        // at `loaded`, not `idle`: the layer still holds a live producer that a
        // later take resumes with no re-load. That is exactly what `loaded`
        // already means, which is why this needs no new status.
        //
        // Retracting the play evidence is the load-bearing part. `freshTruth`
        // derives `on-air` from (producer present + played), and after a STOP the
        // producer is present FOREVER — so leaving `played` set would make a
        // stopped graphic claim ON AIR indefinitely, off real OSC. Clearing it
        // makes the same observation derive `loaded`, which is the truth: there
        // is a producer on the layer and it is not playing.
        // B-079's pattern, mirrored: remember the evidence this retracts, so a stop
        // that FAILS on the wire can give it back. Without this a failed stop would
        // leave the row reading `loaded` while the graphic is still playing — the
        // "hide a live graphic" direction this file calls the worse error.
        rec.playedBeforeIntent = rec.played;
        rec.played = false;
        rec.intentStatus = 'exiting';
        // B-044 — `exiting` is TRANSIENT and the STOP's OK ack settles it. The ack
        // means "CasparCG accepted the stop", NOT "the outro has finished": outro
        // completion is not observable from here (B-030 is precisely a case where
        // a template's own completion never resolves while OSC keeps reporting
        // `html`), so nothing waits on or chases it. Unevidenced, like the out's.
        rec.settle = { to: 'loaded', evidenced: false };
        rec.lastIntentSeq = seq;
        rec.pendingSince = this.now();
        delete rec.ackedStatus;
        this.seqIndex.set(seq, rec.itemId);
        return this.emitChange(rec);
      }
      case 'out': {
        const rec = this.items.get(intent.itemId);
        if (rec === undefined) return null;
        rec.intentStatus = intent.immediate === true ? 'idle' : 'exiting';
        // B-044 — `exiting` is TRANSIENT: the single CLEAR's OK ack settles it.
        // `idle` is the out's TARGET, not an observation — unevidenced.
        if (intent.immediate === true) delete rec.settle;
        else rec.settle = { to: 'idle', evidenced: false };
        rec.lastIntentSeq = seq;
        rec.pendingSince = this.now();
        delete rec.ackedStatus;
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
    const base = this.baseStatus(rec);
    // B-086 — the CasparCG link is down, so an ON AIR claim can no longer be
    // verified: `freshTruth`'s OSC has stopped, and the fallback floor `playing`
    // renders IDENTICALLY to `on-air` (both red "● ON AIR"). Publish the honest
    // UNVERIFIABLE state instead of a red badge the wire no longer backs. A base
    // of `on-air`/`playing` already implies the item was taken (`played`), so no
    // extra guard is needed. Only these two red-badge states are demoted;
    // transient/`unconfirmed`/idle/loaded keep their own honest meaning.
    if (this.linkDown && (base === 'on-air' || base === 'playing')) return 'unverified';
    // The blind-tap case: this item was RESTORED from retained intent, but the
    // occupancy tap has never heard any OSC, so nothing can confirm what is
    // actually on its layer. Same honest answer as a link-loss, scoped to the
    // one item rather than the whole link — the link here is UP, so demoting
    // globally would lie about every other row.
    if (rec.unverifiable === true && (base === 'on-air' || base === 'playing')) return 'unverified';
    return base;
  }

  /** The pre-link-state merge ladder: OSC truth → ack → intent. */
  private baseStatus(rec: ItemRecord): StackItemStatus {
    const fresh = this.freshTruth(rec);
    if (fresh !== null) return fresh;
    if (rec.ackedStatus !== undefined) return rec.ackedStatus;
    return rec.intentStatus;
  }

  /**
   * Returns the truth status if an observation exists and is fresh, otherwise
   * null. B-053 — derived at READ time: a non-empty producer reads 'on-air'
   * only with intent-side play evidence, else it merely confirms the load.
   */
  private freshTruth(rec: ItemRecord): StackItemStatus | null {
    if (rec.lastProducer === undefined || rec.lastOscAt === undefined) return null;
    if (this.now() - rec.lastOscAt >= this.truthTtlMs) return null;
    if (rec.lastProducer === 'empty') return 'idle';
    return rec.played ? 'on-air' : 'loaded';
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
  // `unconfirmed` is an explicit RESTING state (B-044 bounded expiry) — it
  // must not spin as pending; the next intent or a late ack replaces it.
  return status === 'idle' || status === 'loaded' || status === 'unconfirmed';
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
