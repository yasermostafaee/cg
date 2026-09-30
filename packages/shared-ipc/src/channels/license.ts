import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` D / `R-077` — **THE CG LICENSE, AS THE PLAYOUT STATES IT** (Playout `2.9.2`,
 * `docs/integration/playout/PLAYOUT-CG-RESPONSE-LICENSE-v1.md` §3–§4).
 *
 * The Playout is the only license authority: its dongle carries a `cg` feature bit and a CG channel cap.
 * CG Control holds no license of its own. Two facts reach us:
 *
 * - `GET /api/cg/license` — the station's CG license ({@link PlayoutLicenseSchema}), read by CG Bridge with
 *   its own session beside D9, about every 60 s, the last value KEPT while the Playout cannot be reached;
 * - D4's per-channel `cgLicensed` — whether CG may command THAT channel (the cap), on the station channel
 *   row (`StationChannel.cgLicensed`).
 *
 * The rule agreed with the Playout team (their §4): a take on a channel where CG is not licensed is
 * refused with the Playout's own message; removals (`CLEAR`/`STOP` of our own layers) still work; and
 * NOTHING on air is cleared by either side because of the CG license. (The Playout's OWN license rule is
 * another matter — it clears a whole channel every minute — and is D4's `playlist: "unlicensed"`.)
 */

/**
 * The Playout's answer, parsed LENIENTLY: every field but `licensed` may be missing, `null` or of a kind
 * we do not know, and none of that voids the answer — a Playout that adds a reason must not turn a
 * license we can read into one we cannot.
 */
export const PlayoutLicenseSchema = z.object({
  /** CG Control is licensed: sign-in, refresh and new commands. */
  licensed: z.boolean(),
  /** Only when `licensed` is `false`: `not_included`, `missing`, `invalid`, `expired`, `not_yet_valid`. */
  reason: z.string().min(1).nullable().optional().catch(undefined),
  /**
   * The Playout's own sentence for the operator (Persian). Shown as it is, in one line: whitespace
   * runs collapse and it is cut at 300 characters, never dropped for its length.
   */
  message: z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim().slice(0, 300))
    .pipe(z.string().min(1))
    .nullable()
    .optional()
    .catch(undefined),
  /** The Playout's OWN license: `unmanaged`, `valid`, `grace`, `expired`, `missing`, `invalid`, … */
  playoutState: z.string().min(1).nullable().optional().catch(undefined),
  /** The separate CG cap; `null` — no separate cap (every channel the Playout itself is licensed for). */
  maxChannels: z.number().int().nonnegative().nullable().optional().catch(undefined),
  /** `yyyy-MM-dd`, UTC; `null` — permanent or unknown. */
  expiresAt: z.string().min(1).nullable().optional().catch(undefined),
  /** Only in `grace`: the end of the 48 h after the Playout's license expired (ISO 8601, UTC). */
  graceUntil: z.string().min(1).nullable().optional().catch(undefined),
});

export type PlayoutLicense = z.infer<typeof PlayoutLicenseSchema>;

/**
 * What every console is told. `license` is `null` while nothing has been read — auth off, a Playout
 * before `2.9.2` (its `404`), CG Control switched off in the Playout — and NOTHING is refused for it.
 */
export const LicenseStateSchema = z.object({ license: PlayoutLicenseSchema.nullable() });

export type LicenseState = z.infer<typeof LicenseStateSchema>;

/** Pull the license (a console's initial read). Station-wide: one Playout, one license. */
export const LicenseStateChannel = defineChannel('license.state', z.void(), LicenseStateSchema);

/** Pushed whenever the license read changes what it says. */
export const LicenseStateChangedChannel = definePublishChannel(
  'license.state-changed',
  LicenseStateSchema,
);

/**
 * 🔴 **THE ONE PREDICATE — is CG licensed on this channel?** The bridge's take refusal and the console's
 * channel mark both ask it (golden rule 6), so what the strip marks and what the bridge refuses cannot
 * come apart. Answers the REASON in words when CG is not licensed there, else `null`:
 *
 * - `licensed: false` — the Playout's `message`, else our own sentence for the channel;
 * - that channel's D4 `cgLicensed: false` — the Playout's `message` when it gave one, else the cap's
 *   sentence ({@link cgOutsideCapReason});
 * - neither known — `null`: nothing unread is ever a reason to refuse.
 */
export function cgUnlicensedReason(
  license: Pick<PlayoutLicense, 'licensed' | 'message'> | null,
  cgLicensed: boolean | undefined,
  channel: number,
): string | null {
  const message = license?.message ?? null;
  if (license?.licensed === false) return message ?? cgNotLicensedReason();
  if (cgLicensed === false) return message ?? cgOutsideCapReason(channel);
  return null;
}

/** `licensed: false` with no message of the Playout's. */
export function cgNotLicensedReason(): string {
  return "The Playout's license does not include CG Control.";
}

/** A channel outside the CG cap, when the Playout gives no message (`licensed: true` carries none). */
export function cgOutsideCapReason(channel: number): string {
  return `CH ${String(channel)} is outside the Playout's CG Control license.`;
}

/** The refusal's code, on the take's verdict and on the row's refusal record. */
export const CG_UNLICENSED_CODE = 'cg-unlicensed';
