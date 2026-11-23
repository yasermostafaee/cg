import { useUiText } from '../../i18n/locale.js';
import { useRef } from 'react';
import { ArrowDown, ArrowUp, Image, ImagePlus, Move, Scan, Trash2 } from 'lucide-react';
import { type ControlLiveLayoutFrameAttachment, type LiveRevealRect } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import { LiveLayoutEditorSectionHeading } from './LiveLayoutEditorSectionHeading.js';
import './live-layout-frame-attachments.css';

const FIELDS = [
  { key: 'x', limit: 'width', label: 'Graphic X (%)', min: 0 },
  { key: 'y', limit: 'height', label: 'Graphic Y (%)', min: 0 },
  { key: 'width', limit: 'x', label: 'Graphic width (%)', min: 0.1 },
  { key: 'height', limit: 'y', label: 'Graphic height (%)', min: 0.1 },
] as const;

interface Props {
  attachments: readonly ControlLiveLayoutFrameAttachment[];
  legacyIds?: readonly string[] | undefined;
  selectedId: string | undefined;
  selectedMask: LiveRevealRect | undefined;
  importing: boolean;
  canEdit: boolean;
  editing: boolean;
  onImport: (file: File) => Promise<void>;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onEditChange: (editing: boolean) => void;
  onRectChange: (id: string, rect: LiveRevealRect) => void;
}

export function LiveLayoutEditorFrameAttachments({
  attachments,
  legacyIds,
  selectedId,
  selectedMask,
  importing,
  canEdit,
  editing,
  onImport,
  onSelect,
  onReorder,
  onRemove,
  onEditChange,
  onRectChange,
}: Props): JSX.Element {
  const localizeUi = useUiText();
  const picker = useRef<HTMLInputElement>(null);
  const selectedIndex = attachments.findIndex(({ id }) => id === selectedId);
  const selected = attachments[selectedIndex];
  const isLegacy = (id: string): boolean => legacyIds?.includes(id) === true;
  function canReorder(direction: -1 | 1): boolean {
    const neighbor = attachments[selectedIndex + direction];
    return (
      selected !== undefined &&
      neighbor !== undefined &&
      isLegacy(selected.id) === isLegacy(neighbor.id)
    );
  }

  return (
    <details
      className="cg-live-layout-title-style"
      onToggle={(event) => {
        if (!event.currentTarget.open && editing) onEditChange(false);
      }}
    >
      <LiveLayoutEditorSectionHeading icon={Image} label={localizeUi('Plate graphics')} />
      <div
        className="cg-live-layout-title-scope"
        role="group"
        aria-label={localizeUi('Plate graphics')}
      >
        {attachments.map((attachment) => (
          <Button
            key={attachment.id}
            className="cg-live-layout-attachment-choice"
            active={selectedId === attachment.id}
            aria-pressed={selectedId === attachment.id}
            title={attachment.name}
            disabled={importing}
            onClick={() => onSelect(attachment.id)}
          >
            <IsolatedName>{attachment.name}</IsolatedName>
          </Button>
        ))}
        <FileInput
          ref={picker}
          accept=".vcg"
          hidden
          aria-label={localizeUi('Choose plate graphic VCG')}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file !== undefined) void onImport(file);
          }}
        />
        <Button variant="neutral" disabled={importing} onClick={() => picker.current?.click()}>
          <Icon icon={ImagePlus} size={14} /> {importing ? 'Reading graphic…' : 'Add .vcg graphic'}
        </Button>
      </div>
      {selected !== undefined && isLegacy(selected.id) && (
        <p className="cg-live-layout-effect-help">
          {localizeUi(
            'This graphic was saved for this preset. Editing shares it if the plate has no conflicting masked input graphics.',
          )}
        </p>
      )}
      {selected !== undefined && (
        <>
          <div
            className="cg-live-layout-attachment-actions"
            role="group"
            aria-label={localizeUi('Graphic actions')}
          >
            <Button
              variant="neutral"
              aria-label={localizeUi('Bring graphic forward')}
              title={localizeUi('Bring graphic forward')}
              disabled={!canReorder(1)}
              onClick={() => onReorder(selected.id, 1)}
            >
              <Icon icon={ArrowUp} size={14} />
            </Button>
            <Button
              variant="neutral"
              aria-label={localizeUi('Send graphic backward')}
              title={localizeUi('Send graphic backward')}
              disabled={!canReorder(-1)}
              onClick={() => onReorder(selected.id, -1)}
            >
              <Icon icon={ArrowDown} size={14} />
            </Button>
            <Button
              variant="neutral"
              aria-label={localizeUi('Remove graphic')}
              title={localizeUi('Remove graphic')}
              onClick={() => onRemove(selected.id)}
            >
              <Icon icon={Trash2} size={14} />
            </Button>
            {selectedMask !== undefined && (
              <Button variant="neutral" onClick={() => onRectChange(selected.id, selectedMask)}>
                <Icon icon={Scan} size={14} /> {localizeUi('Align to mask')}
              </Button>
            )}
            <Button
              variant="neutral"
              active={editing}
              aria-pressed={editing}
              disabled={!canEdit}
              onClick={() => onEditChange(!editing)}
            >
              <Icon icon={Move} size={14} /> {localizeUi('Edit graphic in preview')}
            </Button>
          </div>
          <div className="cg-form-grid cg-live-layout-title-fields" key={selected.id}>
            {FIELDS.map(({ key, limit, label, min }) => (
              <LiveLayoutEditorNumber
                key={key}
                label={label}
                value={Math.round(selected.rect[key] * 10000) / 100}
                min={min}
                max={100}
                decimal
                onChange={(value) =>
                  onRectChange(selected.id, {
                    ...selected.rect,
                    [key]: Math.min(value / 100, 1 - selected.rect[limit]),
                  })
                }
              />
            ))}
          </div>
        </>
      )}
    </details>
  );
}
