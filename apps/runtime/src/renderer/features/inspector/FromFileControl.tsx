import { useSyncExternalStore } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { reportCommandError } from '../status/commandFeedback.js';
import type { FieldPath } from './draftStore.js';
import { splitDefaultFor } from './fieldTargetStore.js';
import {
  DEFAULT_DELIMITER,
  DELIMITER_SUGGESTIONS,
  type FromFileFieldKind,
} from './fromFileContent.js';
import { reloadFromFile, stageFromFile } from './fromFileOps.js';
import {
  attachFileSource,
  detachFileSource,
  fromFileState,
  fromFileVersion,
  subscribeFromFile,
  updateSplitConfig,
} from './fromFileStore.js';
import {
  FILE_SOURCE_UNSUPPORTED_MESSAGE,
  fileSourceSupported,
  pickTextFileSource,
} from './textFileSource.js';

const styles = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: '0.25rem', marginTop: '0.2rem' },
  row: { display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' as const },
  fileName: {
    fontSize: '0.75rem',
    color: colors.textMuted,
    overflowWrap: 'anywhere' as const,
    minWidth: 0,
  },
  hint: { fontSize: '0.72rem', color: colors.textMuted, margin: 0 },
  error: { fontSize: '0.75rem', color: colors.error, margin: 0 },
  splitLabel: {
    display: 'flex',
    gap: '0.3rem',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  delimiter: { width: '5rem' },
} as const;

/**
 * R-018 — the "from file" affordance under a text-carrying field (text /
 * multiline / list): pick a text file as the field's source, optionally split
 * list content on a delimiter, and manually RELOAD. Choosing/reloading feeds
 * the EXISTING field-update path (stage → `stack.update`) — the file is just
 * an input method, never a second content pipeline.
 *
 * Chromium-only by nature (File System Access API): elsewhere the button
 * renders disabled with the reason — a legible degrade, never a broken control.
 */
export function FromFileControl({
  item,
  path,
  kind,
  fieldId,
}: {
  item: StackItemState;
  path: FieldPath;
  kind: FromFileFieldKind;
  fieldId: string;
}): JSX.Element {
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  const state = fromFileState(item.itemId, path);
  const supported = fileSourceSupported();

  const choose = async (): Promise<void> => {
    let source;
    try {
      source = await pickTextFileSource();
    } catch (err) {
      reportCommandError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (source === null) return; // operator cancelled — not an error
    // The split default is per-TARGET (resolved from the scene's bindings at
    // import): a sequence's list splits into discrete items; a ticker — and any
    // unknown/ambiguous target — stays whole-text verbatim (Cinegy parity).
    attachFileSource(item.itemId, path, source, {
      split: kind === 'list' && splitDefaultFor(item.templateId, path),
      delimiter: DEFAULT_DELIMITER,
    });
    // Initial load STAGES like a hand edit; the operator applies with Update.
    await stageFromFile(item, path, kind);
  };

  if (state === undefined) {
    return (
      <div style={styles.wrap}>
        <div style={styles.row}>
          <Button
            variant="ghost"
            aria-label={`Load ${fieldId} from file`}
            disabled={!supported}
            title={supported ? undefined : FILE_SOURCE_UNSUPPORTED_MESSAGE}
            onClick={() => void choose()}
          >
            From file…
          </Button>
          {!supported && <p style={styles.hint}>{FILE_SOURCE_UNSUPPORTED_MESSAGE}</p>}
        </div>
      </div>
    );
  }

  // Datalist ids must be document-unique; derived from item+path, sanitized.
  const datalistId = `fromfile-delims-${`${item.itemId}-${path.join('-')}`.replace(/[^\w-]/g, '_')}`;
  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        <span style={styles.fileName} title={state.source.name}>
          {state.source.name}
        </span>
        {/* Reload re-reads and RE-APPLIES this field (the same stack.update path
            as Update, scoped to this field). Failures are toasted + shown in the
            inline error line below, so the button's own inline error is a
            duplicate — suppressed, the #334 pattern. */}
        <AsyncButton
          variant="secondary"
          aria-label={`Reload ${fieldId} from file`}
          run={() => reloadFromFile(item, path, kind)}
          onError={() => undefined}
        >
          Reload
        </AsyncButton>
        <Button
          variant="ghost"
          aria-label={`Detach ${fieldId} file source`}
          onClick={() => detachFileSource(item.itemId, path)}
        >
          ×
        </Button>
      </div>
      {kind === 'list' && (
        <div style={styles.row}>
          <label style={styles.splitLabel}>
            <input
              type="checkbox"
              checked={state.split}
              onChange={(e) => updateSplitConfig(item.itemId, path, { split: e.target.checked })}
              aria-label={`Split ${fieldId} into items`}
            />
            Split on delimiter
          </label>
          {state.split && (
            <>
              <input
                className="cg-field"
                style={styles.delimiter}
                type="text"
                value={state.delimiter}
                list={datalistId}
                onChange={(e) =>
                  updateSplitConfig(item.itemId, path, { delimiter: e.target.value })
                }
                aria-label={`${fieldId} split delimiter`}
                placeholder={DEFAULT_DELIMITER}
              />
              <datalist id={datalistId}>
                {DELIMITER_SUGGESTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </datalist>
            </>
          )}
        </div>
      )}
      {kind === 'list' && !state.split && (
        <p style={styles.hint}>Whole file becomes ONE item — separators render exactly as typed.</p>
      )}
      {state.error !== null && (
        <p style={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
