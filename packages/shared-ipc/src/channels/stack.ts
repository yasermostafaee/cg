import { z } from 'zod';
import {
  FieldValuesSchema,
  IdSchema,
  PositionSchema,
  RetainedStackItemSchema,
  StackItemStateSchema,
} from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';
// B-122 — Clear-All's refusals speak the ONE canonical reason list, never an
// inline literal, so a reason added at the `layers.clear` door (as `live-source`
// was) cannot exist on the wire and be unrepresentable here.
import { LAYER_CLEAR_REASONS } from './layers.js';

/**
 * Stack channels (Phase 7 §3 / Phase 5 §8). The Reconciler in Main owns
 * the truth; the Renderer subscribes to state changes via
 * `StackStateChangedChannel` and issues intents via the request channels
 * below.
 */

/**
 * C-014 — `load` answers with an `errorCode` (the B-070 pattern), because its
 * refusals now need distinguishing: `no-layer-foreign-occupied` (the range is
 * eaten by other systems' output, which R-015 makes unclearable from this
 * console) is a different operator situation from the plain `no-layer` (Remove
 * something) or `unknown-template` (re-import).
 */
export const StackLoadChannel = defineChannel(
  'stack.load',
  z.object({
    itemId: IdSchema,
    templateId: IdSchema,
    fields: FieldValuesSchema,
  }),
  z.object({ accepted: z.boolean(), errorCode: z.string().optional() }),
);

export const StackTakeChannel = defineChannel(
  'stack.take',
  z.object({
    itemId: IdSchema,
    mode: z.enum(['direct', 'pvw-pgm']).optional(),
  }),
  z.object({
    accepted: z.boolean(),
    errorCode: z.string().optional(),
    /**
     * C-015 phase 6 (6.0) — the refusal's OWN sentence, when it has one that a
     * code cannot carry.
     *
     * A take can now be refused by a Live Source plate, and those refusals are
     * required to NAME THE PLATE (`live-plate-assignment.ts`, `live-plate-fit.ts`):
     * _"plates "guest-1" and "guest-3" have no live source assigned"_ is what
     * makes the refusal actionable, and a code is a fixed string that cannot say
     * which of a template's plates is the problem. Without this the operator got
     * a generic sentence and the specific one stopped at the bridge's stderr.
     *
     * OPTIONAL and ADDITIVE: every existing refusal keeps answering with its code
     * alone, and `errorCodeMessage` keeps supplying the wording for those. When
     * both are present the message wins — it is the more specific of the two.
     */
    message: z.string().optional(),
  }),
);

/**
 * B-070 — `update` answers with an `errorCode` (mirroring `stack.take`) so a
 * refusal can EXPLAIN itself: the bare `{ accepted: boolean }` could only ever
 * surface as the Inspector's generic "Not accepted.". An update onto a slot
 * with NO live producer is no longer a refusal at all — it commits to the
 * authoritative field-set and the next take's re-ADD carries it to air.
 */
export const StackUpdateChannel = defineChannel(
  'stack.update',
  z.object({
    itemId: IdSchema,
    fields: FieldValuesSchema,
    mergeMode: z.enum(['merge', 'replace']),
  }),
  z.object({ accepted: z.boolean(), errorCode: z.string().optional() }),
);

/**
 * C-012 — the GRACEFUL stop: run the template's own outro and leave the producer
 * RESIDENT, so a later take resumes it with no re-load. Distinct from
 * `stack.out`, which CLEARs and destroys the producer.
 *
 * Hardware-verified on CasparCG 2.3.2 (`4de6d18f`): `CG <ch>-<layer> STOP` acks
 * 202, the template's `window.stop` fires, OSC still reports `html`, and a bare
 * `CG PLAY` resumes it. Refused while no server is reachable, like every other
 * on-air-affecting verb (R-006).
 */
export const StackStopChannel = defineChannel(
  'stack.stop',
  z.object({ itemId: IdSchema }),
  z.object({ accepted: z.boolean(), errorCode: z.string().optional() }),
);

/**
 * R-028 (owner call o2, task 5.4) — advance the template's sequence:
 * `CG <ch>-<layer> NEXT`.
 *
 * The capability existed template-side all along (`window.next`, the runtime's
 * per-scope sequence drivers); what was missing was the wire. Part A added the
 * verb to the command builder; this is the channel that reaches it.
 *
 * OFFERED ONLY when the loaded template actually has a next step
 * (`TemplateInfo.hasNext`, derived at import by the canonical `hasNextStep`).
 * An always-enabled NEXT that silently no-ops on a single-step template is the
 * anti-pattern R-021 stage 2b named — an enabled control must never invite a
 * click that can only do nothing.
 *
 * On-air-affecting, so refused while no server is reachable, like take/stop/out.
 */
export const StackNextChannel = defineChannel(
  'stack.next',
  z.object({ itemId: IdSchema }),
  z.object({ accepted: z.boolean(), errorCode: z.string().optional() }),
);

export const StackOutChannel = defineChannel(
  'stack.out',
  z.object({ itemId: IdSchema, immediate: z.boolean().optional() }),
  z.object({ accepted: z.boolean() }),
);

export const StackRemoveChannel = defineChannel(
  'stack.remove',
  z.object({ itemId: IdSchema }),
  z.object({ accepted: z.boolean() }),
);

/**
 * R-011 — the operator's per-item on-air position override. REFUSED
 * (`reason: 'on-air'`) while the item is on air or unsettled — position is
 * fixed once taken (Option A cannot reposition on air without a re-serve
 * flash); the UI mirrors the lock. A loaded-not-taken item is invisibly
 * re-served with the new position; an idle item stores it for the next
 * load. The override rides the served template URL's query — never a new
 * AMCP verb, never the data payload.
 */
export const StackSetPositionChannel = defineChannel(
  'stack.set-position',
  z.object({ itemId: IdSchema, position: PositionSchema }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(['on-air', 'unknown-item']).optional(),
  }),
);

/**
 * R-048 / C-015 phase 6 (6.9) — **point ONE plate of ONE row at a different live
 * source, WHILE the template is on air.**
 *
 * Modelled on `stack.set-position` deliberately: it is the same KIND of thing — a
 * per-item operator override the bridge holds, which never writes back to the
 * configuration it overrides. The differences are that this one names a PLATE as
 * well as an item, and that it is usable while the graphic is on air, which is the
 * entire point of it (`set-position` refuses `on-air` because moving a live graphic
 * mid-shot is a different act from patching around a dead feed).
 *
 * `sourceId: null` CLEARS the override and puts the plate back on its template
 * assignment. An emergency patch the operator cannot undo is its own trap.
 *
 * The reasons are open (`z.string()`) rather than an enum because two of them are
 * refusals produced deeper in — the plate-resolution and aspect refusals a take
 * uses (`live-source-unassigned`, `live-source-aspect-mismatch`) — and re-listing
 * them here would be a second copy of a vocabulary that already has an owner. The
 * `message` is what the operator reads; the reason is for logs and tests.
 */
export const StackSwapLiveSourceChannel = defineChannel(
  'stack.swap-live-source',
  z.object({
    itemId: IdSchema,
    /** The SCENE's handle for the hole (`guest-1`), never a catalog id. */
    plateId: z.string().min(1),
    /** A catalog entry's id, or `null` to revert to the template's assignment. */
    sourceId: z.string().min(1).nullable(),
  }),
  z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
    message: z.string().optional(),
  }),
);

/**
 * R-010 — clear EVERYTHING in one operation: every stack item is OUTed and
 * REMOVEd (per-item CLEAR-destroys semantics, in sequence), clearing air and
 * emptying the list. The sanctioned path to unblock a server reconfiguration.
 */
export const StackRemoveAllChannel = defineChannel(
  'stack.remove-all',
  z.void(),
  z.object({ ok: z.boolean(), removed: z.number().int().nonnegative() }),
);

/**
 * Take everything OFF AIR, but KEEP it on the stack.
 *
 * The distinction from `remove-all` is the whole point, and it is the operator's most common
 * need: "get it off the screen" is not "throw it away". Remove-All empties the list, so
 * recovering means re-importing/reloading and re-typing every field. Clear-All leaves the
 * rows exactly where they were, idle and re-takeable.
 *
 * NO new AMCP verb. It iterates the items that hold a layer of ours and issues the SAME
 * per-item `out()` the row's Clear button sends — a `CLEAR <ch>-<layer>` on the urgent
 * (air-safety) lane, with the same B-039 CLEAR-destroys bookkeeping, so a later take re-ADDs.
 *
 * ⭐ **B-122 — IT DOES NOT ASK THE STATUS, AND MUST NEVER BE MADE TO AGAIN.**
 *
 * It used to filter its candidates on `status` (everything not `idle`/`loaded`), which made
 * the emergency control depend on **precisely the values that may be wrong in the emergency**.
 * With every item wrongly reading `idle` it sent nothing and returned a SUCCESS with a cleared
 * count of zero — an operator told the escape hatch worked while the graphic was still on air,
 * which is worse than a disabled button, because a disabled button tells the truth.
 *
 * The owner's decision (2026-08-12) is therefore: **a clear is sent for EVERY item holding a
 * bound slot, regardless of believed status — including rows the model believes are merely
 * `loaded` and not yet on air.** Losing a cued row is the ACCEPTED COST. The only question
 * this verb may ask about an item is the structural one — does it hold a layer of ours —
 * never what it believes is on that layer. ⚠ Do not reintroduce a status predicate here under
 * another name.
 *
 * **THE REPORT COUNTS WHAT ACTUALLY WENT.** `attempted` is how many clears were sent,
 * `cleared` how many CasparCG accepted, and `refused` names the items deliberately not
 * addressed. `ok` is true only when something was owed AND all of it landed, so a no-op can
 * never come back dressed as a success.
 *
 * **`refused` — C-015 phase 5's third ownership class.** A bound slot that is in the bridge's
 * Live Source ledger is NOT cleared: broadening this verb must not let it reach a layer that
 * was just fenced off, and cutting a guest's face off air from a button that never named it
 * is exactly that hazard. The reason comes from {@link LAYER_CLEAR_REASONS}, the one canonical
 * list, so a reason added later cannot be silently missed here.
 *
 * **BROADCAST SAFETY — per-LAYER, never per-channel.** It clears only the layers this app
 * itself allocated, one `CLEAR <ch>-<layer>` per item. It MUST NEVER emit a channel-level
 * `CLEAR <channel>`: that wipes the entire channel, including the program/background signal
 * this app does not manage and must never touch. Taking our graphics off air has to leave the
 * program feed ON AIR. An item holding no slot holds no layer of ours, so nothing is sent for
 * it — that is a statement about OWNERSHIP, not about status, and it is the one filter that
 * belongs here.
 */
export const StackClearAllChannel = defineChannel(
  'stack.clear-all',
  z.void(),
  z.object({
    ok: z.boolean(),
    /** Clears CasparCG ACCEPTED — what actually went. Never a candidate count. */
    cleared: z.number().int().nonnegative(),
    /** Clears SENT (`cleared` + those the server rejected). */
    attempted: z.number().int().nonnegative(),
    /** Bound-slot items deliberately not addressed, and why. */
    refused: z.array(z.object({ itemId: IdSchema, reason: z.enum(LAYER_CLEAR_REASONS) })),
  }),
);

/**
 * C-012 / R-028 — STOP every on-air item: each template runs its OWN outro and
 * its producer stays RESIDENT, so a later take RESUMES it with no re-load.
 *
 * The graceful sibling of `stack.clear-all`, and the pairing matters as much as
 * either verb alone: Clear-All hard-cuts every graphic off air at once, Stop-All
 * asks each to leave the way it was authored to. On a real programme that is the
 * difference between a clean end-of-segment and every lower-third snapping to
 * black together.
 *
 * NO new AMCP verb: it issues the SAME per-item `CG … STOP` the row's STOP
 * button sends, over the same candidate set Clear-All uses (everything not
 * `idle`/`loaded` that actually holds a layer of ours), sequentially — no
 * command burst, and one stuck graphic never strands the ones behind it.
 */
export const StackStopAllChannel = defineChannel(
  'stack.stop-all',
  z.void(),
  z.object({ ok: z.boolean(), stopped: z.number().int().nonnegative() }),
);

export const StackSnapshotChannel = defineChannel(
  'stack.snapshot',
  z.void(),
  z.array(StackItemStateSchema),
);

/**
 * B-108 — WHY an intent was declined. The three reasons are not interchangeable,
 * and the split that matters is BENIGN vs LOST:
 *
 *   `already-held`     — the live bridge already has this item (a page reload
 *                        against a healthy bridge). Nothing is lost, the row is
 *                        still there, and surfacing it would be a false alarm.
 *   `unknown-template` — the SPA re-delivers its library FIRST, so this means the
 *                        template is genuinely gone. The row is LOST.
 *   `no-layer`         — the range is exhausted. The row is LOST.
 *   `fixed-slot-taken` — R-021 stage 4. The row's retained coordinate is a
 *                        DECLARED operator row that another restored item had
 *                        already bound. The row is LOST, and it is deliberately
 *                        NOT `no-layer`: nothing is exhausted and freeing a
 *                        dynamic layer would not help, so the two need opposite
 *                        instructions. A declared row may never be re-homed onto
 *                        a dynamic layer (that is the whole of R-021), so the
 *                        only honest outcome is to say so and skip.
 */
export const RestoreSkipReasonSchema = z.enum([
  'already-held',
  'unknown-template',
  'no-layer',
  'fixed-slot-taken',
]);
export type RestoreSkipReason = z.infer<typeof RestoreSkipReasonSchema>;

export const RestoreSkipSchema = z.object({
  itemId: IdSchema,
  reason: RestoreSkipReasonSchema,
});
export type RestoreSkip = z.infer<typeof RestoreSkipSchema>;

/**
 * B-092 — re-deliver the browser's RETAINED stack intent to the bridge, so the
 * stack survives a restart of the bridge process (it otherwise lives only in
 * the bridge's in-memory Reconciler). Issued on every (re)connect, right after
 * the retained templates and BEFORE the snapshot re-pull, so the snapshot the
 * SPA adopts is the RESTORED stack instead of a fresh bridge's empty one.
 *
 * The bridge REBUILDS state from these intents and publishes immediately, but
 * sends NOTHING to CasparCG at that moment: the adopt-vs-re-ADD decision waits
 * until real OSC occupancy is knowable, so a restore can never CLEAR a live
 * layer. A partial restore is normal, never an error.
 *
 * ⭐ **B-108 — `skipped` is a LIST, not a count, and it REPLACED the count rather
 * than joining it.** It was `skipped: number`, and nothing consumed it:
 * `WebSocketRuntime.#resync` awaited the call and discarded the result, so rows the
 * bridge could not re-seat vanished from the operator's stack with nothing said.
 * A count could not have fixed that even if it had been read — the operator needs to
 * know WHICH rows are gone and WHY, and one of the three reasons is benign and must
 * raise no alarm at all. Carrying both a count and a list would be two shapes of one
 * fact, which is how they come to disagree.
 */
export const StackRestoreChannel = defineChannel(
  'stack.restore',
  z.object({ items: z.array(RetainedStackItemSchema) }),
  z.object({
    restored: z.number().int().nonnegative(),
    skipped: z.array(RestoreSkipSchema),
  }),
);

/**
 * Main → Renderer push: emitted after every state mutation. The Renderer
 * keeps its Zustand store in sync via this stream. Sending a full
 * snapshot is simpler than emitting deltas; if profiling shows it's a
 * bottleneck we can swap to per-item deltas.
 */
export const StackStateChangedChannel = definePublishChannel(
  'stack.state-changed',
  z.array(StackItemStateSchema),
);
