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
        if (cancelled) return;
        // preflight always returns a fresh array; only commit (and re-render)
        // when the issue list actually differs from what we already hold.
        setIssues((prev) => (sameIssues(prev, res.issues) ? prev : res.issues));
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [scene]);

  return issues;
}

/**
 * Structural equality for two issue lists. Both come from the same preflight
 * producer (stable field order), the lists are tiny, and the objects are plain
 * data, so a serialise-and-compare is correct and cheap here.
 */
function sameIssues(a: readonly ExportIssue[], b: readonly ExportIssue[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
