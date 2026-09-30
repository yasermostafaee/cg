import { useEffect, useState } from 'react';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 C — **WHY CG BRIDGE CANNOT BE REACHED, IN ONE CLAUSE.**
 *
 * CG Bridge is on another machine now, and a console that cannot reach it says so in one line —
 * "CG Bridge not reachable at `<host>:5280`" — with the reason. A browser cannot read why a
 * WebSocket failed, so the reason is read from a request that carries nothing: `/health` on the
 * same host and port (`no-cors` — any answer at all resolves it), and how it ended:
 *
 *   - refused at once   → nothing is listening on that port (CG Bridge is not running there);
 *   - no answer in 5 s  → the host does not answer (switched off, the wrong address, a firewall);
 *   - an answer         → something there answers, but not as CG Bridge (the socket still fails).
 *
 * Asked while the link is down, and again every 10 s; `null` until an answer is in, and whenever
 * the link is up.
 */

const PROBE_TIMEOUT_MS = 5_000;
/** A refusal comes back at once; a black hole takes the whole timeout. Anything under this is a refusal. */
const REFUSED_WITHIN_MS = 2_000;
const REPROBE_MS = 10_000;

export type Unreachable = 'refused' | 'silent' | 'not-cg-bridge';

export function unreachableReason(kind: Unreachable, hostPort: string): string {
  const host = hostPort.replace(/:\d+$/, '');
  const port = /:(\d+)$/.exec(hostPort)?.[1] ?? '5280';
  switch (kind) {
    case 'refused':
      return `nothing is listening on port ${port} there`;
    case 'silent':
      return `${host} does not answer (switched off, a wrong address, or a firewall)`;
    case 'not-cg-bridge':
      return 'something there answers, but not as CG Bridge';
  }
}

async function probe(hostPort: string): Promise<Unreachable> {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (f === undefined) return 'silent';
  const started = Date.now();
  try {
    await f(`http://${hostPort}/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return 'not-cg-bridge';
  } catch {
    return Date.now() - started < REFUSED_WITHIN_MS ? 'refused' : 'silent';
  }
}

/** The reason CG Bridge at `hostPort` cannot be reached, while `down`; `null` otherwise. */
export function useBridgeReachability(hostPort: string | null, down: boolean): Unreachable | null {
  const [reason, setReason] = useState<Unreachable | null>(null);
  useEffect(() => {
    setReason(null);
    if (!down || hostPort === null) return;
    let live = true;
    const ask = (): void => {
      void probe(hostPort).then((kind) => {
        if (live) setReason(kind);
      });
    };
    ask();
    const timer = setInterval(ask, REPROBE_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [hostPort, down]);
  return reason;
}
