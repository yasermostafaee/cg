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
 * are OURS: the ledger is the record of what this bridge itself seated, resolved
 * at boot against the server's `INFO` (`reconcileLiveLayers` — the file knows the
 * NAMES, the server knows the TRUTH, and their reconciliation IS the ledger). So
 * there is no `observed` union here and no `unknown` arm. A row in this list means
 * "the bridge's single authority says this coordinate carries this plate"; a
 * coordinate the server contradicted at boot was DROPPED and never appears.
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
