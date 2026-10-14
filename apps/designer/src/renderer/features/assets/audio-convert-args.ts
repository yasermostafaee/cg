/**
 * `D-165` — the arguments that turn a picked SOUND into the one stored form (16-bit PCM WAV,
 * 48 kHz, stereo). PURE, so the level rule below is tested without the wasm.
 *
 * 🔴 **A MONO SOUND KEEPS ITS LEVEL.** `-ac 2` upmixes mono through the −3 dB pan law: a −6 dBFS
 * mono whoosh lands at −9 dBFS in each channel — 3 dB quieter on air than the author made it
 * (measured, system ffmpeg 8.1.2 and the shipped core alike). A mono source is therefore COPIED
 * into both channels at unity (`pan=stereo|c0=c0|c1=c0`). Anything else takes `-ac 2`: stereo is
 * untouched, and a surround sound gets ffmpeg's standard downmix.
 */

/** The stored form's rate and channel count. */
export const AUDIO_SAMPLE_RATE = 48000;
export const AUDIO_CHANNELS = 2;

/** Whether ffmpeg's banner for the first audio stream says MONO (`Audio: …, 44100 Hz, mono, …`). */
export function probedMono(logLines: readonly string[]): boolean {
  const line = logLines.find((l) => /\bAudio:/.test(l));
  return line !== undefined && /,\s*mono\b/.test(line);
}

/** The conversion's arguments, input options first (none today). */
export function buildAudioConvertArgs(opts: {
  inputPath: string;
  outputPath: string;
  mono: boolean;
}): string[] {
  return [
    '-y',
    '-i',
    opts.inputPath,
    '-map',
    '0:a:0',
    '-vn',
    '-sn',
    '-dn',
    ...(opts.mono ? ['-af', 'pan=stereo|c0=c0|c1=c0'] : ['-ac', String(AUDIO_CHANNELS)]),
    '-ar',
    String(AUDIO_SAMPLE_RATE),
    '-c:a',
    'pcm_s16le',
    '-f',
    'wav',
    opts.outputPath,
  ];
}
