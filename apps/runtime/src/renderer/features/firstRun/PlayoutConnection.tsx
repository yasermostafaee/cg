import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { orderCheckLines, type CheckLineId } from '@cg/shared-ipc';
import { APP_VERSION } from '../../appVersion.js';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { useEngineSessions } from '../../hooks/useEngineSessions.js';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Tag } from '../../ui/Tag.js';
import { ConnectionCheckList } from './ConnectionCheckList.js';
import { LocalBridgeHelp } from './LocalBridgeHelp.js';
import { StationAddressFields } from './StationAddressFields.js';
import {
  checkingLines,
  consoleCheckLines,
  currentCheckLines,
  hostPart,
  inSetupWords,
  onSeparateServer,
  markChecking,
  updateOnly,
  waitingIds,
  type ShownCheckLine,
} from './firstRunStation.js';
import {
  bridgeAddressOf,
  bridgeFact,
  bridgeFieldsOf,
  playoutAddressOf,
  playoutFact,
  playoutHostOf,
  stationFieldsChanged,
  stationFieldsOf,
  type StationFields,
} from './stationFields.js';

/**
 * `DESKTOP-APPS-01` §2E step 1 / §2F — **THE PLAYOUT, AND THE CONNECTION CHECK**, one component in
 * three places: first-run's first step, the sign-in gate, and Station setup's Connection card.
 *
 * The address is a FACT once the station has one (`192.168.21.32 : 8080`), with CHECK beside it. CHANGE exists
 * only where the address can actually be written — inside CG Control (`setup.canSetPlayoutAddress`) and for
 * whoever the host surface allows — and is otherwise absent, never greyed. CONNECT writes it through CG Control
 * and never over the control socket.
 *
 * `CENTRAL-BRIDGE-01` (D8) — in Station setup (`showBridge`) the card also says where this console reaches CG
 * Bridge, as a fact with a tag — `On the Playout machine` or `Separate server` — and its own CHANGE. Both are
 * this console's own station record.
 *
 * 🔴 `SERVERS-SIMPLIFY-01` (T1, T5) — **ONE ADDRESS TO GIVE, AND ONE COMMIT.** Each address is a `Host` and a
 * `Port` (`StationAddressFields`, the Set up page's own fields), every default a placeholder. `CONNECT` shows the
 * moment a field says something other than the station as it is, beside the fact `Not connected yet`; pressed,
 * it runs the check where the fields resolve and saves only where CG Bridge answers there (`B-317`, the Set up
 * page's rule). `CHECK` stays a test that saves nothing.
 *
 * 🔴 `B-324` — **WHAT IS TYPED IS HELD BY WHOEVER OUTLIVES THE CARD.** Station setup unmounts a tab's body on a
 * tab switch, so a draft kept here was dropped in silence: the owner typed into the CG Bridge field, changed
 * tab, and came back to the card as it was. A surface that must keep the draft passes `draft` and `onDraft`
 * and holds it itself (Station setup holds it beside its other drafts, marks the rail with it, and discards it
 * on close). Without them the card holds its own, as first-run always has.
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

/**
 * 🔴 `B-317` — where a check ran: still running there, answered there (and what CG Bridge said of itself),
 * or nothing answered there. `playout` is the Playout address the check was about.
 */
type RanAt =
  | { readonly kind: 'pending'; readonly address: string; readonly playout: string }
  | {
      readonly kind: 'answered';
      readonly address: string;
      readonly version?: string | null;
      readonly problems: readonly { readonly code: string; readonly message: string }[];
      readonly playout: string;
    }
  | { readonly kind: 'silent'; readonly address: string; readonly playout: string };

/**
 * 🔴 `SERVERS-SIMPLIFY-01` (`B-324`) — **THE CARD'S OPEN EDIT**: which half the operator opened, and what the
 * fields hold. `all` — the Playout row's Change, both addresses; `bridge` — CG Bridge's own Change, its address
 * alone (the Playout stays a fact).
 */
export interface ConnectionDraft {
  readonly editing: 'all' | 'bridge';
  readonly fields: StationFields;
}

/** `R-081` — a console line's subject while a check runs, as the bridge's lines show theirs. */
function consoleSubject(id: CheckLineId): string {
  switch (id) {
    case 'bridge':
      return 'CG Bridge';
    case 'bridge-version':
      return "CG Bridge's release";
    case 'signin':
      return "This console's sign-in";
    case 'bridge-session-backup':
      return "CG Bridge's own sign-in on the backup engine";
    default:
      return id;
  }
}

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
  showBridge = false,
  grouped = false,
  draft: heldDraft,
  onDraft,
  extraLines = [],
  lineActions,
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
  /** `CENTRAL-BRIDGE-01` (D8) — Station setup: where this console reaches CG Bridge, too. */
  showBridge?: boolean;
  /**
   * 🔴 `R-081` — the WHOLE check, in its four groups, with the lines only this console can write
   * (where it found CG Bridge, CG Bridge's release against its own, its own sign-in). First-run and
   * Station setup; never a compact surface that shows one deciding line.
   */
  grouped?: boolean;
  /**
   * 🔴 `B-324` — the open edit, held by the surface that outlives this card (`null` — nothing open). Given
   * together with {@link onDraft}; without them the card holds its own.
   */
  draft?: ConnectionDraft | null;
  /** `B-324` — told every change to the open edit, and `null` when it closes (connected, or nothing changed). */
  onDraft?: (next: ConnectionDraft | null) => void;
  /**
   * 🔴 `SERVERS-SIMPLIFY-01` (`B-326`) — lines the surface that holds the facts writes into the grouped check
   * (Station setup: where CasparCG fetches graphics, from CG Bridge's serve state). Shown with the check's own
   * lines, in their groups.
   */
  extraLines?: readonly ShownCheckLine[];
  /** `B-326` — the one act a line offers, by its id (`Detect automatically`). */
  lineActions?: Readonly<Partial<Record<string, ReactNode>>> | undefined;
}): JSX.Element {
  const auth = useAuthSession();
  const capabilities = useAuthCapabilities();
  const engines = useEngineSessions();
  const canWrite = mayChange && window.cg.setup.canSetPlayoutAddress();
  // `CENTRAL-BRIDGE-01` (D8) — the separate server's CG Bridge address this console keeps, if any.
  const savedBridge = window.cg.setup.bridgeOverride();
  const opened = (editing: ConnectionDraft['editing']): ConnectionDraft => ({
    editing,
    fields: stationFieldsOf(origin, savedBridge),
  });
  /*
    A station with no Playout yet opens on the fields, as it always has: that edit is the card's starting
    state, not something the operator opened — so it is not held anywhere until it is typed into.
  */
  const initial = useMemo(
    () => (startEditing ? opened('all') : null),
    // `opened` reads `origin` and `savedBridge`; the edit a station starts on follows its Playout.
    [startEditing, origin, savedBridge],
  );
  const [ownDraft, setOwnDraft] = useState<ConnectionDraft | null>(initial);
  const held = onDraft !== undefined;
  const draft = held ? (heldDraft ?? initial) : ownDraft;
  const setDraft = (next: ConnectionDraft | null): void => {
    if (held) onDraft(next);
    else setOwnDraft(next);
  };
  const editing = draft !== null;
  const fields = draft?.fields ?? stationFieldsOf(origin, savedBridge);
  const typed = editing ? playoutAddressOf(fields.playout) : null;
  const bridgeTyped = editing ? bridgeAddressOf(fields.bridge, playoutHostOf(typed)) : '';
  // `B-317` / `B-324` — the fields say something other than the station as it is: the one comparison.
  const changed = editing && stationFieldsChanged(fields, origin, savedBridge);
  const [lines, setLines] = useState<readonly ShownCheckLine[] | null>(null);
  const [busy, setBusy] = useState<'checking' | 'connecting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
    🔴 `B-317` — WHERE THE CHECK RAN: the CG Bridge that answered it (and what it said of itself), or the
    address where nothing answered. The check's CG Bridge line and Connect read THIS, never the socket the
    console happens to be on — that is how `.111` came to be "found" for a typed `127.0.0.1`.
  */
  const [ranAt, setRanAt] = useState<RanAt | null>(null);

  // `B-317` — the ONE address the fields resolve to (the rule Connect connects by).
  const resolved =
    editing && typed !== null && bridgeTyped !== null
      ? window.cg.setup.bridgeAddressFor(typed, bridgeTyped)
      : null;
  // `B-317` — the address this console last connected to: a CHOICE when it differs, never used silently.
  const lastUsed = window.cg.link.bridgeAddress?.() ?? null;
  const offerLastUsed =
    editing &&
    canWrite &&
    bridgeTyped === '' &&
    resolved !== null &&
    lastUsed !== null &&
    lastUsed !== resolved;
  // As CG Bridge's fields would hold it: the host, and its port only off CG Bridge's own.
  const lastUsedFields = bridgeFieldsOf(lastUsed);
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
   *
   * Resolves with where the check ran (`null` — none ran, or it was the re-run), so `Connect` can read the
   * answer to the check it asked for rather than a render that has not happened yet.
   */
  const check = async (
    mode: 'press' | 'first' | 'auto',
    /** `B-317` — the CG Bridge address as it is about to be (a choice just made); else as the fields give it. */
    bridgeField: string | null = bridgeTyped,
  ): Promise<RanAt | null> => {
    // After the sign-in the configured address is the one to judge, whatever the fields hold.
    const target = judgeRef.current && origin !== null ? origin : editing ? typed : origin;
    /*
      `B-317` — while the fields are being edited INSIDE CG CONTROL, the check runs where they resolve to:
      there the fields decide where CG Bridge is (Connect writes them). A browser console's CG Bridge is
      its page's host whatever is typed, so its check runs on its own CG Bridge, as before.
    */
    const where =
      editing && canWrite && target === typed && bridgeField !== null
        ? { bridgeAddress: bridgeField }
        : undefined;
    if (inFlight.current) return null;
    if (target === null) {
      if (judgeRef.current) onJudgedRef.current?.();
      return null;
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
    // A — a pressed (or first) run starts clean; the automatic one touches only what waited.
    show(
      waiting !== null && before !== null
        ? markChecking(before, waiting, target)
        : checkingLines(target),
    );
    setBusy('checking');
    setError(null);
    const going =
      where === undefined
        ? (window.cg.link.bridgeAddress?.() ?? null)
        : window.cg.setup.bridgeAddressFor(target, where.bridgeAddress);
    let at: RanAt | null =
      mode === 'auto' || going === null
        ? null
        : { kind: 'pending', address: going, playout: target };
    if (mode !== 'auto') setRanAt(at);
    let shown: readonly ShownCheckLine[] | null = null;
    try {
      const result = await window.cg.setup.check(
        {
          playoutAddress: target,
          origin: window.location.origin,
          ...(mode === 'auto' ? { awaitLetIn: true as const } : {}),
        },
        where,
      );
      if (result.bridge !== null) {
        at = { kind: 'answered', ...result.bridge, playout: target };
        setRanAt(at);
      }
      // `R-090` — an older CG Bridge's `ports`/`topology` lines are dropped here, where its answer lands.
      const fresh = currentCheckLines(result.lines);
      shown = waiting !== null && before !== null ? updateOnly(before, waiting, fresh) : fresh;
      show(shown);
    } catch (err) {
      const silentAt = (err as { name?: unknown; address?: unknown }).address;
      if (
        err instanceof Error &&
        err.name === 'BridgeNotAnsweringError' &&
        typeof silentAt === 'string'
      ) {
        // 🔴 `B-317` — no CG Bridge there: said as the check's own CG Bridge line; nothing else is
        // known, so no other line stands — and nothing locks the fields or the sign-in.
        at = { kind: 'silent', address: silentAt, playout: target };
        setRanAt(at);
        shown = [];
        show(shown);
      } else {
        // C2 — a bridge that did not answer is said in words (`BridgeTimeoutError`'s message), and
        // no line is left checking under it. `B-317` — never the console's refusal of a command.
        show(null);
        setError(inSetupWords(err, going));
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
      settled(shown);
    }
    return at;
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

  /** Every change to the fields: the edit moves, and a check of the old fields no longer stands. */
  const edit = (next: StationFields): void => {
    setDraft({ editing: draft?.editing ?? 'all', fields: next });
    setLines(null);
    setRanAt(null);
  };

  /*
    🔴 `SERVERS-SIMPLIFY-01` (T1) + `B-317` — **CONNECT SAVES ONLY WHERE CG BRIDGE ANSWERS.** It is offered the
    moment a field changed; pressed, it reads the check of exactly these fields, running one first when there
    is none — and saves only when CG Bridge answered at the address the fields resolve to. Where nothing
    answered, the check's own CG Bridge line says where, and nothing is saved.
  */
  const connect = async (): Promise<void> => {
    if (typed === null || bridgeTyped === null) return;
    const answeredHere = (at: RanAt | null): boolean =>
      at?.kind === 'answered' && at.address === resolved;
    const at = answeredHere(ranAt) ? ranAt : await check('press');
    if (!answeredHere(at)) return;
    setBusy('connecting');
    setError(null);
    try {
      /*
        CG Control saves this console's station record and reconnects to CG Bridge there. 🔴 `B-317` —
        the fields AS THEY ARE, always: an address remembered from another session never rides along unseen.
      */
      await window.cg.setup.setPlayoutAddress(typed, bridgeTyped);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const bridgeAddress = window.cg.link.bridgeAddress?.() ?? null;
  const editingAll = draft?.editing === 'all';

  return (
    <div style={styles.column}>
      {editingAll ? (
        <StationAddressFields
          value={fields}
          onChange={edit}
          show={{ playout: true, bridge: canWrite }}
          disabled={busy !== null}
          onEnter={() => {
            if (typed !== null) void check('press');
          }}
        />
      ) : (
        <div style={styles.row}>
          <span style={styles.label}>Address</span>
          <span style={{ ...styles.fact, ...styles.grow }} dir="ltr" data-playout-address>
            {origin === null ? '—' : playoutFact(origin)}
          </span>
          {!editing && (
            <Button
              variant="secondary"
              disabled={origin === null || busy !== null}
              onClick={() => void check('press')}
            >
              {busy === 'checking' ? 'Checking…' : 'Check'}
            </Button>
          )}
          {canWrite && !editing && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              data-change="playout"
              onClick={() => {
                setDraft(opened('all'));
                setLines(null);
              }}
            >
              Change
            </Button>
          )}
        </div>
      )}
      {/* 🔴 `B-324` — CG Bridge's own Change opens its address alone; the Playout stays a fact above it. */}
      {draft?.editing === 'bridge' && canWrite && (
        <StationAddressFields
          value={fields}
          onChange={edit}
          show={{ playout: false, bridge: true }}
          disabled={busy !== null}
          onEnter={() => {
            if (typed !== null) void check('press');
          }}
        />
      )}
      {showBridge && !editing && (
        <div style={styles.row}>
          <span style={styles.label}>CG Bridge</span>
          <span style={{ ...styles.fact, ...styles.grow }} dir="ltr" data-bridge-address>
            {bridgeAddress === null ? '—' : bridgeFact(bridgeAddress)}
          </span>
          {/* T1 — where CG Bridge is, as a fact: on the Playout's machine (derived), or a separate server. */}
          {bridgeAddress !== null && origin !== null && (
            <Tag className="cg-setup-card-tag" data-bridge-placement="">
              {onSeparateServer(bridgeAddress, origin)
                ? 'Separate server'
                : 'On the Playout machine'}
            </Tag>
          )}
          {canWrite && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              data-change="bridge"
              onClick={() => {
                setDraft(opened('bridge'));
                setLines(null);
              }}
            >
              Change
            </Button>
          )}
        </div>
      )}
      {offerLastUsed && (
        <div style={styles.row}>
          <Button
            variant="ghost"
            disabled={busy !== null}
            data-last-used-bridge=""
            onClick={() => {
              const next = { ...fields, bridge: lastUsedFields };
              setDraft({ editing: draft?.editing ?? 'all', fields: next });
              setLines(null);
              setRanAt(null);
              void check('press', bridgeAddressOf(next.bridge, playoutHostOf(typed)));
            }}
          >
            {`Use ${lastUsedFields.port === '' ? lastUsedFields.host : `${lastUsedFields.host}:${lastUsedFields.port}`} (last used)`}
          </Button>
        </div>
      )}
      {/*
        🔴 T1 — an open edit's actions: CHECK (a test, saves nothing) and, once a field says something other
        than the station as it is, CONNECT beside the fact that it is not connected yet.
      */}
      {editing && (
        <div style={styles.row}>
          <Button
            variant="secondary"
            disabled={typed === null || busy !== null}
            onClick={() => void check('press')}
          >
            {busy === 'checking' ? 'Checking…' : 'Check'}
          </Button>
          {changed && canWrite && (
            <Button
              variant="primary"
              disabled={busy !== null || typed === null || bridgeTyped === null}
              onClick={() => void connect()}
            >
              {busy === 'connecting' ? 'Connecting…' : 'Connect'}
            </Button>
          )}
          {changed && (
            <Tag className="cg-setup-card-tag" data-not-connected="">
              Not connected yet
            </Tag>
          )}
        </div>
      )}
      {lines !== null &&
        (grouped ? (
          <ConnectionCheckList
            grouped
            actions={lineActions}
            lines={orderCheckLines([
              ...lines,
              ...extraLines,
              // `CHECK-RERUN-01` — a running check starts clean: the console's lines too.
              ...consoleCheckLines({
                // 🔴 `B-317` — where the CHECK found CG Bridge, never the socket this console is on.
                bridgeAddress: ranAt?.address ?? null,
                bridgeSilent: ranAt?.kind === 'silent',
                separateServer: ranAt !== null && onSeparateServer(ranAt.address, ranAt.playout),
                bridgeProblems: ranAt?.kind === 'answered' ? ranAt.problems : [],
                ...(ranAt?.kind === 'answered' && ranAt.version !== undefined
                  ? { bridgeVersion: ranAt.version }
                  : ranAt?.kind === 'pending' && capabilities?.bridgeVersion !== undefined
                    ? { bridgeVersion: capabilities.bridgeVersion }
                    : {}),
                consoleVersion: APP_VERSION,
                auth,
                // `RELEASE-0112-01` (`R-085`) — the backup engine's line, beside the primary's.
                backupEngine: engines?.backup ?? null,
              }).map((line) =>
                busy === 'checking'
                  ? { ...line, status: 'checking' as const, text: consoleSubject(line.id) }
                  : line,
              ),
            ])}
          />
        ) : (
          <ConnectionCheckList lines={lineFilter === undefined ? lines : lineFilter(lines)} />
        ))}
      {/* 🔴 `R-091` — nothing answered, and CG Bridge's address is THIS machine: why, and the one step. */}
      {ranAt?.kind === 'silent' && canWrite && (
        <LocalBridgeHelp
          key={ranAt.address}
          host={hostPart(ranAt.address)}
          address={ranAt.address}
          onFixed={() => void check('press')}
        />
      )}
      {error !== null && (
        <div style={styles.error} role="status">
          {error}
        </div>
      )}
    </div>
  );
}
