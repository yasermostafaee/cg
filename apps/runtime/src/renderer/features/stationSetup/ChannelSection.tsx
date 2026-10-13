import { rasterVerdict, type ChannelSettingsState, type ConnectionHealth } from '@cg/shared-ipc';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useHoldsStationAdmin } from '../../hooks/useCanOperate.js';
import { ChangeChannelCard, StraysCard } from './ChannelScopeCards.js';
import { colors } from '../../theme.js';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import { OutputsSection } from '../connections/OutputsSection.js';
import { videoModeWords } from './videoModeWords.js';

/**
 * `STATION-CHROME-01` §4 — **the channel, REPORTED. What it is, and what it is coming out
 * of.** Raster and Outputs in one read-only tab, because the raster is what the channel IS,
 * not a preference.
 *
 * ── `RUNTIME-REDESIGN-01` PHASE 7 — ONE CHANNEL, THE SELECTED ONE ─────────────────────
 *
 * The tab is keyed to the channel the console is scoped to (`useSelectedChannel`, the same
 * read the channel strip makes), exactly as the reference keys a whole setup instance by
 * channel (`stationSetupInstances.get(id)`; its subtitle reads `Channel 1 · …`). It used to
 * map EVERY entry of `channelSettings.settings` into one pane: with two channels declared,
 * channel 1's match and channel 2's mismatch stood together under a title naming neither.
 * Per-channel settings and state are separated by channel id; the station-wide tabs do not
 * read the selection at all. Nothing is lost at the alarm level — `RasterMismatchBanner` is
 * station-wide and stays so. Proved by `stationSetupChannelKeyed.dom.test.ts`.
 *
 * The card is the reference's video-format card as rendered: an eyebrow and a `CH 01` token,
 * the mode word and its scan, and three metrics — `Resolution · Frame rate · Server mode` —
 * plus the app's own two, `Declared by` and `Check` (`B-236`), which the reference does not
 * draw and the deletion guard keeps. Every number is a `--r-video-*` token.
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
 * ✅ `B-236` — THE GAP THIS SECTION RECORDED IS CLOSED, in the bridge, where it said it
 * belonged. The stored raster defaults to `REFERENCE_RASTER` (1920×1080) for every declared
 * channel and is only ever changed by a writer; with the control gone there was no writer
 * left, so an install whose channel is NOT 1920×1080 showed a standing mismatch banner with
 * no in-console remedy — a claim with no author. `ChannelSettingsStore.adoptObserved` is
 * that writer, and the value it writes is the server's own: on a `mismatch` whose mode was
 * READABLE it replaces the stored raster with `observed`, persists it, and sends nothing.
 * Re-adding a typed field would not have closed it — it would answer "the server says
 * 1280×720" with "type 1280×720", which is the guess this section exists to prevent.
 *
 * ⚠ TWO CASES SURVIVE ADOPTION, and both are visible above rather than assumed away.
 * `unreadable` — the token is unmapped or was never read — can never be adopted, because
 * there is no raster to adopt; the stored value stands and the Check says so. And adoption
 * is DECLINED while anything is on air (it would re-point live plate geometry under a
 * template already carrying the old raster), so a mismatch can stand for the length of a
 * show. `declaredBy` below therefore reports the value's real provenance PER VERDICT rather
 * than claiming the server's authority for a number the server has just contradicted.
 */

const styles = {
  verdict: {
    match: { color: colors.textMuted },
    mismatch: { color: colors.errorText, fontWeight: 700 },
    unreadable: { color: colors.textMuted },
    unconfigured: { color: colors.textMuted },
  },
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

/**
 * Where the value in force came from — the honest half of "reported, not set".
 *
 * 🔴 `B-236` — KEYED ON THE VERDICT, not on whether a reading merely EXISTS. The earlier
 * spelling answered "casparcg.config, read back from the server" for every channel with any
 * observation at all, which is a false attribution in exactly the two cases that matter: on
 * a `mismatch` the number shown is the stored one and the server has just contradicted it,
 * and on `unreadable` the reading carries no raster to have come from. Claiming the server's
 * authority for a value the server did not supply is the same defect the mismatch check
 * exists to catch, one layer up — so each verdict names its own source.
 */
function declaredBy(state: ChannelSettingsState, channel: number): string {
  switch (rasterVerdict(state, channel)) {
    case 'match':
      return 'casparcg.config, read back from the server';
    case 'mismatch':
      return 'the stored channel settings — the server reports a different raster';
    case 'unreadable':
      return state.observed.some((o) => o.channel === channel)
        ? 'the stored channel settings — the server’s video mode could not be mapped'
        : 'the stored channel settings — the server has not been read';
    case 'unconfigured':
      return 'nothing — this channel has no stored settings';
  }
}

/** `CH 01` — the reference's channel token. */
function channelToken(channel: number): string {
  return `CH ${String(channel).padStart(2, '0')}`;
}

export function ChannelSection({ health }: { health: ConnectionHealth | null }): JSX.Element {
  const state = useChannelSettings();
  const { selected: channel } = useSelectedChannel();
  const stationAdmin = useHoldsStationAdmin();
  const configured = state.settings.find((s) => s.channel === channel);
  const observed = state.observed.find((o) => o.channel === channel);
  const verdict = rasterVerdict(state, channel);
  const words = videoModeWords(observed?.mode);

  return (
    <>
      {/*
        The reference's `.video-card`: eyebrow + token, the mode word and its scan, then the
        metrics. `data-raster-channel` names the ONE channel this pane reports, so a test can
        assert which channel is shown and, as important, which is NOT.
      */}
      {/*
        `SETTINGS-MATCH-02` — `--video` is the one card the reference TINTS, and `design.md`
        14.3 argued the tint away as "the prototype's palette". It is a green-GREY gradient
        rather than a hue, and the owner asked for the panes as drawn: it says "this card is
        the channel itself" among three plain cards.

        🔴 **AMENDED 2026-09-22 (`MODAL-TRUTH-01`, owner): «بهتره وقتی متصل نیست سبز نباشه».**

        The clause above that read _"it claims nothing about air"_ is DELETED, not softened,
        because the owner has now looked at this card on a station with no bridge and it
        claimed something. Every value in it read `not read yet` / `not configured` / `No
        health reading from the bridge yet`, inside a green card. The tint's job — "this card
        is the channel" — is perfectly true; what nobody checked is what it says when there
        is no channel reading to be the subject of it. Green is the console's settled ink for
        a thing that is up, and a surface does not get to opt out of a vocabulary it shares.

        So the tint is CONDITIONAL on there being a reading to tint, and `data-video-read`
        carries that one condition to the stylesheet — `yes` keeps the reference's green,
        `no` takes this dialog's DANGER ground.

        ⚠ Red was settled by the owner in three steps on 2026-09-22, and the order matters
        because the end point is not obvious from the start: not-green first, then amber,
        then «نمیخواد زرد بشه اون باکس شاید قرمز بهتر باشه». It is right on the merits as
        well — a playout console that cannot say what its channel IS has a FAULT, not a
        caution, and the `Check` line two rows down already spends the same red on a
        `mismatch`. The two states now read as one sentence rather than as a card that
        sometimes has a colour.

        ⚠ The predicate is `observed`, and it is named for what it tests (golden rule 6): has
        the SERVER been read for this channel. Not `health`, which answers whether the bridge
        link is up — a different axis, and using it here would tint a card whose own reading
        had not arrived and blank one whose had (golden rule 8). A mode that was read but
        cannot be MAPPED (`observed.raster === null`) still counts as read: the card is
        reporting a real answer from the server, and the mode line says so in its own words.

        ⚠ The rail's selected-tab green is DELIBERATELY UNTOUCHED. It is this dialog's
        SELECTION colour, it is on whichever tab you stand on including Servers and Layers,
        and it makes no claim about a connection — so it is not the same defect and
        restyling it would be a redesign nobody asked for.
      */}
      <section
        className="cg-card cg-card--video"
        aria-label="Video format"
        data-raster-channel={String(channel)}
        data-video-read={observed === undefined ? 'no' : 'yes'}
      >
        <div className="cg-video-head">
          <span className="cg-video-eyebrow">Video format</span>
          <span className="cg-video-token">{channelToken(channel)}</span>
        </div>
        <div className="cg-video-mode">
          <strong className="cg-video-mode__word" data-video-mode-word="">
            {words.word}
          </strong>
          <span className="cg-video-mode__scan">{words.scan}</span>
        </div>
        <dl className="cg-video-metrics">
          <div className="cg-video-metric">
            <dt>Resolution</dt>
            <dd>
              {configured === undefined
                ? 'not configured'
                : `${String(configured.raster.width)} × ${String(configured.raster.height)}`}
            </dd>
          </div>
          <div className="cg-video-metric">
            <dt>Frame rate</dt>
            <dd>{words.rate}</dd>
          </div>
          <div className="cg-video-metric">
            <dt>Server mode</dt>
            <dd className="cg-video-metric__mono">{modeLine(state, channel)}</dd>
          </div>
        </dl>
        {/* The app's own two facts (`B-236`) — the reference draws neither; the guard keeps both. */}
        <dl className="cg-video-metrics">
          <div className="cg-video-metric">
            <dt>Declared by</dt>
            <dd>{declaredBy(state, channel)}</dd>
          </div>
          <div className="cg-video-metric">
            <dt>Check</dt>
            <dd style={styles.verdict[verdict]}>
              <span data-raster-verdict={verdict}>{VERDICT_TEXT[verdict]}</span>
            </dd>
          </div>
        </dl>
      </section>
      {/* The reference folds the "why read only" paragraph under a summary; the app's own
          sentence goes there unchanged. */}
      <details className="cg-setup-details">
        <summary>Why is the video format read only?</summary>
        <p>
          The console needs this because plate geometry, the rehearsal preview and the on-air
          position boxes are computed in channel pixels. It is <b>not</b> typed here: the server
          owns the value, and a second place to set it would be a second source of truth — a wrong
          one moves every graphic without raising an error. If the console and the channel disagree,
          the mismatch banner says so.
        </p>
      </details>

      {/*
        `B-223` — THE OUTPUT CHECK'S ENGINEERING DETAIL, read-only. Nothing in it is a
        control, so it gates nothing and is gated by nothing. `OutputsSection` renders its own
        labelled region (`Program outputs`), which the output-missing banner's pointer names —
        for THIS channel only.
      */}
      <OutputsSection health={health} channel={channel} />
      {/*
        🔴 `DESKTOP-APPS-01-D` e/j — a station-admin's two channel-scope controls. ABSENT for
        anyone else, never greyed (golden rule 13): an operator has no Change channel… and does
        not see another channel's strays at all.
      */}
      {stationAdmin && <ChangeChannelCard />}
      {stationAdmin && <StraysCard />}
    </>
  );
}
