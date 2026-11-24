import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Film, FolderOpen, Image as ImageIcon, Plus, X } from 'lucide-react';
import type { UpcomingProgramsSampleItem } from '@cg/shared-schema';
import { useFeedbackText, useUiText } from '../../i18n/locale.js';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { TextInput } from '../../ui/TextInput.js';

export interface UpcomingProgramsMediaOption {
  assetId: string;
  kind: 'image' | 'video';
  label: string;
  posterAssetId?: string | undefined;
  thumbnailUrl?: string | undefined;
}

interface UpcomingProgramsEditorProps {
  element: { name: string; mediaVisible?: boolean | undefined };
  rows: readonly UpcomingProgramsSampleItem[];
  mediaOptions: readonly UpcomingProgramsMediaOption[];
  onChange: (rows: UpcomingProgramsSampleItem[]) => void;
  onImport: (file: File) => Promise<UpcomingProgramsMediaOption>;
}

export function UpcomingProgramsEditor({
  element,
  rows,
  mediaOptions,
  onChange,
  onImport,
}: UpcomingProgramsEditorProps): JSX.Element {
  const localizeUi = useUiText();
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const [importedMedia, setImportedMedia] = useState<Record<string, UpcomingProgramsMediaOption>>(
    {},
  );
  const options = [...mediaOptions, ...Object.values(importedMedia)];
  const commit = (next: UpcomingProgramsSampleItem[]): void => {
    latestRows.current = next;
    onChange(next);
  };

  // An import can finish after other fields have changed. Apply it to its original row by ID.
  const changeRow = (id: string, patch: Partial<UpcomingProgramsSampleItem>): void => {
    if (!latestRows.current.some((row) => row.id === id)) return;
    commit(latestRows.current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const moveRow = (index: number, delta: -1 | 1): void => {
    const next = [...latestRows.current];
    const [row] = next.splice(index, 1);
    if (row === undefined) return;
    next.splice(index + delta, 0, row);
    commit(next);
  };

  return (
    <section className="cg-inspector-section" aria-label={localizeUi('Upcoming Programs')}>
      <div className="cg-section-caption">
        <h2>
          {localizeUi('Upcoming Programs')}
          {element.name !== '' && element.name !== 'Upcoming Programs' && (
            <>
              {' '}
              · <bdi dir="auto">{element.name}</bdi>
            </>
          )}
        </h2>
        <Button
          variant="neutral"
          onClick={() => commit([...latestRows.current, { id: uuid(), title: '' }])}
        >
          <Icon icon={Plus} />
          {localizeUi('Add program')}
        </Button>
      </div>
      {rows.length === 0 && <span>{localizeUi('No programs.')}</span>}
      {rows.map((row, index) => {
        const number = index + 1;
        const remove = localizeUi('Remove program {number}', { number });
        const earlier = localizeUi('Move program {number} up', { number });
        const later = localizeUi('Move program {number} down', { number });
        return (
          <div
            key={row.id}
            className="cg-list-item"
            role="group"
            aria-label={localizeUi('Program {number}', { number })}
          >
            <div className="cg-list-item__structured">
              <label className="cg-list-cell">
                <span>{localizeUi('Title')}</span>
                <TextInput
                  dir="auto"
                  value={row.title}
                  onChange={(title) => changeRow(row.id, { title })}
                />
              </label>
              <label className="cg-list-cell">
                <span>{localizeUi('Display time')}</span>
                <TextInput
                  dir="auto"
                  value={row.airtime ?? ''}
                  onChange={(airtime) => changeRow(row.id, { airtime })}
                />
              </label>
              {element.mediaVisible !== false && (
                <div className="cg-list-cell">
                  <span>{localizeUi('Image or video')}</span>
                  <UpcomingProgramMediaPicker
                    row={row}
                    options={options}
                    onImport={onImport}
                    onChoose={(asset) => {
                      if (
                        asset !== undefined &&
                        !options.some(({ assetId }) => assetId === asset.assetId)
                      ) {
                        setImportedMedia((known) => ({ ...known, [asset.assetId]: asset }));
                      }
                      if (row.mediaAssetId === asset?.assetId && row.mediaKind === asset?.kind)
                        return;
                      changeRow(row.id, {
                        mediaAssetId: asset?.assetId,
                        mediaKind: asset?.kind,
                        posterAssetId: asset?.posterAssetId,
                        audioAssetId: undefined,
                      });
                    }}
                  />
                </div>
              )}
            </div>
            <div className="cg-list-item__tools">
              <span className="cg-list-item__index" aria-hidden="true">
                {number}
              </span>
              <Button
                variant="icon"
                aria-label={earlier}
                title={earlier}
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
              >
                <Icon icon={ArrowUp} />
              </Button>
              <Button
                variant="icon"
                aria-label={later}
                title={later}
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
              >
                <Icon icon={ArrowDown} />
              </Button>
              <Button
                variant="icon"
                className="cg-list-remove"
                aria-label={remove}
                title={remove}
                onClick={() => commit(latestRows.current.filter((entry) => entry.id !== row.id))}
              >
                <Icon icon={X} />
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function UpcomingProgramMediaPicker({
  row,
  options,
  onImport,
  onChoose,
}: {
  row: UpcomingProgramsSampleItem;
  options: readonly UpcomingProgramsMediaOption[];
  onImport: UpcomingProgramsEditorProps['onImport'];
  onChoose: (asset: UpcomingProgramsMediaOption | undefined) => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const localizeFeedback = useFeedbackText();
  const selected = options.find(({ assetId }) => assetId === row.mediaAssetId);
  const selectedLabel =
    selected?.label ??
    localizeUi(
      row.mediaKind === 'video' ? 'Video' : row.mediaKind === 'image' ? 'Picture' : 'None',
    );
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  useEffect(
    () => () => {
      importRequest.current += 1;
    },
    [],
  );
  const close = (): void => {
    importRequest.current += 1;
    setPending(false);
    setImportFailed(false);
    setOpen(false);
  };
  const choose = (asset: UpcomingProgramsMediaOption | undefined): void => {
    onChoose(asset);
    close();
  };
  const importFile = async (file: File): Promise<void> => {
    const request = ++importRequest.current;
    setPending(true);
    setImportFailed(false);
    try {
      const asset = await onImport(file);
      if (request === importRequest.current) choose(asset);
    } catch {
      if (request !== importRequest.current) return;
      setPending(false);
      setImportFailed(true);
    }
  };
  const label = localizeUi('Image or video');
  const dialogTitle = localizeUi('Choose program media');
  return (
    <>
      <Button
        variant="default"
        className="cg-image-picker-trigger"
        aria-label={label}
        title={selectedLabel}
        onClick={() => setOpen(true)}
      >
        <span className="cg-image-picker-trigger__thumb" aria-hidden="true">
          <MediaThumbnail kind={row.mediaKind} thumbnailUrl={selected?.thumbnailUrl} />
        </span>
        <bdi className="cg-image-picker-trigger__label" dir="auto">
          {selectedLabel}
        </bdi>
        <span className="cg-image-picker-trigger__hint">{localizeUi('Choose…')}</span>
      </Button>
      {open && (
        <Modal
          title={dialogTitle}
          ariaLabel={dialogTitle}
          size="wide"
          onClose={close}
          {...(importFailed && {
            message: {
              role: 'refusal',
              text: localizeFeedback('Could not import program media.'),
            },
          })}
          footer={
            <>
              <ModalAction actionRole="cancel" onClick={close}>
                {localizeUi('Close')}
              </ModalAction>
              <ModalAction
                actionRole="primary"
                disabled={pending}
                onClick={() => input.current?.click()}
              >
                <Icon icon={FolderOpen} />
                {localizeUi(pending ? 'Importing media…' : 'Browse…')}
              </ModalAction>
            </>
          }
        >
          <FileInput
            ref={input}
            className="cg-visually-hidden"
            aria-label={localizeUi('Choose an image or video file')}
            accept=".png,.jpg,.jpeg,.webp,.mp4,.webm"
            disabled={pending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) void importFile(file);
            }}
          />
          <div className="cg-image-picker-grid">
            <Button
              variant="default"
              className="cg-image-picker-choice"
              aria-pressed={row.mediaAssetId === undefined}
              disabled={pending}
              onClick={() => choose(undefined)}
            >
              <span className="cg-image-picker-choice__thumb" aria-hidden="true">
                <Icon icon={ImageIcon} size={22} />
              </span>
              <span className="cg-image-picker-choice__label">{localizeUi('None')}</span>
            </Button>
            {options.map((asset) => (
              <Button
                key={asset.assetId}
                variant="default"
                className="cg-image-picker-choice"
                aria-pressed={asset.assetId === row.mediaAssetId}
                disabled={pending}
                title={asset.label}
                onClick={() => choose(asset)}
              >
                <span className="cg-image-picker-choice__thumb" aria-hidden="true">
                  <MediaThumbnail kind={asset.kind} thumbnailUrl={asset.thumbnailUrl} />
                </span>
                <bdi className="cg-image-picker-choice__label" dir="auto">
                  {asset.label}
                </bdi>
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function MediaThumbnail({
  kind,
  thumbnailUrl,
}: {
  kind: UpcomingProgramsMediaOption['kind'] | undefined;
  thumbnailUrl: string | undefined;
}): JSX.Element {
  return thumbnailUrl === undefined ? (
    <Icon icon={kind === 'video' ? Film : ImageIcon} size={16} />
  ) : (
    <img src={thumbnailUrl} alt="" loading="lazy" />
  );
}
