import { useSyncExternalStore } from 'react';
import { CircleCheck, TriangleAlert, Unplug } from 'lucide-react';
import {
  fileSourceContentToFieldValue,
  type CompositionFieldGroup,
  type DynamicField,
  type ListItem,
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
import { Tag } from '../../ui/Tag.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { ListFieldEditor } from './ListFieldEditor.js';
import { toListItems } from './listField.js';
import { effectiveValue, stageFieldBatch, valueAt, type FieldPath } from './draftStore.js';
import {
  attachFileSource,
  detachFileSource,
  fromFileState,
  fromFileVersion,
  setFromFileError,
  setFromFilePermission,
  subscribeFromFile,
} from './fromFileStore.js';
import {
  FILE_SOURCE_NEEDS_PERMISSION_MESSAGE,
  FILE_SOURCE_UNSUPPORTED_MESSAGE,
  fileSourceSupported,
  fsaTextFileSource,
  requestReadPermission,
  type TextFileSource,
} from './textFileSource.js';

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
} as const;

function workbookFilename(name: string): string {
  const stem = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem || 'sequence'}-rows.sample.xlsx`;
}

async function saveWorkbook(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<TextFileSource | null> {
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const picker = (
    window as typeof window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;
  if (picker !== undefined) {
    let handle: FileSystemFileHandle;
    try {
      handle = await picker({
        suggestedName,
        types: [{ description: 'Excel workbook', accept: { [mime]: ['.xlsx'] } }],
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return null;
      throw cause;
    }
    const writable = await handle.createWritable();
    await writable.write(new Blob([Uint8Array.from(bytes).buffer], { type: mime }));
    await writable.close();
    return fsaTextFileSource(handle);
  }
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return null;
}

function SequenceRowsFileControl({
  item,
  set,
  rows,
  onRows,
}: {
  item: StackItemState;
  set: SequenceRowsPageSet;
  rows: readonly ListItem[];
  onRows: (rows: ListItem[]) => void;
}): JSX.Element {
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  const path = sourcePath(set);
  const state = fromFileState(item.itemId, path);
  const supported = fileSourceSupported();
  const currentSchemaSignature = schemaSignature(set.field);
  const schemaNeedsUpdate = state !== undefined && state.schemaSignature !== currentSchemaSignature;

  const load = async (source: TextFileSource): Promise<void> => {
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
  };

  const saveExcel = async (): Promise<void> => {
    try {
      const fields = set.field.itemFields ?? [];
      const bytes = await buildStructuredRowsXlsx({ fields, rows, editableRows: set.capacity });
      const source = await saveWorkbook(bytes, workbookFilename(set.sequenceName));
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
        <Button
          variant="neutral"
          disabled={!supported}
          title={supported ? undefined : FILE_SOURCE_UNSUPPORTED_MESSAGE}
          onClick={() => void saveExcel()}
        >
          Save and connect Excel…
        </Button>
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
      </div>
      {state.permission !== 'granted' && (
        <p style={styles.error}>{FILE_SOURCE_NEEDS_PERMISSION_MESSAGE}</p>
      )}
      {schemaNeedsUpdate && (
        <p style={styles.warning} role="status">
          Template fields changed after this file was generated. Reload still checks its data, but
          its Excel choices may be outdated. Save and connect a new Excel file.
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
        One row is one city/item. CG Control splits rows into {String(set.pages.length)} pages of{' '}
        {String(set.maxItems)}. Changes stay as a draft until Update.
      </p>
      <ListFieldEditor
        fieldId={set.field.label || set.field.id}
        field={combinedField}
        value={rows}
        onStage={onRows}
        footer={<SequenceRowsFileControl item={item} set={set} rows={rows} onRows={onRows} />}
      />
    </section>
  );
}
