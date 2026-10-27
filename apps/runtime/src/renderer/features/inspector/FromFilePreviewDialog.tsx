import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { FieldValue, StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Tag } from '../../ui/Tag.js';
import type { FieldPath } from './draftStore.js';
import { delimitersVersion, listDelimiters, subscribeDelimiters } from './delimiterStore.js';
import { ManageDelimitersButton } from './DelimitersSection.js';
import { openStationSetup } from '../stationSetup/stationSetupStore.js';
import { contentToFieldValue, type FromFileFieldKind } from './fromFileContent.js';
import { itemText } from './listField.js';
import {
  fromFileState,
  fromFileVersion,
  subscribeFromFile,
  updateSplitConfig,
} from './fromFileStore.js';

const styles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '0.8rem',
    flexWrap: 'wrap' as const,
  },
  file: {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    alignItems: 'baseline',
    gap: '0.35rem 0.75rem',
    fontSize: '0.8rem',
    color: colors.textMuted,
  },
  fileName: { display: 'block', color: colors.text, overflowWrap: 'anywhere' as const },
  filePath: {
    color: colors.text,
    fontFamily: 'inherit',
    direction: 'ltr' as const,
    textAlign: 'start' as const,
    overflowWrap: 'anywhere' as const,
  },
  split: {
    display: 'grid',
    gridTemplateColumns: '7.5rem minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.8rem',
  },
  splitControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  },
  loadingText: { margin: 0, color: colors.textMuted },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '0.75rem',
    minHeight: '24rem',
    flex: '1 1 auto',
  },
  pane: {
    minWidth: 0,
    minHeight: '24rem',
    height: '100%',
    overflow: 'auto',
    border: `1px solid ${colors.border}`,
    borderRadius: '0.45rem',
    background: colors.panelMuted,
    padding: '0.8rem',
  },
  heading: {
    margin: '0 0 0.65rem',
    fontSize: '0.75rem',
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  pre: {
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
    fontFamily: 'inherit',
    lineHeight: 1.55,
  },
  list: { margin: 0, paddingInlineStart: '1.8rem', display: 'grid', gap: '0.35rem' },
} as const;

function ParsedValue({ value }: { value: FieldValue }): JSX.Element {
  if (Array.isArray(value)) {
    return (
      <ol style={styles.list} data-file-preview-fields="">
        {value.map((entry, index) => (
          <li key={`${String(index)}:${entry.id}`}>{itemText(entry)}</li>
        ))}
      </ol>
    );
  }
  return (
    <pre style={styles.pre} data-file-preview-fields="">
      {String(value)}
    </pre>
  );
}

/**
 * R-102 follow-up — the potentially large file bytes and parsed values belong in
 * one bounded dialog, not in the Inspector's narrow field column. Reading here is
 * preview-only: Reload in the Inspector remains the explicit action that stages a
 * fresh value for Update.
 */
export function FromFilePreviewDialog({
  open,
  onClose,
  item,
  path,
  kind,
  fieldId,
  lockFile,
}: {
  open: boolean;
  onClose: () => void;
  item: StackItemState;
  path: FieldPath;
  kind: FromFileFieldKind;
  fieldId: string;
  lockFile: boolean;
}): JSX.Element | null {
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  useSyncExternalStore(subscribeDelimiters, delimitersVersion);
  const state = fromFileState(item.itemId, path);
  const source = state?.source;
  const permission = state?.permission;
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const readPreview = useCallback(async (): Promise<void> => {
    if (source === undefined || permission !== 'granted') return;
    setLoading(true);
    setError(null);
    try {
      setContent(await source.read());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [permission, source]);

  useEffect(() => {
    if (!open) {
      setContent(null);
      setError(null);
      return;
    }
    void readPreview();
  }, [open, readPreview]);

  if (!open || state === undefined) return null;

  const parsed =
    content === null
      ? null
      : contentToFieldValue(content, kind, {
          split: state.split,
          delimiter: state.delimiter,
        });
  const delimiters = listDelimiters();

  return (
    <Modal
      title="File content and fields"
      ariaLabel={`File content and fields · ${fieldId}`}
      size="wide"
      frame="fixed"
      onClose={onClose}
      {...(error === null
        ? {}
        : {
            message: { role: 'refusal' as const, text: 'Could not read the file.', detail: error },
          })}
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          Done
        </ModalAction>
      }
    >
      <div style={styles.toolbar}>
        <div style={styles.file}>
          <span>Selected file</span>
          <strong style={styles.fileName}>{state.source.name.split(/[\\/]/).at(-1)}</strong>
          <span>File path</span>
          <code style={styles.filePath}>{state.source.displayPath ?? state.source.name}</code>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void readPreview()}>
          {loading ? 'Loading…' : 'Reload preview'}
        </Button>
      </div>

      {kind === 'list' && lockFile && (
        <div style={styles.split}>
          <span>Delimiter</span>
          <Tag
            className="cg-file-chip"
            aria-label={`${fieldId} locked delimiter`}
            title={state.split ? state.delimiter : 'Whole file'}
          >
            {state.split
              ? (delimiters.find((entry) => entry.value === state.delimiter)?.label ??
                state.delimiter)
              : 'Whole file'}
          </Tag>
        </div>
      )}

      {kind === 'list' && !lockFile && (
        <div style={styles.split}>
          <span>Delimiter</span>
          <div style={styles.splitControls}>
            <label>
              <Checkbox
                checked={state.split}
                onChange={(checked) => updateSplitConfig(item.itemId, path, { split: checked })}
                aria-label={`Split ${fieldId} into items`}
              />{' '}
              Split file
            </label>
            {state.split && (
              <select
                className="cg-field cg-file-preview__delimiter"
                value={state.delimiter}
                onChange={(event) =>
                  updateSplitConfig(item.itemId, path, { delimiter: event.target.value })
                }
                aria-label={`${fieldId} split delimiter`}
              >
                {delimiters.every((entry) => entry.value !== state.delimiter) && (
                  <option value={state.delimiter}>{state.delimiter} (in use)</option>
                )}
                {delimiters.map((entry) => (
                  <option key={entry.id} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <ManageDelimitersButton
            onOpen={() => {
              onClose();
              openStationSetup('delimiters');
            }}
          />
        </div>
      )}

      <div style={styles.columns}>
        <section style={styles.pane} aria-label="File content">
          <h3 style={styles.heading}>File content</h3>
          <pre style={styles.pre} data-file-preview-content="">
            {content ?? (loading ? 'Loading…' : '')}
          </pre>
        </section>
        <section style={styles.pane} aria-label="Parsed fields">
          <h3 style={styles.heading}>Parsed fields</h3>
          {parsed === null ? (
            <p style={styles.loadingText}>Loading…</p>
          ) : (
            <ParsedValue value={parsed} />
          )}
        </section>
      </div>
    </Modal>
  );
}
