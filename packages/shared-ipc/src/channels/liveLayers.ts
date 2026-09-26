import { z } from 'zod';
import { IdSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * `B-145` acceptance 1, display half (`multibox-layout-switch` `tasks.md` 2.8) —
 * **the LIVE SOURCE ledger on the wire.**
 *
 * ── WHY A THIRD CHANNEL, AND NOT A WIDER `playoutLayers.state` ──────────────
 *
 * The model has THREE declared layer classes and the bridge already enumerates
 * them in one place (`caspar-runtime.ts`'s `#declaredLayerClass`): `playout` is
 * somebody ELSE'S range, `operator-row` is the declared bank, and `live-source`
 * is a coordinate in the bridge's OWN ledger. Only the third is a runtime record
 * rather than a static range, which is exactly what makes it ownable at all.
 *
 * `playoutLayers.state` enumerates `#reservedLayers` and nothing else, and the
 * Live Source band is deliberately kept OUT of that set — reserving it would make
 * every band layer unplaceable (`allocate()` skips reserved layers), unreservable
 * (`reserve()` refuses them) and unclearable (`clearLayer` refuses them as
 * `reserved`). That exclusion is load-bearing, not an oversight (`live-layers.ts`
 * "WHY THIS IS NOT `reservedLayers`"), so widening the reserved channel to carry
 * the band would have to first widen the set that breaks three doors. The band
 * gets its own channel instead, which is what the class model already says it is.
 *
 * ── WHAT THIS CHANNEL IS FOR, AND WHAT IT IS NOT ────────────────────────────
 *
 * It is a READ. There is no clear verb here and that absence is a decision, not an
 * omission: `layers.clear` refuses a live-source coordinate BY NAME
 * (`reason: 'live-source'`), and its comment records why an exemption was refused
 * — *"`clearLayer` is the operator-facing `layers.clear` door ONLY, so an
 * exemption would make Live Source layers operator-CLEARABLE, inverting the
 * protection"*. The sanctioned verbs are ITEM-scoped and already shipped: repoint
 * through `stack.swap-live-source`, audio through `stack.set-plate-volume`, and
 * off-air through `stack.out` / `stack.remove` on the owning row. So this channel
 * exists to make those reachable — to say WHICH row owns a lit layer — never to
 * add a fourth way to take a guest off air.
 *
 * ── WHY IT IS THE LEDGER AND NOT AN OBSERVATION ─────────────────────────────
 *
 * `playoutLayers.state` reports what the OSC tap OBSERVES, because those layers
 * belong to someone else and observation is the only access we have. These layers
 * are OURS: the ledger is the record of what this bridge itself seated, reconciled
 * at boot against whatever the server can be made to say (`reconcileLiveLayers` —
 * the file knows the NAMES, the server knows the TRUTH). So there is no `observed`
 * union here: this is not a tap reading somebody else’s layer.
 *
 * 🔴 **BUT IT IS NOT ALL FIRST-HAND, AND THE PAYLOAD SAYS WHICH.** An earlier draft
 * of this header argued from "resolved at boot against the server's INFO" to "so no
 * `unknown` arm is needed" — and the premise is false in the shipped bridge. The one
 * production call adopts with occupancy hard-coded to `unknown` (`bridge.ts`: no
 * session has connected at that point, and dropping an unverifiable record would
 * strand exactly the producer `B-145` exists to protect), so nothing is ever dropped
 * and EVERY adopted record is unverified. That made the omission the one distinction
 * that is always true after a restart. See {@link LiveLayerStateSchema}’s
 * `unverified`.
 */

/**
 * ONE seated Live Source layer, flattened out of the `itemId`-keyed ledger.
 *
 * FLAT rather than grouped by item, and sorted by coordinate, because the surface
 * that reads it is a LAYER LIST: the operator's question is "what is lit, and
 * whose is it", which is answered per coordinate. `itemId` rides each row so the
 * consumer can join back to the stack — and so a row whose item is GONE is
 * representable, which is the case `B-145` exists for.
 */
export const LiveLayerStateSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /**
   * The stack item whose plates this layer carries.
   *
   * 🔴 **This is the whole handle, and it is why the ledger is keyed by it.** Every
   * verb that can reach a seated layer is item-scoped, so an operator who can see
   * this id — and the row it names — can act; one who cannot is looking at a live
   * face on air with no way to touch it, which is the defect `B-145` describes.
   *
   * ⚠ It may name an item the stack no longer carries. That is not a bug in this
   * payload: after a bridge restart the ledger is adopted from disk while the
   * browser re-delivers its own stack intent, and the two can legitimately
   * disagree. The consumer resolves it — see `liveLayerRows`.
   */
  itemId: IdSchema,
  /** The SYMBOLIC plate id from the scene's declaration, e.g. `guest-1`. Never a device. */
  sourceId: z.string().min(1),
  /** Which half of a fill+key pair. `fill` is every `route://` and media case. */
  role: z.enum(['fill', 'key']),
  /**
   * The concrete producer argument actually SENT — what the installation's mapping
   * resolved `sourceId` to. Recorded as sent rather than as configured, so this
   * says what is on the layer and not what a since-edited mapping now claims.
   */
  producer: z.string(),
  /**
   * §12.4 — the plate is seated but the active LOOK does not show it: muted, idle,
   * and with no hole punched in front of it.
   *
   * REQUIRED here though the ledger record's own field is optional. The record's
   * optionality is a persistence concern (a ledger written before looks existed
   * parses unchanged and reads as "on screen"); on the wire that ambiguity has
   * already been resolved, and a UI branching on `undefined` would be re-deciding
   * a question the projection already answered.
   */
  held: z.boolean(),
  /**
   * 🔴 **The record was ADOPTED FROM THE FILE at boot and nothing has confirmed it
   * since.**
   *
   * Without this, a row the bridge seated thirty seconds ago and a row read out of a
   * file after a reboot — with CasparCG possibly black — are indistinguishable, and a
   * surface would state the second in the present tense. `StackItemStatus` already
   * carries an `unverified` member for exactly this reason (`B-086`): an on-air claim
   * the bridge cannot back is DEMOTED, never asserted.
   *
   * It clears when the bridge itself next writes that item’s records — a take, a look
   * reconcile, a swap — because those send real AMCP and are therefore first-hand.
   */
  unverified: z.boolean(),
});

export type LiveLayerState = z.infer<typeof LiveLayerStateSchema>;

/**
 * Every Live Source layer the bridge currently believes it has seated ([] when
 * none), ordered by channel then layer.
 */
export const LiveLayersStateChannel = defineChannel(
  'liveLayers.state',
  z.void(),
  z.array(LiveLayerStateSchema),
);

/**
 * Pushed whenever the ledger CHANGES — a seat, a release, a hold, a volume
 * re-assert, or the boot adoption.
 *
 * It rides the emitter `B-145` already fires from the ledger's ONE write path, so
 * this is not a second notification mechanism: the persister and the wire learn
 * about a change from the same call. A surface that polled instead would be free
 * to disagree with the file about what is on air.
 */
export const LiveLayersStateChangedChannel = definePublishChannel(
  'liveLayers.state-changed',
  z.array(LiveLayerStateSchema),
);

// ───────── `B-247` — WHY A SEAT LEFT THE LEDGER, and not merely THAT it did ─────────

/**
 * 🔴 **`B-247` — THE REASON A PLATE STOPPED BEING SEATED, CARRIED ACROSS THE SEAM.**
 *
 * ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
 *
 * `releaseLivePlate` has always computed an operator-facing sentence for every plate the
 * reconcile lets go, and `#applyLivePlatesUnguarded` has always emitted it on
 * `livePlateReleased` — which **nothing outside the test suite subscribed to.**
 * `CasparRuntime` declared 19 emitters and `wirePublishes` forwarded 18. So §12.4's promise
 * that the teardown fallback is *"a NAMED, OBSERVABLE behaviour"* rather than *"a teardown
 * nobody can tell from a bug"* was true of the bridge and false of the console. Same class as
 * `B-147`'s reader-less `autoSqueeze` and `B-143`'s zero-reader `assumed`: written, correct,
 * unreachable.
 *
 * ── WHY THE REASON CANNOT BE RE-DERIVED BY THE SURFACE ──────────────────────
 *
 * 🔴 The tab COULD guess — *this row is on air, this frame is not in the active look, its
 * source is a `media` producer, therefore it was torn down* — and that guess is a second
 * spelling of `canHoldLivePlate`, living in the renderer, free to disagree with the bridge
 * about a plate that is on air. Golden rule 6 forbids exactly that. The bridge already knows
 * the answer; this channel is how the answer travels, rather than being recomputed at the far
 * end from facts that only happen to imply it today.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * ⚠ **An EVENT, not standing state, and that bound is deliberate.** It fires at the moment the
 * reconcile lets a plate go; a browser that connects afterwards never sees it, and a reload
 * loses it. That is acceptable HERE and would not be for an alarm: the fact it carries is a
 * refinement of a state the ledger already publishes — the frame has no seat either way — so
 * losing it degrades `Cleared` to `Not seated`, never to a claim that is wrong. Compare
 * `EmptiedAirNoticeChangedChannel`, which is standing bridge state precisely because its fact
 * IS the alarm and two browsers may not disagree about it.
 *
 * ⚠ And it is READ-ONLY, like the ledger channel above it. Nothing here takes a plate off air.
 */
export const LIVE_PLATE_DISPOSITIONS = ['held', 'torn-down'] as const;

export type LivePlateDispositionWire = (typeof LIVE_PLATE_DISPOSITIONS)[number];

/** One plate the reconcile let go, with the bridge's own sentence for why. */
export const LivePlateReleaseSchema = z.object({
  /** The stack row whose plate this is — the handle every item-scoped verb takes. */
  itemId: IdSchema,
  /** The SYMBOLIC plate id from the scene's declaration, e.g. `guest-1`. Never a device. */
  plateId: z.string().min(1),
  /**
   * 🔴 **`held` KEEPS ITS LEDGER RECORD; `torn-down` DOES NOT.** That is the whole distinction
   * the surface needs: a held plate is still on the tab as a seat, while a torn-down one has
   * left the ledger and would otherwise be indistinguishable from a frame that never had a
   * producer at all.
   */
  disposition: z.enum(LIVE_PLATE_DISPOSITIONS),
  /**
   * The operator-facing sentence, composed by `releaseLivePlate` and passed through verbatim.
   *
   * ⚠ **NOT re-worded at either end.** It is the bridge's account of a decision the bridge
   * made, and a surface that paraphrased it would be stating a reason it did not compute.
   */
  reason: z.string().min(1),
});

export type LivePlateReleaseState = z.infer<typeof LivePlateReleaseSchema>;

/** Pushed once per plate the reconcile releases — held or torn down. See the header above. */
export const LivePlateReleasedChannel = definePublishChannel(
  'liveLayers.plate-released',
  LivePlateReleaseSchema,
);

/**
 * 🔴 `FIELD-FIXES-01` K — **THE CHANNELS THE LIVE-LAYERS LEDGER HOLDS A SEAT ON: where a silence
 * has something to act on.** THE ONE DEFINITION, asked over each side's own copy of the ledger:
 * the bridge's PANIC reach (`liveLedgerChannels`, `B-257`, over the ledger it publishes) and the
 * console's silence controls, which are live only while their channel is in this list (over the
 * snapshot it receives). A channel absent here is where the bridge answers "nothing to silence".
 */
export function ledgerChannels(ledger: Iterable<Pick<LiveLayerState, 'channel'>>): number[] {
  const channels = new Set<number>();
  for (const row of ledger) channels.add(row.channel);
  return [...channels].sort((a, b) => a - b);
}
