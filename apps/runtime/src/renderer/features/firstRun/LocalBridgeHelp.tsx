import { useEffect, useRef, useState } from 'react';
import { cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import type { LocalBridgeOutcome, LocalBridgeState } from '../../../shared/runtime-bridge.js';

/**
 * 🔴 `R-091` (`RELEASE-0114-01` A5) — **CG BRIDGE ON THIS MACHINE, AND NOT ANSWERING: said, and the one
 * step offered.** Shown under Set up's check when the CG Bridge address is this machine and nothing
 * answered there. Words, and an app step — never a PowerShell line: `Start CG Bridge` asks Windows for
 * administrator rights itself; `Free the port` is offered ONLY for a holder of ours (an older CG Bridge, a
 * CG Control `0.9.x` sidecar), and the shell checks that again before it stops anything.
 *
 * Labels, values and state facts only (the design system's rule for an operator surface).
 */

export interface LocalBridgeLine {
  readonly text: string;
  /** The one step this state offers, or none. */
  readonly offer:
    | { readonly action: 'start' }
    | { readonly action: 'free'; readonly pid: number }
    | null;
}

/** 🔴 `R-091` — what to say about CG Bridge on this machine, and what to offer. `null` — nothing. */
export function localBridgeLine(
  state: LocalBridgeState | null,
  address: string,
): LocalBridgeLine | null {
  if (state === null || state.kind === 'elsewhere') return null;
  const { service, holder } = state;
  if (holder !== null && service !== 'running') {
    return {
      text: `TCP 5280 here is held by ${holder.name} (PID ${String(holder.pid)}).`,
      offer: holder.ours ? { action: 'free', pid: holder.pid } : null,
    };
  }
  switch (service) {
    case 'not-installed':
      return { text: 'CG Bridge is not installed here.', offer: null };
    case 'stopped':
    case 'stopping':
      return { text: 'CG Bridge is installed here but not running.', offer: { action: 'start' } };
    case 'starting':
      return { text: 'CG Bridge is starting here.', offer: null };
    case 'running':
      return { text: `CG Bridge is running here and does not answer at ${address}.`, offer: null };
    case 'unknown':
      return null;
  }
}

/** 🔴 `R-091` — one step's outcome, in words; `null` when it worked (the check runs again). */
export function outcomeLine(outcome: LocalBridgeOutcome): string | null {
  switch (outcome.kind) {
    case 'done':
      return null;
    case 'declined':
      return 'Administrator rights were declined. Nothing was changed.';
    case 'refused':
      return outcome.code === 5
        ? 'That program is not CG Bridge. Nothing was stopped.'
        : outcome.code === 2
          ? 'CG Bridge is not installed here.'
          : 'CG Bridge did not start.';
    case 'failed':
      return outcome.reason;
  }
}

const styles = {
  column: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  line: { fontSize: cssVars['--r-text-sm'], color: cssVars['--r-caution-text'], lineHeight: 1.6 },
} as const;

export function LocalBridgeHelp({
  host,
  address,
  onFixed,
}: {
  /** The CG Bridge host the check resolved to. */
  host: string;
  /** `host:port`, as the not-answering line names it. */
  address: string;
  /** A step worked: the check runs again. */
  onFixed: () => void;
}): JSX.Element | null {
  const [state, setState] = useState<LocalBridgeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const alive = useRef(true);

  const read = async (): Promise<void> => {
    const next = await window.cg.setup.localBridgeState(host).catch(() => null);
    if (alive.current) setState(next);
  };

  useEffect(() => {
    alive.current = true;
    void read();
    return () => {
      alive.current = false;
    };
  }, [host]);

  const line = localBridgeLine(state, address);
  if (line === null) return null;

  const act = async (offer: NonNullable<LocalBridgeLine['offer']>): Promise<void> => {
    setBusy(true);
    setSaid(null);
    const outcome = await window.cg.setup.localBridgeAct(
      offer.action,
      offer.action === 'free' ? offer.pid : undefined,
    );
    if (!alive.current) return;
    setBusy(false);
    const words = outcomeLine(outcome);
    setSaid(words);
    await read();
    if (words === null) onFixed();
  };

  return (
    <div style={styles.column} data-local-bridge={state?.kind === 'here' ? state.service : ''}>
      <div style={styles.line} role="status">
        {line.text}
      </div>
      {line.offer !== null && (
        <div style={styles.row}>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              if (line.offer !== null) void act(line.offer);
            }}
          >
            {line.offer.action === 'start' ? 'Start CG Bridge' : 'Free the port'}
          </Button>
        </div>
      )}
      {said !== null && (
        <div style={styles.line} role="status" data-local-bridge-outcome="">
          {said}
        </div>
      )}
    </div>
  );
}
