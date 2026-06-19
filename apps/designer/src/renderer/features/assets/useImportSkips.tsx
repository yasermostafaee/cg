import { useCallback, useEffect, useRef, useState } from 'react';
import { Callout } from '../../ui/Callout.js';
import { Control } from '../../ui/Control.js';
import * as s from './useImportSkips.css.js';

/**
 * B-021 — shared "skipped unsupported files" notice for the import panels.
 *
 * When the operator bypasses the picker's `accept` hint (via "All files") and selects
 * a pdf / mp3 / mp4, those files are rejected BEFORE store (no tile) and reported here
 * as a NON-BLOCKING notice — a {@link Callout} (`role="status"`), not a modal. `report`
 * replaces the list (so each import shows only its own skips; `[]` clears it) and a
 * fresh batch resets the auto-dismiss timer; the operator can also dismiss it manually.
 */
const AUTO_DISMISS_MS = 8000;

export function useImportSkips(): {
  skipped: readonly string[];
  report: (names: readonly string[]) => void;
  dismiss: () => void;
} {
  const [skipped, setSkipped] = useState<readonly string[]>([]);
  const timer = useRef(0);
  const report = useCallback((names: readonly string[]) => {
    window.clearTimeout(timer.current);
    setSkipped(names);
    if (names.length > 0) timer.current = window.setTimeout(() => setSkipped([]), AUTO_DISMISS_MS);
  }, []);
  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setSkipped([]);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { skipped, report, dismiss };
}

/** The notice itself — renders nothing when there is nothing to report. */
export function ImportSkipsNotice({
  skipped,
  onDismiss,
}: {
  skipped: readonly string[];
  onDismiss: () => void;
}): JSX.Element | null {
  if (skipped.length === 0) return null;
  return (
    <Callout variant="info" className={s.notice}>
      Skipped unsupported file{skipped.length > 1 ? 's' : ''}: {skipped.join(', ')}
      <Control variant="bare" className={s.dismiss} aria-label="Dismiss notice" onClick={onDismiss}>
        ×
      </Control>
    </Callout>
  );
}
