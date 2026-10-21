import { describe, expect, it } from 'vitest';
import {
  formatLoudness,
  formatTruePeak,
  kWeighting,
  measureLoudness,
  normalisationGainDb,
  offeredGainDb,
  withGain,
} from '../src/renderer/features/assets/loudness.js';
import { wavStats } from '../src/renderer/features/assets/wav-stats.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q10 — a sound's loudness (ITU-R BS.1770-4) and true peak, and the gain
 * that normalises it to −23 LUFS without crossing −1 dBTP. The cases follow EBU Tech 3341's own
 * (a 997 Hz stereo sine reads its level in LUFS; quiet passages under the relative gate do not pull
 * the reading down) and an inter-sample peak a sample meter cannot see.
 */

const RATE = 48_000;

/** A 16-bit PCM WAV of `seconds`, each sample `fn(time, channel)` in −1…1. */
function wav(
  seconds: number,
  fn: (t: number, c: number) => number,
  channels = 2,
  rate = RATE,
): Uint8Array {
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * channels * 2);
  for (let n = 0; n < frames; n++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.round(fn(n / rate, c) * 32767);
      data.writeInt16LE(Math.max(-32768, Math.min(32767, v)), (n * channels + c) * 2);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([h, data]));
}

const amp = (dbfs: number): number => Math.pow(10, dbfs / 20);
const sine =
  (dbfs: number, hz = 997, phase = 0) =>
  (t: number): number =>
    amp(dbfs) * Math.sin(2 * Math.PI * hz * t + phase);

describe('Q10 — loudness (BS.1770-4)', () => {
  it('the K-weighting at 48 kHz is the Recommendation’s own table', () => {
    const [shelf, highPass] = kWeighting(48_000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 9);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 9);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 9);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 9);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 9);
    expect(highPass.a1).toBeCloseTo(-1.99004745483398, 9);
    expect(highPass.a2).toBeCloseTo(0.99007225036621, 9);
  });

  it('🔴 a 997 Hz stereo sine at −23 dBFS reads −23.0 LUFS; at −33 dBFS, −33.0 (Tech 3341 cases 1–2)', () => {
    expect(measureLoudness(wav(5, sine(-23)))?.loudnessLufs).toBeCloseTo(-23, 1);
    expect(measureLoudness(wav(5, sine(-33)))?.loudnessLufs).toBeCloseTo(-33, 1);
  });

  it('🔴 quiet passages under the relative gate do not pull the reading down (Tech 3341 case 3)', () => {
    const shaped = (t: number): number => (t < 2 || t >= 32 ? sine(-36)(t) : sine(-23)(t));
    const reading = measureLoudness(wav(34, shaped))?.loudnessLufs ?? 0;
    expect(Math.abs(reading - -23)).toBeLessThanOrEqual(0.1);
  });

  it('a sound shorter than one 400 ms block is measured over its own length', () => {
    expect(measureLoudness(wav(0.2, sine(-20)))?.loudnessLufs).toBeCloseTo(-20, 0);
  });

  it('digital silence is too quiet to measure, and its true peak is the floor', () => {
    const silent = measureLoudness(wav(1, () => 0));
    expect(silent).toEqual({ loudnessLufs: null, truePeakDbtp: -120 });
    expect(formatLoudness(silent?.loudnessLufs)).toBe('too quiet to measure');
    expect(formatTruePeak(-120)).toBe('silent');
  });

  it('🔴 the TRUE peak sees a peak between samples that the sample peak cannot', () => {
    // A quarter-rate sine sampled at 45°: every sample is 0.707 of the wave's peak.
    const bytes = wav(1, sine(-6, RATE / 4, Math.PI / 4));
    expect(wavStats(bytes)?.peakDbfs).toBeCloseTo(-9, 0);
    const tp = measureLoudness(bytes)?.truePeakDbtp ?? 0;
    expect(Math.abs(tp - -6)).toBeLessThanOrEqual(0.3);
  });

  it('a file that is not 16-bit PCM WAV is not measured', () => {
    expect(measureLoudness(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('Q10 — the gain that normalises a sound', () => {
  it('a loud sound comes down to −23 LUFS', () => {
    expect(normalisationGainDb({ loudnessLufs: -14, truePeakDbtp: -0.5 })).toBe(-9);
  });

  it('🔴 a quiet sound with high peaks stops at the −1 dBTP ceiling, short of the target', () => {
    expect(normalisationGainDb({ loudnessLufs: -30, truePeakDbtp: -3 })).toBe(2);
  });

  it('nothing is offered for a sound already there, or one too quiet to measure', () => {
    expect(offeredGainDb({ loudnessLufs: -23.2, truePeakDbtp: -10 })).toBeNull();
    expect(offeredGainDb({ loudnessLufs: null, truePeakDbtp: -120 })).toBeNull();
    expect(offeredGainDb({ loudnessLufs: -14, truePeakDbtp: -0.5 })).toBe(-9);
  });

  it('🔴 the gain applied to the bytes lands the sound on −23 LUFS, and the source is untouched', () => {
    const source = wav(3, sine(-14));
    const before = source.slice();
    const loud = measureLoudness(source)!;
    const gain = normalisationGainDb(loud)!;
    const out = withGain(source, gain);
    expect(source).toEqual(before);
    const after = measureLoudness(out)!;
    expect(Math.abs((after.loudnessLufs ?? 0) - -23)).toBeLessThanOrEqual(0.1);
    expect(after.truePeakDbtp).toBeLessThanOrEqual(-1);
    expect(wavStats(out)?.durationMs).toBe(wavStats(source)?.durationMs);
  });
});
