import { useState } from 'react';
import {
  NOT_A_BRIDGE_ADDRESS,
  NOT_A_PLAYOUT_ADDRESS,
  normaliseBridgeAddress,
  normalisePlayoutAddress,
} from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { SignInCard } from '../../ui/SignInCard.js';
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
  // `R-080` — the one hint line under the CG Bridge field: the muted ink, one line.
  hint: {
    fontSize: cssVars['--r-text-xs'],
    color: colors.textMuted,
    marginTop: 6,
  },
  // A message is ATTENTION, never red (`design.md` §29).
  error: {
    color: cssVars['--r-caution-text'],
    fontSize: cssVars['--r-text-sm'],
    minHeight: '1.25rem',
    margin: '6px 0 0',
  },
} as const;

/** `R-080` — the CG Bridge field while it is empty: nothing to type, it is found. */
export const BRIDGE_ADDRESS_PLACEHOLDER = 'Found automatically';
/** `R-080` — the field's one hint line (`CONSOLE-POLISH-01` §5, the owner's words). */
export const BRIDGE_ADDRESS_HINT = 'Leave empty unless CG Bridge runs on a separate server.';

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

  /*
    🔴 `R-082` — **ONE SIGN-IN LOOK** (`SignInCard`, as a PAGE): the splash's ground, the APASAI mark
    and the product name over the title, the version at the foot — the first thing CG Control shows
    after its splash, so the two read as one product.
  */
  return (
    <SignInCard
      label="Set up CG Control"
      ground="page"
      title="Set up"
      groundData={{ 'data-playout-address-gate': '' }}
      footer={
        <Button variant="primary" disabled={typed.trim() === ''} onClick={connect}>
          Connect
        </Button>
      }
    >
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
      {/*
          🔴 `R-080` — **EMPTY IS THE ANSWER FOR MOST STATIONS, AND THE FIELD SAYS SO.** The owner's run of
          `0.10.0` (2026-09-30): nothing told him this field may be left empty — CG Bridge is found on
          the Playout's host, port 5280, by itself. The placeholder says it, and ONE hint line (the
          owner's own allowance for a setup form, `CONSOLE-POLISH-01` §5) says when to type anything.
        */}
      <TextInput
        id="cg-bridge-address"
        value={bridgeTyped}
        onChange={(value) => {
          setBridgeTyped(value);
          setError(null);
        }}
        dir="ltr"
        autoComplete="off"
        placeholder={BRIDGE_ADDRESS_PLACEHOLDER}
        aria-label="CG Bridge address"
        aria-describedby="cg-bridge-address-hint cg-playout-address-error"
        onKeyDown={onEnter}
      />
      <div id="cg-bridge-address-hint" style={styles.hint} data-bridge-address-hint="">
        {BRIDGE_ADDRESS_HINT}
      </div>
      <div id="cg-playout-address-error" style={styles.error} role="status">
        {error}
      </div>
    </SignInCard>
  );
}
