import { useEffect, useState } from 'react';
import type { ConnectionCheckLine } from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { TextInput } from '../../ui/TextInput.js';
import { ConnectionCheckList } from './ConnectionCheckList.js';
import { checkAllowsConnect, normalisePlayoutAddress } from './firstRunStation.js';

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
  error: { fontSize: cssVars['--r-text-sm'], color: colors.errorText, lineHeight: 1.6 },
} as const;

export function PlayoutConnection({
  origin,
  startEditing,
  mayChange,
  judgeNow = false,
  onJudged,
}: {
  /** The configured Playout's origin, or `null` when this station has none. */
  origin: string | null;
  startEditing: boolean;
  /** May this surface write the address? The desktop door must exist as well. */
  mayChange: boolean;
  /**
   * `DESKTOP-APPS-01-B` B2 — check again, on its own, when this turns true: first-run sets it once
   * the station admin has signed in, which is when the bridge starts JUDGING the AMCP line (before,
   * it is "waiting for sign-in").
   */
  judgeNow?: boolean;
  /** Told when a check that ran with {@link judgeNow} set has finished, whatever it found. */
  onJudged?: () => void;
}): JSX.Element {
  const canWrite = mayChange && window.cg.setup.canSetPlayoutAddress();
  const [editing, setEditing] = useState(startEditing);
  const [address, setAddress] = useState(origin ?? '');
  const [lines, setLines] = useState<readonly ConnectionCheckLine[] | null>(null);
  const [busy, setBusy] = useState<'checking' | 'connecting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typed = normalisePlayoutAddress(address);
  const check = async (): Promise<void> => {
    // After the sign-in the configured address is the one to judge, whatever the field holds.
    const target = judgeNow && origin !== null ? origin : editing ? typed : origin;
    if (target === null) {
      if (judgeNow) onJudged?.();
      return;
    }
    setBusy('checking');
    setError(null);
    try {
      const result = await window.cg.setup.check({
        playoutAddress: target,
        origin: window.location.origin,
      });
      setLines(result.lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (judgeNow) onJudged?.();
    }
  };
  useEffect(() => {
    if (judgeNow) void check();
    // Once per turn to true: the sign-in, not every render after it.
  }, [judgeNow]);
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
                if (e.key === 'Enter') void check();
              }}
            />
          </div>
          <Button
            variant="secondary"
            disabled={typed === null || busy !== null}
            onClick={() => void check()}
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
            onClick={() => void check()}
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
      {lines !== null && <ConnectionCheckList lines={lines} />}
      {editing && lines !== null && checkAllowsConnect(lines) && canWrite && (
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
