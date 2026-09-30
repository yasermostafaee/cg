import { METER_FLOOR_DBFS } from '@cg/shared-ipc';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE METER'S SCALE AND THE LOUDNESS BADGE'S RULE, IN ONE PLACE**, as
 * the Playout's own `VuMeterTall` draws them (`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §2.2, §2.4).
 *
 * - The bar is LINEAR in dBFS from −60 to 0: the Playout's number, never re-weighted here.
 * - The zones are fixed on the bar, not on the value: green to 70 % (−18 dBFS), yellow to 88 % (−7.2 dBFS),
 *   red above — a gradient revealed from the bottom, so a bar at −10 shows green AND yellow.
 * - No peak hold, no peak mark, no clip latch: the Playout's meter has none, and a console that added one
 *   would be showing a number the Playout's own screen does not.
 * - The badge is the short-term loudness with one decimal: green within the target ± tolerance, amber to
 *   twice it, red beyond (their defaults: −23 LUFS, 1 LU). At or below −70 it is silence. It pulses while
 *   the true-peak limiter takes more than 0.1 dB.
 */

/** The labels beside the bars, top to bottom (their §2.4). */
export const METER_SCALE_MARKS: readonly number[] = [0, -6, -12, -18, -30, -40, -60];

/** Where the yellow and the red begin, in dBFS (their §2.4: 70 % and 88 % of the bar). */
export const METER_YELLOW_FROM_DBFS = -18;
export const METER_RED_FROM_DBFS = -7.2;

/** The bar is drawn as this many segments (their default). */
export const METER_SEGMENTS = 32;

/** How many buses the programme meter draws — the first eight, as the Playout's does. */
export const METER_BARS = 8;

/** A reading older than this is not a level: the bars fall to the floor. */
export const METER_STALE_MS = 500;

/** The height a level reaches, 0…100 %: linear from the floor (−60) to 0 dBFS, clamped. */
export function meterPercent(dbfs: number): number {
  if (!Number.isFinite(dbfs)) return 0;
  const pct = ((dbfs - METER_FLOOR_DBFS) / -METER_FLOOR_DBFS) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** The `clip-path` that reveals `dbfs` of the fixed gradient, from the bottom. */
export function meterClip(dbfs: number): string {
  return `inset(${(100 - meterPercent(dbfs)).toFixed(2)}% 0 0 0)`;
}

/** Their defaults: the target and its tolerance. */
export const LOUDNESS_TARGET_LUFS = -23;
export const LOUDNESS_TOLERANCE_LU = 1;
/** At or below this, the programme is silent (their §2.2). */
export const LOUDNESS_SILENCE_LUFS = -70;
/** The limiter "working": more than this much gain reduction (dB, ≤ 0). */
export const LIMITING_BELOW_DB = -0.1;

/**
 * - `on-target` — within the tolerance;
 * - `near` — within twice it;
 * - `off-target` — beyond;
 * - `silent` — at or below −70 LUFS;
 * - `unknown` — the Playout does not know it now (or nothing has arrived).
 */
export type LoudnessTone = 'on-target' | 'near' | 'off-target' | 'silent' | 'unknown';

export function loudnessTone(shortterm: number | null): LoudnessTone {
  if (shortterm === null || !Number.isFinite(shortterm)) return 'unknown';
  if (shortterm <= LOUDNESS_SILENCE_LUFS) return 'silent';
  const off = Math.abs(shortterm - LOUDNESS_TARGET_LUFS);
  if (off <= LOUDNESS_TOLERANCE_LU) return 'on-target';
  if (off <= LOUDNESS_TOLERANCE_LU * 2) return 'near';
  return 'off-target';
}

/** What the badge reads: `−23.1 LUFS`, `Silence`, or `— LUFS`. The minus is the typographic one. */
export function loudnessText(shortterm: number | null): string {
  const tone = loudnessTone(shortterm);
  if (tone === 'unknown' || shortterm === null) return '— LUFS';
  if (tone === 'silent') return 'Silence';
  return `${shortterm.toFixed(1).replace('-', '−')} LUFS`;
}

/** The true-peak limiter is taking more than 0.1 dB. */
export function isLimiting(limiterGrDb: number | null): boolean {
  return limiterGrDb !== null && Number.isFinite(limiterGrDb) && limiterGrDb < LIMITING_BELOW_DB;
}
