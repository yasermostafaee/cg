/**
 * `B-174` — **finding the two transitions BY PIXEL COMPARISON, and nothing by eye.**
 *
 * The recording is read back as two tiny raw RGB streams — one per probe region, cropped by
 * ffmpeg so nothing decodes a full 1920×1080 frame. This module turns each stream into a
 * per-frame change series and answers the one question that matters: **the index of the
 * FIRST frame that differs from the one before it.**
 *
 * ── 🔴 THE THRESHOLD IS DERIVED FROM THE RECORDING, NOT PICKED ──────────────
 *
 * The channel is encoded lossily, so a probe region is never bit-identical frame to frame
 * even while nothing moves. A hard-coded threshold would be a guess about codec noise, and
 * a guess that drifts with content. Instead the frames BEFORE the switch are the noise
 * sample: whatever the largest quiet-frame difference is, a real transition has to beat it
 * several times over. {@link firstChangeIndex} returns the threshold it used and the whole
 * series alongside the index, so a reader can check the separation rather than trust it.
 *
 * ⚠ **A run with no clear separation must be DISCARDED, not rounded.** If nothing crosses
 * the threshold, or the crossing is not comfortably above the noise, the answer is `null`
 * and the caller drops the run and says so. A measurement that quietly substitutes a weak
 * signal for a strong one is how `k` comes back wrong and confident.
 */

/** One probe's per-frame reading, plus what was decided about it. */
export interface ChangePoint {
  /** Index of the first frame that differs from its predecessor, or `null` if none did. */
  readonly index: number | null;
  /** The threshold the noise floor produced. */
  readonly threshold: number;
  /** The largest difference among the quiet baseline frames. */
  readonly noiseFloor: number;
  /** The difference AT `index` — the separation a reader checks the verdict against. */
  readonly magnitude: number;
  /** Mean absolute per-channel difference, frame i against frame i-1; index 0 is always 0. */
  readonly series: readonly number[];
}

/** How many times the quiet-frame noise a change must be before it counts as a transition. */
export const NOISE_MULTIPLIER = 6;

/**
 * An absolute floor under the derived threshold, in 0..255 units.
 *
 * A perfectly still, perfectly encoded region can have a noise floor of zero, and
 * `0 × 6 = 0` would make the very first rounding wobble a "transition". The floor is what
 * stops a noiseless baseline from producing an infinitely sensitive detector.
 */
export const THRESHOLD_FLOOR = 4;

/** Mean absolute difference between two equal-length raw byte buffers, in 0..255 units. */
export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error(`probe frames differ in size: ${String(a.length)} vs ${String(b.length)}`);
  }
  if (a.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return total / a.length;
}

/** Split a raw stream into fixed-size frames. A trailing partial frame is dropped. */
export function splitFrames(raw: Uint8Array, bytesPerFrame: number): Uint8Array[] {
  if (bytesPerFrame <= 0) throw new Error('bytesPerFrame must be positive');
  const count = Math.floor(raw.length / bytesPerFrame);
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    frames.push(raw.subarray(i * bytesPerFrame, (i + 1) * bytesPerFrame));
  }
  return frames;
}

/** The per-frame change series for one probe. Index 0 is 0 by construction (no predecessor). */
export function changeSeries(frames: readonly Uint8Array[]): number[] {
  const series: number[] = [0];
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const cur = frames[i];
    if (prev === undefined || cur === undefined) break;
    series.push(meanAbsDiff(prev, cur));
  }
  return series;
}

/**
 * The first frame at which this probe changed.
 *
 * `baselineFrames` is how many leading frames are taken as QUIET. The harness records a
 * settle period before it switches, so those frames are quiet by construction; the caller
 * passes the count it actually recorded rather than a constant, because a shorter settle
 * would silently fold the transition into its own noise sample.
 */
export function firstChangeIndex(series: readonly number[], baselineFrames: number): ChangePoint {
  const usable = Math.max(0, Math.min(baselineFrames, series.length));
  let noiseFloor = 0;
  // Index 0 carries no information (no predecessor), so the baseline starts at 1.
  for (let i = 1; i < usable; i += 1) {
    noiseFloor = Math.max(noiseFloor, series[i] ?? 0);
  }
  const threshold = Math.max(noiseFloor * NOISE_MULTIPLIER, THRESHOLD_FLOOR);
  for (let i = usable; i < series.length; i += 1) {
    const value = series[i] ?? 0;
    if (value >= threshold) {
      return { index: i, threshold, noiseFloor, magnitude: value, series: [...series] };
    }
  }
  return { index: null, threshold, noiseFloor, magnitude: 0, series: [...series] };
}

/**
 * EVERY distinct change event in the series — rising edges over `threshold` — not just the
 * first. `B-155`'s window has THREE moving parts (the producer replace, the fills, the
 * holes), so one probe can legitimately change twice; reducing that to a single index would
 * merge the flash with the switch that carries it.
 */
export function changeEvents(
  series: readonly number[],
  baselineFrames: number,
  threshold: number,
): number[] {
  const events: number[] = [];
  const start = Math.max(1, Math.min(baselineFrames, series.length));
  for (let i = start; i < series.length; i += 1) {
    const value = series[i] ?? 0;
    const previous = series[i - 1] ?? 0;
    if (value >= threshold && previous < threshold) events.push(i);
  }
  return events;
}

/** min / median / max over a sample, for reporting `k` as a DISTRIBUTION rather than a value. */
export interface Distribution {
  readonly n: number;
  readonly min: number;
  readonly median: number;
  readonly max: number;
  readonly values: readonly number[];
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { n: 0, min: Number.NaN, median: Number.NaN, max: Number.NaN, values: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? Number.NaN)
      : ((sorted[mid - 1] ?? Number.NaN) + (sorted[mid] ?? Number.NaN)) / 2;
  return {
    n: sorted.length,
    min: sorted[0] ?? Number.NaN,
    median,
    max: sorted[sorted.length - 1] ?? Number.NaN,
    values: sorted,
  };
}
