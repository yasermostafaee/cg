import { airLabel, type ChannelAir } from './channelAir.js';

/**
 * 🔴 `UI-POLISH-01` G — **THE OUTPUT DOT, before every channel name** (the header's tabs, the channel
 * rows of first-run and Change channel…, Station setup's subtitle).
 *
 * - ON AIR — a small FILLED dot in the air green (`--r-onair`), the colour this console spends on air
 *   and on nothing else;
 * - OFF — a small HOLLOW RING in neutral grey. Not red: red and amber are the strip's ALARM marks
 *   (`MULTI-CHANNEL-01` L) and red's home is §29.2; and the two differ in SHAPE as well as colour,
 *   so colour is never the only signal;
 * - UNKNOWN — NOTHING. No element at all: a grey ring would claim "off", which nobody said, and a
 *   Playout we cannot reach must never read as a channel that is off.
 *
 * The dot carries its words as an image's accessible name and as its `title` — `On air` / `Off air`,
 * then the playlist's tag (`On air · Playlist stopped`). The playlist never changes the colour.
 */
export function OutputDot({ air }: { air: ChannelAir }): JSX.Element | null {
  if (air.output === 'unknown') return null;
  const label = airLabel(air);
  return (
    <span
      className="cg-output-dot"
      data-output-dot={air.output}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
