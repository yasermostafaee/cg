import {
  AUDIO_LOUDNESS_TARGET_LUFS,
  AUDIO_PEAK_FLOOR_DBFS,
  AUDIO_TRUE_PEAK_CEILING_DBTP,
} from '@cg/shared-schema';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q10 — a SOUND's loudness and true peak, read from the stored WAV, and
 * the gain that normalises it. PURE — the bytes in, the facts out — like `wav-stats.ts`, so it is
 * tested without a browser and gives the same answer at import and on a sound stored before it.
 *
 * Loudness is ITU-R BS.1770-4's INTEGRATED loudness: each channel K-weighted (the two biquads,
 * computed for the file's own rate), mean square over 400 ms blocks stepped by 100 ms, an absolute
 * gate at −70 LUFS and a relative gate 10 LU under the gated mean. A sound shorter than one block —
 * a click, a short whoosh — is measured as one block of its own length rather than left unmeasured,
 * because short effects are most of what is imported here.
 *
 * True peak is the loudest sample of the signal oversampled 4× by a 49-tap Hann-windowed sinc (the
 * interpolator libebur128 uses below 96 kHz), so a peak between two samples is seen.
 */

export interface Loudness {
  /** Integrated loudness in LUFS; `null` when every block is under the −70 LUFS gate. */
  readonly loudnessLufs: number | null;
  /** True peak in dBTP (floor for digital silence). */
  readonly truePeakDbtp: number;
}

interface Pcm {
  readonly sampleRate: number;
  readonly channels: number;
  /** Byte offset and sample count of the 16-bit interleaved samples. */
  readonly dataAt: number;
  readonly samples: number;
}

/** Where a 16-bit PCM WAV keeps its samples, walked by chunks as `wavStats` walks them. */
function pcmOf(bytes: Uint8Array): Pcm | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string =>
    String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let at = 12;
  let format: { channels: number; sampleRate: number; bits: number; pcm: boolean } | null = null;
  while (at + 8 <= bytes.byteLength) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ' && size >= 16) {
      format = {
        pcm: view.getUint16(body, true) === 1,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (format === null || !format.pcm || format.bits !== 16 || format.channels < 1) return null;
      if (!(format.sampleRate > 0)) return null;
      const end = Math.min(bytes.byteLength, body + size);
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        dataAt: body,
        samples: Math.floor((end - body) / 2),
      };
    }
    at = body + size + (size % 2);
  }
  return null;
}

interface Biquad {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/**
 * BS.1770-4's K-weighting for any rate: the high-shelf "pre-filter" and the RLB high-pass, from the
 * analogue prototypes (the derivation libebur128 uses). At 48 kHz these are the Recommendation's own
 * tabled coefficients — the unit test pins that.
 */
export function kWeighting(sampleRate: number): readonly [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const gain = 3.999843853973347;
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gain / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  let a0 = 1 + k / q + k * k;
  const shelf: Biquad = {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
  f0 = 38.13547087602444;
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * f0) / sampleRate);
  a0 = 1 + k / q + k * k;
  const highPass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
  return [shelf, highPass];
}

/** One channel, K-weighted, squared — the per-sample power BS.1770 sums over a block. */
function weightedPower(
  bytes: Uint8Array,
  pcm: Pcm,
  channel: number,
  filters: readonly [Biquad, Biquad],
): Float64Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(pcm.samples / pcm.channels);
  const out = new Float64Array(frames);
  const [f1, f2] = filters;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let z1 = 0;
  let z2 = 0;
  for (let n = 0; n < frames; n++) {
    const x = view.getInt16(pcm.dataAt + (n * pcm.channels + channel) * 2, true) / 32768;
    const y = f1.b0 * x + f1.b1 * x1 + f1.b2 * x2 - f1.a1 * y1 - f1.a2 * y2;
    x2 = x1;
    x1 = x;
    const z = f2.b0 * y + f2.b1 * y1 + f2.b2 * y2 - f2.a1 * z1 - f2.a2 * z2;
    y2 = y1;
    y1 = y;
    z2 = z1;
    z1 = z;
    out[n] = z * z;
  }
  return out;
}

const blockLoudness = (power: number): number => -0.691 + 10 * Math.log10(power);

/** Integrated, gated loudness over the channels' weighted powers (channel weight 1: L/R/C). */
function integrated(powers: readonly Float64Array[], sampleRate: number): number | null {
  const frames = powers[0]?.length ?? 0;
  if (frames === 0) return null;
  const blockLen = Math.round(sampleRate * 0.4);
  const step = Math.round(sampleRate * 0.1);
  const starts: number[] = [];
  if (frames < blockLen) starts.push(0);
  else for (let s = 0; s + blockLen <= frames; s += step) starts.push(s);
  const len = Math.min(blockLen, frames);
  const blocks = starts.map((start) => {
    let sum = 0;
    for (const p of powers) {
      let acc = 0;
      for (let n = start; n < start + len; n++) acc += p[n] ?? 0;
      sum += acc / len;
    }
    return sum;
  });
  const absolute = blocks.filter((z) => z > 0 && blockLoudness(z) > -70);
  if (absolute.length === 0) return null;
  const mean = (zs: readonly number[]): number => zs.reduce((a, z) => a + z, 0) / zs.length;
  const relativeGate = blockLoudness(mean(absolute)) - 10;
  const gated = absolute.filter((z) => blockLoudness(z) > relativeGate);
  return blockLoudness(mean(gated.length > 0 ? gated : absolute));
}

const OVERSAMPLE = 4;
const TAPS = 49;

/** The 4× interpolator's taps, split by phase: `PHASES[p][k]` multiplies `x[n − k]`. */
const PHASES: readonly (readonly number[])[] = (() => {
  const h: number[] = [];
  for (let t = 0; t < TAPS; t++) {
    const m = t - (TAPS - 1) / 2;
    const arg = (m * Math.PI) / OVERSAMPLE;
    const sinc = Math.abs(m) < 1e-9 ? 1 : Math.sin(arg) / arg;
    h.push(sinc * 0.5 * (1 - Math.cos((2 * Math.PI * t) / (TAPS - 1))));
  }
  return Array.from({ length: OVERSAMPLE }, (_, p) => {
    const phase: number[] = [];
    for (let t = p; t < TAPS; t += OVERSAMPLE) phase.push(h[t] ?? 0);
    return phase;
  });
})();

function truePeakOf(bytes: Uint8Array, pcm: Pcm): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(pcm.samples / pcm.channels);
  const history = Math.ceil(TAPS / OVERSAMPLE);
  let peak = 0;
  for (let c = 0; c < pcm.channels; c++) {
    const x = new Float64Array(frames + history);
    for (let n = 0; n < frames; n++) {
      const v = view.getInt16(pcm.dataAt + (n * pcm.channels + c) * 2, true) / 32768;
      x[n] = v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    // Run past the end by the filter's length so the last samples' ringing is read too.
    for (let n = 0; n < frames + history; n++) {
      for (const phase of PHASES) {
        let y = 0;
        for (let k = 0; k < phase.length && k <= n; k++) y += (phase[k] ?? 0) * (x[n - k] ?? 0);
        if (Math.abs(y) > peak) peak = Math.abs(y);
      }
    }
  }
  return peak === 0
    ? AUDIO_PEAK_FLOOR_DBFS
    : Math.max(AUDIO_PEAK_FLOOR_DBFS, 20 * Math.log10(peak));
}

const tenth = (v: number): number => Math.round(v * 10) / 10;

/** A 16-bit PCM WAV's loudness and true peak, or `null` when the bytes are not one. */
export function measureLoudness(bytes: Uint8Array): Loudness | null {
  const pcm = pcmOf(bytes);
  if (pcm === null) return null;
  const filters = kWeighting(pcm.sampleRate);
  const powers = Array.from({ length: pcm.channels }, (_, c) =>
    weightedPower(bytes, pcm, c, filters),
  );
  const lufs = integrated(powers, pcm.sampleRate);
  return {
    loudnessLufs: lufs === null ? null : Math.min(0, tenth(lufs)),
    truePeakDbtp: tenth(truePeakOf(bytes, pcm)),
  };
}

/**
 * A measurement as the stored `AudioInfo` members: `truePeakDbtp` always (it says "measured"), and
 * `loudnessLufs` only when there was one. Nothing for bytes that were not measured.
 */
export function loudnessInfo(loudness: Loudness | null): {
  truePeakDbtp?: number;
  loudnessLufs?: number;
} {
  if (loudness === null) return {};
  return {
    truePeakDbtp: loudness.truePeakDbtp,
    ...(loudness.loudnessLufs !== null ? { loudnessLufs: loudness.loudnessLufs } : {}),
  };
}

/** The stored members read back as a measurement; `null` for a sound stored before them. */
export function storedLoudness(info: {
  truePeakDbtp?: number | undefined;
  loudnessLufs?: number | undefined;
}): Loudness | null {
  if (info.truePeakDbtp === undefined) return null;
  return { truePeakDbtp: info.truePeakDbtp, loudnessLufs: info.loudnessLufs ?? null };
}

/**
 * The gain that takes a sound to the target without its true peak crossing the ceiling, in dB to a
 * tenth; `null` for a sound too quiet to measure.
 */
export function normalisationGainDb(loudness: Loudness): number | null {
  if (loudness.loudnessLufs === null) return null;
  return tenth(
    Math.min(
      AUDIO_LOUDNESS_TARGET_LUFS - loudness.loudnessLufs,
      AUDIO_TRUE_PEAK_CEILING_DBTP - loudness.truePeakDbtp,
    ),
  );
}

/** Below this, a sound is already where normalisation would put it, and nothing is offered. */
export const NORMALISE_THRESHOLD_DB = 0.5;

/** The gain to offer for a sound, or `null` when there is nothing to offer. */
export function offeredGainDb(loudness: Loudness): number | null {
  const gain = normalisationGainDb(loudness);
  return gain !== null && Math.abs(gain) >= NORMALISE_THRESHOLD_DB ? gain : null;
}

/**
 * The same WAV with every sample scaled by `gainDb` — a copy; the input is untouched. Rounded to the
 * nearest step and held inside 16 bits (a gain from `normalisationGainDb` never needs the hold: the
 * ceiling keeps the true peak, and so every sample, under full scale).
 */
export function withGain(bytes: Uint8Array, gainDb: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  const pcm = pcmOf(out);
  if (pcm === null) return out;
  const view = new DataView(out.buffer);
  const factor = Math.pow(10, gainDb / 20);
  for (let i = 0; i < pcm.samples; i++) {
    const at = pcm.dataAt + i * 2;
    const v = Math.round(view.getInt16(at, true) * factor);
    view.setInt16(at, Math.max(-32768, Math.min(32767, v)), true);
  }
  return out;
}

/** `loudnessLufs` as the author reads it: `−14.2 LUFS`, or `too quiet to measure`. */
export function formatLoudness(lufs: number | null | undefined): string {
  if (lufs === null || lufs === undefined) return 'too quiet to measure';
  return `${lufs.toFixed(1).replace('-', '−')} LUFS`;
}

/** `truePeakDbtp` as the author reads it: `−0.4 dBTP`, `+0.3 dBTP`, or `silent`. */
export function formatTruePeak(dbtp: number): string {
  if (dbtp <= AUDIO_PEAK_FLOOR_DBFS) return 'silent';
  const s = dbtp.toFixed(1);
  return `${dbtp > 0 ? '+' : ''}${s.replace('-', '−')} dBTP`;
}

/** A gain as the author reads it: `−8.8 dB`, `+2.0 dB`. */
export function formatGain(db: number): string {
  return `${db > 0 ? '+' : ''}${db.toFixed(1).replace('-', '−')} dB`;
}
