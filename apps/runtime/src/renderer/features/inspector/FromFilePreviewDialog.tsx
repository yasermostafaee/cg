import { useFeedbackText, useUiText } from '../../i18n/locale.js';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { FieldValue, ListItemField, StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { SelectInput } from '../../ui/SelectInput.js';
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
  structuredRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(6rem, 0.35fr) minmax(0, 1fr)',
    gap: '0.25rem 0.65rem',
    margin: 0,
  },
  term: { color: colors.textMuted, overflowWrap: 'anywhere' as const },
  value: { margin: 0, overflowWrap: 'anywhere' as const },
} as const;

function ParsedValue({ value }: { value: FieldValue }): JSX.Element {
  if (Array.isArray(value)) {
    const structured = value.some((entry) =>
      Object.keys(entry).some((key) => key !== 'id' && key !== 'text'),
    );
    return (
      <ol style={styles.list} data-file-preview-fields="">
        {value.map((entry, index) =>
          structured ? (
            <li key={`${String(index)}:${entry.id}`}>
              <dl style={styles.structuredRow}>
                {Object.entries(entry)
                  .filter(([key]) => key !== 'id')
                  .map(([key, cell]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <dt style={styles.term}>{key}</dt>
                      <dd style={styles.value}>
                        {typeof cell === 'object' && cell !== null
                          ? JSON.stringify(cell)
                          : String(cell ?? '')}
                      </dd>
                    </div>
                  ))}
              </dl>
            </li>
          ) : (
            <li key={`${String(index)}:${entry.id}`}>{itemText(entry)}</li>
          ),
        )}
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
  itemFields,
}: {
  open: boolean;
  onClose: () => void;
  item: StackItemState;
  path: FieldPath;
  kind: FromFileFieldKind;
  fieldId: string;
  lockFile: boolean;
  itemFields?: readonly ListItemField[] | undefined;
}): JSX.Element | null {
  const localizeUi = useUiText();
  const localizeFeedback = useFeedbackText();
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

  let parsed: FieldValue | null = null;
  let parseError: string | null = null;
  if (content !== null) {
    try {
      parsed = contentToFieldValue(content, kind, {
        split: state.split,
        delimiter: state.delimiter,
        format: state.format,
        ...(kind === 'list' && itemFields !== undefined ? { itemFields } : {}),
      });
    } catch (reason) {
      parseError = reason instanceof Error ? reason.message : String(reason);
    }
  }
  const delimiters = listDelimiters();
  const modalError = error ?? parseError;

  return (
    <Modal
      title={localizeUi('File content and fields')}
      ariaLabel={localizeUi('File content and fields · {field}', { field: fieldId })}
      size="wide"
      frame="fixed"
      onClose={onClose}
      {...(modalError === null
        ? {}
        : {
            message: {
              role: 'refusal' as const,
              text: localizeFeedback(
                error === null ? 'The file data is not valid.' : 'Could not read the file.',
              ),
              detail: modalError,
            },
          })}
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          {localizeUi('Done')}
        </ModalAction>
      }
    >
      <div style={styles.toolbar}>
        <div style={styles.file}>
          <span>{localizeUi('Selected file')}</span>
          <strong style={styles.fileName}>{state.source.name.split(/[\\/]/).at(-1)}</strong>
          <span>{localizeUi('File path')}</span>
          <code style={styles.filePath}>{state.source.displayPath ?? state.source.name}</code>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void readPreview()}>
          {loading ? localizeUi('Loading…') : localizeUi('Reload preview')}
        </Button>
      </div>

      {kind === 'list' && lockFile && (
        <div style={styles.split}>
          <span>{state.format === 'text' ? localizeUi('Delimiter') : localizeUi('Format')}</span>
          <Tag
            className="cg-file-chip cg-file-chip--content-sized"
            aria-label={
              state.format === 'text'
                ? localizeUi('{field} locked delimiter', { field: fieldId })
                : localizeUi('{field} locked file format', { field: fieldId })
            }
            title={
              state.format === 'text'
                ? state.split
                  ? state.delimiter
                  : localizeUi('Whole file')
                : state.format
            }
          >
            {state.format === 'text'
              ? state.split
                ? (delimiters.find((entry) => entry.value === state.delimiter)?.label ??
                  state.delimiter)
                : localizeUi('Whole file')
              : state.format.toUpperCase()}
          </Tag>
        </div>
      )}

      {kind === 'list' && !lockFile && (
        <div style={styles.split}>
          <span>{localizeUi('File format')}</span>
          <div className="cg-form" style={styles.splitControls}>
            <SelectInput
              className="cg-file-preview__delimiter"
              value={state.format}
              onChange={(event) =>
                updateSplitConfig(item.itemId, path, {
                  format: event.target.value as 'text' | 'json' | 'csv',
                })
              }
              aria-label={localizeUi('{field} file format', { field: fieldId })}
            >
              <option value="text">{localizeUi('Text / delimiter')}</option>
              <option value="json">{localizeUi('JSON rows')}</option>
              <option value="csv">{localizeUi('CSV rows')}</option>
            </SelectInput>
            {state.format === 'text' && (
              <label>
                <Checkbox
                  checked={state.split}
                  onChange={(checked) => updateSplitConfig(item.itemId, path, { split: checked })}
                  aria-label={localizeUi('Split {field} into items', { field: fieldId })}
                />{' '}
                {localizeUi('Split file')}
              </label>
            )}
            {state.format === 'text' && state.split && (
              <SelectInput
                className="cg-file-preview__delimiter"
                value={state.delimiter}
                onChange={(event) =>
                  updateSplitConfig(item.itemId, path, { delimiter: event.target.value })
                }
                aria-label={localizeUi('{field} split delimiter', { field: fieldId })}
              >
                {delimiters.every((entry) => entry.value !== state.delimiter) && (
                  <option value={state.delimiter}>
                    {state.delimiter} {localizeUi('(in use)')}
                  </option>
                )}
                {delimiters.map((entry) => (
                  <option key={entry.id} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </div>
          {state.format === 'text' ? (
            <ManageDelimitersButton
              onOpen={() => {
                onClose();
                openStationSetup('delimiters');
              }}
            />
          ) : (
            <span />
          )}
        </div>
      )}

      <div style={styles.columns}>
        <section style={styles.pane} aria-label={localizeUi('File content')}>
          <h3 style={styles.heading}>{localizeUi('File content')}</h3>
          <pre style={styles.pre} data-file-preview-content="">
            {content ?? (loading ? localizeUi('Loading…') : '')}
          </pre>
        </section>
        <section style={styles.pane} aria-label={localizeUi('Parsed fields')}>
          <h3 style={styles.heading}>{localizeUi('Parsed fields')}</h3>
          {parsed === null ? (
            <p style={styles.loadingText}>
              {parseError === null ? localizeUi('Loading…') : localizeUi('No valid rows.')}
            </p>
          ) : (
            <ParsedValue value={parsed} />
          )}
        </section>
      </div>
    </Modal>
  );
}
