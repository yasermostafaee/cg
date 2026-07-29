import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';
import { FixedSlotObservationSchema } from './fixedLayers.js';

/**
 * R-028 part B — the PLAYOUT tab: the declared reserved layers (C-015), what
 * is on them, and a DELIBERATE per-layer clear.
 *
 * WHY THIS EXISTS AT ALL, given part A refused exactly this. Part A excluded
 * reserved layers from the R-009 orphan sweep and made `layers.clear` refuse
 * them (`reason: 'reserved'`), because the operator was being INVITED to
 * reclaim the company's output as if it were his own orphan. The owner has
 * since decided the opposite for a DELIBERATE surface, and the distinction is
 * the whole safety argument:
 *
 *   - the orphan banner is an invitation the operator did not ask for — it
 *     stays refused, and the sweep exclusion stays exactly as part A left it;
 *   - this tab is a separate, labelled surface the operator opens on purpose,
 *     knowing these are not his layers. Automatic paths still never touch them.
 *
 * So this is a SECOND channel, not a loosening of `layers.clear`. Nothing that
 * runs on its own can reach it.
 *
 * THE KIND GATE (owner-confirmed, not optional). The reservation is a claim
 * about who owns the LAYERS, never about what is on them. The playout team's
 * contract says they put graphics on 60–69, but a contract is not a mechanism:
 * a video, route or decklink producer can land there — including by the playout
 * operator's own mistake — and clearing THAT is precisely the "killed the
 * antenna or a live channel" accident the reservation was created to prevent.
 * So the bridge refuses anything whose observed producer kind is not `html`,
 * and the UI offers no control for it either.
 *
 * VERIFIED (R-028 part B, against the station's running CasparCG 2.3.2, and
 * the recon task 1.3 never ran): producer kind IS legible for layers this
 * process did not create — four foreign `html` producers were observed on
 * layers 61/70/71/72 through both the OSC occupancy tap and AMCP `INFO`. The
 * tap records the kind string VERBATIM and never defaults (`occupancy-tap.ts`
 * stores `event.producer` as-is and only skips `'empty'`), so a non-`html`
 * producer cannot be misread as `html`; a layer with no OSC evidence has no
 * entry at all, which this contract reports as `unknown` — and unknown offers
 * no clear.
 *
 * WHAT THE GATE DOES NOT PROMISE, stated so no wording oversells it: `html`
 * means "not a video/route/decklink". It does NOT mean "unimportant" — an html
 * producer on a playout layer may well be the station's own on-air graphics
 * package. Clearing it takes real graphics off air. That is accepted and
 * intended; the operator is told whose layer it is and confirms.
 */

/** One reserved (playout-owned) layer and what is observed on it. */
export const PlayoutLayerStateSchema = z.object({
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
  /**
   * The SAME observation union the fixed rows use — `unknown` / `empty` /
   * `producer` + kind — read from the same tap with the same freshness
   * predicate. Reused deliberately: a second occupancy vocabulary is how
   * "unknown" would come to mean "empty" on one surface and not the other.
   */
  observed: FixedSlotObservationSchema,
});
export type PlayoutLayerState = z.infer<typeof PlayoutLayerStateSchema>;

/** Pull every declared reserved layer's state ([] when nothing is reserved). */
export const PlayoutLayersStateChannel = defineChannel(
  'playoutLayers.state',
  z.void(),
  z.array(PlayoutLayerStateSchema),
);

/** Pushed when the reserved-layer state CHANGES (never on idle sweeps). */
export const PlayoutLayersStateChangedChannel = definePublishChannel(
  'playoutLayers.state-changed',
  z.array(PlayoutLayerStateSchema),
);

/**
 * R-028 part B — refusal codes for a deliberate playout clear. Each is a
 * REFUSAL the operator can act on, and every one of them fails CLOSED.
 *
 * - `not-reserved` — the coordinate is not a declared playout layer. This
 *   channel is for the playout tab only; our own rows are the Layers list's
 *   business and a foreign layer outside both is still `layers.clear`'s.
 * - `not-html` — an observed producer that is NOT an html template (a video,
 *   a route, a decklink, anything unrecognised — "not html" fails safe). The
 *   antenna/live-channel guard; refused from ANY caller, never merely unoffered.
 * - `unknown-occupancy` — no fresh OSC for that layer, so what is there cannot
 *   be established. Silence is evidence of nothing (the B-093 lesson): a gate
 *   that cannot read its input must refuse rather than guess.
 * - `already-empty` — the tap IS hearing and reports nothing on that layer.
 *   Distinct from `unknown-occupancy` on purpose: "I looked and it is empty" and
 *   "I cannot see" are opposite statements about our knowledge, and telling the
 *   operator the bridge is blind when it actually looked would be a lie in the
 *   more alarming direction.
 * - `amcp-error` — the CLEAR reached the wire and failed.
 */
export const PLAYOUT_CLEAR_REASONS = [
  'not-reserved',
  'not-html',
  'unknown-occupancy',
  'already-empty',
  'amcp-error',
] as const;

/**
 * Clear ONE declared playout layer — the operator's deliberate act, gated as
 * above. There is no bulk channel on purpose: "clear all" in the tab is N
 * calls to THIS channel over the html-only subset, so the gate is enforced
 * bridge-side exactly once and a bulk action can never clear something the
 * single action would have refused.
 */
export const PlayoutLayersClearChannel = defineChannel(
  'playoutLayers.clear',
  z.object({
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(PLAYOUT_CLEAR_REASONS).optional(),
    /** The observed kind at refusal time, so the UI can name what it saw. */
    observedProducer: z.string().min(1).optional(),
  }),
);
