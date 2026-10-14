import { describe, expect, it } from 'vitest';
import {
  buildAudioConvertArgs,
  probedMono,
} from '../src/renderer/features/assets/audio-convert-args.js';

/**
 * `D-165` — a SOUND's conversion to the stored WAV. 🔴 A mono sound is COPIED into both channels
 * at unity: `-ac 2` would upmix it through the −3 dB pan law (measured: a −6 dBFS mono tone read
 * −9.0 dBFS after `-ac 2`, −6.0 after the pan used here).
 */

describe('D-165 — the sound conversion args', () => {
  it('🔴 a MONO source is panned into both channels at unity, never through -ac 2', () => {
    const args = buildAudioConvertArgs({
      inputPath: '/mnt/a.wav',
      outputPath: '/out.wav',
      mono: true,
    });
    expect(args).toContain('pan=stereo|c0=c0|c1=c0');
    expect(args).not.toContain('-ac');
  });

  it('anything else takes -ac 2 (stereo untouched; surround gets the standard downmix)', () => {
    const args = buildAudioConvertArgs({
      inputPath: '/mnt/a.mp3',
      outputPath: '/out.wav',
      mono: false,
    });
    expect(args.slice(args.indexOf('-ac'), args.indexOf('-ac') + 2)).toEqual(['-ac', '2']);
    expect(args).not.toContain('-af');
  });

  it('always: the first audio stream, no video, 48 kHz 16-bit PCM WAV', () => {
    const args = buildAudioConvertArgs({
      inputPath: '/mnt/a.m4a',
      outputPath: '/out.wav',
      mono: false,
    });
    expect(args.slice(0, 5)).toEqual(['-y', '-i', '/mnt/a.m4a', '-map', '0:a:0']);
    for (const flag of ['-vn', '-sn', '-dn']) expect(args).toContain(flag);
    expect(args.slice(-7)).toEqual(['-ar', '48000', '-c:a', 'pcm_s16le', '-f', 'wav', '/out.wav']);
  });

  it('reads MONO from ffmpeg’s banner for the audio stream, and only from it', () => {
    expect(
      probedMono([
        '  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 44100 Hz, mono, s16, 705 kb/s',
      ]),
    ).toBe(true);
    expect(
      probedMono(['  Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, stereo, fltp, 64 kb/s']),
    ).toBe(false);
    expect(probedMono(['  Stream #0:0: Video: h264, yuv420p, 1920x1080, mono-ish'])).toBe(false);
    expect(probedMono([])).toBe(false);
  });
});
