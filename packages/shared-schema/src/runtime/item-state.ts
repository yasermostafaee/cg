import { z } from 'zod';
import { IdSchema, ISODateSchema } from '../primitives.js';
import { FieldValuesSchema } from '../fields.js';
import { PositionSchema } from '../scene.js';
import { LivePlateVolumesSchema, LiveSourceOverrideSchema } from '../live-source.js';

/** A CasparCG (channel, layer) coordinate plus which server it lives on. */
export const LayerSlotSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  server: z.enum(['primary', 'backup', 'both']),
});
export type LayerSlot = z.infer<typeof LayerSlotSchema>;

export const StackItemStatusSchema = z.enum([
  'idle',
  'loaded',
  'playing',
  'on-air',
  'updating',
  'exiting',
  // B-044 — explicit bounded-timeout state: the bridge sent the intent's
  // command and no AMCP ack arrived within the bound; the on-air result is
  // unknown. A resting state (never a spinner); the next intent overwrites it.
  'unconfirmed',
  // B-086 — the CasparCG LINK is down, so an ON AIR claim can no longer be
  // verified: the item WAS on air but the wire no longer backs it. Distinct from
  // `unconfirmed` (one command's ack timed out on a LIVE link) — this is the
  // whole link. Rendered muted "WAS ON AIR" (never red, never amber). On
  // reconnect it restores to on-air (producer still there) or resets to idle
  // (layer empty), per the occupancy check.
  'unverified',
  'error',
  'disconnected',
]);
export type StackItemStatus = z.infer<typeof StackItemStatusSchema>;

/** Reconciled view of one item on the operator's stack. */
export const StackItemStateSchema = z.object({
  itemId: IdSchema,
  templateId: IdSchema,
  fields: FieldValuesSchema,
  status: StackItemStatusSchema,
  pending: z.boolean(),
  lastIntentSeq: z.number().int().nonnegative().optional(),
  lastOscAt: ISODateSchema.optional(),
  slot: LayerSlotSchema.optional(),
  errorCode: z.string().optional(),
  /**
   * B-072 — the operator's APPLIED on-air position override, published so the
   * UI can show what is actually on air. The bridge owns it (R-011); this is
   * the read-back. ABSENT means no override — the consumer falls back to the
   * template's manifest default, exactly as before the field existed.
   */
  position: PositionSchema.optional(),
  /**
   * R-048 / C-015 phase 6 (6.9) — the operator’s PER-ITEM live-source override,
   * published for the same reason `position` is: the row has to be able to show
   * that this plate is not on its configured source. See
   * {@link LiveSourceOverrideSchema} for the three-level layering and for why it
   * never writes back. ABSENT means every plate is on its template assignment.
   */
  sourceOverride: LiveSourceOverrideSchema.optional(),
  /**
   * C-015 phase 6 (6.5f) — how loud each plate is INTENDED to be on this row,
   * published so the console can show it and so the browser's retention can carry
   * it (`StackRetentionStore`).
   *
   * Published for a sharper reason than `position` is: audio is the one property
   * of a graphic an operator CANNOT see. A row whose plate is live-and-audible
   * looks identical to one whose plate is silent, so if the console cannot read
   * this back it cannot tell them apart — and neither can the operator.
   *
   * ABSENT means no plate has been raised, which is every row's starting state:
   * every producer the bridge creates is created muted. See
   * {@link LivePlateVolumesSchema} for why an explicit `0` is NOT the same as a
   * missing key.
   */
  plateVolumes: LivePlateVolumesSchema.optional(),
});
export type StackItemState = z.infer<typeof StackItemStateSchema>;

/**
 * B-107 / B-109 — the STATE a retained row was actually in, and the one question
 * it exists to answer: **may a restore re-seat a producer onto this row's layer?**
 *
 * Retention used to carry a single `played: boolean`, which collapsed `idle`,
 * `loaded`, `error` and `disconnected` into one value. That is the shared root of
 * three bugs: an errored row came back READY (B-107, the DISPLAY face), and a
 * graphic the operator deliberately CLEARed was re-ADDed onto its layer by a
 * `CG ADD` nobody asked for (B-109, the WIRE face), because a cleared row and a
 * pre-rolled row retained as the identical record.
 *
 * ⭐ **ONE field, not two — the state IS the reason it left air.** The tempting
 * design is a state plus a separate "why". That second field would be a SECOND
 * DERIVATION of the same fact, which is exactly what golden rule 6 forbids. The
 * distinction is already carried here, because the values are named for it: a
 * deliberate CLEAR is the only operator action that takes an acknowledged row to
 * `cleared`, while a bridge dying UNDER a live row leaves it at `on-air` — as far
 * as anyone knows it never left air at all.
 *
 * Play evidence is DERIVED from this ({@link isRetainedOnAir}) and never stored
 * beside it, so the two can never disagree.
 */
export const RetainedAirStateSchema = z.enum([
  /**
   * On air when last observed — or possibly so. RESTORABLE: the occupancy check
   * decides adopt-vs-re-ADD.
   *
   * The ambiguous statuses resolve HERE on purpose (see {@link retainedStateFor}).
   * Over-claiming is self-correcting — the bridge's occupancy check demotes it to
   * `loaded` the moment the layer proves silent — whereas under-claiming would let
   * a restore treat a LIVE layer as empty, which is the error direction this
   * codebase never takes.
   */
  'on-air',
  /**
   * A producer was resident on the layer but the item was not on air. RESTORABLE:
   * a re-ADD is precisely what this row is asking for if its producer is gone.
   */
  'loaded',
  /**
   * The layer is KNOWN EMPTY. **NOT restorable — this is B-109.**
   *
   * Two origins, and they make the same claim, which is why they share a value:
   * the operator CLEARed the row (an `out` is not a `remove` — the row stays, the
   * slot stays reserved), or a reconnect reconcile proved the layer empty. Both are
   * POSITIVE knowledge that nothing should be on that layer, which is the exact
   * opposite of `loaded`. Named for the operator's case because that is the one a
   * human reads on a row and the one a restart must not undo.
   */
  'cleared',
  /**
   * The last operation FAILED — the row never got what it asked for. **NOT
   * restorable, and never promoted — this is B-107.**
   *
   * Any error code reaches here: `no-layer`, `no-layer-foreign-occupied`,
   * `unknown-template`, `amcp-error`. A lost link may never IMPROVE a status, so a
   * bridge death must leave this exactly where it is.
   */
  'error',
]);
export type RetainedAirState = z.infer<typeof RetainedAirStateSchema>;

/**
 * THE canonical reconciled-status → retained-state map. **The only one.**
 *
 * It lives in the schema package rather than in the browser store because more than
 * one party reduces published state to intent (the SPA's `StackRetentionStore`, and
 * the bridge's own integration tests standing in for it), and a second local copy is
 * how a name comes to lie about what it tests — golden rule 6, and the defect
 * `B-107`'s own notes call out as "two status-derivation sites that can drift".
 *
 * The `switch` is EXHAUSTIVE with no `default`, deliberately: adding a
 * `StackItemStatus` then fails to compile here until someone decides what a restore
 * is allowed to do with it. A `default` would silently pick a comfortable answer for
 * a status nobody considered, which is the whole class of bug this change closes.
 */
export function retainedStateFor(status: StackItemStatus): RetainedAirState {
  switch (status) {
    /*
     * AIR, OR POSSIBLY AIR — see `RetainedAirStateSchema`'s note on over-claiming.
     * Three of these are ambiguous rather than confident, and each resolves here on
     * purpose:
     *
     *   `exiting`     — an out was in flight when the bridge died, so the CLEAR may
     *                   never have landed. Deliberately NOT `cleared`: we do not know
     *                   the layer is empty, and guessing that it is would be the
     *                   under-claim that HIDES a live graphic.
     *   `unconfirmed` — B-044: a command whose ack never came. Unknown, so possibly live.
     *   `unverified`  — B-086: the link was down, so the claim could not be checked.
     *                   Still an air claim; the wire simply cannot back it right now.
     */
    case 'playing':
    case 'on-air':
    case 'updating':
    case 'exiting':
    case 'unconfirmed':
    case 'unverified':
      return 'on-air';
    case 'loaded':
      return 'loaded';
    // The layer is known empty: an operator CLEAR, or a reconcile that proved it.
    case 'idle':
      return 'cleared';
    case 'error':
      return 'error';
    /*
     * `disconnected` has NO producer in the reconciler — nothing ever publishes it
     * (verified, not assumed). It is mapped rather than thrown on because the schema
     * admits it, and `loaded` is the answer that preserves the previous behaviour
     * exactly: it is not an air claim, and it is the resting status the bridge leaves
     * an item at when no server is reachable (B-082). If a producer for it is ever
     * added, this is the line to revisit.
     */
    case 'disconnected':
      return 'loaded';
  }
}

/**
 * Play evidence, DERIVED. The single reader of "was this item taken to air?" — so
 * `played` exists as a computation and never as a stored field that can drift from
 * the state beside it.
 */
export function isRetainedOnAir(state: RetainedAirState): boolean {
  return state === 'on-air';
}

/**
 * True iff a restore may put a producer back on this row's layer.
 *
 * 🔴 **THE B-109 PREDICATE, and its name is its contract.** A `cleared` row's layer
 * is empty BECAUSE THE OPERATOR EMPTIED IT; a restore that reads that silence as "a
 * producer was lost, re-ADD it" resurrects a graphic nobody asked for. An `error`
 * row never had a producer to lose. Neither may be re-seated, under any occupancy
 * verdict — for those two states occupancy is not even consulted.
 */
export function isRestorable(state: RetainedAirState): boolean {
  return state === 'on-air' || state === 'loaded';
}

/**
 * B-092 — one stack item's INTENT as retained by the browser, so the stack
 * survives a restart of the bridge process (the stack otherwise lives only in
 * the bridge's in-memory Reconciler and dies with it).
 *
 * This is intent, NOT reconciled state: it carries what the operator asked for
 * (template + fields + placement) plus the STATE that justified it. The restored
 * item's actual air state is still decided by the bridge against real OSC
 * occupancy — but only for a row whose state licenses a producer at all
 * ({@link isRestorable}).
 *
 * ⭐ **TWO AXES, and they do not interact. Read this before adding a field.**
 *
 *   - **CLOSED — `state`.** Four values answering one question: may this row's
 *     producer be re-seated? Adding a fifth is a MODEL change and needs the same
 *     care B-107/B-109 did.
 *   - **OPEN — the operator's per-item OVERRIDES** (`slot`, `position`, Live
 *     Source phase 6's per-plate source override (6.9d) and its per-plate audio
 *     intent (6.5f) — both landed). Each is an
 *     independent optional field that `restore()` re-applies BEFORE it decides
 *     anything, so a re-issued producer carries it. Adding one is additive: no
 *     existing field changes meaning and the restore decision is not consulted.
 *
 * A new override goes on the OPEN axis. A new answer to "may this be re-seated"
 * goes on the CLOSED one. Anything that seems to need both is a sign the model,
 * not the field, is wrong.
 *
 * `slot` is the layer the item occupied. It must be restored EXACTLY (not
 * re-allocated) — it is the layer the surviving producer is actually on, so it
 * is what the occupancy check has to consult. It survives a CLEAR too: an `out`
 * is not a `remove`, so a `cleared` row keeps its reserved slot.
 */
export const RetainedStackItemSchema = z.object({
  itemId: IdSchema,
  templateId: IdSchema,
  fields: FieldValuesSchema,
  /**
   * The state the row was actually in — see {@link RetainedAirStateSchema}. This
   * REPLACED a `played: boolean` that could not tell a failed row from a cleared
   * one from a pre-rolled one (B-107 / B-109).
   */
  state: RetainedAirStateSchema,
  /**
   * The machine-readable cause carried by an `error` state, so a restored or
   * offline-displayed failure can still say WHY. Absent for every other state.
   */
  errorCode: z.string().optional(),
  slot: LayerSlotSchema.optional(),
  position: PositionSchema.optional(),
  /**
   * R-048 / C-015 phase 6 (6.9d) — the per-plate source override, on the OPEN
   * axis beside `position` exactly as the note above prescribes.
   *
   * 🔴 **RETENTION MUST CARRY IT, or a momentary bridge blip silently reverts the
   * plate to the DEAD source the operator patched around.** That is the
   * `B-107`/`B-109` class — retention dropping state it did not model — which is
   * why it is a requirement with a test rather than an assumption. Nothing about
   * the CLOSED `state` axis changes and no consumer branches differently.
   */
  sourceOverride: LiveSourceOverrideSchema.optional(),
  /**
   * C-015 phase 6 (6.5f) — the per-plate audio intent, on the OPEN axis beside
   * `sourceOverride` and for the identical reason.
   *
   * 🔴 **THE RAISE HALF OF THE AUDIO RULE IS NOTHING BUT MEMORY.** The mute half
   * needs none — silence is what every producer is created with — but "this plate
   * was deliberately raised" exists only where somebody wrote it down. The
   * bridge's own ledger is PROCESS memory and dies with the bridge, so without
   * this a blip re-mutes a raised plate: the picture comes back, the guest does
   * not, and every console shows the row as normal. `B-107` / `B-109`, applied to
   * the one property of a graphic nobody can see.
   */
  plateVolumes: LivePlateVolumesSchema.optional(),
});
export type RetainedStackItem = z.infer<typeof RetainedStackItemSchema>;
