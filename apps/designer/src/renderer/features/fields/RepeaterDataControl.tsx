import { useMemo, useState, useSyncExternalStore } from 'react';
import { CircleCheck, TriangleAlert, Unplug } from 'lucide-react';
import {
  fieldUsesFileOnly,
  fileSourceContentToFieldValue,
  repeaterRowLimit,
  type Composition,
  type DynamicField,
  type ListItem,
  type ListItemField,
  type RepeaterElement,
  type Scene,
} from '@cg/shared-schema';
import {
  buildStructuredRowsXlsx,
  decodeStructuredText,
  structuredRowsXlsxToCsv,
} from '@cg/vcg-format';
import { designerStore } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { CheckRow } from '../inspector/DynamicDataSection.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { useAssets } from '../assets/useAssets.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { ListItemsEditor } from './ListItemsEditor.js';
import { columnsForFields, imageChoicesForAssets } from './repeater-columns.js';
import {
  getSequencePageDataAttachment,
  sequencePageDataAttachmentNeedsUpdate,
  sequencePageDataAttachmentsVersion,
  setSequencePageDataAttachment,
  subscribeSequencePageDataAttachments,
} from './sequencePageDataAttachmentStore.js';
import * as s from './SequencePageDataPanel.css.js';

type FieldDoc = Scene | Composition;

function activeDoc(scene: Scene): FieldDoc {
  const activeId = designerStore.get().activeCompositionId;
  return activeId === null
    ? scene
    : (scene.compositions?.find((composition) => composition.id === activeId) ?? scene);
}

function listFieldFor(
  doc: FieldDoc,
  repeaterId: string,
): Extract<DynamicField, { type: 'list' }> | null {
  const binding = (doc.bindings ?? []).find(
    (candidate) =>
      candidate.target.kind === 'repeater-items' && candidate.target.elementId === repeaterId,
  );
  const field =
    binding === undefined
      ? undefined
      : (doc.fields ?? []).find((candidate) => candidate.id === binding.fieldId);
  return field?.type === 'list' ? field : null;
}

function attachmentId(repeaterId: string): string {
  return `repeater:${repeaterId}`;
}

function workbookFilename(name: string): string {
  const stem = name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${stem || 'repeater'}-rows.sample.xlsx`;
}

function schemaSignature(repeater: RepeaterElement, itemFields: readonly ListItemField[]): string {
  return JSON.stringify({
    format: 'xlsx',
    maxItems: repeaterRowLimit(repeater),
    itemFields,
  });
}

function generatedDataKey(doc: FieldDoc, repeater: RepeaterElement): string {
  const stem = repeater.name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const base = `${stem || 'repeater'}-rows`;
  const used = new Set((doc.fields ?? []).map((field) => field.id));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${String(suffix)}`)) suffix += 1;
  return `${base}-${String(suffix)}`;
}

function itemFieldsFor(
  child: Composition | undefined,
  imageChoices: readonly { value: string; label: string }[],
): ListItemField[] {
  const assetOptions = imageChoices.map((choice) => ({
    assetId: choice.value,
    label: choice.label,
  }));
  return (child?.fields ?? [])
    .filter((field): field is ListItemField => field.type !== 'list')
    .map((field) =>
      field.type === 'image' ? ({ ...field, assetOptions } as ListItemField) : field,
    );
}

/** Direct Repeater workbook management; an outer Sequence is deliberately optional. */
export function RepeaterDataControl({
  scene,
  repeater,
}: {
  scene: Scene;
  repeater: RepeaterElement;
}): JSX.Element {
  useSyncExternalStore(subscribeSequencePageDataAttachments, sequencePageDataAttachmentsVersion);
  const assets = useAssets();
  const sharedImages = useSharedImages();
  const imageChoices = useMemo(
    () => imageChoicesForAssets(assets, sharedImages),
    [assets, sharedImages],
  );
  const child = scene.compositions?.find(
    (composition) => composition.id === repeater.compositionId,
  );
  const columns = useMemo(
    () => columnsForFields(child?.fields, imageChoices),
    [child?.fields, imageChoices],
  );
  const itemFields = useMemo(() => itemFieldsFor(child, imageChoices), [child, imageChoices]);
  const doc = activeDoc(scene);
  const field = listFieldFor(doc, repeater.id);
  const fileOnly = fieldUsesFileOnly(field);
  const authoredBridgePath = field?.fileSource?.bridgePath;
  const currentSignature = schemaSignature(repeater, itemFields);
  const storeId = attachmentId(repeater.id);
  const attachment = getSequencePageDataAttachment(scene.id, storeId);
  const needsUpdate =
    attachment !== null && sequencePageDataAttachmentNeedsUpdate(attachment, currentSignature);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ListItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rowsChanged = JSON.stringify(draft) !== JSON.stringify(repeater.items);

  const ensureField = (): void => {
    const latest = designerStore.get().scene;
    if (latest === null) throw new Error('No project is open.');
    const latestDoc = activeDoc(latest);
    if (listFieldFor(latestDoc, repeater.id) === null) {
      const key = generatedDataKey(latestDoc, repeater);
      if (!designerStore.setElementDataKey(repeater.id, key)) {
        throw new Error('Could not create the Repeater data field. Choose a unique Data key.');
      }
    }
    designerStore.setElementFieldMeta(repeater.id, {
      title: repeater.name.trim() || 'Repeater rows',
      allowFileSource: true,
    });
  };

  const setFileOnly = (enabled: boolean): void => {
    try {
      ensureField();
      const latest = designerStore.get().scene;
      if (latest === null) return;
      const latestField = listFieldFor(activeDoc(latest), repeater.id);
      const previous = latestField?.fileSource;
      const remaining = {
        ...(previous?.bridgePath === undefined ? {} : { bridgePath: previous.bridgePath }),
        ...(previous?.lockFile === true ? { lockFile: true as const } : {}),
        ...(previous?.delimiter === undefined ? {} : { delimiter: previous.delimiter }),
        ...(previous?.format === undefined
          ? { format: 'csv' as const }
          : { format: previous.format }),
      };
      designerStore.setElementFieldMeta(repeater.id, {
        allowFileSource: true,
        fileSource: enabled ? { ...remaining, inputMode: 'file-only' } : remaining,
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const openManager = (): void => {
    setDraft(repeater.items.map((item) => ({ ...item })));
    setNotice(null);
    setError(null);
    setOpen(true);
  };

  const connect = (sourcePath: string): void => {
    ensureField();
    const name = sourcePath.split(/[\\/]/u).at(-1) ?? sourcePath;
    const latest = designerStore.get().scene;
    const latestField = latest === null ? null : listFieldFor(activeDoc(latest), repeater.id);
    designerStore.setElementFieldMeta(repeater.id, {
      allowFileSource: true,
      fileSource: {
        ...latestField?.fileSource,
        bridgePath: name,
        format: 'csv',
      },
    });
    setSequencePageDataAttachment(scene.id, storeId, {
      bridgePath: name,
      sourcePath,
      name,
      format: 'xlsx',
      schemaSignature: currentSignature,
    });
    setNotice(`File connected: ${sourcePath}`);
    setError(null);
  };

  const detach = (): void => {
    const latest = designerStore.get().scene;
    const latestField = latest === null ? null : listFieldFor(activeDoc(latest), repeater.id);
    const previous = latestField?.fileSource;
    if (previous !== undefined) {
      const { bridgePath: _bridgePath, lockFile: _lockFile, ...remaining } = previous;
      designerStore.setElementFieldMeta(repeater.id, {
        allowFileSource: true,
        fileSource: remaining,
      });
    }
    setSequencePageDataAttachment(scene.id, storeId, null);
    setNotice('File detached.');
    setError(null);
  };

  const saveAndConnect = async (): Promise<void> => {
    if (itemFields.length === 0) {
      setError('The referenced composition has no fields to use as Excel columns.');
      return;
    }
    try {
      const saved = await window.cg.textSources.saveSample({
        suggestedName: workbookFilename(repeater.name),
        content: await buildStructuredRowsXlsx({ fields: itemFields, rows: draft }),
        format: 'xlsx',
      });
      if (saved !== null) connect(saved);
    } catch (cause) {
      setNotice(null);
      setError(
        `Could not save and connect the Excel file: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  };

  const reload = async (): Promise<void> => {
    if (attachment === null) return;
    try {
      const source = await window.cg.textSources.reloadStructuredRows(attachment.sourcePath);
      const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
      const content =
        attachment.format === 'xlsx'
          ? await structuredRowsXlsxToCsv(bytes)
          : decodeStructuredText(bytes);
      const value = fileSourceContentToFieldValue(content, 'list', {
        split: false,
        delimiter: '',
        format: attachment.format === 'json' ? 'json' : 'csv',
        itemFields,
      });
      if (!Array.isArray(value)) throw new Error('The selected workbook did not contain row data.');
      const rows = value as ListItem[];
      const limit = repeaterRowLimit(repeater);
      if (limit !== undefined && rows.length > limit) {
        throw new Error(
          `The workbook has ${String(rows.length)} rows, but this Repeater shows at most ${String(limit)}. Raise max items or remove rows.`,
        );
      }
      designerStore.setRepeaterItems(repeater.id, rows);
      setDraft(rows.map((row) => ({ ...row })));
      ensureField();
      setNotice(`${String(rows.length)} rows reloaded from ${attachment.name}.`);
      setError(null);
    } catch (cause) {
      setNotice(null);
      setError(
        `Could not reload “${attachment.name}”: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  };

  const apply = (): void => {
    designerStore.setRepeaterItems(repeater.id, draft);
    setOpen(false);
  };

  return (
    <>
      <section className={s.section} aria-label={`${repeater.name} data file`}>
        <div className={s.sourceRow}>
          <Button variant="secondary" onClick={openManager}>
            Data file…
          </Button>
          {attachment === null && authoredBridgePath === undefined ? (
            <span className={`${s.connectionStatus} ${s.disconnected}`}>
              <Icon icon={Unplug} size={14} /> Not connected
            </span>
          ) : (
            <>
              <span
                className={`${s.connectionStatus} ${needsUpdate ? s.updateNeeded : s.connected}`}
              >
                <Icon icon={needsUpdate ? TriangleAlert : CircleCheck} size={14} />
                {needsUpdate ? 'Connected · update file' : 'Connected'}
              </span>
              {attachment !== null && (
                <Button variant="secondary" onClick={() => void reload()}>
                  Reload
                </Button>
              )}
            </>
          )}
          {fileOnly && <span className={s.connectionStatus}>CG Control · File only</span>}
        </div>
        {(attachment !== null || authoredBridgePath !== undefined) && (
          <code className={s.path}>{attachment?.sourcePath ?? authoredBridgePath}</code>
        )}
      </section>
      {open && (
        <Modal
          title={`Repeater data · ${repeater.name}`}
          onClose={() => setOpen(false)}
          width="min(1120px, 96vw)"
          maxHeight="90vh"
          footer={
            <>
              <ModalButton onClick={() => setOpen(false)}>Cancel</ModalButton>
              <ModalButton variant="primary" onClick={apply}>
                Apply rows
              </ModalButton>
            </>
          }
        >
          <div className={s.modalSourceRow}>
            <span
              className={`${s.connectionStatus} ${attachment === null && authoredBridgePath === undefined ? s.disconnected : needsUpdate ? s.updateNeeded : s.connected}`}
            >
              <Icon
                icon={
                  attachment === null && authoredBridgePath === undefined
                    ? Unplug
                    : needsUpdate
                      ? TriangleAlert
                      : CircleCheck
                }
                size={14}
              />
              {attachment === null && authoredBridgePath === undefined
                ? 'Not connected'
                : needsUpdate
                  ? 'Connected · update file'
                  : 'Connected'}
            </span>
            <Button onClick={() => void saveAndConnect()}>
              Save and connect{' '}
              {attachment === null && authoredBridgePath === undefined ? '' : 'another '}Excel file…
            </Button>
            {attachment !== null && (
              <Button variant="secondary" onClick={() => void reload()}>
                Reload connected file
              </Button>
            )}
            {(attachment !== null || authoredBridgePath !== undefined) && (
              <Button variant="secondary" onClick={detach}>
                Detach file
              </Button>
            )}
          </div>
          {(attachment !== null || authoredBridgePath !== undefined) && (
            <code className={s.path}>{attachment?.sourcePath ?? authoredBridgePath}</code>
          )}
          <CheckRow
            label="File only in CG Control"
            checked={fileOnly}
            onChange={setFileOnly}
            title="Remove manual row editing in CG Control; connection and reload remain read-only there."
          />
          {needsUpdate && (
            <p className={s.warning} role="status">
              Template fields changed after this file was generated. Reload still validates its
              data, but its Excel columns or choices may be outdated. Save and connect a new file.
            </p>
          )}
          {(attachment !== null || authoredBridgePath !== undefined) && rowsChanged && (
            <p className={s.warning} role="status">
              These row edits update the Designer preview only; they do not overwrite the connected
              workbook. Save and connect a new Excel file to keep the file in sync. Reloading first
              will replace these edits with the file contents.
            </p>
          )}
          <p className={s.bulkHint}>
            This workbook is generated from “{child?.name ?? repeater.compositionId}”. One row is
            one repeated item; Excel choices and number limits follow the template fields.
          </p>
          {notice !== null && <p className={s.notice}>{notice}</p>}
          {error !== null && <p className={s.error}>{error}</p>}
          <ListItemsEditor
            items={draft}
            onChange={setDraft}
            label={repeater.name || 'Repeater row'}
            columns={columns}
            maxItems={repeaterRowLimit(repeater)}
            comfortable
          />
        </Modal>
      )}
    </>
  );
}
