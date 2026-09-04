import { stoppedChannelsOf } from '@cg/shared-ipc';
import { useConnections } from '../../hooks/useConnections.js';
import { resolveCasparReach } from '../../hooks/useCasparReachable.js';
import { useLink } from '../../hooks/useLink.js';
import { useLock } from '../../hooks/useLock.js';
import { colors, cssVars } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { normalizeDigits } from '../../ui/NumericInput.js';
import { usePrompt } from '../../ui/useDialog.js';
import { LinkIndicator } from './LinkIndicator.js';

interface Props {
  onOpenAudit?: () => void;
  /** R-010 — opens the server connection settings panel. */
  onOpenSettings?: () => void;
  /**
   * D-137 / C-015 — opens the Live Source mapping.
   *
   * Beside SERVERS, and that placement is the point: both are INSTALLATION
   * config that decides what a command does when it reaches CasparCG, and this
   * one is the surface without which a template declaring a live source cannot
   * be taken at all. It is not a per-row or per-field concern, so it does not
   * belong beside a control the way the delimiter gear does.
   */
  onOpenSources?: () => void;
}

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    padding: '0.5rem 1rem',
    // Content-sized in the shell's flex column: never stretched, never squeezed away.
    flexShrink: 0,
    background: colors.panel,
    borderTop: `1px solid ${colors.border}`,
    fontSize: '0.85rem',
    color: colors.textMuted,
  },
  /*
   * ── THE STATUS BAR HAS ITS OWN COLOUR VOCABULARY, AND "HEALTHY" IS NOT A HUE ──
   *
   * Owner's call, and the reason is a collision across two surfaces rather than
   * within one. This bar used to read `● BRIDGE LIVE` in a green and
   * `● PRIMARY A HEALTHY` in the sky blue — but GREEN means ON AIR on the layer
   * table and SKY means READY, and a glance at green in the footer can read as
   * "something is on air". `theme.ts` reserves the air hue for the layer rows and
   * the status bar's own indicator; this is the second half of that rule, applied
   * ACROSS the two surfaces instead of within one.
   *
   * The healthy state therefore takes no hue at all: primary INK and WEIGHT
   * against the bar's muted base text. The rule that falls out is easy to hold and
   * easy to check — NOTHING IN THIS BAR IS COLOURED UNLESS IT NEEDS ATTENTION.
   * Health is the absence of an alarm, which is exactly what it is.
   *
   * The fault tones are unchanged and are not borrowed from anywhere: muted grey
   * for what we cannot verify, amber for a configuration problem, red for down.
   * Those are role colours (`--r-caution`, `--r-danger`) rather than state
   * colours, and neither is a hue the layer table uses to describe a row.
   *
   * DO NOT reintroduce green or sky here at any weight, including a lighter or
   * darker one — "not the same hue at a different weight" is the constraint.
   */
  primary: { color: colors.text, fontWeight: 700 },
  /**
   * THE HEALTH LED — the one thing in this bar that carries a hue while nothing
   * is wrong (owner: «فقط دایره … رو سبز کن»).
   *
   * `--r-success`, the soft ack/healthy emerald, and NEVER `--r-onair`. `theme.ts`
   * keeps the two greens under separate names for exactly this reason: the vivid
   * air green is the mark an operator finds from across a gallery and may say only
   * that a graphic is on the output.
   *
   * A dot and not a word, deliberately: the label stays uncoloured, so there is no
   * green SENTENCE in the footer to be glanced at as an air claim. A 6px LED reads
   * as "this light is on".
   */
  healthDot: { color: cssVars['--r-success'] },
  backup: { color: colors.textMuted },
  failed: { color: colors.offline },
  failedHard: { color: colors.errorText },
  ok: { color: colors.text, fontWeight: 700 },
  // B-081 — the look of health we CANNOT currently verify: muted, never a confident color.
  stale: { color: colors.textMuted },
  // B-094 — a CONFIGURATION problem on a server that is otherwise fine. Amber, the
  // repo's caution tone: deliberately NOT `error` red, which is reserved for air
  // claims and for a server that is actually down. Getting that wrong would repeat
  // the mis-attribution this indicator exists to end.
  noOsc: { color: colors.pending, fontWeight: 700 },
  spacer: { flex: 1 },
  lock: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    color: colors.pending,
    fontWeight: 700,
  },
} as const;

interface SessionLabel {
  text: string;
  style: { color: string };
}

/**
 * B-081 — what a server's health reads as while the BRIDGE is down.
 *
 * Server health only ever reaches the Runtime **through** the bridge (AMCP handshake +
 * OSC). Once the link is gone, the last snapshot is not "still true" — it is unverifiable,
 * and it ages with every second the bridge stays down. Rendering it as a confident green
 * HEALTHY next to R-006's "NOT CONNECTED — NOTHING CAN REACH AIR" is the same species of lie
 * that R-006 itself was filed to kill: the reassuring claim wins over the alarming one.
 * So while disconnected the pills say UNKNOWN, muted — and the last-known state survives
 * only in the tooltip, explicitly labelled as stale.
 */
const UNKNOWN: SessionLabel = { text: 'UNKNOWN', style: styles.stale };

/**
 * THE DOT FOLLOWS ITS OWN SERVER'S STATE — it is an LED, not a decoration.
 *
 * The first version keyed the green on "not stale and not deaf", which is a
 * different question and got the reported case exactly backwards: a server
 * reporting `disconnected` is neither stale nor OSC-deaf, so `● PRIMARY A
 * OFFLINE` rendered a GREEN light beside a red word. A light that says fine
 * beside a label that says offline is the B-081 contradiction reintroduced on the
 * one element that is hardest to read as text.
 *
 * So the dot is DERIVED FROM THE RESOLVED LABEL rather than computed beside it.
 * Only a genuine HEALTHY gets the green LED; every other state — degraded,
 * offline, unknown, stale, connecting — takes the label's own colour, so the two
 * halves of the pill physically cannot disagree.
 */
function healthDotStyle(label: SessionLabel): { color: string } {
  return label.style === styles.ok ? styles.healthDot : label.style;
}

function sessionLabel(state: string): SessionLabel {
  switch (state) {
    case 'healthy':
      return { text: 'HEALTHY', style: styles.ok };
    case 'degraded':
      return { text: 'DEGRADED', style: styles.failed };
    case 'disconnected':
      return { text: 'OFFLINE', style: styles.failedHard };
    case 'connecting':
    case 'handshaking':
    case 'resyncing':
      return { text: state.toUpperCase(), style: styles.backup };
    default:
      return { text: state.toUpperCase(), style: styles.backup };
  }
}

/**
 * B-094 — is this server answering AMCP while we hear NO OSC from it?
 *
 * The two axes are orthogonal and the pill only carries one. A server can be
 * perfectly healthy on AMCP — rendering graphics, acking every command — while
 * its OSC never reaches us because `casparcg.config` points the predefined-client
 * somewhere else, or the UDP port is closed. The operator's install had exactly
 * that: the client on port 5253 instead of 6250, and a literal
 * `false [true|false]` left in `<disable-send-to-amcp-clients>`.
 *
 * Nothing in the UI pointed at it. Worse, when the session eventually notices the
 * silence it DEGRADES — and DEGRADED reads as "CasparCG is down", which sends an
 * engineer to restart a playout box that is working, taking air down. That is
 * mis-warning, not un-warning, and it is what this fixes.
 *
 * Gated on the session having got past its handshake (`healthy`/`degraded`), so a
 * cold start does not flash the warning during the connect/resync drain when no
 * OSC has legitimately arrived yet. `oscFreshAt` absent means "never heard from
 * this server this session" — the same source-filtered signal B-093's restore
 * guard reads, not a second one.
 */
function isDeafToServer(server: { state: string; oscFreshAt?: string | undefined }): boolean {
  return (
    (server.state === 'healthy' || server.state === 'degraded') && server.oscFreshAt === undefined
  );
}

/**
 * Names the fault and the remedy, in that order. Says what is DEGRADED by it, so
 * the operator can judge urgency — and says the server is fine, so nobody
 * restarts it.
 */
function noOscTitle(label: string): string {
  return (
    `No OSC has ever reached the bridge from server ${label}, but AMCP on ${label} is ` +
    'answering normally. The server is UP — this is an OSC configuration problem on the ' +
    'CasparCG side, not a connection failure, so restarting the playout machine will not fix ' +
    'it and would take working output off air. ' +
    `While this shows, on-air confirmation, orphan detection and restore-after-restart are ` +
    `unverified — and this pill's DEGRADED/OFFLINE readings are caused by the OSC silence, ` +
    'not by a failing server. ' +
    'Fix in casparcg.config: point <osc><predefined-clients> at this machine on the ' +
    "bridge's OSC port (or set <disable-send-to-amcp-clients> to exactly false — a pasted " +
    '"false [true|false]" is invalid and silently disables OSC), then open that UDP port.'
  );
}

/**
 * 🔴 **`R-058` — REACHABLE IS NOT WORKING. The sentence for a channel that has STOPPED
 * producing frames.**
 *
 * The owner's 2026-08-23 incident: a `<decklink>` consumer in `casparcg.config` for a device
 * the machine did not have. CasparCG started, AMCP connected, and this bar read
 * **BRIDGE LIVE + PRIMARY A HEALTHY** while the channel produced nothing at all — not even on
 * the `<screen />` consumer. Every signal the console had was about REACHABILITY, and every
 * one of them was true.
 *
 * ⚠ **It sends the operator somewhere, and it stops short of what it cannot see.** This
 * chip reads the OSC axis only: it knows the channel ticked and stopped, not why. Since
 * `C-029` the bridge DOES read what `casparcg.config` declares (`INFO CONFIG` exposes it) and
 * the OUTPUT MISSING banner names a declared consumer that never started — so the sentence
 * points there for that case, and for the other (every consumer started, one stopped later)
 * it still says only what is true: the log has the reason, this surface does not.
 *
 * ⚠ **It says the server is UP**, for the same reason `noOscTitle` does: the fault is inside
 * CasparCG, and an operator who restarts a playout box over this takes working channels off
 * air to fix one.
 */
function deadChannelTitle(label: string, channels: readonly number[]): string {
  const which =
    channels.length === 1
      ? `Channel ${String(channels[0])} on server ${label} was producing frames and has STOPPED.`
      : `Channels ${channels.join(', ')} on server ${label} were producing frames and have STOPPED.`;
  return (
    `${which} AMCP on ${label} is still answering, so the server is UP and reachable — this ` +
    'is not a connection failure and restarting the playout machine would take working ' +
    'channels off air to fix it. ' +
    'Nothing this channel is asked to play will appear on its output while this shows. ' +
    "Check CasparCG's own log and the channel's consumers — a consumer that cannot start " +
    '(a device that is not present, a format it will not take) stops the channel without ' +
    'failing any command. ' +
    'If the OUTPUT MISSING banner is showing, it names the declared consumer that is not ' +
    'running; if it is not, every declared consumer started and one has stopped since, which ' +
    'only the log can see.'
  );
}

/** Hung off a deaf server's pill: its reading covers the command path only. */
const AMCP_ONLY_TITLE =
  'AMCP only — no OSC is arriving from this server, so this reading covers the command ' +
  'path, not what is actually on screen.';

/** The tooltip that keeps the last-known reading available without asserting it. */
function staleTitle(state: string): string {
  return (
    `Bridge disconnected — the server's health cannot be read. ` +
    `Last known before the link dropped: ${sessionLabel(state).text}.`
  );
}

/** Bottom-of-window status bar (Phase 6 §2). Never hidden, never re-flows. */
export function StatusBar({ onOpenAudit, onOpenSettings, onOpenSources }: Props = {}): JSX.Element {
  const health = useConnections();
  const lock = useLock();
  const link = useLink();
  const simulated = link === 'offline-mock';
  // B-081 — the link that DELIVERS health is down, so every reading below is unverifiable.
  const stale = link === 'disconnected';
  /**
   * §7 — the link pill's second hop, resolved HERE from the health this component
   * already holds, and handed down. One subscription, one reading: the pill saying
   * "bridge only" and the pills saying "PRIMARY A OFFLINE" are now two views of one
   * value rather than two answers to one question.
   */
  const casparReach = resolveCasparReach(link, health);
  // Above the loading early return: a hook cannot be called conditionally.
  const { prompt, promptDialog } = usePrompt();

  if (health === null) {
    return (
      <footer style={styles.bar} aria-label="Status bar">
        <LinkIndicator reach={casparReach} />
        {/* Nothing has answered yet. While the link is down that is not "loading" — there
            is nobody to load from (B-080/B-081). */}
        <span className="cg-pill" style={stale ? styles.stale : undefined}>
          {stale ? 'SERVER HEALTH UNKNOWN' : 'Loading…'}
        </span>
      </footer>
    );
  }

  // B-094 — per SERVER: A and B are independent sessions with independent taps and
  // independent bound UDP ports, so a mirror pair can have one deaf and the other fine.
  const primaryDeaf = !stale && !simulated && isDeafToServer(health.primary);
  const backupDeaf =
    !stale && !simulated && health.backup !== undefined && isDeafToServer(health.backup);

  /*
    🔴 R-058 — REACHABLE BUT PRODUCING NOTHING, read from the ONE authority.

    `stoppedChannelsOf` lives in `@cg/shared-ipc` beside `isServerReachable`, not here: the
    question is the same class and a second local copy is how a name comes to lie about what
    it tests (golden rule 6). The bridge already DECIDED which channels are stale — this only
    reads the verdict, which is `B-171`'s lesson applied before it could bite again.

    ⚠ Silence is not proof, and the schema is what enforces it: a channel appears in
    `health.*.channels` only once it has TICKED, so a `ticking: false` can only ever be said
    about a channel that proved it ticks. An OSC-less install publishes an EMPTY list and
    lights nothing — no rule here has to remember that.
  */
  const primaryDead = stale || simulated ? [] : stoppedChannelsOf(health.primary);
  const backupDead =
    stale || simulated || health.backup === undefined ? [] : stoppedChannelsOf(health.backup);

  // …and while a server is deaf, its pill STOPS ASSERTING. Leaving a confident green
  // HEALTHY beside the amber warning is the exact shape this repo has already
  // diagnosed twice (B-081, R-006): two contradictory claims, same size, same row —
  // and the reassuring one wins. So the pill mutes to B-081's `stale` tone, which
  // already means "health we cannot currently verify", and the warning carries the
  // attribution. The state WORD is unchanged (it is the FSM's, and still true on the
  // AMCP axis); only its confidence is withdrawn.
  /*
    🔴 R-058 — A STOPPED CHANNEL MUTES THE PILL TOO, for the reason stated directly above
    for deafness, and this is the case that reason was written about.

    The owner read `PRIMARY A HEALTHY` in confident green while the channel produced nothing.
    That is B-081's and R-006's shape exactly — two claims of different sizes, and the
    reassuring one wins — and it is the whole complaint. The state WORD stays, because it is
    the FSM's and is still true on the AMCP axis; only its CONFIDENCE is withdrawn, and the
    attribution goes on the chip beside it.
  */
  const primary = stale
    ? UNKNOWN
    : primaryDeaf || primaryDead.length > 0
      ? { ...sessionLabel(health.primary.state), style: styles.stale }
      : sessionLabel(health.primary.state);
  // B-046 — `backup` is absent under a declared single-server config: render
  // the honest "no backup" state instead of a phantom card, and disable the
  // manual failover (the bridge refuses it anyway — nothing to switch to).
  const backup =
    health.backup === undefined
      ? null
      : stale
        ? UNKNOWN
        : backupDeaf || backupDead.length > 0
          ? { ...sessionLabel(health.backup.state), style: styles.stale }
          : sessionLabel(health.backup.state);

  return (
    <footer style={styles.bar} aria-label="Status bar">
      <LinkIndicator reach={casparReach} />
      {simulated ? (
        // R-006 — in test mode there is no server to describe. The per-server pills used to
        // read "PRIMARY A HEALTHY" in green here, straight from the mock's seed, which is
        // the claim that convinced the operator a graphic was on air. Say the true thing.
        <span className="cg-pill" aria-label="Server status">
          <span style={styles.failedHard}>⚠ NO SERVER — SIMULATED</span>
        </span>
      ) : (
        <>
          {/* B-081 — while `stale`, the whole pill mutes: the green ● dot is a claim too. */}
          <span
            className="cg-pill"
            {...(stale
              ? { title: staleTitle(health.primary.state) }
              : primaryDeaf
                ? { title: AMCP_ONLY_TITLE }
                : {})}
          >
            {/*
              THE DOT IS THE ONLY THING THAT MAY BE GREEN (owner). The label keeps
              the no-hue treatment; a 6px LED reads as "this light is on", where a
              green WORD in the footer can be glanced at as an air claim.

              `--r-success`, never `--r-onair` — the soft ack/healthy emerald, kept
              under its own name in `theme.ts` precisely so a tweak to one cannot
              move the other.

              B-081 STILL HOLDS: while `stale` or AMCP-deaf the dot mutes WITH the
              label, because a confident green light beside an UNKNOWN word is the
              same contradiction this pill exists to end — "the green ● dot is a
              claim too".
            */}
            <span style={healthDotStyle(primary)}>●</span>{' '}
            <span style={stale || primaryDeaf ? styles.stale : styles.primary}>
              PRIMARY {health.primary.label}
            </span>{' '}
            <span style={primary.style}>{primary.text}</span>
          </span>
          {health.backup !== undefined && backup !== null ? (
            <span
              className="cg-pill"
              {...(stale
                ? { title: staleTitle(health.backup.state) }
                : backupDeaf
                  ? { title: AMCP_ONLY_TITLE }
                  : {})}
            >
              {/*
                THE BACKUP'S LED FOLLOWS ITS OWN STATE TOO (owner) — it used to be
                permanently muted, so a backup that was DEFINED and OFFLINE showed
                a neutral light beside a red word. Same defect as the primary's,
                one pill along, and the same fix: `healthDotStyle` derives it from
                the resolved label, so the light and the word cannot disagree.

                The SHAPE stays `○` against the primary's `●`. That distinction is
                which server is in charge, not how healthy it is, and it has to
                survive the two now sharing a colour vocabulary — an operator must
                be able to tell the pair apart without reading either word.
              */}
              <span style={healthDotStyle(backup)}>○</span>{' '}
              <span style={styles.backup}>BACKUP {health.backup.label}</span>{' '}
              <span style={backup.style}>{backup.text}</span>
            </span>
          ) : (
            <span className="cg-pill">
              <span style={styles.backup}>○ NO BACKUP</span>
            </span>
          )}
          {/* B-094 — a SEPARATE indicator, deliberately not a pill STATE.
              The pill's vocabulary mirrors the session state machine exactly, and
              "answering AMCP but inaudible" is an orthogonal axis, not another
              state on it. Keeping them apart lets the bar say both things at once —
              "PRIMARY A HEALTHY  ⚠ NO OSC" reads as "it is up, but I am deaf to it",
              which is the truth. It also survives the FLAP a blind install causes:
              as the pill oscillates HEALTHY↔DEGRADED this stays put and explains
              BOTH, where a pill state would be overwritten by DEGRADED at exactly
              the moment the operator most needs the explanation. */}
          {primaryDeaf && (
            <span
              className="cg-pill"
              title={noOscTitle(health.primary.label)}
              aria-label={`No OSC from server ${health.primary.label}`}
            >
              <span style={styles.noOsc}>⚠ NO OSC FROM {health.primary.label}</span>
            </span>
          )}
          {backupDeaf && health.backup !== undefined && (
            <span
              className="cg-pill"
              title={noOscTitle(health.backup.label)}
              aria-label={`No OSC from server ${health.backup.label}`}
            >
              <span style={styles.noOsc}>⚠ NO OSC FROM {health.backup.label}</span>
            </span>
          )}
          {/*
            🔴 R-058 — REACHABLE BUT PRODUCING NOTHING, beside its sibling and never instead
            of it. The two are different faults with different remedies: NO OSC means we
            cannot SEE this server's channels; this means we can see them and they have
            STOPPED. Both can be true at once on a mirror pair, and neither suppresses the
            other.

            It is a chip on this bar and NOT a banner. `ConnectionBanner` owns "nothing can
            reach air" and renders only while the link is NOT live — its own header makes
            that a promise: *"When the link is live this renders nothing: no banner is itself
            the signal that the Runtime can actually reach air."* An operator has been taught
            that. Rendering a banner while the link IS live would spend that learned signal,
            and a per-CHANNEL, per-SERVER fact does not fit a surface that is singular by
            design.
          */}
          {primaryDead.length > 0 && (
            <span
              className="cg-pill"
              title={deadChannelTitle(health.primary.label, primaryDead)}
              aria-label={`Server ${health.primary.label} is not producing frames on ${
                primaryDead.length === 1 ? 'channel' : 'channels'
              } ${primaryDead.join(', ')}`}
            >
              <span style={styles.noOsc}>
                ⚠ {health.primary.label} NOT PRODUCING · CH {primaryDead.join(', ')}
              </span>
            </span>
          )}
          {backupDead.length > 0 && health.backup !== undefined && (
            <span
              className="cg-pill"
              title={deadChannelTitle(health.backup.label, backupDead)}
              aria-label={`Server ${health.backup.label} is not producing frames on ${
                backupDead.length === 1 ? 'channel' : 'channels'
              } ${backupDead.join(', ')}`}
            >
              <span style={styles.noOsc}>
                ⚠ {health.backup.label} NOT PRODUCING · CH {backupDead.join(', ')}
              </span>
            </span>
          )}
          {/* The strategy is CONFIG, not health — it does not go stale with the link. */}
          <span className="cg-pill">{health.strategy}</span>
        </>
      )}
      <span style={styles.spacer} />
      <AsyncButton
        /*
          R-055 — the DEFAULT variant, not `caution`.

          `--r-caution` is a FAULT role in this bar — the header above says "amber
          for a configuration problem, red for down" — and the `⚠ NO OSC` alarm two
          elements to the left wears the same hex. FAILOVER is a manual ACTION, not
          a fault, so colouring it spent the alarm colour on something that is not
          alarming and made the real alarm quieter. Its three neighbours (SERVERS /
          SOURCES / LOG) are already bare `Button`s; this now reads as one of them.
          It keeps its disabled state and its `title`, which is where "why can I not
          press this" actually belongs.
        */
        aria-label="Manual failover"
        disabled={health.backup === undefined}
        title={
          health.backup === undefined
            ? 'No backup configured'
            : `Switch primary to ${health.currentPrimary === 'A' ? 'B' : 'A'}`
        }
        run={() =>
          window.cg.connections.failover({ reason: 'manual' }).then((r) => ({ accepted: r.ok }))
        }
      >
        ⇄ FAILOVER
      </AsyncButton>
      {onOpenSettings !== undefined && (
        <Button onClick={onOpenSettings} aria-label="Open server settings">
          SERVERS
        </Button>
      )}
      {onOpenSources !== undefined && (
        <Button onClick={onOpenSources} aria-label="Open live sources">
          SOURCES
        </Button>
      )}
      {/* LOG, not AUDIT (owner). "Audit" names the FILE FORMAT the bridge writes;
          "log" is what the operator is going to look at. The accessible name keeps
          the fuller phrase, so a screen reader still says WHICH log this is. */}
      {onOpenAudit !== undefined && (
        <Button onClick={onOpenAudit} aria-label="Open audit log">
          LOG
        </Button>
      )}
      {lock.engaged ? (
        <span style={styles.lock}>🔒 LOCKED</span>
      ) : (
        <Button
          onClick={() => {
            void (async () => {
              // The native prompt let a too-short PIN through and this handler then dropped
              // it on the floor — the operator pressed Lock, nothing happened, and nothing
              // said why. The dialog now holds the rule itself: submit stays disabled until
              // the PIN is long enough.
              const pin = await prompt({
                title: 'Lock the Runtime',
                body: 'While locked, every on-air control is disabled until the PIN is re-entered.',
                label: 'Lock PIN (4–64 characters)',
                submitLabel: 'Lock',
                type: 'password',
                minLength: 4,
              });
              // R-020 — digits normalize to Latin BEFORE the PIN is stored, and
              // LockOverlay normalizes the release PIN the same way, so the two
              // ends of the comparison can never disagree about ۱۲۳۴ vs 1234.
              if (pin !== null) await window.cg.lock.engage({ pin: normalizeDigits(pin) });
            })();
          }}
        >
          🔒 Lock…
        </Button>
      )}
      {promptDialog}
    </footer>
  );
}
