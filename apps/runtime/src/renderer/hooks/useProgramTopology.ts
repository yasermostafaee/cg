import { useEffect, useMemo, useState } from 'react';
import type { PgmTopology } from '@cg/shared-ipc';
import { useBridgeReadable } from './useBridgeSnapshot.js';

const POLL_MS = 5_000;

/** Undefined means waiting for the bridge; null means the channel uses legacy mapping. */
export function useProgramTopology(channel: number | null): PgmTopology | null | undefined {
  const read = window.cg.pgmReturn.topology;
  const readable = useBridgeReadable();
  const request = useMemo(
    () => (channel !== null && read !== undefined && readable ? { channel, read } : null),
    [channel, read, readable],
  );
  const [result, setResult] = useState<{
    request: NonNullable<typeof request>;
    topology: PgmTopology | null;
  }>();

  useEffect(() => {
    if (request === null) return;
    const { channel, read } = request;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const topology = await read(channel);
        if (current && (topology === null || topology.channel === channel)) {
          setResult({ request, topology });
        }
      } catch {
        if (current) {
          setResult((previous) => {
            if (previous?.request !== request || previous.topology === null) return previous;
            const { members } = previous.topology;
            return {
              request,
              topology: {
                channel,
                active: null,
                members: members.map((member) => ({ ...member, physicalChannel: null })),
              },
            };
          });
        }
      }
      if (current) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      current = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [request]);

  if (read === undefined || channel === null) return null;
  // A new request must answer before we can reuse a channel, even after A -> B -> A.
  return result?.request === request ? result.topology : undefined;
}
