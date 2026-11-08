import { useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import * as s from './ImageChoicePicker.css.js';

export interface ImageChoice {
  value: string;
  label: string;
  thumbnailUrl?: string;
}

interface Props {
  value: string;
  choices: readonly ImageChoice[];
  label: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  emptyThumbnailUrl?: string | undefined;
  currentThumbnailUrl?: string | undefined;
  allowEmpty?: boolean;
  currentLabel?: string;
}

/** Compact selected-picture button backed by a visual grid, never a filename-only combo. */
export function ImageChoicePicker({
  value,
  choices,
  label,
  onChange,
  emptyLabel = 'No picture selected',
  emptyThumbnailUrl,
  currentThumbnailUrl,
  allowEmpty = true,
  currentLabel = 'Current uploaded picture',
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    if (value === '' || choices.some((choice) => choice.value === value)) return choices;
    return [
      {
        value,
        label: currentLabel,
        ...(currentThumbnailUrl === undefined ? {} : { thumbnailUrl: currentThumbnailUrl }),
      },
      ...choices,
    ];
  }, [choices, currentLabel, currentThumbnailUrl, value]);
  const selected = options.find((choice) => choice.value === value);
  const selectedThumbnail =
    value === '' ? emptyThumbnailUrl : (selected?.thumbnailUrl ?? currentThumbnailUrl);

  return (
    <>
      <Button
        variant="bare"
        className={s.trigger}
        aria-label={label}
        title={selected?.label ?? emptyLabel}
        onClick={() => setOpen(true)}
      >
        <span className={s.triggerThumb} aria-hidden="true">
          {selectedThumbnail === undefined ? (
            <Icon icon={ImageIcon} size={16} />
          ) : (
            <img src={selectedThumbnail} alt="" />
          )}
        </span>
        <span className={s.triggerLabel}>{selected?.label ?? emptyLabel}</span>
        <span className={s.triggerHint}>Choose…</span>
      </Button>
      {open && (
        <Modal
          title={`Choose picture · ${label}`}
          ariaLabel={`Choose picture for ${label}`}
          width="min(760px, 94vw)"
          maxHeight="88vh"
          onClose={() => setOpen(false)}
          footer={<ModalButton onClick={() => setOpen(false)}>Close</ModalButton>}
        >
          <div className={s.grid}>
            {allowEmpty && (
              <Button
                variant="bare"
                className={s.choice}
                selected={value === ''}
                aria-pressed={value === ''}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <span className={s.choiceThumb} aria-hidden="true">
                  {emptyThumbnailUrl === undefined ? (
                    <Icon icon={ImageIcon} size={22} />
                  ) : (
                    <img src={emptyThumbnailUrl} alt="" />
                  )}
                </span>
                <span className={s.choiceLabel}>{emptyLabel}</span>
              </Button>
            )}
            {options.map((choice) => (
              <Button
                key={choice.value}
                variant="bare"
                className={s.choice}
                selected={choice.value === value}
                aria-pressed={choice.value === value}
                title={choice.label}
                onClick={() => {
                  onChange(choice.value);
                  setOpen(false);
                }}
              >
                <span className={s.choiceThumb} aria-hidden="true">
                  {choice.thumbnailUrl === undefined ? (
                    <Icon icon={ImageIcon} size={22} />
                  ) : (
                    <img src={choice.thumbnailUrl} alt="" loading="lazy" />
                  )}
                </span>
                <span className={s.choiceLabel}>{choice.label}</span>
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
