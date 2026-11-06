import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  fileSourceContentToFieldValue,
  fieldAllowsFileSource,
  fieldTakesFileSource,
  fileSourcePolicyOf,
  listFieldItemFields,
  fieldDigitsOf,
  FieldDigitsSchema,
  NumberFieldDigitsSchema,
  numberFieldAllowedValues,
  numberFieldValueAlias,
  sequenceItemsBinding,
  type DynamicField,
  type FileSourceListFormat,
  type FieldBinding,
  type ListItemField,
  type RepeaterElement,
  type Scene,
  type SequenceElement,
  type TextElement,
  type TickerElement,
} from '@cg/shared-schema';
import { SHIPPED_DEFAULT_DELIMITER } from '@cg/shared-ipc';
import type { DigitSet } from '@cg/text-shaping';
import { compositionPackageId } from '@cg/vcg-format';
import type { DesignerBridge, DesignerTextSourceFile } from '../../../shared/designer-bridge.js';
import { designerStore, type ElementFieldMetaPatch } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Tag } from '../../ui/Tag.js';
import {
  designerDelimitersVersion,
  listDesignerDelimiters,
  subscribeDesignerDelimiters,
} from '../settings/designerDelimiterStore.js';
import { CollapseSection } from './CollapseSection.js';
import {
  clearDesignerFileSourcePreview,
  designerFileSourcePreviewsVersion,
  dismissDesignerFileSourcePreview,
  getDesignerFileSourcePreview,
  isDesignerFixedFileIntent,
  isDesignerFileSourcePreviewOpen,
  requestDesignerFileSourcePreviewOpen,
  setDesignerFileSourcePreview,
  setDesignerFixedFileIntent,
  subscribeDesignerFileSourcePreviews,
} from '../fields/fileSourcePreviewStore.js';
import { fixedFileFieldId, isFixedFileFieldId } from '../fields/fixedFileField.js';
import {
  sequencePageDataAttachmentCount,
  sequencePageDataAttachmentsVersion,
  subscribeSequencePageDataAttachments,
} from '../fields/sequencePageDataAttachmentStore.js';
import {
  bridgeTextSourceFiles,
  isVisibleWindowsSourcePath,
  readBridgeTextPreview,
} from './bridgeTextFile.js';
import { NumberField, SelectField, TextField } from './controls.js';
import { FileSourcePreviewModal } from './FileSourcePreviewModal.js';
import { InfoTip } from './InfoTip.js';
import { DigitsField } from './DigitsField.js';
import { NumberChoicesModal } from './NumberChoicesModal.js';
import { SelectChoicesModal } from './SelectChoicesModal.js';
import {
  CUSTOM_PATTERN,
  PATTERN_PRESET_ORDER,
  PATTERN_PRESETS,
  patternForPresetKey,
  patternPresetKeyFor,
} from './pattern-presets.js';
import * as cs from './controls.css.js';
import * as s from './DynamicDataSection.css.js';

/**
 * D-018 / D-028 / D-029 — "Dynamic / Data" section, shown for text, ticker,
 * AND sequence elements. An element becomes a runtime data field when given
 * a non-empty **Data key**; the store's convenience layer
 * (`setElementDataKey` / `setElementFieldMeta`) keeps the scene-level
 * `fields[]`+`bindings[]` in sync. A text element syncs a full-text binding +
 * text field; a ticker/sequence syncs its items binding
 * (`ticker-items`/`sequence-items`) + `list` field (its items stay editable
 * in the inspector's Items section and in the preview form). This is
 * distinct from the inspector's "Name" row, which edits the element name.
 */
export function FixedFileSourceSection({
  element,
  scene,
}: {
  element: TextElement | TickerElement | SequenceElement | RepeaterElement;
  scene: Scene;
}): JSX.Element {
  useSyncExternalStore(subscribeDesignerFileSourcePreviews, designerFileSourcePreviewsVersion);
  const activeCompositionId = designerStore.get().activeCompositionId;
  const previewSceneId =
    activeCompositionId === null ? scene.id : compositionPackageId(scene.id, activeCompositionId);
  const isListElement =
    element.type === 'ticker' || element.type === 'sequence' || element.type === 'repeater';
  const itemsKind =
    element.type === 'repeater'
      ? 'repeater-items'
      : element.type === 'sequence'
        ? 'sequence-items'
        : 'ticker-items';
  const binding = scene.bindings.find((candidate) =>
    isListElement
      ? candidate.target.kind === itemsKind &&
        'elementId' in candidate.target &&
        candidate.target.elementId === element.id
      : candidate.target.kind === 'text' &&
        candidate.target.elementId === element.id &&
        candidate.target.placeholder === undefined,
  );
  const field =
    binding === undefined
      ? undefined
      : scene.fields.find((candidate) => candidate.id === binding.fieldId);
  const fixedMode =
    field !== undefined &&
    isFixedFileFieldId(field.id) &&
    fileSourcePolicyOf(field)?.inputMode === 'file-only' &&
    fileSourcePolicyOf(field)?.lockFile === true;
  const compositionLocked =
    element.type === 'sequence' && sequenceItemsBinding(element.items) === null;
  const canChoose =
    element.type !== 'repeater' &&
    !compositionLocked &&
    (field === undefined || fieldTakesFileSource(field)) &&
    (element.type !== 'sequence' || sequenceItemsBinding(element.items) === 'text');
  const [error, setError] = useState<string | null>(null);
  const enabled = fixedMode || isDesignerFixedFileIntent(previewSceneId, element.id);

  if (!fixedMode && !canChoose) return <></>;

  const setEnabled = (next: boolean): void => {
    setDesignerFixedFileIntent(previewSceneId, element.id, next);
    setError(null);
    if (next || !fixedMode || field === undefined) return;
    clearDesignerFileSourcePreview(previewSceneId, field.id);
    const bridge = (window as unknown as { cg: Partial<DesignerBridge> }).cg;
    const fallback = fieldTakesFileSource(field) ? field.default : '';
    void bridge.preview?.update({ fields: { [field.id]: fallback } }).catch(() => undefined);
    designerStore.setElementDataKey(element.id, '');
  };

  const chooseFixedFile = async (): Promise<void> => {
    try {
      const bridge = (window as unknown as { cg: DesignerBridge }).cg;
      const selected = await pickSharedTextSource(bridge);
      if (selected === null) return;
      const fieldId = fixedFileFieldId(element.id);
      if (!designerStore.setElementDataKey(element.id, fieldId)) {
        setError('Could not create the internal fixed-file connection.');
        return;
      }
      designerStore.setElementFieldMeta(element.id, {
        title: element.name.trim() === '' ? 'Fixed file' : element.name,
        allowFileSource: true,
        fileSource: {
          inputMode: 'file-only',
          bridgePath: selected.bridgePath,
          lockFile: true,
          ...(isListElement ? { delimiter: SHIPPED_DEFAULT_DELIMITER } : {}),
        },
      });
      const value = fileSourceContentToFieldValue(
        selected.content,
        isListElement ? 'list' : 'text',
        {
          split: isListElement,
          delimiter: isListElement ? SHIPPED_DEFAULT_DELIMITER : '',
        },
      );
      setDesignerFileSourcePreview({
        sceneId: previewSceneId,
        fieldId,
        bridgePath: selected.bridgePath,
        displayPath: selected.sourcePath,
        content: selected.content,
        value,
      });
      setDesignerFixedFileIntent(previewSceneId, element.id, true);
      requestDesignerFileSourcePreviewOpen(previewSceneId, fieldId);
      setError(null);
      void bridge.preview.update({ fields: { [fieldId]: value } }).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <CollapseSection
      title="Fixed file source"
      pinned
      trailing={
        <InfoTip title="Fixed file source">
          <p>
            Use this when the element must always read from one file. CG Control operators cannot
            type over its value, add or remove rows, or replace the selected file.
          </p>
          <p>
            Choose a text file from the shared folder available to Designer and CG Control. The
            template saves only its portable filename, never the Windows or network path.
          </p>
          <p>
            Open <b>View content and fields…</b> to review the file, reload it, and choose or manage
            the delimiter for list fields.
          </p>
        </InfoTip>
      }
    >
      <CheckRow
        label="Use fixed file"
        checked={enabled}
        onChange={setEnabled}
        title="Use a locked file source instead of authored Items or manual CG Control input."
      />
      {!enabled ? null : fixedMode && field !== undefined ? (
        <>
          <p className={s.fixedSourceHeading}>File-only, locked source · no Data key required</p>
          <FileSourceRow
            sceneId={previewSceneId}
            field={field}
            itemFields={
              field.type === 'list' ? listFieldItemFields(scene, scene, field.id) : undefined
            }
            onPatch={(patch) => designerStore.setElementFieldMeta(element.id, patch)}
            fixedMode
          />
        </>
      ) : (
        <div className={s.emptySourceChoices}>
          <Button size="sm" onClick={() => void chooseFixedFile()}>
            Browse shared file…
          </Button>
          {error !== null && <p className={s.warn}>{error}</p>}
        </div>
      )}
    </CollapseSection>
  );
}

export function DynamicDataSection({
  element,
  scene,
}: {
  element: TextElement | TickerElement | SequenceElement | RepeaterElement;
  scene: Scene;
}): JSX.Element {
  const activeCompositionId = designerStore.get().activeCompositionId;
  const previewSceneId =
    activeCompositionId === null ? scene.id : compositionPackageId(scene.id, activeCompositionId);
  // The element kinds whose Data key backs a LIST field (items binding).
  const isListElement =
    element.type === 'ticker' || element.type === 'sequence' || element.type === 'repeater';
  const itemsKind =
    element.type === 'repeater'
      ? 'repeater-items'
      : element.type === 'sequence'
        ? 'sequence-items'
        : 'ticker-items';
  // The convenience binding for this element: the full-text one for text (no
  // placeholder), the items one for a ticker/sequence; its field is what the
  // meta edits.
  const isConv = (b: FieldBinding, elementId: string): boolean =>
    isListElement
      ? b.target.kind === itemsKind && 'elementId' in b.target && b.target.elementId === elementId
      : b.target.kind === 'text' &&
        b.target.elementId === elementId &&
        b.target.placeholder === undefined;
  const conv = scene.bindings.find((b) => isConv(b, element.id));
  const field = conv === undefined ? undefined : scene.fields.find((f) => f.id === conv.fieldId);
  const currentKey = field?.id ?? '';
  const fixedMode =
    field !== undefined &&
    isFixedFileFieldId(field.id) &&
    fileSourcePolicyOf(field)?.inputMode === 'file-only' &&
    fileSourcePolicyOf(field)?.lockFile === true;
  const [warn, setWarn] = useState<string | null>(null);
  // D-083 / D-163 — a sequence's item list is bindable when it is all text, or a BOOK — pictures
  // with or without text pages (`RUN-NEXT-VERSION-03` 1.6); only a composition item locks it. The
  // one predicate decides.
  const compositionLocked =
    element.type === 'sequence' && sequenceItemsBinding(element.items) === null;

  // A convenience binding owned by an element OTHER than this one (any
  // kind — one key, one owner).
  function ownedByOther(b: FieldBinding): boolean {
    return (
      ((b.target.kind === 'text' && b.target.placeholder === undefined) ||
        b.target.kind === 'ticker-items' ||
        b.target.kind === 'sequence-items' ||
        b.target.kind === 'repeater-items') &&
      'elementId' in b.target &&
      b.target.elementId !== element.id
    );
  }

  // A key is a real conflict only when *another* element already owns it via a
  // convenience binding. A field that merely exists but is orphaned (its
  // binding was removed) is re-adopted by the store, so it must not block
  // re-typing.
  function isDuplicate(value: string): boolean {
    const t = value.trim();
    if (t === '' || t === currentKey) return false;
    return scene.bindings.some((b) => b.fieldId === t && ownedByOther(b));
  }

  // Re-bindable keys for the autocomplete: existing fields of the matching
  // shape (text/multiline for text elements, list for tickers/sequences)
  // that aren't owned by another element (i.e. orphaned by an "unbind"), so
  // the operator can reconnect a field here instead of hunting for it.
  const adoptable = scene.fields
    .filter(
      (f) =>
        (isListElement ? f.type === 'list' : f.type === 'text' || f.type === 'multiline') &&
        f.id !== currentKey &&
        !scene.bindings.some((b) => b.fieldId === f.id && ownedByOther(b)),
    )
    .map((f) => f.id);

  // A fixed file is an author-owned source, not an operator variable. Its dedicated Inspector
  // section renders outside Dynamic / Data; keep the internal runtime field entirely out of here.
  if (fixedMode) return <></>;
  if (element.type === 'text' && element.rowNumber === true) {
    return (
      <CollapseSection title="Dynamic / Data" defaultExpanded>
        <Tag>Automatic row number</Tag>
      </CollapseSection>
    );
  }

  return (
    <CollapseSection title="Dynamic / Data" defaultExpanded={field !== undefined}>
      <div className={cs.row}>
        <span className={cs.label}>Data key</span>
        <div className="cg-field">
          <input
            className={cs.inputInner}
            type="text"
            placeholder={compositionLocked ? '(composition items)' : '(static)'}
            disabled={compositionLocked}
            defaultValue={currentKey}
            // Key by the SELECTED element id (+ the committed key) so the input
            // re-initialises when the selection moves to another element instead
            // of keeping the previous element's uncommitted draft (B-009).
            key={`dk-${element.id}-${currentKey}`}
            aria-label="Data key"
            list={adoptable.length > 0 ? 'cg-data-key-options' : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) =>
              setWarn(
                isDuplicate(e.target.value)
                  ? `Key “${e.target.value.trim()}” is already used`
                  : null,
              )
            }
            onBlur={(e) => {
              if (isDuplicate(e.target.value)) {
                e.target.value = currentKey; // reject; keep the warning visible
                return;
              }
              designerStore.setElementDataKey(element.id, e.target.value);
              setWarn(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).value = currentKey;
                setWarn(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {adoptable.length > 0 && (
            <datalist id="cg-data-key-options">
              {adoptable.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </div>
      </div>
      {warn !== null && <p className={s.warn}>{warn}</p>}

      {compositionLocked ? (
        /* The one place the binding disappears (`designer-sequence-element`: a hint scoped to the item
           list, saying what the author can still do). `RUN-NEXT-VERSION-03` 1.6 — and that such a
           sequence is not a book in CG Control. */
        <p className={s.hint} data-testid="sequence-composition-lock">
          The item list can’t be data-bound while this sequence has a composition item, and it is
          not a book in CG Control. You can still edit each item’s text, bind an individual text
          item to a field via its data key in the Items list above, and bind fields inside
          composition items from the data form.
        </p>
      ) : field === undefined ? (
        <p className={s.hint}>
          {isListElement
            ? `Give this ${element.type} a Data key to drive its items from operator data.`
            : 'Give this text a Data key to drive it from operator data.'}
        </p>
      ) : (
        <FieldMeta
          key={field.id}
          element={element}
          field={field}
          scene={scene}
          sceneId={previewSceneId}
        />
      )}
    </CollapseSection>
  );
}

/** The editable metadata for the field backing a Data key. */
function FieldMeta({
  element,
  field,
  scene,
  sceneId,
}: {
  element: TextElement | TickerElement | SequenceElement | RepeaterElement;
  field: DynamicField;
  scene: Scene;
  sceneId: string;
}): JSX.Element {
  useSyncExternalStore(subscribeDesignerFileSourcePreviews, designerFileSourcePreviewsVersion);
  useSyncExternalStore(subscribeSequencePageDataAttachments, sequencePageDataAttachmentsVersion);
  const filePreview = getDesignerFileSourcePreview(
    sceneId,
    field.id,
    'fileSource' in field ? field.fileSource?.bridgePath : undefined,
  );
  const fieldType = field.type === 'number' || field.type === 'select' ? field.type : 'text';
  const multiline = field.type === 'multiline';
  const [numberChoicesOpen, setNumberChoicesOpen] = useState(false);
  const [selectChoicesOpen, setSelectChoicesOpen] = useState(false);
  const patch = (p: ElementFieldMetaPatch): void =>
    designerStore.setElementFieldMeta(element.id, p);
  const allowedNumberValues = field.type === 'number' ? numberFieldAllowedValues(field) : undefined;
  const numberMode =
    field.type !== 'number'
      ? 'any'
      : allowedNumberValues !== undefined
        ? 'choices'
        : field.min === undefined && field.max === undefined
          ? 'any'
          : 'custom';

  const numberAliasCount =
    field.type === 'number' && allowedNumberValues !== undefined
      ? allowedNumberValues.filter((value) => numberFieldValueAlias(field, value) !== undefined)
          .length
      : 0;

  // D-028/D-029 — a ticker's/sequence's list field: only the base meta
  // applies; the items themselves are edited in the Items section (and live
  // in the preview form).
  if (field.type === 'list') {
    return (
      <>
        <TextField
          label="Title"
          value={field.label}
          onCommit={(v) => patch({ title: v })}
          resetKey={element.id}
        />
        <TextField
          label="Description"
          value={field.description ?? ''}
          onCommit={(v) => patch({ description: v })}
          resetKey={element.id}
        />
        <CheckRow
          label="Required"
          checked={field.required}
          onChange={(v) => patch({ required: v })}
        />
        {/* 🔴 `B-353` — a PAGE LIST's items are pictures: there is no text to give digits to and no
            text file to fill it from. "Allow file source" — a grant for TEXT — is what the owner
            ticked on his book, hoping for CG Control's Load folder…, and the rebuild it ran dropped
            the book's mark. A book says where its pages come from instead. */}
        {field.pages === true ? (
          <p className={s.hint} data-testid="page-list-hint">
            A book: operators turn its pages in CG Control, and load new ones there with Load
            pages….
          </p>
        ) : (
          <>
            {/* TEXT-DIGITS-01 — a list's items are typed text: the one Digits control. */}
            <DigitsField
              value={fieldDigitsOf(field)}
              options={FieldDigitsSchema.options}
              onCommit={(v) => patch({ digits: v })}
            />
            {/* A Repeater's structured workbook belongs to Rows and data file (or to its outer
                Sequence). Rendering the generic shared-file picker here creates a second source
                for the same rows, so only non-Repeater list fields retain this control. */}
            {element.type !== 'repeater' && fieldTakesFileSource(field) && (
              <FileSourceRow
                key={`file-source-${field.id}`}
                sceneId={sceneId}
                field={field}
                itemFields={listFieldItemFields(scene, scene, field.id)}
                onPatch={patch}
              />
            )}
            <p className={s.hint}>
              {element.type === 'repeater'
                ? 'Row files are managed in Rows and data file, or by the outer Sequence when it supplies pages.'
                : `The field’s items are the ${element.type}’s Items section; operators edit them live in the preview’s data form.`}
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <TextField
        label="Title"
        value={field.label}
        onCommit={(v) => patch({ title: v })}
        resetKey={element.id}
      />
      <TextField
        label="Description"
        value={field.description ?? ''}
        onCommit={(v) => patch({ description: v })}
        resetKey={element.id}
      />
      <CheckRow
        label="Required"
        checked={field.required}
        onChange={(v) => patch({ required: v })}
      />
      <SelectField
        label="Field type"
        value={fieldType}
        options={['text', 'number', 'select'] as const}
        labels={['text', 'number', 'Choice list']}
        onCommit={(v) => patch({ fieldType: v })}
      />
      {/* FIELD-DIGITS-01 / TEXT-DIGITS-01 — the one Digits control; Keyboard only for text, since
          a number reaches the page as a number. Absent reads Keyboard / Latin (`fieldDigitsOf`). */}
      {fieldType !== 'select' && (
        <DigitsField
          value={fieldDigitsOf(field)}
          options={
            fieldType === 'number' ? NumberFieldDigitsSchema.options : FieldDigitsSchema.options
          }
          onCommit={(v) => patch({ digits: v })}
        />
      )}
      {field.type === 'select' && (
        <>
          <div className={cs.row}>
            <span className={cs.label}>Choices</span>
            <div className={s.numberChoicesControl}>
              <span className={cs.readout}>{field.options.length} choices</span>
              <Button size="sm" onClick={() => setSelectChoicesOpen(true)}>
                Edit…
              </Button>
            </div>
          </div>
          {selectChoicesOpen && (
            <SelectChoicesModal
              options={field.options}
              connectedFileCount={sequencePageDataAttachmentCount(scene.id)}
              onCancel={() => setSelectChoicesOpen(false)}
              onSave={(options) => {
                patch({ options });
                setSelectChoicesOpen(false);
              }}
            />
          )}
        </>
      )}
      {fieldType === 'number' && (
        <SelectField
          label="Allowed values"
          value={numberMode}
          options={['any', 'choices', 'custom'] as const}
          labels={['Any number', 'Choice list', 'Custom limits']}
          onCommit={(mode) => {
            if (mode === 'choices') {
              patch({
                allowedValues: [0, 1],
                allowedValueLabels: null,
                min: null,
                max: null,
                step: null,
              });
            } else if (mode === 'any') {
              patch({
                allowedValues: null,
                allowedValueLabels: null,
                min: null,
                max: null,
                step: null,
              });
            } else {
              patch({
                allowedValues: null,
                allowedValueLabels: null,
                min: field.type === 'number' ? (field.min ?? 0) : 0,
                max: field.type === 'number' ? (field.max ?? 100) : 100,
                step: field.type === 'number' ? (field.step ?? 1) : 1,
              });
            }
          }}
        />
      )}
      {fieldType === 'number' && field.type === 'number' && numberMode === 'choices' && (
        <>
          <div className={cs.row}>
            <span className={cs.label}>Choices</span>
            <div className={s.numberChoicesControl}>
              <span className={cs.readout}>
                {allowedNumberValues?.length ?? 0}{' '}
                {(allowedNumberValues?.length ?? 0) === 1 ? 'choice' : 'choices'} ·{' '}
                {numberAliasCount} {numberAliasCount === 1 ? 'alias' : 'aliases'}
              </span>
              <Button size="sm" onClick={() => setNumberChoicesOpen(true)}>
                Edit…
              </Button>
            </div>
          </div>
          <p className={s.hint}>Stored values stay numeric; aliases are shown to operators.</p>
          {numberChoicesOpen && (
            <NumberChoicesModal
              values={allowedNumberValues ?? [0, 1]}
              labels={field.allowedValueLabels ?? {}}
              connectedFileCount={sequencePageDataAttachmentCount(scene.id)}
              onCancel={() => setNumberChoicesOpen(false)}
              onSave={(values, labels) => {
                patch({
                  allowedValues: values,
                  allowedValueLabels: Object.keys(labels).length === 0 ? null : labels,
                  min: null,
                  max: null,
                  step: null,
                });
                setNumberChoicesOpen(false);
              }}
            />
          )}
        </>
      )}
      {fieldType === 'number' && field.type === 'number' && numberMode === 'custom' && (
        <>
          <NumberField
            label="Minimum"
            value={field.min ?? 0}
            step={field.step ?? 1}
            {...(field.max === undefined ? {} : { max: field.max })}
            onCommit={(min) => patch({ min })}
          />
          <NumberField
            label="Maximum"
            value={field.max ?? 100}
            step={field.step ?? 1}
            {...(field.min === undefined ? {} : { min: field.min })}
            onCommit={(max) => patch({ max })}
          />
          <NumberField
            label="Increment"
            value={field.step ?? 1}
            min={0.000001}
            onCommit={(step) => patch({ step: Math.max(0.000001, step) })}
          />
        </>
      )}
      {fieldType === 'text' && (
        <>
          <CheckRow
            label="Multiline"
            checked={multiline}
            onChange={(v) => patch({ multiline: v })}
          />
          <NumberField
            label="Min length"
            value={lenOf(field, 'min')}
            min={0}
            step={1}
            onCommit={(n) => patch({ minLength: Math.max(0, Math.round(n)) })}
          />
          {!multiline && (
            <NumberField
              label="Max length"
              value={lenOf(field, 'max')}
              min={0}
              step={1}
              onCommit={(n) => patch({ maxLength: Math.max(0, Math.round(n)) })}
            />
          )}
          <PatternField
            // Re-mount when the edited field changes so the Custom escape (local
            // UI state) never leaks onto the next element/field (B-009).
            key={`pattern-${element.id}-${field.id}`}
            pattern={patternOf(field)}
            resetKey={element.id}
            onCommit={(p) => patch({ pattern: p })}
          />
          {/* TEXT-FILE-OPT-01 — inside the `fieldType === 'text'` block on purpose:
              a NUMBER cannot hold file content, so the author is never shown a
              control for a grant that could not exist. Switching to Number drops
              any grant the field had (`rebuildField`), so nothing is hidden here —
              it is gone. */}
          <FileSourceRow
            key={`file-source-${field.id}`}
            sceneId={sceneId}
            field={field}
            onPatch={patch}
          />
        </>
      )}
      {field.type === 'select' ? (
        <SelectField
          label="Value"
          value={field.default}
          options={field.options.map((option) => option.value)}
          labels={field.options.map((option) => option.label)}
          onCommit={(value) => patch({ default: value })}
        />
      ) : fieldType === 'number' && field.type === 'number' && allowedNumberValues !== undefined ? (
        <SelectField
          label="Value"
          value={String(field.default)}
          options={allowedNumberValues.map(String)}
          labels={allowedNumberValues.map(
            (value) => numberFieldValueAlias(field, value) ?? String(value),
          )}
          onCommit={(value) => patch({ default: Number(value) })}
        />
      ) : fieldType === 'number' ? (
        <NumberField
          label="Value"
          value={field.type === 'number' ? field.default : 0}
          step={field.type === 'number' ? (field.step ?? 1) : 1}
          min={field.type === 'number' ? field.min : undefined}
          max={field.type === 'number' ? field.max : undefined}
          // `PERSIAN-DIGITS-01` — a template value, read by the one reader; `TEXT-DIGITS-01` — shown
          // and typed in the field's digits, what goes on air.
          digits="as-typed"
          valueDigits={numberDigits(field)}
          onCommit={(n) => patch({ default: n })}
        />
      ) : filePreview === null ? (
        <TextField
          label="Value"
          value={defaultStr(field)}
          // `TEXT-DIGITS-01` — typed in the field's digits (Keyboard: the keyboard's), what goes on air.
          digits={fieldDigitsOf(field)}
          onCommit={(v) => patch({ default: v })}
          resetKey={element.id}
        />
      ) : (
        <p className={s.hint}>
          The selected file is previewing this field on the canvas. Its bytes are not saved as the
          authored default.
        </p>
      )}
    </>
  );
}

/**
 * D-059 — the field's `pattern` behind named validation presets. The select
 * shows what the STORED regex spells (None / a named shape / Custom); picking a
 * preset writes its vetted anchored regex through the same `pattern` patch, and
 * "Custom (advanced)" reveals the raw regex box — today's UI — pre-filled with
 * the current pattern, so any regex stays authorable. Custom is a DISPLAY state
 * (an empty pattern still spells None, an email regex still spells Email), hence
 * the local escape flag.
 */
function PatternField({
  pattern,
  resetKey,
  onCommit,
}: {
  pattern: string;
  resetKey: string;
  onCommit: (pattern: string) => void;
}): JSX.Element {
  const [customEscape, setCustomEscape] = useState(false);
  const stored = patternPresetKeyFor(pattern);
  const selected = stored === CUSTOM_PATTERN || customEscape ? CUSTOM_PATTERN : stored;
  const example = PATTERN_PRESETS[selected]?.example;

  return (
    <>
      <SelectField
        label="Pattern"
        value={selected}
        options={PATTERN_PRESET_ORDER.map((p) => p.key)}
        labels={PATTERN_PRESET_ORDER.map((p) => p.label)}
        onCommit={(key) => {
          setCustomEscape(key === CUSTOM_PATTERN);
          const next = patternForPresetKey(key);
          if (next !== null) onCommit(next); // Custom keeps the current regex
        }}
      />
      {selected === CUSTOM_PATTERN ? (
        <TextField
          label="Regex"
          ariaLabel="Custom pattern regex"
          value={pattern}
          onCommit={onCommit}
          resetKey={resetKey}
        />
      ) : (
        example !== undefined && <p className={s.hint}>Accepts e.g. {example}</p>
      )}
    </>
  );
}

/**
 * TEXT-FILE-OPT-01 — the AUTHORED grant that decides whether the Runtime operator
 * may point this field at a text file.
 *
 * WHY IT IS AUTHORED HERE AT ALL. The Runtime's "From file…" affordance used to be
 * gated on FIELD KIND alone, which is a decision about a TYPE rather than about a
 * field: it rendered identically under a twelve-character `title` and under a
 * four-hundred-word crawl, once per text / multiline / list field on the template.
 * The owner's report — _"it is really for subtitles and long copy, not small
 * labels"_ — is a statement only the AUTHOR can make, and this is where they are
 * already saying what kind of content the field holds.
 *
 * The hint names the operator's control because that is the honest explanation of
 * what ticking the box does; the LABEL names the grant, not the control.
 */
async function pickSharedTextSource(
  bridge: DesignerBridge,
): Promise<DesignerTextSourceFile | null> {
  if (bridge.textSources?.pick !== undefined) return bridge.textSources.pick();

  // Browser/test fallback. The desktop bridge always takes the native branch above so its
  // absolute Windows/UNC path remains visible.
  const picked = await bridge.assets.pick(undefined, {
    accept:
      '.txt,.text,.csv,.tsv,.json,.log,text/plain,text/csv,application/json,text/tab-separated-values',
    multiple: false,
  });
  const candidate = bridgeTextSourceFiles(picked)[0];
  if (candidate === undefined) {
    if (picked.length > 0) throw new Error('Choose a supported text file of 1 MiB or smaller.');
    return null;
  }
  return {
    name: candidate.file.name,
    bridgePath: candidate.path,
    sourcePath:
      ((candidate.file as File & { path?: string }).path ?? candidate.file.webkitRelativePath) ||
      candidate.path,
    content: await readBridgeTextPreview(candidate.file),
  };
}

function FileSourceRow({
  sceneId,
  field,
  itemFields,
  onPatch,
  fixedMode = false,
}: {
  sceneId: string;
  field: DynamicField;
  itemFields?: readonly ListItemField[] | undefined;
  onPatch: (patch: ElementFieldMetaPatch) => void;
  fixedMode?: boolean;
}): JSX.Element {
  useSyncExternalStore(subscribeDesignerDelimiters, designerDelimitersVersion);
  useSyncExternalStore(subscribeDesignerFileSourcePreviews, designerFileSourcePreviewsVersion);
  const delimiters = listDesignerDelimiters();
  const granted = fieldAllowsFileSource(field);
  const policy = fileSourcePolicyOf(field);
  const preview = getDesignerFileSourcePreview(sceneId, field.id, policy?.bridgePath);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const previewModalOpen = isDesignerFileSourcePreviewOpen(sceneId, field.id);
  const patchPolicy = (next: NonNullable<ElementFieldMetaPatch['fileSource']>): void => {
    const compact = {
      ...(next.inputMode === 'file-only' ? { inputMode: 'file-only' as const } : {}),
      ...(next.bridgePath !== undefined ? { bridgePath: next.bridgePath } : {}),
      ...(next.lockFile === true ? { lockFile: true as const } : {}),
      ...(next.delimiter !== undefined ? { delimiter: next.delimiter } : {}),
      ...(next.format !== undefined && next.format !== 'text' ? { format: next.format } : {}),
    };
    onPatch({ fileSource: Object.keys(compact).length === 0 ? null : compact });
  };

  const pushAuthoringPreview = (
    file: Pick<DesignerTextSourceFile, 'bridgePath' | 'sourcePath' | 'content'>,
    delimiter: string | undefined,
    format: FileSourceListFormat = 'text',
  ): void => {
    if (!fieldTakesFileSource(field)) return;
    const value = fileSourceContentToFieldValue(file.content, field.type, {
      split: field.type === 'list' && delimiter !== undefined,
      delimiter: delimiter ?? '',
      format,
      ...(field.type === 'list' && itemFields !== undefined ? { itemFields } : {}),
    });
    setDesignerFileSourcePreview({
      sceneId,
      fieldId: field.id,
      bridgePath: file.bridgePath,
      displayPath: file.sourcePath,
      content: file.content,
      value,
    });
    setBrowseError(null);
    const bridge = (window as unknown as { cg: Partial<DesignerBridge> }).cg;
    void bridge.preview?.update({ fields: { [field.id]: value } }).catch(() => undefined);
  };

  const clearAuthoringPreview = (): void => {
    clearDesignerFileSourcePreview(sceneId, field.id);
    const bridge = (window as unknown as { cg: Partial<DesignerBridge> }).cg;
    const fallback = fieldTakesFileSource(field) ? field.default : '';
    void bridge.preview?.update({ fields: { [field.id]: fallback } }).catch(() => undefined);
  };

  const browseSharedFile = async (): Promise<void> => {
    // Some page-realm tests deliberately declare `window.cg` as TemplateRuntime.
    // This control runs only in Designer; use its explicit bridge contract rather
    // than merging those two unrelated ambient globals.
    const bridge = (window as unknown as { cg: DesignerBridge }).cg;
    try {
      const selected = await pickSharedTextSource(bridge);
      if (selected === null) return;
      setBrowseError(null);
      patchPolicy({ ...policy, bridgePath: selected.bridgePath });
      pushAuthoringPreview(selected, policy?.delimiter, policy?.format ?? 'text');
      requestDesignerFileSourcePreviewOpen(sceneId, field.id);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err));
    }
  };

  // Re-selecting the element remounts this row. Restore the same selected-file value to the
  // authoring canvas from the session store; no second browse is needed.
  useEffect(() => {
    if (preview === null) return;
    const bridge = (window as unknown as { cg: Partial<DesignerBridge> }).cg;
    void bridge.preview?.update({ fields: { [field.id]: preview.value } }).catch(() => undefined);
  }, [field.id, preview]);

  const effectiveDelimiter =
    fixedMode && field.type === 'list'
      ? (policy?.delimiter ?? SHIPPED_DEFAULT_DELIMITER)
      : policy?.delimiter;
  const effectiveFormat: FileSourceListFormat = policy?.format ?? 'text';
  const delimiterValues = [
    ...(!fixedMode ? [''] : []),
    ...delimiters.map((option) => option.value),
    ...(effectiveDelimiter !== undefined &&
    !delimiters.some((option) => option.value === effectiveDelimiter)
      ? [effectiveDelimiter]
      : []),
  ];
  const delimiterLabels = [
    ...(!fixedMode ? ['CG Control default'] : []),
    ...delimiters.map((option) => option.label),
    ...(delimiterValues.length > delimiters.length + (fixedMode ? 0 : 1)
      ? ['Current value (not in list)']
      : []),
  ];
  let interpretedPreview = preview?.value ?? null;
  let previewParseError: string | null = null;
  if (preview !== null && fieldTakesFileSource(field)) {
    try {
      interpretedPreview = fileSourceContentToFieldValue(preview.content, field.type, {
        split: field.type === 'list' && effectiveDelimiter !== undefined,
        delimiter: effectiveDelimiter ?? '',
        format: effectiveFormat,
        ...(field.type === 'list' && itemFields !== undefined ? { itemFields } : {}),
      });
    } catch (cause) {
      interpretedPreview = null;
      previewParseError = cause instanceof Error ? cause.message : String(cause);
    }
  }
  const fullSourcePathVisible = preview !== null && isVisibleWindowsSourcePath(preview.displayPath);
  const commitDelimiter = (delimiter: string): void => {
    const authored = delimiter === '' ? undefined : delimiter;
    patchPolicy({ ...policy, delimiter: authored });
    if (preview !== null) {
      try {
        pushAuthoringPreview(
          {
            bridgePath: preview.bridgePath,
            sourcePath: preview.displayPath,
            content: preview.content,
          },
          authored,
          effectiveFormat,
        );
      } catch (cause) {
        setBrowseError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };
  const commitFormat = (format: FileSourceListFormat): void => {
    patchPolicy({ ...policy, format: format === 'text' ? undefined : format });
    if (preview !== null) {
      try {
        pushAuthoringPreview(
          {
            bridgePath: preview.bridgePath,
            sourcePath: preview.displayPath,
            content: preview.content,
          },
          effectiveDelimiter,
          format,
        );
      } catch (cause) {
        setBrowseError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  };
  const reloadSelectedFile = async (): Promise<void> => {
    if (preview === null) throw new Error('Choose this file again before reloading it.');
    const bridge = (window as unknown as { cg: DesignerBridge }).cg;
    const content = await bridge.textSources.reload(preview.displayPath);
    pushAuthoringPreview(
      {
        bridgePath: preview.bridgePath,
        sourcePath: preview.displayPath,
        content,
      },
      effectiveDelimiter,
      effectiveFormat,
    );
  };
  return (
    <>
      {!fixedMode && (
        <>
          <CheckRow
            label="Allow file source"
            checked={granted}
            onChange={(enabled) => {
              onPatch({ allowFileSource: enabled, ...(!enabled ? { fileSource: null } : {}) });
              if (!enabled) clearAuthoringPreview();
            }}
          />
          <p className={s.hint}>
            {granted
              ? 'Operators can point this field at a text file and reload it — for subtitles and long copy.'
              : 'Off: operators type this field by hand. Turn it on for subtitles and long copy prepared elsewhere.'}
          </p>
        </>
      )}
      {granted && (
        <>
          {!fixedMode && (
            <CheckRow
              label="File only"
              checked={policy?.inputMode === 'file-only'}
              onChange={(enabled) =>
                patchPolicy({
                  ...policy,
                  ...(enabled ? { inputMode: 'file-only' } : { inputMode: 'operator-choice' }),
                })
              }
              title="Remove manual text and list editing from CG Control; file controls remain."
            />
          )}
          {field.type === 'list' && (
            <SelectField
              label="file format"
              value={effectiveFormat}
              options={['text', 'json', 'csv'] as const}
              labels={['Text / delimiter', 'JSON rows', 'CSV rows']}
              onCommit={commitFormat}
            />
          )}
          <div className={s.fileBrowseRow}>
            <Button size="sm" onClick={() => void browseSharedFile()}>
              Browse shared file…
            </Button>
            {policy?.bridgePath !== undefined && !fixedMode && (
              <Button
                size="sm"
                variant="bare"
                onClick={() => {
                  clearAuthoringPreview();
                  setBrowseError(null);
                  patchPolicy({ ...policy, bridgePath: undefined, lockFile: undefined });
                }}
              >
                Clear file
              </Button>
            )}
          </div>
          {policy?.bridgePath !== undefined && (
            <div className={s.selectedFile}>
              <span>
                {preview === null
                  ? 'CG Control file'
                  : fullSourcePathVisible
                    ? 'Selected file · full Windows/UNC path'
                    : 'Selected file'}
              </span>
              <code className={s.selectedFilePath}>
                {preview?.displayPath ?? policy.bridgePath}
              </code>
              {preview !== null && <small>CG Control file: {policy.bridgePath}</small>}
            </div>
          )}
          {browseError !== null && <p className={s.warn}>{browseError}</p>}
          {previewParseError !== null && browseError !== previewParseError && (
            <p className={s.warn}>{previewParseError}</p>
          )}
          {preview !== null && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => requestDesignerFileSourcePreviewOpen(sceneId, field.id)}
            >
              View content and fields…
            </Button>
          )}
          {policy?.bridgePath !== undefined && preview === null && browseError === null && (
            <p className={s.hint}>
              Select this shared file once in this Designer session to preview its live content.
            </p>
          )}
          {!fixedMode && (
            <>
              <CheckRow
                label="Lock file"
                checked={policy?.lockFile === true}
                disabled={policy?.bridgePath === undefined}
                onChange={(enabled) =>
                  patchPolicy({
                    ...policy,
                    ...(enabled ? { lockFile: true } : { lockFile: undefined }),
                  })
                }
                title={
                  policy?.bridgePath === undefined
                    ? 'Choose a file from the shared folder first.'
                    : 'CG Control can reload this file but cannot choose, replace or detach it.'
                }
              />
              {policy?.bridgePath === undefined && (
                <p className={s.hint}>
                  Lock file becomes available after a shared file is selected.
                </p>
              )}
            </>
          )}
          {previewModalOpen && preview !== null && interpretedPreview !== null && (
            <FileSourcePreviewModal
              sourcePath={preview.displayPath}
              bridgePath={preview.bridgePath}
              content={preview.content}
              value={interpretedPreview}
              delimiter={
                field.type === 'list' && effectiveFormat === 'text' ? effectiveDelimiter : undefined
              }
              delimiterValues={
                field.type === 'list' && effectiveFormat === 'text' ? delimiterValues : []
              }
              delimiterLabels={
                field.type === 'list' && effectiveFormat === 'text' ? delimiterLabels : []
              }
              onDelimiter={
                field.type === 'list' && effectiveFormat === 'text' ? commitDelimiter : undefined
              }
              onReload={reloadSelectedFile}
              onClose={() => dismissDesignerFileSourcePreview(sceneId, field.id)}
            />
          )}
        </>
      )}
    </>
  );
}

/** An on/off inspector row. Exported so a second one is never written (`D-163` reuses it). */
export function CheckRow({
  label,
  checked,
  onChange,
  title,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** What the option does, as the row's tooltip. */
  title?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className={cs.row} {...(title !== undefined ? { title } : {})}>
      <span className={cs.label}>{label}</span>
      <input
        type="checkbox"
        className={s.checkbox}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

function lenOf(f: DynamicField, which: 'min' | 'max'): number {
  if (which === 'min') {
    return (f.type === 'text' || f.type === 'multiline') && f.minLength !== undefined
      ? f.minLength
      : 0;
  }
  return f.type === 'text' && f.maxLength !== undefined ? f.maxLength : 0;
}

function patternOf(f: DynamicField): string {
  return (f.type === 'text' || f.type === 'multiline') && f.pattern !== undefined ? f.pattern : '';
}

function defaultStr(f: DynamicField): string {
  if (f.type === 'image') return '';
  return typeof f.default === 'string' ? f.default : String(f.default);
}

/** `TEXT-DIGITS-01` — a number field's digit set (a number is never Keyboard; absent reads Latin). */
function numberDigits(f: DynamicField): DigitSet {
  const digits = fieldDigitsOf(f);
  return digits === 'as-typed' ? 'latin' : digits;
}
