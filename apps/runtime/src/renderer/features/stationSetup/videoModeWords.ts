import { videoModeFramePeriodMs, videoModeRaster, videoModeScan } from '@cg/shared-ipc';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 — the words the video-format card prints for a server-reported
 * mode token: the reference's `1080i · Interlaced` over `Resolution · Frame rate · Server mode`.
 *
 * Every word is derived through the ONE token grammar in `@cg/shared-ipc` (`videoModeRaster`,
 * `videoModeScan`, `videoModeFramePeriodMs`) — nothing here parses the token itself, so a mode
 * this build cannot read prints its honest gap in every column instead of a guess in one.
 *
 * ⚠ FRAME RATE IS DISPLAYED, NOT MODELLED. `channelSettings.ts` keeps rate out of the schema on
 * purpose (ADR 0005 — frame-locked animation), and this card REPORTS what the server said about
 * itself; it declares nothing and nothing reads the number back. The interlaced spelling names
 * both halves — `25 fps · 50 fields/s` — because `videoModeFramePeriodMs` already knows an
 * interlaced channel ticks at half its field rate, and a card that printed `50 fps` for
 * `1080i5000` would contradict the mixer hold that function times.
 */
export interface VideoModeWords {
  /** `1080i` / `1080p` / `PAL`, or the raw token when unreadable. */
  readonly word: string;
  /** `Interlaced` / `Progressive`, or the honest gap. */
  readonly scan: string;
  /** `50 fps` / `25 fps · 50 fields/s`, or the honest gap. */
  readonly rate: string;
}

const NOT_READ = 'not read yet';
const CANNOT_READ = 'a mode this build cannot map';

function rateWords(mode: string, interlaced: boolean): string {
  const period = videoModeFramePeriodMs(mode);
  if (period === null) return CANNOT_READ;
  const fps = Math.round((1000 / period) * 100) / 100;
  return interlaced
    ? `${String(fps)} fps · ${String(Math.round(fps * 2 * 100) / 100)} fields/s`
    : `${String(fps)} fps`;
}

export function videoModeWords(mode: string | undefined): VideoModeWords {
  if (mode === undefined) return { word: '—', scan: NOT_READ, rate: NOT_READ };
  const raster = videoModeRaster(mode);
  const scan = videoModeScan(mode);
  if (raster === null) return { word: mode, scan: CANNOT_READ, rate: CANNOT_READ };
  const word =
    scan === null
      ? mode.trim().toUpperCase()
      : `${String(raster.height)}${scan === 'interlaced' ? 'i' : 'p'}`;
  return {
    word,
    scan: scan === 'interlaced' ? 'Interlaced' : scan === 'progressive' ? 'Progressive' : '—',
    rate: rateWords(mode, scan === 'interlaced'),
  };
}
