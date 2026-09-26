import { useEffect, useRef, useState } from 'react';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { TextInput } from '../../ui/TextInput.js';
import { ConnectionCheckList } from './ConnectionCheckList.js';
import {
  checkingLines,
  markChecking,
  normalisePlayoutAddress,
  signInCanWork,
  updateOnly,
  waitingIds,
  type ShownCheckLine,
} from './firstRunStation.js';

/**
 * `DESKTOP-APPS-01` §2E step 1 / §2F — **THE PLAYOUT, AND THE CONNECTION CHECK**, one component in
 * two places: first-run's first step, and a card in Station setup → Servers.
 *
 * The address is a FACT once the station has one, with CHECK beside it. CHANGE exists only where
 * the address can actually be written — inside CG Control (`setup.canSetPlayoutAddress`) and for
 * whoever the host surface allows — and is otherwise absent, never greyed. CONNECT writes it
 * through CG Control and never over the control socket; it appears once a check shows the two
 * links a sign-in needs.
 */
const styles = {
  column: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  label: { fontSize: cssVars['--r-text-sm'], color: colors.textSecondary, minWidth: 120 },
  fact: { fontSize: cssVars['--r-text-md'] },
  /*
    `DELTA-MULTI-CHANNEL-01-B` B1/B3 — a message is ATTENTION, never red (`design.md` §29): the
    owner met a red "not signed in" here. Red belongs to controls that destroy.
  */
  error: { fontSize: cssVars['--r-text-sm'], color: cssVars['--r-caution-text'], lineHeight: 1.6 },
} as const;

export function PlayoutConnection({
  origin,
  startEditing,
  mayChange,
  judgeNow = false,
  onJudged,
  checkOnOpen = false,
  onLines,
  recheck = 0,
  lineFilter,
}: {
  /** The configured Playout's origin, or `null` when this station has none. */
  origin: string | null;
  startEditing: boolean;
  /** May this surface write the address? The desktop door must exist as well. */
  mayChange: boolean;
  /**
   * `DESKTOP-APPS-01-B` B2 — first-run sets it once the station admin has signed in, which is when
   * the bridge starts JUDGING the AMCP line (before, it is "waiting for sign-in"). With nothing
   * shown yet, that is one check; with a line still waiting, the one re-run (below).
   */
  judgeNow?: boolean;
  /**
   * Told once the check is judged after {@link judgeNow}: the one re-run has answered, no line was
   * waiting, or the bridge did not answer — whatever it found.
   */
  onJudged?: () => void;
  /**
   * `DELTA-MULTI-CHANNEL-01-B` B2 — a SIGN-IN FORM's check: run once when this opens with nothing
   * shown, so the form knows whether a sign-in can work before anybody types into it.
   */
  checkOnOpen?: boolean;
  /** B2 — told whenever the lines on screen change (the sign-in form gates on them). */
  onLines?: (lines: readonly ShownCheckLine[] | null) => void;
  /**
   * B2 — bumped by a sign-in that found the Playout silent: each bump runs the check once, clean,
   * so the silence is said as the check's own line under the address, never on a field.
   */
  recheck?: number;
  /** B2 — what a compact surface shows of the lines: the sign-in overlay shows the one that decides. */
  lineFilter?: (lines: readonly ShownCheckLine[]) => readonly ShownCheckLine[];
}): JSX.Element {
  const canWrite = mayChange && window.cg.setup.canSetPlayoutAddress();
  const [editing, setEditing] = useState(startEditing);
  const [address, setAddress] = useState(origin ?? '');
  const [lines, setLines] = useState<readonly ShownCheckLine[] | null>(null);
  const [busy, setBusy] = useState<'checking' | 'connecting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typed = normalisePlayoutAddress(address);
  /*
    🔴 `DELTA-MULTI-CHANNEL-01-A` A2 — **A CHECK RUNS WHEN CHECK IS PRESSED; BY ITSELF, ONCE.**

    It used to re-run the WHOLE check every 2 s after the sign-in for as long as the AMCP line
    waited — which, for the bridge's 30-s trust window, is fifteen runs, every one flashing every
    line back to "checking". The owner watched it loop until the channel list appeared.

    The rule now: a PRESSED check starts clean (`CHECK-RERUN-01`). By itself the console re-runs
    ONCE, when the thing a waiting line waits for changes — the sign-in, for the AMCP line — and
    that re-run updates only the waiting line, in place. It asks the bridge to HOLD the AMCP line
    (`awaitLetIn`) until the Playout lets this machine in or the trust window ends, so it gets one
    answer where the loop fished for one every two seconds. Watching the bridge's own link for the
    moment instead would read the wrong axis (golden rule 8): on a first run that link still aims
    at the loopback default, never at the CasparCG the check probes, and would never come up. The
    channels come after the answer (`onJudged`), because the on-air warning needs AMCP to read a
    channel's occupancy (`DESKTOP-APPS-01-B` B2).
  */
  // Read at the moment a run settles, not when it started.
  const judgeRef = useRef(judgeNow);
  judgeRef.current = judgeNow;
  const onJudgedRef = useRef(onJudged);
  onJudgedRef.current = onJudged;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  /** The one automatic re-run has been spent; a PRESS starts a new cycle. */
  const autoSpent = useRef(false);
  /*
    `CHECK-RERUN-01` A, as A2 leaves it — **ONE CHECK AT A TIME.** `CHECK-RERUN-01` tagged every run
    because the sign-in used to start its own check while a pressed one was still out, and the slow
    reply then overwrote the new lines. Now no door starts a check while one runs: Check is
    disabled, a sign-in waits for the running check's reply and reads it, the re-run waits too, and
    StrictMode's second mount effect finds this set. A reply therefore always belongs to the check
    on screen, and the late reply the tag guarded against cannot exist.
  */
  const inFlight = useRef(false);

  /** After the sign-in: the one re-run while a line still waits, else the check is judged. */
  const settled = (shown: readonly ShownCheckLine[] | null): void => {
    if (!judgeRef.current) return;
    if (shown !== null && waitingIds(shown).size > 0 && !autoSpent.current) {
      void check('auto');
      return;
    }
    onJudgedRef.current?.();
  };

  /**
   * `press` — the operator's Check: every line starts clean. `first` — nothing was ever shown and
   * the sign-in wants a verdict: the same, by itself. `auto` — the one re-run: only the lines that
   * waited, in place, with the AMCP line held until this machine is let in.
   */
  const check = async (mode: 'press' | 'first' | 'auto'): Promise<void> => {
    // After the sign-in the configured address is the one to judge, whatever the field holds.
    const target = judgeRef.current && origin !== null ? origin : editing ? typed : origin;
    if (inFlight.current) return;
    if (target === null) {
      if (judgeRef.current) onJudgedRef.current?.();
      return;
    }
    inFlight.current = true;
    if (mode === 'press') autoSpent.current = false;
    if (mode === 'auto') autoSpent.current = true;
    /*
      The ref moves WITH the state: the one re-run starts from the previous run's `finally`, before
      React has rendered that run's lines, and must read them — not the "checking" lines it
      replaced, in which nothing waits.
    */
    const show = (next: readonly ShownCheckLine[] | null): void => {
      linesRef.current = next;
      setLines(next);
    };
    const before = linesRef.current;
    const waiting = mode === 'auto' && before !== null ? waitingIds(before) : null;
    // C3 — the field shows the address actually checked: `192.168.21.111` → `http://…:8080`.
    if (editing && target === typed) setAddress(target);
    // A — a pressed (or first) run starts clean; the automatic one touches only what waited.
    show(
      waiting !== null && before !== null
        ? markChecking(before, waiting, target)
        : checkingLines(target),
    );
    setBusy('checking');
    setError(null);
    let shown: readonly ShownCheckLine[] | null = null;
    try {
      const result = await window.cg.setup.check({
        playoutAddress: target,
        origin: window.location.origin,
        ...(mode === 'auto' ? { awaitLetIn: true as const } : {}),
      });
      shown =
        waiting !== null && before !== null
          ? updateOnly(before, waiting, result.lines)
          : result.lines;
      show(shown);
    } catch (err) {
      // C2 — a bridge that did not answer is said in words (`BridgeTimeoutError`'s message), and
      // no line is left checking under it.
      show(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setBusy(null);
      settled(shown);
    }
  };

  // The sign-in: nothing shown → one check, as if pressed; shown → the one re-run, or judged.
  useEffect(() => {
    if (!judgeNow) return;
    // A check still out settles, and decides then — the sign-in reads ITS reply.
    if (busy !== null || inFlight.current) return;
    const shown = linesRef.current;
    if (shown === null) void check('first');
    else settled(shown);
  }, [judgeNow]);

  // B2 — a sign-in form's own first check, once, when it opens with nothing shown.
  useEffect(() => {
    if (checkOnOpen && linesRef.current === null) void check('first');
  }, []);

  // B2 — the lines, to whoever gates on them.
  const onLinesRef = useRef(onLines);
  onLinesRef.current = onLines;
  useEffect(() => {
    onLinesRef.current?.(lines);
  }, [lines]);

  // B2 — a sign-in found the Playout silent: check once more, clean.
  const lastRecheck = useRef(recheck);
  useEffect(() => {
    if (recheck === lastRecheck.current) return;
    lastRecheck.current = recheck;
    void check('press');
  }, [recheck]);

  const connect = async (): Promise<void> => {
    if (typed === null) return;
    setBusy('connecting');
    setError(null);
    try {
      // CG Control writes the address and restarts the bridge; the console reconnects on its own.
      await window.cg.setup.setPlayoutAddress(typed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={styles.column}>
      {editing ? (
        <div style={styles.row}>
          <div style={styles.grow}>
            <TextInput
              id="cg-playout-address"
              value={address}
              onChange={(v) => {
                setAddress(v);
                setLines(null);
              }}
              placeholder="http://host:port"
              dir="ltr"
              aria-label="Playout address"
              invalid={address !== '' && typed === null}
              disabled={busy !== null}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void check('press');
              }}
            />
          </div>
          <Button
            variant="secondary"
            disabled={typed === null || busy !== null}
            onClick={() => void check('press')}
          >
            {busy === 'checking' ? 'Checking…' : 'Check'}
          </Button>
        </div>
      ) : (
        <div style={styles.row}>
          <span style={styles.label}>Address</span>
          <span style={{ ...styles.fact, ...styles.grow }} dir="ltr" data-playout-address>
            {origin ?? '—'}
          </span>
          <Button
            variant="secondary"
            disabled={origin === null || busy !== null}
            onClick={() => void check('press')}
          >
            {busy === 'checking' ? 'Checking…' : 'Check'}
          </Button>
          {canWrite && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => {
                setEditing(true);
                setLines(null);
              }}
            >
              Change
            </Button>
          )}
        </div>
      )}
      {lines !== null && (
        <ConnectionCheckList lines={lineFilter === undefined ? lines : lineFilter(lines)} />
      )}
      {editing && lines !== null && signInCanWork(lines) && canWrite && (
        <div style={styles.row}>
          <Button variant="primary" disabled={busy !== null} onClick={() => void connect()}>
            {busy === 'connecting' ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      )}
      {error !== null && (
        <div style={styles.error} role="status">
          {error}
        </div>
      )}
    </div>
  );
}
