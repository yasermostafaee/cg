import { useState } from 'react';
import {
  NOT_A_BRIDGE_ADDRESS,
  NOT_A_PLAYOUT_ADDRESS,
  normaliseBridgeAddress,
  normalisePlayoutAddress,
} from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { TextInput } from '../../ui/TextInput.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D8) — **CG CONTROL'S FIRST QUESTION: WHERE IS THE PLAYOUT?**
 *
 * CG Bridge is one service on the Playout machine, and a console finds it there — port 5280 on the
 * Playout's host — so the operator types only the Playout address, as before. Until this console
 * has one there is nowhere to connect, and this is the whole screen: the address, and Connect. It
 * connects to nothing itself; the address is saved (`cg.runtime.station.v1`) and the console starts
 * again, aimed at CG Bridge.
 *
 * Where CG Bridge runs on a SEPARATE server, its address goes in the second field (`host` or
 * `host:port`); left empty, CG Bridge is on the Playout's host. An admin changes either later in
 * Station setup, once the console is connected.
 *
 * It renders BEFORE the console has a bridge (`main.tsx`), so it cannot reach one: the one write it
 * makes — this console's station record — is handed in by `main.tsx`, the composition root, and
 * the renderer imports nothing of the platform (golden rule 1).
 *
 * Labels, fields, one action and one refusal line: the design system's rule for an operator
 * surface. `SignInOverlay`'s card, in the same tokens, so the two gates read as one kind of stop.
 *
 * ⚠ A PAGE, NOT AN OVERLAY. `main.tsx` renders this INSTEAD of the app — there is nothing behind it
 * to cover or to dismiss to — so it is laid out in the page's own flow, full height, and hand-rolls
 * no full-window scrim (`modalMessageRegion.dom.test.ts` allows two, the two gates over the app).
 */
const styles = {
  page: {
    minHeight: '100vh',
    background: colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.text,
  },
  card: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: cssVars['--r-radius-lg'],
    width: cssVars['--r-lock-card-w'],
    maxWidth: 'calc(100vw - 32px)',
    padding: cssVars['--r-lock-card-pad'],
    display: 'flex',
    flexDirection: 'column' as const,
  },
  title: {
    margin: '0 0 20px',
    fontSize: cssVars['--r-lock-title-fs'],
    fontWeight: 650,
    textAlign: 'center' as const,
  },
  label: {
    fontSize: cssVars['--r-text-sm'],
    fontWeight: 500,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  // The second field's label sits below the first field.
  labelAfter: {
    fontSize: cssVars['--r-text-sm'],
    fontWeight: 500,
    color: colors.textSecondary,
    margin: '14px 0 6px',
  },
  // A message is ATTENTION, never red (`design.md` §29).
  error: {
    color: cssVars['--r-caution-text'],
    fontSize: cssVars['--r-text-sm'],
    minHeight: '1.25rem',
    margin: '6px 0 14px',
  },
} as const;

/** What the gate saves: this console's station record. */
export interface GateStation {
  readonly playoutAddress: string;
  readonly bridgeAddress?: string;
}

export function PlayoutAddressGate({
  save,
  reload = () => globalThis.location.reload(),
}: {
  /** Save this console's station record; `false` when the store refused (`main.tsx` hands it in). */
  save: (station: GateStation) => boolean;
  /** Start the console again once the address is saved (a test passes its own). */
  reload?: () => void;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const [bridgeTyped, setBridgeTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const connect = (): void => {
    const playoutAddress = normalisePlayoutAddress(typed);
    if (playoutAddress === null) {
      setError(NOT_A_PLAYOUT_ADDRESS);
      return;
    }
    const bridgeAddress = normaliseBridgeAddress(bridgeTyped);
    if (bridgeAddress === null) {
      setError(NOT_A_BRIDGE_ADDRESS);
      return;
    }
    if (!save({ playoutAddress, ...(bridgeAddress === '' ? {} : { bridgeAddress }) })) {
      setError('This console could not save the Playout address.');
      return;
    }
    reload();
  };
  const onEnter = (e: { key: string }): void => {
    if (e.key === 'Enter' && typed.trim() !== '') connect();
  };

  return (
    <div style={styles.page} data-playout-address-gate="">
      <div style={styles.card} role="dialog" aria-label="Set up CG Control" aria-modal="true">
        <h2 style={styles.title}>Set up CG Control</h2>
        <label htmlFor="cg-playout-address" style={styles.label}>
          Playout address
        </label>
        <TextInput
          id="cg-playout-address"
          value={typed}
          onChange={(value) => {
            setTyped(value);
            setError(null);
          }}
          // An address is not prose: LTR is a statement about the CONTENT.
          dir="ltr"
          autoComplete="off"
          aria-label="Playout address"
          aria-describedby="cg-playout-address-error"
          onKeyDown={onEnter}
        />
        <label htmlFor="cg-bridge-address" style={styles.labelAfter}>
          CG Bridge address
        </label>
        <TextInput
          id="cg-bridge-address"
          value={bridgeTyped}
          onChange={(value) => {
            setBridgeTyped(value);
            setError(null);
          }}
          dir="ltr"
          autoComplete="off"
          aria-label="CG Bridge address"
          aria-describedby="cg-playout-address-error"
          onKeyDown={onEnter}
        />
        <div id="cg-playout-address-error" style={styles.error} role="status">
          {error}
        </div>
        <Button variant="primary" disabled={typed.trim() === ''} onClick={connect}>
          Connect
        </Button>
      </div>
    </div>
  );
}
