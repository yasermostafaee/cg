import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * R-030 — CHANNEL SETTINGS: the per-channel output properties, owned by the
 * BRIDGE and pushed to every browser.
 *
 * Bridge-owned for the same two reasons the template catalogue and the fixed
 * layer bank are: several browsers share one bridge, so a browser-local raster
 * would let two operators disagree about where graphics land; and it must
 * survive a bridge restart. Configured by hand today — later, when the channel
 * list arrives from an API, these properties come with it, which is why this is
 * a channel-keyed LIST rather than one global raster.
 *
 * WHAT IS IN HERE, ENUMERATED. Exactly one property: `raster`, the channel's
 * pixel geometry. That is what output placement needs (`@cg/template-runtime`'s
 * `resolveChannelRaster`) and it is the whole of R-030.
 *
 * FRAME RATE IS DELIBERATELY ABSENT, and this is not an oversight to be tidied
 * up later by whoever notices. Rate is a DIFFERENT axis with different
 * consequences: this codebase has frame-locked animation (ADR 0005), so a
 * declared rate would immediately raise "does the FrameDriver read it, and what
 * happens to a scene authored at another rate?" — questions the raster does not
 * raise and R-030 does not answer. Anyone adding it must say in the same change
 * what reads it and what changes when it is wrong.
 */

/**
 * A channel's pixel raster. Bounded on both axes so a typo'd config
 * (`{ width: 2e9 }`) is a LEGIBLE schema refusal at boot rather than a scale of
 * ~0 that blanks the output — the `MAX_RESERVED_LAYER` doctrine.
 */
export const MAX_RASTER_DIMENSION = 16384;

export const ChannelRasterSchema = z.object({
  width: z.number().int().positive().max(MAX_RASTER_DIMENSION),
  height: z.number().int().positive().max(MAX_RASTER_DIMENSION),
});
export type ChannelRaster = z.infer<typeof ChannelRasterSchema>;

/** The reference frame every scene is authored against (`REFERENCE_FRAME`). */
export const REFERENCE_RASTER: ChannelRaster = { width: 1920, height: 1080 };

export const ChannelSettingsSchema = z.object({
  channel: z.number().int().positive(),
  raster: ChannelRasterSchema,
});
export type ChannelSettings = z.infer<typeof ChannelSettingsSchema>;

/**
 * What the SERVER says about a channel — read from `INFO <channel>`, never
 * assumed from config.
 *
 * `raster: null` means the `video-mode` token was read but THIS build does not
 * recognise it. That is a genuinely different fact from "not read at all"
 * (an absent entry) and the two must not collapse: the first says the check
 * cannot be performed on this mode, the second says it has not been attempted.
 * Neither is ever rendered as agreement.
 */
export const ChannelVideoModeSchema = z.object({
  channel: z.number().int().positive(),
  /** The raw `<video-mode>` token, verbatim — facts, not a resolved label. */
  mode: z.string().min(1),
  /** The raster that token means, or null when unrecognised. */
  raster: z.union([ChannelRasterSchema, z.null()]),
});
export type ChannelVideoMode = z.infer<typeof ChannelVideoModeSchema>;

export const ChannelSettingsStateSchema = z.object({
  /** The configured settings, one entry per declared channel. */
  settings: z.array(ChannelSettingsSchema),
  /**
   * What the server reported, one entry per channel successfully queried. An
   * ABSENT entry is the honest "not read" — never a guess, and never treated as
   * a match.
   */
  observed: z.array(ChannelVideoModeSchema),
});
export type ChannelSettingsState = z.infer<typeof ChannelSettingsStateSchema>;

/**
 * THE verdict for one channel's raster, and THE canonical way to compute it.
 *
 * A single exported predicate rather than a `w===w && h===h` at each call site:
 * the bridge decides whether to warn on stderr, the renderer decides whether to
 * show a banner, and if those two ever disagreed about what "mismatch" means,
 * the UI would go quiet about a channel the bridge considered broken. Same rule
 * as `isLayerVisible` and `isLiveState`.
 *
 * - `match` — configured and observed rasters agree. The only reassuring verdict.
 * - `mismatch` — they disagree. EVERY graphic on this channel is mis-placed.
 * - `unreadable` — the mode was read but is not a raster this build knows, OR it
 *   could not be read at all. The check is unavailable; that is a recorded gap,
 *   not a pass.
 * - `unconfigured` — no settings entry for this channel, so there is no claim to
 *   check. Placement falls back to the page viewport then the reference frame.
 */
export type RasterVerdict = 'match' | 'mismatch' | 'unreadable' | 'unconfigured';

export function rasterVerdict(state: ChannelSettingsState, channel: number): RasterVerdict {
  const configured = state.settings.find((s) => s.channel === channel);
  if (configured === undefined) return 'unconfigured';
  const observed = state.observed.find((o) => o.channel === channel);
  if (observed === undefined || observed.raster === null) return 'unreadable';
  return observed.raster.width === configured.raster.width &&
    observed.raster.height === configured.raster.height
    ? 'match'
    : 'mismatch';
}

/** Every channel whose configured raster CONTRADICTS what the server reports. */
export function mismatchedChannels(state: ChannelSettingsState): ChannelSettings[] {
  return state.settings.filter((s) => rasterVerdict(state, s.channel) === 'mismatch');
}

/**
 * ─── Reading reality: CasparCG's `video-mode` token ────────────────────────
 *
 * These live HERE, beside the schema, rather than in `@cg/caspar-client` where
 * the rest of the AMCP knowledge sits. Two reasons, and the first is decisive:
 *
 *  1. BOTH TIERS need the map. The bridge reads `INFO <channel>` off the wire;
 *     the browser's `MockRuntime` must report the same raster for the same token
 *     or test mode would show a mismatch that does not exist on air. Importing
 *     `@cg/caspar-client` into browser code would drag `node:net` (its AMCP
 *     transport) into the SPA bundle — the exact thing the tier rule forbids. A
 *     second local copy is the alternative, and a second copy of "what
 *     `1080i5000` means" is how the two tiers come to disagree.
 *  2. Nothing here needs AMCP machinery. Both functions are pure string work
 *     over a value the wire happens to deliver.
 */

/**
 * The named modes whose raster is NOT derivable from the token's own digits: SD
 * modes are 720-wide with a non-16:9 raster.
 */
const NAMED_RASTERS = new Map<string, ChannelRaster>([
  ['pal', { width: 720, height: 576 }],
  ['ntsc', { width: 720, height: 486 }],
]);

/** Vertical resolution → the broadcast raster CasparCG builds for it. */
const HEIGHT_RASTERS = new Map<number, ChannelRaster>([
  [576, { width: 720, height: 576 }],
  [486, { width: 720, height: 486 }],
  [720, { width: 1280, height: 720 }],
  [1080, { width: 1920, height: 1080 }],
  [1556, { width: 2048, height: 1556 }],
  [2160, { width: 3840, height: 2160 }],
]);

/** `dci<height>p…` — digital cinema, wider than broadcast at the same height. */
const DCI_RASTERS = new Map<number, ChannelRaster>([
  [1080, { width: 2048, height: 1080 }],
  [2160, { width: 4096, height: 2160 }],
]);

/**
 * The raster a CasparCG `video-mode` token means, or `null` when this build does
 * not recognise the token.
 *
 * `null` IS THE HONEST ANSWER and must stay one. An unrecognised mode on some
 * future CasparCG has to read as "cannot check", never as a guessed raster that
 * would then be compared against config and reported as agreement or
 * disagreement on no evidence.
 *
 * SCOPE, stated so nobody widens it casually: this returns a PIXEL RASTER and
 * nothing else. A mode token also carries a FRAME RATE and a scan type, and rate
 * is a different axis with different consequences (ADR 0005 — frame-locked
 * animation), so neither is returned. `[ip]` is matched and discarded precisely
 * because scan type does not change the raster: `1080i5000` and `1080p2500` are
 * both 1920×1080.
 */
export function videoModeRaster(mode: string): ChannelRaster | null {
  const token = mode.trim().toLowerCase();
  if (token === '') return null;
  const named = NAMED_RASTERS.get(token);
  if (named !== undefined) return named;
  const match = /^(dci)?(\d+)[ip]\d*$/.exec(token);
  if (match === null) return null;
  const height = Number(match[2]);
  const table = match[1] === 'dci' ? DCI_RASTERS : HEIGHT_RASTERS;
  return table.get(height) ?? null;
}

/**
 * `B-174` — **the period of ONE CHANNEL FRAME for a CasparCG mode token, in ms — or null
 * for a token this build cannot read.** The unit the look-switch mixer hold is denominated
 * in, and the ONE place the interlace subtlety is spelled:
 *
 * 🔴 **An interlaced channel ticks at HALF the rate its name carries.** The mode token
 * always names the FIELD rate (`1080i5000` = 50 fields/s), but `stage.cpp` pulls BOTH
 * fields inside a single tick — _"it lets us tick at 25hz and avoids amcp changes starting
 * on the second field"_ (v2.5.0-stable) — so an AMCP transform lands once per 40 ms there,
 * while `1080p5000` genuinely ticks every 20 ms. Measured on the wire by `SKEW-COUNT-01`
 * (`tools/skew-harness`), whose own copy of this arithmetic delegates here now that the
 * bridge needs it too: two spellings of a halving rule is how one of them comes to lie.
 *
 * `null` — never a guess — for an unreadable token, the same honesty contract as
 * {@link videoModeRaster}: a guessed period would silently misplace the hold on exactly
 * the installs whose mode string this build has not met.
 *
 * ⚠ **The rate suffix is required to be 4–5 digits, and that width IS the convention check.**
 * CasparCG spells the rate ×100 (`5000` → 50 Hz, `2398` → 23.98 Hz; five digits only for a
 * future ≥100 Hz mode), but a `casparcg.config` may define a CUSTOM mode id — a free-form
 * string that `INFO`'s `<format>` echoes verbatim — and the human spelling of one is
 * `1080p50`. Under a looser `\d{2,5}` that token divided to 0.5 Hz and answered **2000 ms**:
 * a plausible-looking number that would have parked the mixer hold for two seconds of
 * holes-without-fills on air, with every swap and update queued behind the seat lock. A
 * token outside the convention is not a slow mode, it is an UNREAD one — so it takes the
 * `null` path to `#lookMixerHoldMsFor`'s honest 40 ms fallback.
 */
export function videoModeFramePeriodMs(mode: string): number | null {
  const match = /^(?:dci)?\d+([ip])(\d{4,5})$/.exec(mode.trim().toLowerCase());
  if (match === null) return null;
  // The trailing digits are the rate × 100 (`5000` → 50 Hz, `5994` → 59.94 Hz, `2398` →
  // 23.98 Hz). PAL/NTSC and other named modes carry no rate and answer null.
  const rate = Number(match[2]) / 100;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return match[1] === 'i' ? 2000 / rate : 1000 / rate;
}

/**
 * Pull the video-mode token out of an `INFO <channel>` XML body, or null when
 * no mode element is present.
 *
 * 🔴 **`B-189` — the tag the REAL server emits is `<format>`, and this function
 * spent its whole life looking for one it does not.** A reply captured verbatim
 * from CasparCG 2.5.0 `69e8ad5` (2026-08-31, `INFO 1` on the wire) begins:
 *
 *   `<?xml version="1.0" encoding="utf-8"?>\n<channel>\n   <format>1080p5000</format>\n   <framerate>50</framerate>…`
 *
 * — no `<video-mode>` anywhere in the document. That spelling came from
 * `@cg/amcp-mock`, which was written from this code's expectation rather than
 * from a real reply, so every test proved the two halves of one guess agreed
 * with each other. `<format>` is matched FIRST because it is the measured
 * dialect; `<video-mode>` is kept so any build or fixture that speaks it keeps
 * parsing — accepting both costs one alternation and closes the gap either way.
 *
 * Deliberately a targeted extraction and not an XML parse: the bridge needs ONE
 * leaf out of a document whose shape differs across CasparCG versions, and an
 * unexpected surrounding structure should still yield the mode rather than throw.
 */
export function parseVideoModeFromInfo(xml: string): string | null {
  const match =
    /<format>\s*([^<\s]+)\s*<\/format>/i.exec(xml) ??
    /<video-mode>\s*([^<\s]+)\s*<\/video-mode>/i.exec(xml);
  if (match === null) return null;
  const token = (match[1] ?? '').trim();
  return token === '' ? null : token;
}

/** Pull the current channel settings + what the server reports about them. */
export const ChannelSettingsGetChannel = defineChannel(
  'channelSettings.get',
  z.void(),
  ChannelSettingsStateSchema,
);

/**
 * R-030 — the refusal codes for a settings change, as ONE shared const (the
 * `FIXED_LAYERS_SET_CONFIG_REASONS` pattern) so the wire contract, the bridge
 * and the renderer cannot drift.
 *
 * - `unknown-channel` — the channel is not one this install declares. The
 *   settings list is not a door onto arbitrary channel numbers.
 * - `on-air-block` — something is on air or unsettled. Changing the raster
 *   moves EVERY graphic on the channel, and doing that under a live graphic is
 *   the one thing this must not permit (the R-010 `setConfig` stance, for the
 *   same reason). Fail closed: unsettled counts as on air.
 */
export const CHANNEL_SETTINGS_SET_REASONS = ['unknown-channel', 'on-air-block'] as const;

/** Apply a channel's settings to the RUNNING bridge (validate → apply → persist → publish). */
export const ChannelSettingsSetChannel = defineChannel(
  'channelSettings.set',
  ChannelSettingsSchema,
  z.object({
    ok: z.boolean(),
    reason: z.enum(CHANNEL_SETTINGS_SET_REASONS).optional(),
    message: z.string().optional(),
  }),
);

/** Pushed to every client when settings change OR when a fresh mode reading lands. */
export const ChannelSettingsChangedChannel = definePublishChannel(
  'channelSettings.changed',
  ChannelSettingsStateSchema,
);
