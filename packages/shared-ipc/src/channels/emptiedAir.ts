import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 **`B-225` — THE PLAYOUT SERVER EMPTIED AIR, AND THE CONSOLE SAYS SO.**
 *
 * CasparCG restarts under a running bridge (NSSM auto-restarts the service on the plant). The
 * channel comes back emitting a valid, correctly-timed BLACK picture — nothing downstream
 * faults, no alarm anywhere fires — and the reconnect honestly resets every row it can no
 * longer verify to `idle`. Until this channel existed the operator's only evidence was rows
 * quietly going grey, and by the time the browser had mirrored that back as retained state the
 * fact was gone (`B-225`: `idle` retains as `cleared`, "KNOWN EMPTY … NOT restorable").
 *
 * ── WHAT THE NOTICE CLAIMS, EXACTLY ─────────────────────────────────────────
 *
 * 🔴 **NOT "the server restarted".** The bridge cannot prove that: CasparCG puts no boot
 * marker, uptime or channel generation on any wire this bridge reads (`osc.health`/`uptimeSec`
 * is modelled in `osc.ts` and never emitted, and `INFO` carries no such field), and
 * `RESTART-NOTICE-01` forbids adding a probe to find out.
 *
 * What IS proven, and all the notice says, is this: **at the moment the primary session
 * re-entered `healthy` with the OSC tap PROVEN HEARING, layers this bridge had put producers
 * on reported no producer.** Air this console had seated is empty, and this console did not
 * empty it. A server restart is the overwhelmingly likely cause — {@link newConnection}
 * narrows it further, because a restart necessarily kills the AMCP socket while a recovered
 * OSC flap does not — but a channel `CLEAR` from another AMCP client, or a reconfiguration,
 * would read identically, so the wording stays at what was measured.
 *
 * ── AND WHY THE SET IS THE DISCRIMINATOR ────────────────────────────────────
 *
 * ⭐ A row enters {@link EmptiedAirNoticeSchema.rows} only by being RESET FROM A PLAYED STATE
 * by that one reconnect. A row the operator deliberately cleared was already `played: false`
 * long before, so `reconcileOnReconnect` skips it (`if (!rec.played) continue`) and it can
 * never appear here. That is what lets the one press put rows back without re-opening
 * `B-109`: the distinction is structural — a deliberately-cleared row is not in the set to
 * be offered — rather than a guard the restore has to remember to apply.
 */

/** Why a row in the notice could not be put back. */
export const EMPTIED_AIR_REFUSALS = [
  /** The row's template is no longer registered — nothing can re-`CG ADD` it. */
  'unknown-template',
  /** No server is reachable, so the take did not leave the bridge. */
  'disconnected',
  /** The row is on PVW; leaving rehearse is the operator's decision (`R-022`). */
  'rehearsing',
  /** The row is no longer on the stack — removed since the notice was raised. */
  'unknown-item',
  /** The take was refused or failed for a reason the bridge reports as its own. */
  'refused',
] as const;

export type EmptiedAirRefusal = (typeof EMPTIED_AIR_REFUSALS)[number];

/** One row that was on air until the server stopped carrying it. */
export const EmptiedAirRowSchema = z.object({
  itemId: z.string().min(1),
  /** What it was showing — the operator recognises the row by this, not by its id. */
  templateId: z.string().min(1),
  /**
   * The layer it was on, so the row can be found in the layer list.
   *
   * OPTIONAL because the row it is copied from is: `reconcileOnReconnect` resets a played
   * record whether or not it carries a slot. Reporting the row WITHOUT a layer is the honest
   * answer there; inventing a coordinate, or dropping the row from the notice to keep the
   * field required, would each be worse than a missing number.
   */
  slot: z
    .object({
      channel: z.number().int().positive(),
      layer: z.number().int().nonnegative(),
    })
    .optional(),
  /**
   * Set only by a restore ATTEMPT that did not put this row back. Absent means "not yet
   * tried" — never "succeeded", because a row that succeeds leaves the notice entirely.
   */
  refusal: z.enum(EMPTIED_AIR_REFUSALS).optional(),
});

export type EmptiedAirRow = z.infer<typeof EmptiedAirRowSchema>;

/** The standing notice, or `null` when air was not emptied under us. */
export const EmptiedAirNoticeSchema = z.object({
  /** When the reconnect that emptied these rows completed (ISO). */
  at: z.string().datetime(),
  /** The rows reset from a played state by that one reconnect. Never empty. */
  rows: z.array(EmptiedAirRowSchema).min(1),
  /**
   * How many Live Source seats went with them — the ledger records the server contradicted
   * (`B-227`). Reported so the sentence can name guests' pictures as well as graphics; zero
   * for a stack with no multi-box row on air.
   */
  seatsDropped: z.number().int().nonnegative(),
  /**
   * The AMCP connection was NEW, rather than the same connection with its OSC recovered.
   * A server restart necessarily kills the socket, so `false` here means the layers emptied
   * WITHOUT the connection dropping — which a restart cannot explain and a `CLEAR` from
   * elsewhere can. It narrows the claim; it does not prove it.
   */
  newConnection: z.boolean(),
});

export type EmptiedAirNotice = z.infer<typeof EmptiedAirNoticeSchema>;

/** Pull the standing notice (initial state on client connect). */
export const EmptiedAirNoticeChannel = defineChannel(
  'air.emptied',
  z.void(),
  EmptiedAirNoticeSchema.nullable(),
);

/** Pushed when the notice is raised, narrowed by a partial restore, or dismissed. */
export const EmptiedAirNoticeChangedChannel = definePublishChannel(
  'air.emptied-changed',
  EmptiedAirNoticeSchema.nullable(),
);

/**
 * 🔴 **THE ONE PRESS — and it is a PRESS, never a timer, a reconnect or a page load.**
 *
 * The owner's decision (2026-09-05), choosing "detect and say" over restoring automatically:
 * *an unattended machine must not put a graphic on air.* So nothing in the bridge calls this;
 * it exists only to be reached by an operator who has read the notice.
 *
 * Each named row is re-taken through the ORDINARY `take` — not a private re-seat path — so
 * every refusal a take already owns (reachability, the rehearse interlock, multi-box
 * exclusivity, live-plate seating) applies unchanged. Rows that are not in the standing notice
 * are refused: the notice is the evidence, and acting past it would be acting on nothing.
 */
export const EmptiedAirRestoreChannel = defineChannel(
  'air.restore-emptied',
  z.object({ itemIds: z.array(z.string().min(1)).min(1) }),
  z.object({
    restored: z.number().int().nonnegative(),
    results: z.array(
      z.object({
        itemId: z.string().min(1),
        ok: z.boolean(),
        reason: z.enum(EMPTIED_AIR_REFUSALS).optional(),
      }),
    ),
  }),
);

/**
 * Dismiss the standing notice without restoring anything.
 *
 * Bridge-side rather than per-browser on purpose: two operators on two browsers must not
 * disagree about whether the console is still reporting that air is empty. Dismissing changes
 * nothing on air — the rows stay on the stack, idle, and a take puts any of them back by the
 * ordinary door.
 */
export const EmptiedAirDismissChannel = defineChannel(
  'air.dismiss-emptied',
  z.void(),
  z.object({ ok: z.boolean() }),
);
