import { useEffect, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';

/**
 * Run `export.preflight` whenever the scene changes (debounced 200ms)
 * and expose the resulting issue list. The 200ms debounce keeps
 * keystroke-driven edits from flooding the IPC pipe — preflight is a
 * pure function but the round-trip is still a few ms.
 */
export function useIssues(scene: Scene | null): readonly ExportIssue[] {
  const [issues, setIssues] = useState<readonly ExportIssue[]>([]);

  useEffect(() => {
    if (scene === null) {
      setIssues([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void window.cg.export.preflight({ scene }).then((res) => {
        if (!cancelled) setIssues(res.issues);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [scene]);

  return issues;
}
