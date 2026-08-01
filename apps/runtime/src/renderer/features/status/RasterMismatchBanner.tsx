import { mismatchedChannels, rasterVerdict } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';

/**
 * R-030 — the LOUD half of the configured-vs-real raster check.
 *
 * The configured raster is a CLAIM; the channel has a real video mode, and
 * `INFO <channel>` reports it. When the two disagree EVERY graphic on that
 * channel is mis-placed — and silently, because nothing else in the system would
 * notice. A wrong raster does not crash, does not log, and does not look wrong
 * on the operator's screen; it only looks wrong on air, where nobody in this app
 * can see it. That asymmetry is why this is a banner and not a settings-page
 * hint.
 *
 * The repo has been bitten twice by config that contradicted reality —
 * `casparcg.config` declared `newtek-ivga` after 2.4.0 removed the consumer
 * (C-020), and "the plant is 2.3.3" while `VERSION` said `2.3.2 4de6d18f`. Both
 * were caught by reading the server rather than trusting the file, which is
 * exactly what this surfaces.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it never shouts about a raster it could not
 * read. `rasterVerdict` distinguishes `unreadable` (the mode was not readable, or
 * is one this build cannot map) from `mismatch`, and only the latter is an
 * alarm — an unreadable mode is a gap in the check, not evidence of a fault, and
 * treating the two alike would train the operator to dismiss the banner.
 */

/** Matches `ConnectionBanner`'s strip geometry — loud is the colour, not the height. */
const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.4rem 0.9rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: '#FFFFFF',
    background: colors.error,
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0, lineHeight: 1.35 },
  detail: {
    display: 'block',
    fontWeight: 500,
    letterSpacing: 0,
    opacity: 0.9,
    fontSize: '0.75rem',
  },
} as const;

export function RasterMismatchBanner(): JSX.Element | null {
  const state = useChannelSettings();
  const mismatched = mismatchedChannels(state);
  if (mismatched.length === 0) return null;

  // One line per offending channel, naming BOTH rasters. "Raster mismatch on
  // channel 1" tells an operator nothing they can act on; the two numbers and
  // the mode token are what let them decide which side is wrong.
  const details = mismatched.map((entry) => {
    const observed = state.observed.find((o) => o.channel === entry.channel);
    const real =
      observed?.raster == null
        ? 'unknown'
        : `${String(observed.raster.width)}×${String(observed.raster.height)} (${observed.mode})`;
    return `Channel ${String(entry.channel)}: configured ${String(entry.raster.width)}×${String(entry.raster.height)}, server reports ${real}`;
  });

  return (
    <div role="alert" aria-label="Channel raster mismatch" style={styles.banner}>
      <span style={styles.text}>
        CHANNEL RASTER MISMATCH — EVERY GRAPHIC ON THIS CHANNEL IS MIS-PLACED.
        {details.map((line) => (
          <span key={line} style={styles.detail}>
            {line}
          </span>
        ))}
        <span style={styles.detail}>
          Correct the channel raster in settings, or the channel’s video mode in casparcg.config —
          they must agree before placement can be trusted.
        </span>
      </span>
    </div>
  );
}

/**
 * Exported for the settings surface and for tests: the verdict for ONE channel,
 * read through the canonical predicate rather than re-compared locally.
 */
export { rasterVerdict };
