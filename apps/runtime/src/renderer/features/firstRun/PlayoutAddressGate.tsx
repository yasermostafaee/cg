import { useState } from 'react';
import { NOT_A_BRIDGE_ADDRESS, NOT_A_PLAYOUT_ADDRESS } from '@cg/shared-ipc';
import type { SetupCheckAnswer } from '../../../shared/runtime-bridge.js';
import {
  DIRECT_CASPAR_MODE_LABEL,
  STANDALONE_BRIDGE_ADDRESS_ERROR,
  type PlayoutStationAddress,
  type StandaloneStationAddress,
  type StationAddress,
} from '../../../shared/station-address.js';
import { cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { SignInCard } from '../../ui/SignInCard.js';
import { StationAddressFields } from './StationAddressFields.js';
import {
  NO_HOST_PORT,
  bridgeAddressOf,
  playoutAddressOf,
  playoutHostOf,
  standaloneBridgeAddressOf,
  type StationFields,
} from './stationFields.js';

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
 * 🔴 `SERVERS-SIMPLIFY-01` (T1, T5) — **THE SAME FIELDS AS THE CONNECTION CARD** (`StationAddressFields`):
 * each address a `Host` and a `Port`, every default a placeholder, a whole address pasted into a `Host`
 * filling both. One set of fields and one rule (`stationFields.ts`), never two copies.
 *
 * ⚠ A PAGE, NOT AN OVERLAY. `main.tsx` renders this INSTEAD of the app — there is nothing behind it
 * to cover or to dismiss to — so it is laid out in the page's own flow, full height, and hand-rolls
 * no full-window scrim (`modalMessageRegion.dom.test.ts` allows two, the two gates over the app).
 */
const styles = {
  // A message is ATTENTION, never red (`design.md` §29).
  error: {
    color: cssVars['--r-caution-text'],
    fontSize: cssVars['--r-text-sm'],
    minHeight: '1.25rem',
    margin: '6px 0 0',
  },
} as const;

/** What the gate saves: this console's station record. */
export type GateStation = StationAddress;

export function PlayoutAddressGate({
  save,
  answers = () => Promise.resolve(null),
  checkStandalone,
  reload = () => globalThis.location.reload(),
}: {
  /** Save this console's station record; `false` when the store refused (`main.tsx` hands it in). */
  save: (station: GateStation) => boolean;
  /**
   * 🔴 `B-317` — does CG Bridge answer where this record would send the console? `null` — it does;
   * else the sentence that says where nothing answered (`main.tsx` hands in the platform's).
   */
  answers?: (station: PlayoutStationAddress) => Promise<string | null>;
  /** Only the installed app can verify and select an explicit local No Playout service. */
  checkStandalone?: ((station: StandaloneStationAddress) => Promise<SetupCheckAnswer>) | undefined;
  /** Start the console again once the address is saved (a test passes its own). */
  reload?: () => void;
}): JSX.Element {
  const [fields, setFields] = useState<StationFields>({
    playout: NO_HOST_PORT,
    bridge: NO_HOST_PORT,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [localBridge, setLocalBridge] = useState(NO_HOST_PORT);
  const [checkedOfflineAddress, setCheckedOfflineAddress] = useState<string | null>(null);
  const nothingTyped = !standalone && fields.playout.host.trim() === '';

  const finish = (station: GateStation): void => {
    if (!save(station)) {
      setError(
        'mode' in station
          ? 'This console could not save the CG Bridge address.'
          : 'This console could not save the Playout address.',
      );
      return;
    }
    reload();
  };

  const connect = async (): Promise<void> => {
    if (busy) return;
    if (standalone && checkStandalone !== undefined) {
      const bridgeAddress = standaloneBridgeAddressOf(localBridge);
      if (bridgeAddress === null) {
        setError(STANDALONE_BRIDGE_ADDRESS_ERROR);
        return;
      }
      const station: StandaloneStationAddress = { mode: 'standalone', bridgeAddress };
      if (checkedOfflineAddress === bridgeAddress) {
        finish(station);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await checkStandalone(station);
        const amcp = result.lines.find((line) => line.id === 'amcp');
        if (amcp === undefined) {
          setError('CG Bridge did not report a CasparCG A connection check.');
        } else if (amcp.status === 'pass') {
          finish(station);
        } else {
          setCheckedOfflineAddress(bridgeAddress);
          setError(`${amcp.text} You can correct the CasparCG A address in Settings → Connection.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    const playoutAddress = playoutAddressOf(fields.playout);
    if (playoutAddress === null) {
      setError(NOT_A_PLAYOUT_ADDRESS);
      return;
    }
    const bridgeAddress = bridgeAddressOf(fields.bridge, playoutHostOf(playoutAddress));
    if (bridgeAddress === null) {
      setError(NOT_A_BRIDGE_ADDRESS);
      return;
    }
    const station = { playoutAddress, ...(bridgeAddress === '' ? {} : { bridgeAddress }) };
    /*
      🔴 `B-317` — Connect only where CG Bridge ANSWERS. The owner's typed `192.168.111` was saved as it
      came (the URL parser reads it `192.168.0.111`) and left him in a NOT CONNECTED; the sentence below
      names the address the console would have dialled, so a typo shows where it sends him.
    */
    setBusy(true);
    setError(null);
    const silent = await answers(station).catch((err: unknown) =>
      err instanceof Error ? err.message : String(err),
    );
    setBusy(false);
    if (silent !== null) {
      setError(silent);
      return;
    }
    finish(station);
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
        <Button variant="primary" disabled={nothingTyped || busy} onClick={() => void connect()}>
          {busy
            ? 'Connecting…'
            : checkedOfflineAddress === null
              ? 'Connect'
              : 'Continue to CG Control'}
        </Button>
      }
    >
      {checkStandalone !== undefined && (
        <label className="cg-setup-field">
          <span className="cg-setup-field__label">Station mode</span>
          <select
            className="cg-field"
            aria-describedby={standalone ? 'cg-direct-caspar-hint' : undefined}
            disabled={busy}
            value={standalone ? 'standalone' : 'playout'}
            onChange={(event) => {
              setStandalone(event.target.value === 'standalone');
              setCheckedOfflineAddress(null);
              setError(null);
            }}
          >
            <option value="playout">APASAI Playout</option>
            <option value="standalone">{DIRECT_CASPAR_MODE_LABEL}</option>
          </select>
        </label>
      )}
      {standalone && (
        <p id="cg-direct-caspar-hint" className="cg-setup-field__hint">
          Uses CG Bridge on this computer to reach CasparCG without APASAI Playout. Choose the same
          mode in CG Bridge Setup. Tested with CasparCG 2.5.0 Stable.
        </p>
      )}
      {/*
          🔴 `R-080` — **EMPTY IS THE ANSWER FOR MOST STATIONS, AND THE FIELDS SAY SO.** The owner's run of
          `0.10.0` (2026-09-30): nothing told him CG Bridge's address may be left empty — CG Bridge is found
          on the Playout's host, port 5280, by itself. The placeholders say it (the Playout's host once it is
          typed, `5280`), and ONE hint line (`CONSOLE-POLISH-01` §5) says when to type anything.
        */}
      <StationAddressFields
        value={standalone ? { ...fields, bridge: localBridge } : fields}
        onChange={(next) => {
          if (standalone) setLocalBridge(next.bridge);
          else setFields(next);
          setCheckedOfflineAddress(null);
          setError(null);
        }}
        standalone={standalone}
        disabled={standalone && busy}
        hint={!standalone}
        statusId="cg-playout-address-error"
        onEnter={() => {
          if (!nothingTyped) void connect();
        }}
      />
      <div id="cg-playout-address-error" style={styles.error} role="status">
        {error}
      </div>
    </SignInCard>
  );
}
