import { describe, expect, it } from 'vitest';
import { formatPeak, formatSeconds, wavStats } from '../src/renderer/features/assets/wav-stats.js';

/**
 * `D-165` — what an imported sound MEASURES, read from the stored WAV: its length and its peak
 * sample level. Chunk-walked (a `LIST` chunk before the samples must not throw it off), 16-bit PCM
 * only, digital silence at the floor rather than −∞.
 */

function wav(opts: {
  samples: number[]; // interleaved, already in int16
  channels?: number;
  rate?: number;
  listChunk?: boolean;
  bits?: number;
}): Uint8Array {
  const channels = opts.channels ?? 2;
  const rate = opts.rate ?? 48000;
  const bits = opts.bits ?? 16;
  const data = Buffer.alloc(opts.samples.length * 2);
  opts.samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * channels * 2, 16);
  fmt.writeUInt16LE(channels * 2, 20);
  fmt.writeUInt16LE(bits, 22);
  const list =
    opts.listChunk === true
      ? Buffer.from('LIST\x05\x00\x00\x00INFOx\x00', 'latin1')
      : Buffer.alloc(0);
  const dataHead = Buffer.alloc(8);
  dataHead.write('data', 0);
  dataHead.writeUInt32LE(data.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, list, dataHead, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0);
  riff.writeUInt32LE(body.length, 4);
  return new Uint8Array(Buffer.concat([riff, body]));
}

describe('D-165 — wavStats', () => {
  it('🔴 reads the length and the PEAK in dBFS', () => {
    // 48 000 stereo frames = 1 s; the loudest sample is half scale ⇒ −6.0 dBFS.
    const samples = Array.from({ length: 96_000 }, (_, i) => (i === 5000 ? -16384 : 100));
    const s = wavStats(wav({ samples }));
    expect(s).toEqual({ sampleRate: 48000, channels: 2, durationMs: 1000, peakDbfs: -6 });
  });

  it('a chunk before the samples (LIST) does not throw the walk off', () => {
    const s = wavStats(wav({ samples: [32767, -32768, 0, 0], listChunk: true }));
    expect(s?.peakDbfs).toBe(0);
    expect(s?.durationMs).toBeCloseTo((2 / 48000) * 1000, 6);
  });

  it('digital silence reads the floor, never −∞', () => {
    expect(wavStats(wav({ samples: [0, 0, 0, 0] }))?.peakDbfs).toBe(-120);
  });

  it('not a 16-bit PCM WAV reads null', () => {
    expect(wavStats(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(wavStats(new TextEncoder().encode('RIFF\x00\x00\x00\x00JUNK'))).toBeNull();
    expect(wavStats(wav({ samples: [1, 2], bits: 24 }))).toBeNull();
  });

  it('formats as the author reads it', () => {
    expect(formatPeak(-3.24)).toBe('−3.2 dBFS');
    expect(formatPeak(-120)).toBe('silent');
    expect(formatSeconds(900)).toBe('0.9 s');
  });
});
