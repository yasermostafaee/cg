import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { UpcomingMediaRemoveResult } from '@cg/shared-ipc';
import { upcomingProgramMediaHash, type UpcomingProgramsSampleItem } from '@cg/shared-schema';
import { useFeedbackText, useUiText } from '../../i18n/locale.js';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { TextInput } from '../../ui/TextInput.js';
import { useConfirm } from '../../ui/useDialog.js';
import { upcomingProgramMediaInOtherDrafts } from './draftStore.js';
import { removeUploadedProgramMedia } from './upcomingProgramMedia.js';

export interface UpcomingProgramsMediaOption {
  assetId: string;
  kind: 'image' | 'video';
  label: string;
  posterAssetId?: string | undefined;
  thumbnailUrl?: string | undefined;
}

interface UpcomingProgramsEditorProps {
  itemId: string;
  element: { id: string; name: string; mediaVisible?: boolean | undefined };
  appliedRows: readonly UpcomingProgramsSampleItem[];
  rows: readonly UpcomingProgramsSampleItem[];
  mediaOptions: readonly UpcomingProgramsMediaOption[];
  onChange: (rows: UpcomingProgramsSampleItem[]) => void;
  onImport: (file: File) => Promise<UpcomingProgramsMediaOption>;
}

export function UpcomingProgramsEditor({
  itemId,
  element,
  appliedRows,
  rows,
  mediaOptions,
  onChange,
  onImport,
}: UpcomingProgramsEditorProps): JSX.Element {
  const localizeUi = useUiText();
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const latestApplied = useRef(appliedRows);
  latestApplied.current = appliedRows;
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

  const removeMedia = async (assetId: string): Promise<UpcomingMediaRemoveResult> => {
    if (
      latestRows.current.some((row) => row.posterAssetId === assetId) ||
      upcomingProgramMediaInOtherDrafts(assetId, itemId, element.id)
    ) {
      return { removed: false, errorCode: 'upcoming-program-media-in-use' };
    }
    const result = await removeUploadedProgramMedia(assetId);
    if (!result.removed) return result;
    setImportedMedia((known) => {
      const remaining = { ...known };
      delete remaining[assetId];
      return remaining;
    });
    if (latestRows.current.some((row) => row.mediaAssetId === assetId)) {
      commit(
        latestRows.current.map((row) => {
          if (row.mediaAssetId !== assetId) return row;
          const previous = latestApplied.current.find((entry) => entry.id === row.id);
          const { mediaAssetId, mediaKind, posterAssetId, audioAssetId } = previous ?? {};
          return { ...row, mediaAssetId, mediaKind, posterAssetId, audioAssetId };
        }),
      );
    }
    return result;
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
                    onRemove={removeMedia}
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
  onRemove,
  onChoose,
}: {
  row: UpcomingProgramsSampleItem;
  options: readonly UpcomingProgramsMediaOption[];
  onImport: UpcomingProgramsEditorProps['onImport'];
  onRemove: (assetId: string) => Promise<UpcomingMediaRemoveResult>;
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
  const [pending, setPending] = useState<'import' | 'remove' | null>(null);
  const [error, setError] = useState<'import' | 'remove' | 'in-use' | null>(null);
  const { confirm, confirmDialog } = useConfirm();
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
    setPending(null);
    setError(null);
    setOpen(false);
  };
  const choose = (asset: UpcomingProgramsMediaOption | undefined): void => {
    onChoose(asset);
    close();
  };
  const importFile = async (file: File): Promise<void> => {
    const request = ++importRequest.current;
    setPending('import');
    setError(null);
    try {
      const asset = await onImport(file);
      if (request === importRequest.current) choose(asset);
    } catch {
      if (request !== importRequest.current) return;
      setPending(null);
      setError('import');
    }
  };
  const remove = async (asset: UpcomingProgramsMediaOption): Promise<void> => {
    setPending('remove');
    setError(null);
    try {
      if (
        !(await confirm({
          title: 'Remove uploaded media?',
          body: <bdi dir="auto">{asset.label}</bdi>,
          confirmLabel: 'Remove',
        }))
      )
        return;
      const result = await onRemove(asset.assetId);
      if (!result.removed)
        setError(result.errorCode === 'upcoming-program-media-in-use' ? 'in-use' : 'remove');
    } catch {
      setError('remove');
    } finally {
      setPending(null);
    }
  };
  const refusal =
    error === 'import'
      ? localizeFeedback('Could not import program media.')
      : error === 'in-use'
        ? localizeFeedback('This upload is in use by a program.')
        : error === 'remove'
          ? localizeFeedback('Could not remove program media.')
          : undefined;
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
          {...(refusal !== undefined && { message: { role: 'refusal', text: refusal } })}
          footer={
            <>
              <ModalAction actionRole="cancel" onClick={close}>
                {localizeUi('Close')}
              </ModalAction>
              <ModalAction
                actionRole="primary"
                disabled={pending !== null}
                onClick={() => input.current?.click()}
              >
                <Icon icon={FolderOpen} />
                {localizeUi(pending === 'import' ? 'Importing media…' : 'Browse…')}
              </ModalAction>
            </>
          }
        >
          <FileInput
            ref={input}
            className="cg-visually-hidden"
            aria-label={localizeUi('Choose an image or video file')}
            accept=".png,.jpg,.jpeg,.webp,.mp4,.webm"
            disabled={pending !== null}
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
              disabled={pending !== null}
              onClick={() => choose(undefined)}
            >
              <span className="cg-image-picker-choice__thumb" aria-hidden="true">
                <Icon icon={ImageIcon} size={22} />
              </span>
              <span className="cg-image-picker-choice__label">{localizeUi('None')}</span>
            </Button>
            {options.map((asset) => {
              const uploaded = upcomingProgramMediaHash(asset.assetId) !== undefined;
              const removeLabel = localizeUi('Remove upload {name}', { name: asset.label });
              return (
                <div key={asset.assetId} className="cg-image-picker-option">
                  <Button
                    variant="default"
                    className="cg-image-picker-choice"
                    aria-pressed={asset.assetId === row.mediaAssetId}
                    disabled={pending !== null}
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
                  {uploaded && (
                    <span className="cg-image-picker-option__action">
                      <Button
                        variant="icon"
                        aria-label={removeLabel}
                        title={removeLabel}
                        disabled={pending !== null}
                        onClick={() => void remove(asset)}
                      >
                        <Icon icon={Trash2} />
                      </Button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
      {confirmDialog}
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
