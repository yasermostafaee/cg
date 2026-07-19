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
  z.object({ accepted: z.boolean(), errorCode: z.string().optional() }),
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
 * NO new AMCP verb. It iterates the items that are actually on air and issues the SAME
 * per-item `out()` the row's Clear button sends — a `CLEAR <ch>-<layer>` on the urgent
 * (air-safety) lane, with the same B-039 CLEAR-destroys bookkeeping, so a later take re-ADDs.
 * The predicate matches the row's Clear gating exactly: everything that is not `idle` or
 * `loaded`. Clear-All IS "press Clear on every row where Clear is enabled".
 *
 * **BROADCAST SAFETY — per-LAYER, never per-channel.** It clears only the layers this app
 * itself allocated, one `CLEAR <ch>-<layer>` per on-air item. It MUST NEVER emit a
 * channel-level `CLEAR <channel>`: that wipes the entire channel, including the
 * program/background signal this app does not manage and must never touch. Taking our
 * graphics off air has to leave the program feed ON AIR. An item holding no slot holds no
 * layer of ours, so nothing is sent for it.
 */
export const StackClearAllChannel = defineChannel(
  'stack.clear-all',
  z.void(),
  z.object({ ok: z.boolean(), cleared: z.number().int().nonnegative() }),
);

export const StackSnapshotChannel = defineChannel(
  'stack.snapshot',
  z.void(),
  z.array(StackItemStateSchema),
);

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
 * layer. `skipped` counts intents the bridge declined (an item it already
 * holds, an unregistered template, no free layer) — a partial restore is
 * normal, never an error.
 */
export const StackRestoreChannel = defineChannel(
  'stack.restore',
  z.object({ items: z.array(RetainedStackItemSchema) }),
  z.object({
    restored: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
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
