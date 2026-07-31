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
  failedHard: { color: colors.error },
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
export function StatusBar({ onOpenAudit, onOpenSettings }: Props = {}): JSX.Element {
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

  // …and while a server is deaf, its pill STOPS ASSERTING. Leaving a confident green
  // HEALTHY beside the amber warning is the exact shape this repo has already
  // diagnosed twice (B-081, R-006): two contradictory claims, same size, same row —
  // and the reassuring one wins. So the pill mutes to B-081's `stale` tone, which
  // already means "health we cannot currently verify", and the warning carries the
  // attribution. The state WORD is unchanged (it is the FSM's, and still true on the
  // AMCP axis); only its confidence is withdrawn.
  const primary = stale
    ? UNKNOWN
    : primaryDeaf
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
        : backupDeaf
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
            <span style={stale || primaryDeaf ? styles.stale : styles.healthDot}>●</span>{' '}
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
              <span style={styles.backup}>○ BACKUP {health.backup.label}</span>{' '}
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
          {/* The strategy is CONFIG, not health — it does not go stale with the link. */}
          <span className="cg-pill">{health.strategy}</span>
        </>
      )}
      <span style={styles.spacer} />
      <AsyncButton
        variant="caution"
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
      {onOpenAudit !== undefined && (
        <Button onClick={onOpenAudit} aria-label="Open audit log">
          AUDIT
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
