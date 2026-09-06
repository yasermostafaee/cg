import { rasterVerdict, type ChannelSettingsState, type ConnectionHealth } from '@cg/shared-ipc';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { colors } from '../../theme.js';
import { OutputsSection } from '../connections/OutputsSection.js';

/**
 * `STATION-CHROME-01` §4 — **the channel, REPORTED. What it is, and what it is coming out
 * of.** Raster and Outputs in one read-only tab, because the raster is what the channel IS,
 * not a preference.
 *
 * ── WHY THE CONTROL WENT, WITH THE EVIDENCE THAT DECIDED IT ─────────────────
 *
 * `STATION-SETUP-02` shipped the first editable UI this value has ever had, and the owner's
 * response was «I don't know what this is for». The instruction was to make it read-only
 * unless the facts said otherwise. They did not. What they said:
 *
 *  1. **THE CONFIGURED RASTER REACHES AIR.** `caspar-runtime.ts` appends it to the served
 *     template URL as `?cw=&ch=`, and the page's `resolveChannelRaster` takes that query as
 *     source #1 — above everything else. A wrong value there mis-places every graphic on
 *     the channel, silently, and only on air.
 *  2. **THE PAGE CAN ALREADY DERIVE IT.** `resolveChannelRaster`'s source #2, used whenever
 *     the query is absent, is the page's own `innerWidth`/`innerHeight` — the size CasparCG's
 *     CEF actually gave it, which IS the channel's real raster. So the configured value's
 *     only job is to OVERRIDE a number the output can already observe about itself.
 *  3. **THE CONSOLE CAN ALREADY DERIVE IT TOO.** The bridge reads `INFO <channel>` into
 *     `observed`, with `videoModeRaster` mapping the mode token to a raster. That is the
 *     server's own answer, and it is what the mismatch banner compares the configured value
 *     against (`rasterVerdict`: `configured.raster` vs `observed.raster`; `unreadable` when
 *     the token is unmapped or was never read — a recorded gap, never a pass).
 *  4. **NO CASE WAS FOUND WHERE THE CONSOLE MUST OVERRIDE THE SERVER.** A typed raster is
 *     never more correct than what the channel reports about itself; it can only be a guess
 *     that disagrees with it.
 *
 * So the value is displayed and not typed. `channelSettings.set` stays on the bridge,
 * guarded and persisted, with no renderer call site — which is where it was before
 * `STATION-SETUP-02`, and the honest place for a writer nothing in the UI should reach.
 *
 * ⚠ ONE GAP IS OPEN AND IS REPORTED RATHER THAN PAPERED OVER. The stored raster defaults to
 * `REFERENCE_RASTER` (1920×1080) for every declared channel and is only ever changed by a
 * writer. With the control gone, an install whose channel is NOT 1920×1080 shows a standing
 * mismatch banner and has no in-console remedy. The fix belongs in the bridge — adopt
 * `observed` into `settings` when the verdict is `mismatch` and the mode was readable, one
 * change in `channel-settings-store.ts` — and it is bridge LEDGER work, not chrome, so it is
 * not done here. Re-adding a typed field would not close it either: it would answer "the
 * server says 1280×720" with "type 1280×720", which is the guess this section exists to
 * prevent.
 */

const styles = {
  lede: { fontSize: '0.8rem', color: colors.textMuted, margin: 0 },
  card: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  cardTitle: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  kv: {
    display: 'grid',
    gridTemplateColumns: 'minmax(7rem, auto) 1fr',
    columnGap: '0.9rem',
    rowGap: '0.35rem',
    margin: 0,
    fontSize: '0.85rem',
  },
  dt: { color: colors.textMuted },
  dd: { margin: 0, fontVariantNumeric: 'tabular-nums' as const },
  note: { fontSize: '0.78rem', color: colors.textMuted, lineHeight: 1.5 },
  channel: { fontSize: '0.85rem', fontWeight: 700 },
  verdict: {
    match: { color: colors.textMuted },
    mismatch: { color: colors.errorText, fontWeight: 700 },
    unreadable: { color: colors.textMuted },
    unconfigured: { color: colors.textMuted },
  },
  empty: { fontSize: '0.82rem', color: colors.textMuted },
} as const;

const VERDICT_TEXT = {
  match: 'agrees with the server',
  mismatch: 'MISMATCH — every graphic on this channel is mis-placed',
  unreadable: 'cannot be checked',
  unconfigured: 'not configured',
} as const;

/** The channel's video mode, as the server reported it. */
function modeLine(state: ChannelSettingsState, channel: number): string {
  const observed = state.observed.find((o) => o.channel === channel);
  if (observed === undefined) return 'not read yet';
  if (observed.raster === null) return `${observed.mode} — a mode this build cannot map`;
  return observed.mode;
}

/** Where the value in force came from — the honest half of "reported, not set". */
function declaredBy(state: ChannelSettingsState, channel: number): string {
  const observed = state.observed.find((o) => o.channel === channel);
  return observed === undefined
    ? 'the stored channel settings — the server has not been read'
    : 'casparcg.config, read back from the server';
}

export function ChannelSection({ health }: { health: ConnectionHealth | null }): JSX.Element {
  const state = useChannelSettings();

  return (
    <>
      <p style={styles.lede}>
        What the channel actually is, and what it is coming out of. Reported, not set.
      </p>

      <section style={styles.card} aria-label="Raster">
        <span style={styles.cardTitle}>Raster</span>
        {state.settings.length === 0 ? (
          <span style={styles.empty} role="status">
            No channel is declared yet — the channels come from the bridge’s fixed-layers config at
            start.
          </span>
        ) : (
          state.settings.map((s) => {
            const verdict = rasterVerdict(state, s.channel);
            const channel = String(s.channel);
            return (
              <div key={s.channel} data-raster-channel={channel}>
                <span style={styles.channel}>Channel {channel}</span>
                <dl style={styles.kv}>
                  <dt style={styles.dt}>Video mode</dt>
                  <dd style={styles.dd}>{modeLine(state, s.channel)}</dd>
                  <dt style={styles.dt}>Raster</dt>
                  <dd style={styles.dd}>
                    {String(s.raster.width)} × {String(s.raster.height)}
                  </dd>
                  <dt style={styles.dt}>Declared by</dt>
                  <dd style={styles.dd}>{declaredBy(state, s.channel)}</dd>
                  <dt style={styles.dt}>Check</dt>
                  <dd style={{ ...styles.dd, ...styles.verdict[verdict] }}>
                    <span data-raster-verdict={verdict}>{VERDICT_TEXT[verdict]}</span>
                  </dd>
                </dl>
              </div>
            );
          })
        )}
        <p style={styles.note}>
          The console needs this because plate geometry, the rehearsal preview and the on-air
          position boxes are computed in channel pixels. It is <b>not</b> typed here: the server
          owns the value, and a second place to set it would be a second source of truth — a wrong
          one moves every graphic without raising an error. If the console and the channel disagree,
          the mismatch banner says so.
        </p>
      </section>

      {/*
        `B-223` — THE OUTPUT CHECK'S ENGINEERING DETAIL, read-only. Nothing in it is a
        control, so it gates nothing and is gated by nothing. `OutputsSection` renders its own
        labelled region (`Program outputs`), which the output-missing banner's pointer names.
      */}
      <OutputsSection health={health} />
    </>
  );
}
