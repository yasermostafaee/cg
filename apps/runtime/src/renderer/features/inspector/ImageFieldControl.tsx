import { useRef, useState } from 'react';
import { FolderOpen, Image as ImageIcon } from 'lucide-react';
import {
  imageFieldAllowsChoices,
  imageFieldAllowsUpload,
  type DynamicField,
} from '@cg/shared-schema';
import { useAuthoredPictureThumbnails, usePictureThumbnail } from '../book/authoredPictures.js';
import { Button } from '../../ui/Button.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';

type ImageField = Extract<DynamicField, { type: 'image' }>;

export function imageAssetId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return '';
  const assetId = (value as Record<string, unknown>)['assetId'];
  return typeof assetId === 'string' ? assetId : '';
}

function acceptAttr(field: ImageField): string {
  return field.accept.map((extension) => `.${extension}`).join(',');
}

function dataUrlOf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

export function ImageFieldControl({
  field,
  value,
  ariaLabel,
  dirty = false,
  disabled = false,
  templateId,
  channel,
  onChange,
}: {
  field: ImageField;
  value: unknown;
  ariaLabel: string;
  dirty?: boolean;
  disabled?: boolean;
  templateId?: string | undefined;
  channel?: number | undefined;
  onChange: (assetId: string | undefined) => void;
}): JSX.Element {
  const assetId = imageAssetId(value);
  const authoredPictures = useAuthoredPictureThumbnails(templateId, channel);
  const uploadedThumbnail = usePictureThumbnail(
    assetId.startsWith('data:image/') ? assetId : undefined,
  );
  const thumbnailUrl = assetId.startsWith('data:image/')
    ? uploadedThumbnail
    : authoredPictures[assetId];
  const uploadInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const authoredOptions = field.assetOptions ?? [];
  const selectedOption = authoredOptions.find((option) => option.assetId === assetId);
  return (
    <div className="cg-image-field-control">
      {imageFieldAllowsChoices(field) && (
        <Button
          variant="default"
          className={`cg-image-picker-trigger${dirty ? ' is-dirty' : ''}`}
          aria-label={ariaLabel}
          disabled={disabled}
          title={
            selectedOption?.label ?? (assetId === '' ? 'No picture selected' : 'Uploaded picture')
          }
          onClick={() => setPickerOpen(true)}
        >
          <span className="cg-image-picker-trigger__thumb" aria-hidden="true">
            {thumbnailUrl === undefined ? (
              <Icon icon={ImageIcon} size={16} />
            ) : (
              <img src={thumbnailUrl} alt="" />
            )}
          </span>
          <span className="cg-image-picker-trigger__label">
            {selectedOption?.label ??
              (assetId === '' ? 'No picture selected' : 'Current uploaded picture')}
          </span>
          <span className="cg-image-picker-trigger__hint">Choose…</span>
        </Button>
      )}
      {!imageFieldAllowsChoices(field) && thumbnailUrl !== undefined && (
        <img className="cg-image-field-thumbnail" src={thumbnailUrl} alt="" aria-hidden="true" />
      )}
      {imageFieldAllowsUpload(field) && (
        <>
          <FileInput
            ref={uploadInput}
            className="cg-visually-hidden"
            accept={acceptAttr(field)}
            aria-label={`${ariaLabel} browse image`}
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file === undefined) return;
              setError(null);
              void dataUrlOf(file)
                .then((next) => onChange(next))
                .catch(() => setError('Could not read this image.'));
              event.currentTarget.value = '';
            }}
          />
          <Button
            variant="neutral"
            className={`cg-image-browse${dirty ? ' is-dirty' : ''}`}
            disabled={disabled}
            onClick={() => uploadInput.current?.click()}
          >
            <Icon icon={FolderOpen} size={14} />
            Browse…
          </Button>
        </>
      )}
      {error !== null && (
        <span className="cg-field-refusal" role="alert">
          {error}
        </span>
      )}
      {pickerOpen && (
        <Modal
          title={`Choose picture · ${ariaLabel}`}
          ariaLabel={`Choose picture for ${ariaLabel}`}
          size="wide"
          layer="sub"
          onClose={() => setPickerOpen(false)}
          footer={
            <ModalAction actionRole="cancel" onClick={() => setPickerOpen(false)}>
              Close
            </ModalAction>
          }
        >
          <div className="cg-image-picker-grid">
            <Button
              variant="default"
              className="cg-image-picker-choice"
              aria-pressed={assetId === ''}
              onClick={() => {
                onChange('');
                setPickerOpen(false);
              }}
            >
              <span className="cg-image-picker-choice__thumb" aria-hidden="true">
                <Icon icon={ImageIcon} size={22} />
              </span>
              <span className="cg-image-picker-choice__label">No picture selected</span>
            </Button>
            {assetId !== '' && selectedOption === undefined && (
              <Button
                variant="default"
                className="cg-image-picker-choice"
                aria-pressed="true"
                onClick={() => setPickerOpen(false)}
              >
                <span className="cg-image-picker-choice__thumb" aria-hidden="true">
                  {thumbnailUrl === undefined ? (
                    <Icon icon={ImageIcon} size={22} />
                  ) : (
                    <img src={thumbnailUrl} alt="" />
                  )}
                </span>
                <span className="cg-image-picker-choice__label">Current uploaded picture</span>
              </Button>
            )}
            {authoredOptions.map((option) => {
              const optionUrl = authoredPictures[option.assetId];
              return (
                <Button
                  key={`${option.source ?? 'project'}:${option.assetId}`}
                  variant="default"
                  className="cg-image-picker-choice"
                  aria-pressed={option.assetId === assetId}
                  title={option.label}
                  onClick={() => {
                    onChange(option.assetId);
                    setPickerOpen(false);
                  }}
                >
                  <span className="cg-image-picker-choice__thumb" aria-hidden="true">
                    {optionUrl === undefined ? (
                      <Icon icon={ImageIcon} size={22} />
                    ) : (
                      <img src={optionUrl} alt="" loading="lazy" />
                    )}
                  </span>
                  <span className="cg-image-picker-choice__label">{option.label}</span>
                </Button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
