/** Proven source presets for the bundled offline converter (D-190). */
export const VIDEO_FORMATS_SUMMARY = 'MOV · MP4 · WebM · AVI';

export const VIDEO_FORMATS_WITH_ALPHA =
  'MOV / QuickTime Animation (QTRLE), uncompressed AVI / BGRA, or a numbered PNG sequence';

export const VIDEO_FORMATS_OPAQUE = 'MP4 or MOV / H.264, or WebM / VP8 or VP9';

export const VIDEO_ACCEPTED_CONTAINERS =
  'MP4, WebM, AVI, MOV, MKV, MPG/MPEG, WMV, FLV, M4V, TS/MTS/M2TS, 3GP and OGV';

export function unsupportedVideoSelectionMessage(names: readonly string[]): string {
  const shown = names
    .slice(0, 2)
    .map((name) => `“${name}”`)
    .join(', ');
  const more = names.length > 2 ? ` and ${String(names.length - 2)} more` : '';
  const verb = names.length === 1 ? 'is' : 'are';
  return `${shown}${more} ${verb} not an accepted video file. Use ${VIDEO_FORMATS_OPAQUE}; for transparency use ${VIDEO_FORMATS_WITH_ALPHA}.`;
}

export function decodeFailureMessage(filename: string): string {
  return `“${filename}” has a video track, but the built-in converter could not decode its first frame. The codec may be unsupported or the file may be incomplete. Re-export it as ${VIDEO_FORMATS_OPAQUE}; for transparency use ${VIDEO_FORMATS_WITH_ALPHA}.`;
}

export function videoContainerLabel(container: string | undefined): string | null {
  if (container === undefined) return null;
  const names = container.toLowerCase().split(',');
  if (names.includes('mov') || names.includes('mp4')) return 'QuickTime / MOV';
  if (names.includes('matroska') || names.includes('webm')) return 'Matroska / WebM';
  if (names.includes('avi')) return 'AVI';
  return (names[0] ?? container).toUpperCase();
}

export function videoCodecLabel(codec: string | undefined): string | null {
  if (codec === undefined) return null;
  const known: Record<string, string> = {
    qtrle: 'QTRLE',
    rawvideo: 'Raw video',
    h264: 'H.264',
    hevc: 'HEVC',
    vp8: 'VP8',
    vp9: 'VP9',
    prores: 'ProRes',
  };
  return known[codec.toLowerCase()] ?? codec.toUpperCase();
}

export function pixelFormatLabel(pixelFormat: string | undefined): string | null {
  if (pixelFormat === undefined) return null;
  const alpha = /^(?:a?rgb|rgba|bgra|argb|abgr|yuva)/i.test(pixelFormat);
  return `${pixelFormat.toUpperCase()}${alpha ? ' + alpha' : ''}`;
}
