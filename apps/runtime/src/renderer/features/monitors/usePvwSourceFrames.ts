import { useEffect, useMemo, useRef, useState } from 'react';
import type { SourcePreviewFrame } from '@cg/shared-ipc';
import { uuid } from '../../lib/uuid.js';

export type PvwSourceFrame = SourcePreviewFrame;

const EMPTY_FRAMES: ReadonlyMap<string, PvwSourceFrame> = new Map();
const POLL_MS = 500;
const EXPIRE_MS = 2500;

export function usePvwSourceFrames(
  channel: number | undefined,
  visibleSources: readonly string[],
  enabled = true,
): ReadonlyMap<string, PvwSourceFrame> {
  const [viewId] = useState(uuid);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sourceKey = JSON.stringify([...new Set(visibleSources)].slice(0, 4).sort());
  const scope = useMemo(
    () => ({ channel, sourceIds: JSON.parse(sourceKey) as string[] }),
    [channel, sourceKey],
  );
  const [snapshot, setSnapshot] = useState<{
    scope: typeof scope;
    frames: ReadonlyMap<string, PvwSourceFrame>;
  }>();

  useEffect(() => {
    const { channel, sourceIds } = scope;
    const pvw = window.cg?.sourcePreviews?.pvw;
    if (!enabled || pvw === undefined || channel === undefined || sourceIds.length === 0) return;
    const requested = new Set(sourceIds);
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;

    function poll(): void {
      if (pvw === undefined || channel === undefined) return;
      // Finish old reads and their release before publishing a new set on the same view.
      queue.current = queue.current.then(async () => {
        if (closed) return;
        try {
          const { frames } = await pvw({ channel, viewId, sourceIds });
          if (!closed) {
            clearTimeout(expiry);
            setSnapshot({
              scope,
              frames: new Map(
                frames.filter((f) => requested.has(f.sourceId)).map((f) => [f.sourceId, f]),
              ),
            });
            expiry = setTimeout(() => setSnapshot({ scope, frames: EMPTY_FRAMES }), EXPIRE_MS);
          }
        } catch {
          if (!closed) setSnapshot({ scope, frames: EMPTY_FRAMES });
        }
        if (!closed) timer = setTimeout(poll, POLL_MS);
      });
    }

    poll();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(expiry);
      queue.current = queue.current.then(async () => {
        await pvw({ channel, viewId, sourceIds: [] }).catch(() => undefined);
      });
    };
  }, [enabled, scope, viewId]);

  // Hiding the pane releases its stream without discarding the last picture for the same scope.
  return snapshot?.scope === scope ? snapshot.frames : EMPTY_FRAMES;
}
