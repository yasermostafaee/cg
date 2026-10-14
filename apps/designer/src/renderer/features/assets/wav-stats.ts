import { AUDIO_PEAK_FLOOR_DBFS } from '@cg/shared-schema';

/**
 * `D-165` — what an imported SOUND measures, read from the stored WAV itself (never from the
 * source, which the import converted): its length and its PEAK sample level in dBFS. PURE — the
 * bytes in, the facts out — so it is tested without a browser.
 *
 * The WAV is walked by its chunks (`fmt `, then `data`), never by a fixed 44-byte offset, because a
 * converter may write `LIST` or other chunks before the samples. 16-bit PCM is what the import
 * produces; anything else reads as not a sound this module measures.
 */

export interface WavStats {
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationMs: number;
  /** The loudest sample, in dBFS (0 = full scale); digital silence reads the floor. */
  readonly peakDbfs: number;
}

export function wavStats(bytes: Uint8Array): WavStats | null {
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
      // A converter streaming to a pipe may write a placeholder size; the bytes present are the truth.
      const end = Math.min(bytes.byteLength, body + size);
      const samples = Math.floor((end - body) / 2);
      let peak = 0;
      for (let i = 0; i < samples; i++) {
        const v = Math.abs(view.getInt16(body + i * 2, true));
        if (v > peak) peak = v;
      }
      const frames = samples / format.channels;
      const peakDbfs =
        peak === 0
          ? AUDIO_PEAK_FLOOR_DBFS
          : Math.max(AUDIO_PEAK_FLOOR_DBFS, Math.min(0, 20 * Math.log10(peak / 32768)));
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        durationMs: format.sampleRate > 0 ? (frames / format.sampleRate) * 1000 : 0,
        peakDbfs: Math.round(peakDbfs * 10) / 10,
      };
    }
    // Chunks are word-aligned: an odd size carries one pad byte.
    at = body + size + (size % 2);
  }
  return null;
}

/** `peakDbfs` as the author reads it: `−3.2 dBFS`, or `silent` at the floor. */
export function formatPeak(peakDbfs: number): string {
  if (peakDbfs <= AUDIO_PEAK_FLOOR_DBFS) return 'silent';
  return `${peakDbfs.toFixed(1).replace('-', '−')} dBFS`;
}

/** A duration as the author reads it: `0.9 s`, `12.4 s`. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
