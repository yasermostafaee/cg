import { useState, type ReactNode } from 'react';
import type { SetupCheckAnswer, StandaloneSetup } from '../../../shared/runtime-bridge.js';
import { STANDALONE_BRIDGE_ADDRESS_ERROR } from '../../../shared/station-address.js';
import { cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { SetUpAgain } from '../shell/SetUpAgain.js';
import { ConnectionCheckList } from './ConnectionCheckList.js';
import { StationAddressFields } from './StationAddressFields.js';
import { type ShownCheckLine, inSetupWords } from './firstRunStation.js';
import { NO_HOST_PORT, standaloneBridgeAddressOf, type HostPort } from './stationFields.js';

const actionStyle = { display: 'flex', gap: cssVars['--r-space-2'], marginBlock: 8 } as const;

function checkLines(answer: SetupCheckAnswer): readonly ShownCheckLine[] {
  const bridge = answer.bridge;
  if (bridge === null) return answer.lines;
  const problem = bridge.problems[0];
  return [
    {
      id: 'bridge',
      status: problem === undefined ? 'pass' : 'fail',
      text: problem?.message ?? `CG Bridge answered at ${bridge.address}.`,
    },
    ...answer.lines,
  ];
}

export function StandaloneConnection({
  setup,
  fields,
  onFields,
  changed,
  extraLines,
  lineActions,
}: {
  setup: StandaloneSetup;
  fields: HostPort;
  onFields: (fields: HostPort) => void;
  changed: boolean;
  extraLines: readonly ShownCheckLine[];
  lineActions?: Readonly<Partial<Record<string, ReactNode>>> | undefined;
}): JSX.Element {
  const [lines, setLines] = useState<readonly ShownCheckLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'connect' | null>(null);
  const address = standaloneBridgeAddressOf(fields);
  const act = async (action: 'check' | 'connect'): Promise<void> => {
    if (busy !== null) return;
    if (address === null) {
      setError(STANDALONE_BRIDGE_ADDRESS_ERROR);
      return;
    }
    setBusy(action);
    setLines([]);
    setError(null);
    try {
      if (action === 'check') setLines(checkLines(await setup.check(address)));
      else await setup.connect(address);
    } catch (err) {
      setError(inSetupWords(err, address));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <StationAddressFields
        standalone
        value={{ playout: NO_HOST_PORT, bridge: fields }}
        onChange={({ bridge }) => {
          onFields(bridge);
          setLines([]);
          setError(null);
        }}
        disabled={busy !== null}
        onEnter={() => void act('check')}
        statusId="cg-standalone-connection-error"
      />
      <div style={actionStyle}>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void act('check')}>
          {busy === 'check' ? 'Checking…' : 'Check'}
        </Button>
        {changed && (
          <Button variant="primary" disabled={busy !== null} onClick={() => void act('connect')}>
            {busy === 'connect' ? 'Connecting…' : 'Connect'}
          </Button>
        )}
      </div>
      <div className="cg-setup-field__error" id="cg-standalone-connection-error" role="status">
        {error}
      </div>
      {(lines.length > 0 || extraLines.length > 0) && (
        <ConnectionCheckList
          grouped
          engineName="CasparCG"
          actions={lineActions}
          lines={[...lines, ...extraLines]}
        />
      )}
      <SetUpAgain />
    </>
  );
}
