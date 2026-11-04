import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { CircleCheck, TriangleAlert, Unplug } from 'lucide-react';
import {
  fileSourceContentToFieldValue,
  bridgeTextSourcePath,
  fieldUsesFileOnly,
  numberFieldAllowedValues,
  numberFieldValueError,
  numberFieldValueLabel,
  type CompositionFieldGroup,
  type DynamicField,
  type ListItem,
  type ListItemField,
  type StackItemState,
} from '@cg/shared-schema';
import {
  buildStructuredRowsXlsx,
  decodeStructuredText,
  structuredRowsXlsxToCsv,
} from '@cg/vcg-format';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Tag } from '../../ui/Tag.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { ListFieldEditor } from './ListFieldEditor.js';
import { toListItems } from './listField.js';
import { effectiveValue, stageFieldBatch, valueAt, type FieldPath } from './draftStore.js';
import {
  attachFileSource,
  claimAuthoredFileAutoLoad,
  detachFileSource,
  fromFileState,
  fromFileVersion,
  reconcileAuthoredFileSource,
  setFromFileError,
  setFromFilePermission,
  subscribeFromFile,
} from './fromFileStore.js';
import {
  FILE_SOURCE_NEEDS_PERMISSION_MESSAGE,
  FILE_SOURCE_UNSUPPORTED_MESSAGE,
  fileSourceSupported,
  requestReadPermission,
  type TextFileSource,
} from './textFileSource.js';
import { saveStructuredWorkbook, structuredWorkbookFilename } from './structuredWorkbook.js';

type ListField = Extract<DynamicField, { type: 'list' }>;

export interface SequenceRowsPageSet {
  readonly sequenceId: string;
  readonly sequenceName: string;
  readonly pages: readonly CompositionFieldGroup[];
  readonly field: ListField;
  readonly maxItems: number;
  readonly capacity: number;
}

function schemaSignature(field: ListField): string {
  return JSON.stringify({ id: field.id, maxItems: field.maxItems, itemFields: field.itemFields });
}

/** Find the exact Sequence shape that can safely be represented as one spreadsheet. */
export function sequenceRowsPageSets(
  groups: readonly CompositionFieldGroup[],
): SequenceRowsPageSet[] {
  const candidates = new Map<string, CompositionFieldGroup[]>();
  for (const group of groups) {
    const sequence = group.sequence;
    if (sequence === undefined) continue;
    const pages = candidates.get(sequence.id) ?? [];
    pages.push(group);
    candidates.set(sequence.id, pages);
  }

  const sets: SequenceRowsPageSet[] = [];
  for (const [sequenceId, unsorted] of candidates) {
    const pages = [...unsorted].sort(
      (a, b) => (a.labelParts?.item ?? 0) - (b.labelParts?.item ?? 0),
    );
    const first = pages[0];
    const aggregate = first?.aggregate;
    const field = aggregate?.fields[0];
    if (
      first === undefined ||
      aggregate === undefined ||
      aggregate.groups.length !== 0 ||
      aggregate.fields.length !== 1 ||
      field?.type !== 'list' ||
      field.maxItems === undefined ||
      field.maxItems <= 0 ||
      field.itemFields === undefined ||
      field.itemFields.length === 0
    ) {
      continue;
    }
    const signature = schemaSignature(field);
    if (
      !pages.every((page) => {
        const pageField = page.aggregate.fields[0];
        return (
          page.sequence?.id === sequenceId &&
          page.compositionId === first.compositionId &&
          page.aggregate.groups.length === 0 &&
          page.aggregate.fields.length === 1 &&
          pageField?.type === 'list' &&
          schemaSignature(pageField) === signature
        );
      })
    ) {
      continue;
    }
    sets.push({
      sequenceId,
      sequenceName: first.sequence?.name ?? sequenceId,
      pages,
      field,
      maxItems: field.maxItems,
      capacity: pages.length * field.maxItems,
    });
  }
  return sets;
}

function sourcePath(set: SequenceRowsPageSet): FieldPath {
  return ['$sequence-rows', set.sequenceId];
}

function stageRows(itemId: string, set: SequenceRowsPageSet, rows: readonly ListItem[]): void {
  if (rows.length > set.capacity) {
    throw new Error(
      `This template has room for ${String(set.capacity)} rows. Add more pages in Designer, then save and connect a new workbook.`,
    );
  }
  stageFieldBatch(
    itemId,
    set.pages.map((page, index) => ({
      path: [page.name, set.field.id],
      value: rows.slice(index * set.maxItems, (index + 1) * set.maxItems),
    })),
  );
}

function rowsFromPages(item: StackItemState, set: SequenceRowsPageSet): ListItem[] {
  return set.pages.flatMap((page) => {
    const path = [page.name, set.field.id];
    const applied = valueAt(item.fields, path);
    const authored = page.defaultValues?.[set.field.id];
    const fallback = Array.isArray(authored) ? authored : set.field.default;
    return toListItems(effectiveValue(item.itemId, path, applied ?? fallback));
  });
}

const styles = {
  section: {
    border: `1px solid ${colors.border}`,
    borderRadius: 'var(--r-radius-md)',
    padding: 'var(--r-space-3)',
    marginBottom: 'var(--r-space-3)',
  },
  heading: { margin: '0 0 var(--r-space-1)', fontSize: 'var(--r-text-md)' },
  hint: {
    margin: '0 0 var(--r-space-3)',
    color: colors.textMuted,
    fontSize: 'var(--r-text-sm)',
    lineHeight: 1.4,
  },
  source: { display: 'flex', gap: 'var(--r-space-2)', flexWrap: 'wrap' as const },
  error: { margin: 'var(--r-space-1) 0 0', color: colors.errorText, fontSize: 'var(--r-text-sm)' },
  warning: {
    margin: 'var(--r-space-1) 0 0',
    color: cssVars['--r-caution-text'],
    fontSize: 'var(--r-text-sm)',
    lineHeight: 1.4,
  },
  previewSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--r-space-2)',
    flexWrap: 'wrap' as const,
    marginBottom: 'var(--r-space-3)',
  },
  previewTableWrap: {
    minHeight: 0,
    maxHeight: 'min(62vh, 38rem)',
    overflow: 'auto',
    border: `1px solid ${colors.border}`,
    borderRadius: 'var(--r-radius-md)',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 'var(--r-text-sm)',
  },
  previewHead: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
    padding: 'var(--r-space-2) var(--r-space-3)',
    background: colors.panelMuted,
    color: colors.textMuted,
    textAlign: 'start' as const,
    whiteSpace: 'nowrap' as const,
    borderBottom: `1px solid ${colors.border}`,
  },
  previewCell: {
    minWidth: '8rem',
    maxWidth: '20rem',
    padding: 'var(--r-space-2) var(--r-space-3)',
    borderBottom: `1px solid ${cssVars['--r-border-soft']}`,
    verticalAlign: 'top' as const,
    overflowWrap: 'anywhere' as const,
  },
  previewRowNumber: {
    width: '1%',
    minWidth: '3rem',
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  previewInvalid: {
    background: cssVars['--r-caution-bg'],
    color: cssVars['--r-caution-text'],
    boxShadow: `inset 3px 0 0 ${cssVars['--r-caution-text']}`,
  },
  previewError: {
    display: 'block',
    marginTop: 'var(--r-space-1)',
    color: cssVars['--r-caution-text'],
    fontSize: 'var(--r-text-xs)',
    lineHeight: 1.35,
  },
} as const;

function imageAssetId(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const assetId = (value as Record<string, unknown>)['assetId'];
  return typeof assetId === 'string' && assetId !== '' ? assetId : undefined;
}

function cellError(field: ListItemField, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return field.required ? 'A value is required.' : undefined;
  }
  switch (field.type) {
    case 'number':
      return typeof value === 'number' ? numberFieldValueError(field, value) : 'Must be a number.';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Must be true or false.';
    case 'select':
      return typeof value === 'string' && field.options.some((option) => option.value === value)
        ? undefined
        : `Must be one of: ${field.options.map((option) => option.label).join(', ')}.`;
    case 'image': {
      const assetId = imageAssetId(value);
      if (assetId === undefined) return 'Must be a picture.';
      return field.assetOptions !== undefined &&
        !field.assetOptions.some((option) => option.assetId === assetId)
        ? 'This picture is not packaged with the template.'
        : undefined;
    }
    case 'color':
      return typeof value === 'string' && /^#[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?$/u.test(value)
        ? undefined
        : 'Must be a hex color.';
    case 'text':
    case 'multiline':
      return typeof value === 'string' ? undefined : 'Must be text.';
  }
}

function cellText(field: ListItemField, value: unknown): string {
  if (field.type === 'number' && typeof value === 'number') {
    const allowed = numberFieldAllowedValues(field);
    if (allowed?.includes(value) === true) {
      const label = numberFieldValueLabel(field, value);
      return label === String(value) ? label : `${label} (${String(value)})`;
    }
  }
  if (field.type === 'select' && typeof value === 'string') {
    const option = field.options.find((candidate) => candidate.value === value);
    if (option !== undefined) {
      return option.label === value ? value : `${option.label} (${value})`;
    }
  }
  if (field.type === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'image') {
    const assetId = imageAssetId(value);
    const option = field.assetOptions?.find((candidate) => candidate.assetId === assetId);
    return option?.label ?? assetId ?? '—';
  }
  if (value === undefined || value === null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function CurrentSequenceRowsDialog({
  open,
  onClose,
  rows,
  fields,
  label,
}: {
  open: boolean;
  onClose: () => void;
  rows: readonly ListItem[];
  fields: readonly ListItemField[];
  label: string;
}): JSX.Element | null {
  if (!open) return null;
  const invalidCount = rows.reduce(
    (total, row) =>
      total + fields.filter((field) => cellError(field, row[field.id]) !== undefined).length,
    0,
  );

  return (
    <Modal
      title="Current file-only data"
      subtitle={label}
      ariaLabel={`Current file-only data · ${label}`}
      size="wide"
      frame="fixed"
      onClose={onClose}
      footer={
        <ModalAction actionRole="cancel" onClick={onClose}>
          Done
        </ModalAction>
      }
    >
      <div style={styles.previewSummary} role="status">
        <Tag>{String(rows.length)} rows</Tag>
        <Tag>{String(fields.length)} columns</Tag>
        <Tag
          className={
            invalidCount === 0
              ? 'cg-sequence-data-status--valid'
              : 'cg-sequence-data-status--invalid'
          }
        >
          {invalidCount === 0
            ? 'All values match the template'
            : `${String(invalidCount)} invalid ${invalidCount === 1 ? 'cell' : 'cells'}`}
        </Tag>
      </div>
      <div style={styles.previewTableWrap}>
        <table style={styles.previewTable}>
          <thead>
            <tr>
              <th scope="col" style={{ ...styles.previewHead, ...styles.previewRowNumber }}>
                Row
              </th>
              {fields.map((field) => (
                <th key={field.id} scope="col" style={styles.previewHead} title={field.id}>
                  {field.label.trim() || field.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  style={{
                    ...styles.previewCell,
                    ...styles.previewRowNumber,
                    textAlign: 'start',
                  }}
                >
                  {String(rowIndex + 1)}
                </th>
                {fields.map((field) => {
                  const error = cellError(field, row[field.id]);
                  return (
                    <td
                      key={field.id}
                      style={{
                        ...styles.previewCell,
                        ...(error === undefined ? {} : styles.previewInvalid),
                      }}
                      title={error}
                      aria-label={
                        error === undefined
                          ? undefined
                          : `Row ${String(rowIndex + 1)}, ${field.label || field.id}: ${error}`
                      }
                    >
                      {cellText(field, row[field.id])}
                      {error !== undefined && <span style={styles.previewError}>{error}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function SequenceRowsFileControl({
  item,
  set,
  rows,
  onRows,
  fileOnly,
}: {
  item: StackItemState;
  set: SequenceRowsPageSet;
  rows: readonly ListItem[];
  onRows: (rows: ListItem[]) => void;
  fileOnly: boolean;
}): JSX.Element {
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  const path = sourcePath(set);
  const state = fromFileState(item.itemId, path);
  const supported = fileSourceSupported();
  const currentSchemaSignature = schemaSignature(set.field);
  const schemaNeedsUpdate =
    state?.schemaSignature !== undefined && state.schemaSignature !== currentSchemaSignature;
  const authoredPath = bridgeTextSourcePath(set.field);

  const load = useCallback(
    async (source: TextFileSource): Promise<void> => {
      try {
        const lowerName = source.name.toLocaleLowerCase();
        if (!/\.(?:csv|xlsx)$/u.test(lowerName)) {
          throw new Error(
            `Wrong file type: “${source.name}”. Choose a .xlsx workbook or .csv file generated for this template.`,
          );
        }
        const content = lowerName.endsWith('.xlsx')
          ? await structuredRowsXlsxToCsv(
              source.readBytes === undefined ? new Uint8Array() : await source.readBytes(),
            )
          : source.readBytes === undefined
            ? await source.read()
            : decodeStructuredText(await source.readBytes());
        const value = fileSourceContentToFieldValue(content, 'list', {
          split: false,
          delimiter: '',
          format: 'csv',
          itemFields: set.field.itemFields ?? [],
        });
        const rows = toListItems(value);
        if (rows.length > set.capacity) {
          throw new Error(
            `The selected file has ${String(rows.length)} rows, but this template has room for ${String(set.capacity)}. Add pages in Designer first.`,
          );
        }
        onRows(rows);
        setFromFileError(item.itemId, path, null);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        const message = `Could not reload “${source.name}”: ${reason}`;
        setFromFileError(item.itemId, path, message);
        reportCommandError(message);
      }
    },
    [item.itemId, onRows, path, set.capacity, set.field.itemFields],
  );

  useEffect(() => {
    reconcileAuthoredFileSource(item.itemId, path, authoredPath, fileOnly, {
      split: false,
      delimiter: '',
      format: 'csv',
    });
  }, [authoredPath, fileOnly, item.itemId, path]);

  useEffect(() => {
    if (authoredPath === undefined) return;
    const current = fromFileState(item.itemId, path);
    if (
      current?.source.bridgePath !== authoredPath ||
      current.permission !== 'granted' ||
      !claimAuthoredFileAutoLoad(
        item.itemId,
        path,
        JSON.stringify([authoredPath, currentSchemaSignature]),
      )
    ) {
      return;
    }
    void load(current.source);
  }, [authoredPath, currentSchemaSignature, item.itemId, load, path, state?.source.bridgePath]);

  const saveExcel = async (): Promise<void> => {
    try {
      const fields = set.field.itemFields ?? [];
      const bytes = await buildStructuredRowsXlsx({ fields, rows, editableRows: set.capacity });
      const source = await saveStructuredWorkbook(
        bytes,
        structuredWorkbookFilename(set.sequenceName, 'sequence'),
      );
      if (source === null) return;
      attachFileSource(item.itemId, path, source, {
        split: false,
        delimiter: '',
        format: 'csv',
        schemaSignature: currentSchemaSignature,
      });
    } catch (cause) {
      reportCommandError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (state === undefined) {
    return (
      <div style={styles.source}>
        <Tag className="cg-sequence-file-status">
          <Icon icon={Unplug} size={14} style={{ color: colors.textMuted }} />
          Not connected
        </Tag>
        {!fileOnly && (
          <Button
            variant="neutral"
            disabled={!supported}
            title={supported ? undefined : FILE_SOURCE_UNSUPPORTED_MESSAGE}
            onClick={() => void saveExcel()}
          >
            Save and connect Excel…
          </Button>
        )}
        {fileOnly && <span style={styles.hint}>Connect this workbook in Designer.</span>}
      </div>
    );
  }

  const grant = async (): Promise<void> => {
    if (state.source.handle === undefined) return;
    const permission = await requestReadPermission(state.source.handle);
    setFromFilePermission(item.itemId, path, permission);
    if (permission === 'granted') await load(state.source);
  };

  return (
    <div>
      <div style={styles.source}>
        <Tag title={state.source.displayPath ?? state.source.name}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--r-space-1)' }}>
            <Icon
              icon={schemaNeedsUpdate ? TriangleAlert : CircleCheck}
              size={14}
              style={{
                color: schemaNeedsUpdate ? cssVars['--r-caution-text'] : colors.checkPass,
              }}
            />
            {schemaNeedsUpdate ? 'Connected · update file' : 'Connected'} · {state.source.name}
          </span>
        </Tag>
        {state.permission === 'granted' ? (
          <Button variant="secondary" onClick={() => void load(state.source)}>
            Reload file
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void grant()}>
            Grant access
          </Button>
        )}
        {!fileOnly && (
          <>
            <Button
              variant="neutral"
              onClick={() => detachFileSource(item.itemId, path)}
              aria-label={`Detach ${state.source.name}`}
            >
              Detach
            </Button>
            <Button variant="secondary" onClick={() => void saveExcel()}>
              Save and connect another Excel…
            </Button>
          </>
        )}
      </div>
      {state.permission !== 'granted' && (
        <p style={styles.error}>{FILE_SOURCE_NEEDS_PERMISSION_MESSAGE}</p>
      )}
      {schemaNeedsUpdate && (
        <p style={styles.warning} role="status">
          Template fields changed after this file was generated. Reload still checks its data, but
          its Excel choices may be outdated.{' '}
          {fileOnly
            ? 'Reconnect the updated workbook in Designer.'
            : 'Save and connect a new Excel file.'}
        </p>
      )}
      {state.error !== null && <p style={styles.error}>{state.error}</p>}
    </div>
  );
}

/** One operator table for every homogeneous Sequence page, staged behind the normal Update. */
export function SequenceRowsEditor({
  item,
  set,
}: {
  item: StackItemState;
  set: SequenceRowsPageSet;
}): JSX.Element {
  const rows = rowsFromPages(item, set);
  const fileOnly = fieldUsesFileOnly(set.field);
  const [dataOpen, setDataOpen] = useState(false);
  const combinedField: ListField = {
    ...set.field,
    label: `${set.field.label} · all pages`,
    maxItems: set.capacity,
  };
  const onRows = (next: ListItem[]): void => {
    try {
      stageRows(item.itemId, set, next);
    } catch (cause) {
      reportCommandError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section style={styles.section} aria-label={`${set.sequenceName} all rows`}>
      <h3 style={styles.heading}>{set.field.label} · all pages</h3>
      <p style={styles.hint}>
        {String(rows.length)} / {String(set.capacity)} · {String(set.pages.length)} pages ·{' '}
        {String(set.maxItems)} per page
      </p>
      {fileOnly ? (
        <>
          <div style={styles.source}>
            <Tag>File only</Tag>
            <Button variant="secondary" onClick={() => setDataOpen(true)}>
              View current data
            </Button>
          </div>
          <SequenceRowsFileControl item={item} set={set} rows={rows} onRows={onRows} fileOnly />
          <CurrentSequenceRowsDialog
            open={dataOpen}
            onClose={() => setDataOpen(false)}
            rows={rows}
            fields={set.field.itemFields ?? []}
            label={set.field.label}
          />
        </>
      ) : (
        <ListFieldEditor
          fieldId={set.field.label || set.field.id}
          field={combinedField}
          value={rows}
          onStage={onRows}
          footer={
            <SequenceRowsFileControl
              item={item}
              set={set}
              rows={rows}
              onRows={onRows}
              fileOnly={false}
            />
          }
        />
      )}
    </section>
  );
}
