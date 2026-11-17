import { useEffect, useState } from 'react';
import type { ConnectionConfig, FailoverInfo } from '@cg/shared-ipc';
import type { AuthSessionState } from '../../../shared/runtime-bridge.js';

const KEY = 'cg.runtime.failover.dismissed.v1';
type Dismissals = Record<string, string>;

function read(): Dismissals {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .slice(-64),
    );
  } catch {
    return {};
  }
}

/** One operator's acknowledgement on this configured station, across console restarts. */
export function useFailoverDismissal(
  event: FailoverInfo | undefined,
  config: ConnectionConfig | null,
  auth: AuthSessionState,
  signInUrl: string | null,
  bridgeAddress: string | null,
): { ready: boolean; dismissed: boolean; dismiss: () => void } {
  const [dismissals, setDismissals] = useState(read);
  useEffect(() => {
    const changed = (change: StorageEvent) => {
      if (change.key === KEY || change.key === null) setDismissals(read());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const actor =
    auth.kind === 'signed-in' ? auth.principal.sub : auth.kind === 'off' ? 'local' : null;
  const endpoint = (server: ConnectionConfig['servers']['A'] | undefined) =>
    server === undefined ? null : [server.host.toLowerCase(), server.amcpPort];
  const scope =
    config === null || actor === null
      ? null
      : JSON.stringify([
          bridgeAddress,
          signInUrl,
          endpoint(config.servers.A),
          endpoint(config.servers.B),
          actor,
        ]);
  const identity =
    event === undefined ? null : JSON.stringify([event.at, event.from, event.to, event.reason]);
  return {
    ready: scope !== null,
    dismissed: scope !== null && identity !== null && dismissals[scope] === identity,
    dismiss: () => {
      if (scope === null || identity === null) return;
      const next = Object.fromEntries(
        [...Object.entries(read()).filter(([key]) => key !== scope), [scope, identity]].slice(-64),
      );
      try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
      } catch {
        /* Keep the acknowledgement for this window when storage is unavailable. */
      }
      setDismissals(next);
    },
  };
}
