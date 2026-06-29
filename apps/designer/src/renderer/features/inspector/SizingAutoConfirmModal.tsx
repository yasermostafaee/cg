import { Modal, ModalButton } from '../shell/Modal.js';
import * as s from './SizingAutoConfirmModal.css.js';

interface Props {
  /** How many selected text elements will lose their size keyframes (≥ 1). */
  count: number;
  /** Proceed: switch to Auto and delete the size keyframes (one undo step). */
  onConfirm: () => void;
  /** Abort: stay Fixed, keep the keyframes. */
  onCancel: () => void;
}

/**
 * D-046 — warn + confirm before switching a text element to Auto when it has size
 * keyframes. Auto sizing is content-driven, so those keyframes can no longer apply
 * and are removed on confirm. Reuses the shared {@link Modal} / {@link ModalButton}
 * destructive-confirm pattern (Cancel + a `danger` Confirm), same as
 * `SaveBeforeSwitchModal`. RTL-safe + vanilla-extract; copy is localizable like the
 * rest of the UI.
 */
export function SizingAutoConfirmModal({ count, onConfirm, onCancel }: Props): JSX.Element {
  const many = count > 1;
  return (
    <Modal
      title="Switch to auto sizing?"
      onClose={onCancel}
      ariaLabel="Confirm switch to auto sizing"
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton variant="danger" onClick={onConfirm} autoFocus>
            Switch &amp; remove keyframes
          </ModalButton>
        </>
      }
    >
      <p className={s.body}>
        Auto sizing makes the box hug its text, so its <strong>size</strong> is driven by the
        content. {many ? `${count} selected text elements’` : 'This text element’s'} existing{' '}
        <strong>size keyframes</strong> will be removed. You can undo this.
      </p>
    </Modal>
  );
}
