import { useMemo, useState, useSyncExternalStore } from 'react';
import { CircleCheck, TriangleAlert, Unplug } from 'lucide-react';
import {
  aggregateCompositionFields,
  countdownTargetFieldsOf,
  defaultNestedValues,
  sequenceItemInstanceId,
  sequencesOf,
  withListLimits,
  type AggregatedFields,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldValue,
  type FieldValues,
  type ListItem,
  type NestedFieldValues,
  type Scene,
  type SequenceElement,
} from '@cg/shared-schema';
import {
  buildStructuredRowsXlsx,
  decodeStructuredText,
  structuredRowsXlsxToCsv,
} from '@cg/vcg-format';
import { designerStore } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { useAssets } from '../assets/useAssets.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { PreviewFieldForm } from './PreviewFieldForm.js';
import { ListItemsEditor, newItemId } from './ListItemsEditor.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import {
  imageChoicesForAssets,
  repeaterColumnsByFieldId,
  type ListItemColumn,
} from './repeater-columns.js';
import {
  buildSequencePageDataSample,
  chunkSequenceRows,
  parseSequencePageData,
  parseSequenceRowsCsv,
} from './sequence-page-data.js';
import * as s from './SequencePageDataPanel.css.js';
import {
  getSequencePageDataAttachment,
  sequencePageDataAttachmentNeedsUpdate,
  sequencePageDataAttachmentsVersion,
  setSequencePageDataAttachment,
  subscribeSequencePageDataAttachments,
} from './sequencePageDataAttachmentStore.js';

interface PageRef {
  readonly itemId: string;
  readonly group: CompositionFieldGroup;
}

interface PageSequence {
  readonly sequence: SequenceElement;
  readonly pages: readonly PageRef[];
}

type ListField = Extract<DynamicField, { type: 'list' }>;

interface BulkLayout {
  readonly compositionId: string;
  readonly field: ListField;
  readonly columns: readonly ListItemColumn[];
  readonly maxItems: number;
}

type SequenceDoc = Scene | NonNullable<Scene['compositions']>[number];

function pageSequences(scene: Scene, doc: SequenceDoc = scene): PageSequence[] {
  const aggregate = countdownTargetFieldsOf(
    scene,
    doc,
    withListLimits(scene, doc, aggregateCompositionFields(scene, doc)),
  );
  const groups = new Map(aggregate.groups.map((group) => [group.instanceId, group]));
  return sequencesOf(doc)
    .map((sequence) => ({
      sequence,
      pages: sequence.items.flatMap((item) => {
        if (item.kind !== 'composition') return [];
        const group = groups.get(sequenceItemInstanceId(sequence.id, item.id));
        return group === undefined ? [] : [{ itemId: item.id, group }];
      }),
    }))
    .filter((entry) => entry.pages.length > 0);
}

/** Compact entry point owned by the selected Sequence's Inspector. */
export function SequencePageDataControl({
  scene,
  sequence,
}: {
  scene: Scene;
  sequence: SequenceElement;
}): JSX.Element | null {
  const entry = useMemo(() => {
    const activeCompositionId = designerStore.get().activeCompositionId;
    const doc =
      activeCompositionId === null
        ? scene
        : (scene.compositions?.find((composition) => composition.id === activeCompositionId) ??
          scene);
    return pageSequences(scene, doc).find((candidate) => candidate.sequence.id === sequence.id);
  }, [scene, sequence.id]);
  const assets = useAssets();
  const sharedImages = useSharedImages();
  const columns = useMemo(
    () => repeaterColumnsByFieldId(scene, imageChoicesForAssets(assets, sharedImages)),
    [assets, scene, sharedImages],
  );
  return entry === undefined ? null : <SequencePageSection entry={entry} columns={columns} />;
}

function setNested(source: FieldValues, path: readonly string[], value: FieldValue): FieldValues {
  const [head, ...rest] = path;
  if (head === undefined) return source;
  if (rest.length === 0) return { ...source, [head]: value };
  const current = source[head];
  const nested =
    typeof current === 'object' &&
    current !== null &&
    !Array.isArray(current) &&
    !('assetId' in current)
      ? (current as FieldValues)
      : {};
  return { ...source, [head]: setNested(nested, rest, value) };
}

function sampleFilename(name: string, format: 'json' | 'csv' | 'xlsx'): string {
  const stem = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem || 'sequence'}-${
    format === 'json' ? 'pages.sample.json' : `rows.sample.${format}`
  }`;
}

/** The safe spreadsheet case: one repeated composition, with one flat structured Repeater. */
function bulkLayout(
  entry: PageSequence,
  columnsByFieldId: ReadonlyMap<string, readonly ListItemColumn[]>,
): BulkLayout | null {
  const compositionItems = entry.sequence.items.filter((item) => item.kind === 'composition');
  if (
    compositionItems.length === 0 ||
    compositionItems.length !== entry.sequence.items.length ||
    compositionItems.length !== entry.pages.length ||
    compositionItems.some((item) => item.compositionId !== compositionItems[0]?.compositionId)
  ) {
    return null;
  }
  const firstAggregate = entry.pages[0]?.group.aggregate;
  const firstField = firstAggregate?.fields[0];
  if (
    firstAggregate === undefined ||
    firstAggregate.groups.length !== 0 ||
    firstAggregate.fields.length !== 1 ||
    firstField?.type !== 'list' ||
    firstField.itemFields === undefined ||
    firstField.itemFields.length === 0 ||
    firstField.maxItems === undefined ||
    firstField.maxItems <= 0
  ) {
    return null;
  }
  const signature = JSON.stringify({
    id: firstField.id,
    maxItems: firstField.maxItems,
    itemFields: firstField.itemFields,
  });
  const compatible = entry.pages.every((page) => {
    const aggregate = page.group.aggregate;
    const field = aggregate.fields[0];
    return (
      aggregate.groups.length === 0 &&
      aggregate.fields.length === 1 &&
      field?.type === 'list' &&
      JSON.stringify({ id: field.id, maxItems: field.maxItems, itemFields: field.itemFields }) ===
        signature
    );
  });
  const fieldColumns = columnsByFieldId.get(firstField.id);
  if (!compatible || fieldColumns === undefined || fieldColumns.length === 0) return null;
  return {
    compositionId: compositionItems[0]?.compositionId ?? '',
    field: firstField,
    columns: fieldColumns,
    maxItems: firstField.maxItems,
  };
}

function bulkRows(entry: PageSequence, layout: BulkLayout): ListItem[] {
  return entry.pages.flatMap((page) => {
    const value = page.group.defaultValues?.[layout.field.id];
    const rows = Array.isArray(value) ? value : layout.field.default;
    return rows.map((row) => ({ ...row }));
  });
}

function pageDataSchemaSignature(entry: PageSequence, layout: BulkLayout | null): string {
  return JSON.stringify(
    layout === null
      ? {
          format: 'json',
          pages: entry.pages.map((page) => page.group.aggregate),
        }
      : {
          format: 'xlsx',
          fieldId: layout.field.id,
          maxItems: layout.maxItems,
          itemFields: layout.field.itemFields,
        },
  );
}

function SequencePageSection({
  entry,
  columns,
}: {
  entry: PageSequence;
  columns: ReadonlyMap<string, readonly ListItemColumn[]>;
}): JSX.Element {
  const { sequence, pages } = entry;
  const aggregate: AggregatedFields = useMemo(
    () => ({ fields: [], groups: pages.map((page) => page.group) }),
    [pages],
  );
  const values = useMemo(() => defaultNestedValues(aggregate), [aggregate]);
  const layout = useMemo(() => bulkLayout(entry, columns), [columns, entry]);
  useSyncExternalStore(subscribeSequencePageDataAttachments, sequencePageDataAttachmentsVersion);
  const sceneId = designerStore.get().scene?.id ?? 'scene';
  const attachment = getSequencePageDataAttachment(sceneId, sequence.id);
  // The connection itself is the authority switch. A second File-only checkbox on the child
  // Repeater created two independent states for one table and was easy to miss.
  const fileOnly = attachment !== null || sequence.pageDataFile !== undefined;
  // `pageDataFile` is authored scene state and therefore survives a `.cgproj` round trip. The
  // native source handle is intentionally session-only, but losing that handle must not make an
  // imported project claim the Sequence is disconnected: CG Control still owns and reads this
  // Bridge-relative source. A live attachment merely adds Designer-side Reload capability.
  const connected = fileOnly;
  const connectedPath = attachment?.sourcePath ?? sequence.pageDataFile;
  const currentSchemaSignature = pageDataSchemaSignature(entry, layout);
  const attachmentNeedsUpdate =
    attachment !== null &&
    sequencePageDataAttachmentNeedsUpdate(attachment, currentSchemaSignature);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<ListItem[]>([]);

  const applyBulkRows = (rows: readonly ListItem[], bridgePath?: string): void => {
    if (layout === null) return;
    const chunks = chunkSequenceRows(rows, layout.maxItems);
    const current = sequence.items.filter((item) => item.kind === 'composition');
    const first = current[0];
    if (first === undefined) return;
    const items = chunks.map((chunk, index) => {
      const existing = current[index];
      const source = existing ?? first;
      return {
        id: existing?.id ?? newItemId(),
        kind: 'composition' as const,
        compositionId: first.compositionId,
        ...(source.dwellMs === undefined ? {} : { dwellMs: source.dwellMs }),
        fieldValues: { [layout.field.id]: chunk },
      };
    });
    designerStore.runAsSingleHistoryEntry(() => {
      designerStore.setSequenceItems(sequence.id, items as ListItem[]);
      if (bridgePath !== undefined) designerStore.setSequencePageDataFile(sequence.id, bridgePath);
    });
  };

  const applyFile = (content: string, bridgePath: string, format: 'json' | 'csv'): void => {
    if (format === 'csv') {
      if (layout === null) {
        throw new Error(
          'Excel/CSV is available when every page uses the same flat Repeater. Save the matching JSON sample for this Sequence instead.',
        );
      }
      applyBulkRows(parseSequenceRowsCsv(content, layout.field), bridgePath);
      return;
    }
    const parsed = parseSequencePageData(
      content,
      pages.map((page) => page.group),
    );
    designerStore.runAsSingleHistoryEntry(() => {
      pages.forEach((page, index) => {
        designerStore.setSequenceItemFieldValues(sequence.id, page.itemId, parsed[index] ?? {});
      });
      designerStore.setSequencePageDataFile(sequence.id, bridgePath);
    });
    if (layout !== null) {
      setBulkDraft(
        parsed.flatMap((page) => {
          const rows = page[layout.field.id];
          return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
        }),
      );
    }
  };

  const reload = async (): Promise<void> => {
    if (attachment === null) return;
    const currentAttachment = attachment;
    try {
      const source = await window.cg.textSources.reloadStructuredRows(currentAttachment.sourcePath);
      const content =
        currentAttachment.format === 'xlsx'
          ? await structuredRowsXlsxToCsv(
              typeof source === 'string' ? new TextEncoder().encode(source) : source,
            )
          : typeof source === 'string'
            ? source
            : decodeStructuredText(source);
      applyFile(
        content,
        currentAttachment.bridgePath,
        currentAttachment.format === 'json' ? 'json' : 'csv',
      );
      if (currentAttachment.format !== 'json' && layout !== null) {
        setBulkDraft(parseSequenceRowsCsv(content, layout.field));
      }
      setError(null);
      setNotice(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`Could not reload “${currentAttachment.name}”: ${message}`);
    }
  };

  const connectSavedFile = (savedPath: string, format: 'json' | 'xlsx'): void => {
    const name = savedPath.split(/[\\/]/u).at(-1) ?? savedPath;
    designerStore.setSequencePageDataFile(sequence.id, name);
    setSequencePageDataAttachment(sceneId, sequence.id, {
      bridgePath: name,
      sourcePath: savedPath,
      name,
      format,
      schemaSignature: currentSchemaSignature,
    });
    setNotice(`File connected: ${savedPath}`);
    setError(null);
  };

  const saveAndConnectJson = async (): Promise<void> => {
    try {
      const saved = await window.cg.textSources.saveSample({
        suggestedName: sampleFilename(sequence.name, 'json'),
        content: buildSequencePageDataSample(
          sequence,
          pages.map((page) => page.group),
        ),
        format: 'json',
      });
      if (saved === null) return;
      connectSavedFile(saved, 'json');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`Could not save and connect the JSON file: ${message}`);
      setNotice(null);
    }
  };

  const saveAndConnectExcel = async (): Promise<void> => {
    if (layout === null || layout.field.itemFields === undefined) return;
    try {
      const saved = await window.cg.textSources.saveSample({
        suggestedName: sampleFilename(sequence.name, 'xlsx'),
        content: await buildStructuredRowsXlsx({
          fields: layout.field.itemFields,
          rows: bulkDraft,
        }),
        format: 'xlsx',
      });
      if (saved === null) return;
      connectSavedFile(saved, 'xlsx');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(`Could not save and connect the Excel file: ${message}`);
      setNotice(null);
    }
  };

  const change = (path: string[], value: FieldValue): void => {
    const [namespace, ...fieldPath] = path;
    if (namespace === undefined || fieldPath.length === 0) return;
    const page = pages.find((candidate) => candidate.group.name === namespace);
    if (page === undefined) return;
    const item = sequence.items.find((candidate) => candidate.id === page.itemId);
    if (item?.kind !== 'composition') return;
    designerStore.setSequenceItemFieldValues(
      sequence.id,
      page.itemId,
      setNested(item.fieldValues ?? {}, fieldPath, value),
    );
  };

  const openManager = (): void => {
    if (layout !== null) setBulkDraft(bulkRows(entry, layout));
    setManagerOpen(true);
  };

  const confirmBulkEditor = (): void => {
    applyBulkRows(bulkDraft);
    setManagerOpen(false);
    setNotice(
      `${String(bulkDraft.length)} rows split into ${String(chunkSequenceRows(bulkDraft, layout?.maxItems ?? 1).length)} pages.`,
    );
    setError(null);
  };

  return (
    <>
      <section className={s.section} aria-label={`${sequence.name} page data`}>
        <div className={s.sourceRow}>
          <Button variant="secondary" onClick={openManager} data-testid="sequence-page-data-open">
            Page data…
          </Button>
          {connected && (
            <>
              <span
                className={`${s.connectionStatus} ${attachmentNeedsUpdate ? s.updateNeeded : s.connected}`}
                title={
                  attachmentNeedsUpdate ? 'Template fields changed; replace this file.' : undefined
                }
              >
                <Icon icon={attachmentNeedsUpdate ? TriangleAlert : CircleCheck} size={14} />
                {attachmentNeedsUpdate ? 'Connected · update file' : 'Connected'}
              </span>
              {attachment !== null && (
                <Button variant="secondary" onClick={() => void reload()}>
                  Reload
                </Button>
              )}
            </>
          )}
          {!connected && (
            <span className={`${s.connectionStatus} ${s.disconnected}`}>
              <Icon icon={Unplug} size={14} /> Not connected
            </span>
          )}
          {fileOnly && <span className={s.connectionStatus}>CG Control · file managed</span>}
        </div>
        {connectedPath !== undefined && (
          <div className={s.path} title={connectedPath}>
            <span>Share path</span>
            <code>{connectedPath}</code>
          </div>
        )}
      </section>
      {managerOpen && (
        <Modal
          title={`Page data · ${sequence.name}`}
          onClose={() => setManagerOpen(false)}
          width="min(1120px, 96vw)"
          maxHeight="90vh"
          footer={
            layout === null ? (
              <ModalButton onClick={() => setManagerOpen(false)}>Done</ModalButton>
            ) : (
              <>
                <ModalButton onClick={() => setManagerOpen(false)}>Cancel</ModalButton>
                <ModalButton variant="primary" onClick={confirmBulkEditor}>
                  Apply and make pages
                </ModalButton>
              </>
            )
          }
        >
          <div className={s.modalSourceRow}>
            <span
              className={`${s.connectionStatus} ${!connected ? s.disconnected : attachmentNeedsUpdate ? s.updateNeeded : s.connected}`}
            >
              <Icon
                icon={!connected ? Unplug : attachmentNeedsUpdate ? TriangleAlert : CircleCheck}
                size={14}
              />
              {!connected
                ? 'Not connected'
                : attachmentNeedsUpdate
                  ? 'Connected · update file'
                  : 'Connected'}
            </span>
            <Button
              onClick={() => void (layout === null ? saveAndConnectJson() : saveAndConnectExcel())}
            >
              Save and connect {!connected ? '' : 'another '}
              {layout === null ? 'JSON' : 'Excel'} file…
            </Button>
            {connected && (
              <>
                {attachment !== null && (
                  <Button variant="secondary" onClick={() => void reload()}>
                    Reload connected file
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    designerStore.setSequencePageDataFile(sequence.id, undefined);
                    setSequencePageDataAttachment(sceneId, sequence.id, null);
                  }}
                >
                  Detach file
                </Button>
              </>
            )}
          </div>
          {connectedPath !== undefined && (
            <div className={s.path} title={connectedPath}>
              <span>Share path</span>
              <code>{connectedPath}</code>
            </div>
          )}
          {fileOnly && <span className={s.connectionStatus}>CG Control · file managed</span>}
          {attachmentNeedsUpdate && (
            <p className={s.warning} role="status">
              Template fields changed after this file was generated. Reload still validates its
              data, but its columns or Excel choices may be outdated. Save and connect a new file.
            </p>
          )}
          <p className={s.bulkHint}>
            {layout === null
              ? "The connected JSON file is generated from this Sequence's exact fields and nested groups."
              : `The connected Excel file is generated from this template. One row is one city/item; page breaks are automatic every ${String(layout.maxItems)} rows.`}
          </p>
          {notice !== null && <p className={s.notice}>{notice}</p>}
          {error !== null && <p className={s.error}>{error}</p>}
          {layout === null ? (
            <PreviewFieldForm
              aggregate={aggregate}
              values={values as NestedFieldValues}
              onChange={change}
              columnsByFieldId={columns}
              title={`Page data · ${sequence.name}`}
            />
          ) : (
            <ListItemsEditor
              items={bulkDraft}
              onChange={setBulkDraft}
              label={`${sequence.name} row`}
              columns={layout.columns}
              comfortable
            />
          )}
        </Modal>
      )}
    </>
  );
}
