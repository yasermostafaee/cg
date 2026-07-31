import { z } from 'zod';
import { IdSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * R-022 — REHEARSE: run a loaded graphic's lifecycle and edit its values while it
 * renders LOCALLY IN THE BROWSER, with PLAY-to-air interlocked off.
 *
 * This is R-022's territory (in-app template preview via the shared renderer)
 * extended into an explicit MODE WITH A SAFETY INTERLOCK, which is stronger than
 * R-022 as filed: a passive preview pane merely happens not to send commands,
 * whereas a mode makes "cannot reach air" a state the system ENFORCES. It is
 * deliberately not implemented as "a preview pane that we hope nobody plays
 * from".
 *
 * WHY IT IS BRIDGE-OWNED AND NOT BROWSER-LOCAL. Several browsers share one
 * bridge. If rehearse lived in one browser, the second operator would see that
 * row as an ordinary loaded row and load onto it — a collision on a real layer.
 * So rehearse belongs in the bridge's state and is pushed to every client,
 * exactly like the template catalogue and the channel raster.
 *
 * THE GUARD IS BRIDGE-SIDE, NOT A HIDDEN BUTTON. Rehearse is refused for a row
 * that is on air, and the refusal lives where no UI state can bypass it — the
 * doctrine this whole surface follows.
 *
 * WHAT REHEARSE NEEDS, AND WHAT IT DOES NOT. The render is the retained
 * self-contained page in a same-origin iframe sized to the channel raster, with
 * the operator's typed values. That needs three things — a BOUND TEMPLATE, the
 * VALUES and the RASTER — and all three are bridge-owned. None of them is the
 * CasparCG layer. So the entry precondition is that the row has a template
 * bound, and nothing more.
 *
 * It used to also require a RESIDENT PRODUCER (`not-loaded`), which made a
 * preview feature refuse to preview because of the state of a resource it does
 * not use: a row that had been CLEARed could not be rehearsed while the same row
 * after STOP could, and the operator experiences both as "close it". That
 * precondition was protecting nothing and has been removed.
 *
 * THE MUTE IS A CONSEQUENCE, NOT A PREREQUISITE. On 2.5.0 a bare `CG ADD` puts
 * the template's audio on air (R-029), so a producer that IS resident must be
 * muted while the operator rehearses. That is a consequence of rehearsing a
 * LOADED row — it was never a reason to refuse rehearsing an empty one. So the
 * bridge branches on what is actually true of the layer:
 *
 *   - resident producer → `MIXER VOLUME 0` before entering, fail closed on
 *     `mute-failed`, restore on exit / on take / at bridge start. Unchanged.
 *   - empty layer → enter with NO AMCP TRAFFIC AT ALL. Nothing is on the layer,
 *     so there is nothing to make safe — and the exit path MIRRORS the entry
 *     path, sending no restore for a mute that never happened (a stray
 *     `MIXER VOLUME` on a layer we do not own is not a harmless no-op).
 *
 * NOT AN AIR CHECK. What rehearse catches is wrong values, broken layouts and
 * bad motion. Browser rendering versus CasparCG's CEF 71 is faithful, NOT
 * pixel-identical (the B-066 class), and after C-015 a Live Source region renders
 * as a labelled placeholder rather than video. The confidence monitor is C-016,
 * which is a different thing. Those caveats are stated IN the panel, not only
 * here — R-022's own acceptance requires it, and it matters more once rehearse
 * looks authoritative.
 */

/**
 * The refusal codes for entering rehearse, as ONE shared const (the
 * `FIXED_LAYERS_SET_CONFIG_REASONS` pattern) so the wire contract, the bridge and
 * the renderer cannot drift.
 *
 * - `unknown-item` — no such item on the stack.
 * - `on-air` — the item is on air or unsettled. Rehearse is for a graphic that is
 *   NOT on air; entering it on a live one would mute a graphic that is airing.
 *   Fail closed, so `unconfirmed`/`pending` count as on air: an item whose true
 *   state is unknown must not be muted on a guess.
 * - `mute-failed` — the guard passed but the layer could not be muted. REFUSED
 *   rather than entered, and this is the important one: entering rehearse without
 *   having established the mute would leave a resident producer unmuted while the
 *   UI claims it is safely rehearsing — on 2.5.0 that is audio on air. Never
 *   claim a mode whose safety condition failed to apply. Reachable ONLY on the
 *   resident-producer branch: an empty layer sends no mute, so it has no mute to
 *   fail.
 * - `busy` — another rehearse transition for this item is still in flight. Not a
 *   politeness: the mute and the un-mute are separate AMCP round trips, so two
 *   overlapping transitions can interleave such that a LATE un-mute lands after a
 *   NEW mute — leaving a row that CLAIMS to be rehearsing while the layer is not
 *   actually muted. On 2.5.0 that is audio on air behind a UI saying the graphic
 *   cannot reach air, which is the worst kind of wrong this feature can be. Serialising
 *   per item makes the interleaving unrepresentable rather than unlikely.
 *
 * NOTE — `mute-failed` CURRENTLY HAS NO PRODUCER, and that is deliberate rather
 * than an oversight. Entry no longer refuses when the mute does not land (the
 * mute is best-effort; see `enterRehearse`), because refusing made ON PVW behave
 * differently on a STOPped row and a CLEARed row. It is kept in the contract
 * because a future decision to fail closed on a genuine server REFUSAL would use
 * exactly this word — and because removing it would silently narrow the wire.
 */
export const REHEARSE_ENTER_REASONS = ['unknown-item', 'on-air', 'mute-failed', 'busy'] as const;

/** Exit's refusals: no such rehearsal, or a transition already in flight. */
export const REHEARSE_EXIT_REASONS = ['unknown-item', 'busy'] as const;

/** One rehearsing row. Facts only — the renderer derives its own row state. */
export const RehearsalSchema = z.object({
  itemId: z.string().min(1),
  channel: z.number().int().positive(),
  layer: z.number().int().nonnegative(),
});
export type Rehearsal = z.infer<typeof RehearsalSchema>;

/** Every row currently in rehearse ([] when none). */
export const RehearseStateChannel = defineChannel(
  'rehearse.state',
  z.void(),
  z.array(RehearsalSchema),
);

export const RehearseEnterChannel = defineChannel(
  'rehearse.enter',
  z.object({ itemId: IdSchema }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(REHEARSE_ENTER_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/**
 * Leave rehearse and restore the layer's intended volume.
 *
 * ALWAYS `ok` for an item that was rehearsing, even when the un-mute command
 * fails. That is deliberate: the alternative is a UI stuck claiming rehearse over
 * a layer the bridge no longer considers rehearsing, and the un-mute is not the
 * last line of defence anyway — the PLAY path re-asserts the intended volume
 * unconditionally on every take, and the bridge re-asserts for every declared row
 * at startup. A failed un-mute is reported in `message` and cannot strand a
 * silent graphic on air.
 */
export const RehearseExitChannel = defineChannel(
  'rehearse.exit',
  z.object({ itemId: IdSchema }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(REHEARSE_EXIT_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/** Pushed to every client whenever the rehearsing set changes. */
export const RehearseStateChangedChannel = definePublishChannel(
  'rehearse.state-changed',
  z.array(RehearsalSchema),
);

/**
 * THE canonical predicate: is this item rehearsing?
 *
 * One exported function rather than an `.some()` at each call site, because it
 * gates a DESTRUCTIVE-adjacent decision on both sides — the bridge refuses PLAY
 * on it, and the renderer disables PLAY for it. If those two ever disagreed about
 * what "rehearsing" means, one of them would offer a take the other refuses, or
 * worse, allow one the other thought was interlocked off.
 */
export function isRehearsing(rehearsals: readonly Rehearsal[], itemId: string): boolean {
  return rehearsals.some((r) => r.itemId === itemId);
}
